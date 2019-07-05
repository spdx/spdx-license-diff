// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
// Enable chromereload by uncommenting this line:
// if(process.env.NODE_ENV === 'development' && typeof browser === "undefined"){
//   require('chromereload/devonly');
// }

import { version, defaultoptions } from './const.js'
var list = {}
var options
var lastupdate
var updating = false
var runningworkers = 0
var workers = []
var workqueue = {}
var workqueuelength = 0
var pendingcompare = false
var comparequeue = []
var activeTabId = null
var unsorted = {}
var selection = ''
var status = {}
var diffcount = {}
var licensesLoaded = 0
var pendingload = false
var filtered = {}
var total = 0
var completedcompares = 0

chrome.browserAction.setBadgeText({
  text: `Diff`
})

function handleClick (tab) {
  // Send a message to the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tab) {
    var activeTab = tab[0]
    activeTabId = activeTab.id
    console.log('Click detected', status[activeTabId])
    if (!status[activeTabId]) {
      injectContentScript(activeTabId)
    } else {
      chrome.tabs.sendMessage(activeTabId, { 'command': 'clicked_browser_action' }, messageResponse)
    }
  })
}

function injectContentScript (activeTabId) {
  chrome.tabs.insertCSS(activeTabId, { file: '/styles/contentscript.css' })
  chrome.tabs.executeScript(activeTabId, { file: '/scripts/contentscript.js' },
    function (result) {
      chrome.tabs.sendMessage(activeTabId, { 'command': 'clicked_browser_action' }, messageResponse)
    })
}
function messageResponse (response) {
  console.log('Processing message response from ' + activeTabId, response)
  if (!response) {
    console.log(activeTabId + ' failed to respond; assuming not injected in tab')
    status[activeTabId] = null
  }
}

function handleActivate (activeinfo) {
  // Set the active tab
  activeTabId = activeinfo.tabId
  // console.log("ActiveTabId changed", activeTabId)
  if (status[activeTabId]) {
    chrome.tabs.sendMessage(activeTabId, { command: 'alive?' }, messageResponse)
  }
}

function handleUpdated (tabId, changeInfo, tabInfo) {
  // console.log(tabId + " updated.");
  if (status[tabId]) { // reset status so we will inject content script again
    status[tabId] = null
  }
}
function handleFocusChanged (windowid) {
  // Set the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (queryinfo) {
    if (queryinfo.length > 0) { activeTabId = queryinfo[0].id }
    // console.log("ActiveTabId changed", activeTabId)
  })
}

// This function responds to changes to storage
function handleStorageChange (changes, area) {
  if (area === 'local' && 'options' in changes) {
    console.log('Detected changed options; reloading')
    restoreOptions()
  }
}

// respond to content script
function handleMessage (request, sender, sendResponse) {
  switch (request.command) {
    case 'focused':
      activeTabId = sender.tab.id
      console.log('activeTabId', activeTabId)
      break
    case 'updatelicenselist':
      updateList()
      break
    case 'compareselection':
      selection = request.selection
      activeTabId = sender.tab.id
      if (updating || list.licenses === undefined || licensesLoaded < list.licenses.length) {
        pendingcompare = true
        comparequeue.push({ 'selection': selection, 'tabId': activeTabId })
        status[activeTabId] = 'Pending'
        if (updating) {
          console.log('Update pending; queing compare for tab %s; %s queued', activeTabId, comparequeue.length)
        } else {
          console.log('License load needed; queing compare for tab %s; %s queued', activeTabId, comparequeue.length)
          loadList()
        }
        break
      }
      if (status[activeTabId] !== 'Comparing') {
        console.log('tab %s: Starting compare: %s', activeTabId, selection.substring(0, 25))
        status[activeTabId] = 'Comparing'
        compareSelection(selection, activeTabId)
      } else {
        console.log('tab %s: Ignoring redundant compare: %s', activeTabId, selection.substring(0, 25))
      }
      break
    case 'generateDiff':
      activeTabId = sender.tab.id
      request.tabId = activeTabId
      console.log('tab %s: Generating diff:', activeTabId, request)
      status[activeTabId] = 'Diffing'
      diffcount[activeTabId] = diffcount[activeTabId] + 1
      dowork(request)
      break
    default:
    // console.log("Proxying to worker", request);
    // chrome.tabs.sendMessage(activeTab.id, request);
      break
  }
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function workeronmessage (event) {
  processqueue((status[activeTabId] && status[activeTabId] !== 'Done' &&
                  activeTabId)
    ? activeTabId : 0) // Message received so see if queue can be cleared.
  var result
  var threadid
  switch (event.data.command) {
    case 'progressbarmax':
      var tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId
      if (pendingcompare) { // broadcast to all
        for (var i = 0; i < comparequeue.length; i++) { chrome.tabs.sendMessage(comparequeue[i].tabId, event.data) }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data)
      }
      break
    case 'progressbarvalue':
      tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId
      if (pendingcompare) { // broadcast to all
        for (i = 0; i < comparequeue.length; i++) { chrome.tabs.sendMessage(comparequeue[i].tabId, event.data) }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data)
      }
      break
    case 'next':
      tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId
      if (pendingcompare) { // broadcast to all
        for (i = 0; i < comparequeue.length; i++) { chrome.tabs.sendMessage(comparequeue[i].tabId, event.data) }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data)
      }

      break
    case 'store':
    // This path is intended to store a hash of a comparison. TODO: Complete
    // updateProgressBar(-1, -1)
      var obj = {}
      obj[event.data.spdxid] = {
        hash: event.data.hash,
        raw: event.data.raw,
        processed: event.data.processed,
        patterns: event.data.patterns }

      chrome.storage.local.set(obj,
        function () {
          console.log('Setting', obj)
        })

      break
    case 'license':
    // This path is intended to determine if comparison already done. TODO: Complete
      var spdxid = event.data.spdxid
      // var hash = event.data.hash
      // chrome.storage.local.get(spdxid, function(result) {
      //       if (result[spdxid] && result[spdxid].hash != hash){
      //         console.log('No match found', spdxid, hash, result);
      //         worker.postMessage({ 'command':'process', 'license':spdxid,'data':result[spdxid].processed, 'selection': selection});
      //
      //       }else {
      //         console.log('Found prior computed result', spdxid, hash, result);
      //
      //     }
      // });
      break
    case 'savelicenselist':
      var externallicenselist = event.data.value
      console.log('Trying to save list', externallicenselist)
      chrome.storage.local.get(['list'], function (result) {
        if (result.list && result.list.licenseListVersion) {
          var list = result.list
          console.log('Existing License list version %s with %s licenses', list.licenseListVersion,
            Object.keys(list.licenses).length)
          if (list.licenseListVersion < externallicenselist.licenseListVersion) {
            console.log('Newer license list version %s found with %s licenses',
              externallicenselist.licenseListVersion,
              Object.keys(externallicenselist.licenses).length)
            storeList(externallicenselist)
          } else {
            dowork({ 'command': 'populatelicenselist', 'data': list })
            console.log('No new update found; same version %s and %s licenses',
              externallicenselist.licenseListVersion,
              Object.keys(externallicenselist.licenses).length)
          }
        } else {
          console.log('No license list found')
          storeList(externallicenselist)
        }
      })
      break
    case 'savelicense':
      if (updating) {
        externallicenselist = event.data
        spdxid = event.data.spdxid
        console.log('Saving license', event.data)
        chrome.storage.local.get([spdxid], function (result) {
          if (result[spdxid] && externallicenselist.data && _.isEqual(result[spdxid], externallicenselist.data)) {
            // var license = result[spdxid]
            console.log('Ignoring existing license', spdxid)
          } else {
            console.log('Saving new', spdxid)
            var obj = {}
            obj[spdxid] = externallicenselist.data
            chrome.storage.local.set(obj,
              function () {
                console.log('Storing', obj)
              })
          }
        })
      } else {
        console.log('Not supposed to update but received savelicense request; ignoring', event.data)
      }
      break
    case 'updatedone':
      workerdone(event.data.id)
      var arr = event.data.result
      if (typeof list.license === 'undefined') { list.license = {} }
      for (i = 0; i < arr.length; i++) {
        list.license[arr[i].licenseId] = arr[i]
      }
      updating = false
      launchPendingCompares()
      break
    case 'comparenext':
      threadid = event.data.id
      workerdone(threadid)
      tabId = event.data.tabId
      result = event.data.result
      spdxid = event.data.spdxid
      chrome.tabs.sendMessage(tabId, { 'command': 'next', 'spdxid': spdxid, 'id': threadid })
      unsorted[tabId][spdxid] = result
      completedcompares++
      if (completedcompares >= Object.keys(unsorted[tabId]).length) {
        console.log('Requesting final sort of %s for tab %s', Object.keys(unsorted[tabId]).length, tabId)
        status[tabId] = 'Sorting'
        dowork({ 'command': 'sortlicenses', 'licenses': unsorted[tabId], 'tabId': tabId })
        // unsorted[tabId] = {}
        diffcount[tabId] = 0
      }
      break
    case 'sortdone':
      threadid = event.data.id
      workerdone(threadid)
      tabId = event.data.tabId
      result = event.data.result
      chrome.tabs.sendMessage(tabId, { 'command': 'sortdone', 'result': result, 'id': threadid })
      break
    case 'diffnext':
      threadid = event.data.id
      workerdone(threadid)
      tabId = event.data.tabId
      result = event.data.result
      spdxid = event.data.spdxid
      var record = event.data.record
      chrome.tabs.sendMessage(tabId, { 'command': 'diffnext', 'spdxid': spdxid, 'result': result, 'record': record, 'id': threadid })
      diffcount[tabId] = diffcount[tabId] - 1
      if (diffcount[tabId] === 0) {
        status[tabId] = 'Done'
        for (var filter of Object.keys(filtered[tabId])) {
          for (var license in filtered[tabId][filter]) {
            status[tabId] = 'Background comparing'
            console.log('Background compare for %s', license)
            dowork({ 'command': 'compare', 'selection': selection, 'maxLengthDifference': options.maxLengthDifference, 'spdxid': license, 'license': list.license[license], 'total': total, 'tabId': tabId, 'background': true })
          }
        }
      }
      break
    case 'backgroundcomparenext':
      threadid = event.data.id
      workerdone(threadid)
      tabId = event.data.tabId
      result = event.data.result
      spdxid = event.data.spdxid
      chrome.tabs.sendMessage(tabId, { 'command': 'next', 'spdxid': spdxid, 'id': threadid })
      if (filtered[tabId]['results'] === undefined) { filtered[tabId]['results'] = {} }
      filtered[tabId]['results'][spdxid] = result
      unsorted[tabId][spdxid] = result
      completedcompares++
      if (completedcompares === Object.keys(list.license).length) {
        console.log('Done with background compare of %s for tab %s', Object.keys(filtered[tabId]['results']).length, tabId)
        status[tabId] = 'Done'
        dowork({ 'command': 'sortlicenses', 'licenses': unsorted[tabId], 'tabId': tabId })
        // unsorted[tabId] = {}
        diffcount[tabId] = 0
      }
      break
    default:
  }
}
// storage functions
function storeList (externallicenselist) {
  var obj = {}
  externallicenselist.lastupdate = Date.now()
  obj = {
    list: externallicenselist
  }
  chrome.storage.local.set(obj,
    function () {
      console.log('Storing cached copy of ', obj)
    })
}
function loadList () {
  if (pendingload) {
    console.log('Ignoring redundant loadList request')
  } else {
    pendingload = true
    console.log('Attempting to load list from storage')
    chrome.storage.local.get(['list'], function (result) {
      if (result.list && result.list.licenseListVersion) {
        list = result.list
        lastupdate = list.lastupdate
        console.log('Loading License list version %s from storage with %s licenses last updated %s',
          list.licenseListVersion, list.licenses.length, new Date(lastupdate))
        if ((Date.now() - lastupdate) >= (options.updateFrequency * 86400000)) {
          console.log('Last update was over %s days ago; update required', options.updateFrequency)
          updateList()
        } else {
          for (var j = 0; j < list.licenses.length; j++) {
            var line = list.licenses[j]
            var license = line.licenseId
            list.license = {}
            console.log('Attempting to load %s from storage', license)
            chrome.storage.local.get([license], function (result) {
              if (result && !_.isEmpty(result)) {
                license = Object.keys(result)[0]
                list.license[license] = result[license]
                licensesLoaded++
                console.log('%s succesfully loaded from storage %s/%s',
                  license, licensesLoaded, list.licenses.length)
              } else {
                console.log('%s not found in storage; requesting update', license)
                updateList()
              }
              if (list.licenses.length === licensesLoaded) {
                pendingload = false
                launchPendingCompares()
              }
            })
          }
        }
      } else {
        pendingload = false
        console.log('No license list found in storage; requesting update')
        updateList()
      }
    })
  }
}
function updateList () {
  if (updating) {
    console.log('Ignoring redundant update request')
  } else {
    updating = true
    licensesLoaded = 0
    dowork({ 'command': 'updatelicenselist', 'url': chrome.extension.getURL(''), 'remote': true })
  }
}

// processing phase functions (these are called by the workeronmessage in order)
// Compare selection against a fully populated license list (must be loaded in list)
// This is the first phase to determine edit distance and return a sorted list
// for display in spdx
function compareSelection (selection, tabId = activeTabId) {
  unsorted[tabId] = {}
  if (filtered === undefined) {
    filtered = {}
  }
  filtered[tabId] = {}
  total = Object.keys(list.license).length
  completedcompares = 0
  for (var license in list.license) {
    for (var filter in options.filters) {
      if (list.license[license][options.filters[filter]]) {
        if (filtered[tabId][filter] === undefined) { filtered[tabId][filter] = {} }
        filtered[tabId][filter][license] = true
        console.log('Deferring %s because its %s', license, filter)
      }
    }
    if (filtered[tabId] === undefined ||
        filtered[tabId][filter] === undefined ||
        filtered[tabId][filter][license] === undefined) { unsorted[tabId][license] = list.license[license] }
  }
  total = Object.keys(unsorted[tabId]).length
  for (license in unsorted[tabId]) {
    dowork({ 'command': 'compare', 'selection': selection, 'maxLengthDifference': options.maxLengthDifference, 'spdxid': license, 'license': list.license[license], 'total': total, 'tabId': tabId })
    chrome.tabs.sendMessage(tabId, { 'message': 'progressbarmax', 'value': total, 'stage': 'Comparing licenses', 'reset': true })
  }
}

function launchPendingCompares () {
  if (pendingcompare) { console.log('Processing pending %s compare items', comparequeue.length) }
  while (comparequeue.length) {
    var compare = comparequeue.shift()
    selection = compare.selection
    var tabId = compare.tabId
    console.log('Processing compare queue: compare for %s of selection length %s', tabId, selection.length)
    status[tabId] = 'Comparing'
    compareSelection(selection, tabId)
  }
  pendingcompare = false
}

function restoreOptions () {
  chrome.storage.local.get(['options'], function (result) {
    options = result.options
    if (options === undefined) {
      options = defaultoptions
    }
    loadList()
  })
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function spawnworkers () {
  if (workers.length >= options.maxworkers) { return }
  console.log('Spawning %s workers', options.maxworkers)
  for (var i = 0; i < options.maxworkers; i++) {
    var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'))
    worker.onmessage = workeronmessage
    workers[i] = [worker, false]
  }
}
// queue and start work
// priority defines a tabId to search for
function processqueue (priority = 0) {
  var work = null
  while (workqueuelength > 0 && options.maxworkers > runningworkers) {
    if ((priority > 0) &&
        (workqueue[priority]) &&
         (work = workqueue[priority].shift())) {
      dowork(work)
      workqueuelength--
      console.log('Prioritizing tab %s work with %s items, total queue %s items', priority, workqueue[priority].length, workqueuelength)
    } else {
      for (var tabId in workqueue) {
        work = workqueue[tabId].shift()
        if (work) {
          dowork(work)
          workqueuelength--
        }
      }
    }
  }
}
function dowork (message) {
  spawnworkers()
  var offset = options.maxworkers - runningworkers
  if (options.maxworkers > runningworkers) {
    for (var i = runningworkers % options.maxworkers; i < options.maxworkers + offset - 1; i = (i + 1) % options.maxworkers) {
      if (!workers[i][1]) { // worker is available
        message.id = i
        var worker = workers[i][0]
        workers[i][1] = true
        worker.postMessage(message)
        runningworkers++
        break
      } else {
        continue
      }
    }
  } else { // queue up work
    queuework(message)
  }
}
function queuework (message) {
  var tabId
  if (!message.tabId) {
    tabId = 0
  } else {
    tabId = message.tabId
  }
  if (!workqueue[tabId]) {
    workqueue[tabId] = []
  }
  workqueue[tabId].push(message)
  workqueuelength++
}

function workerdone (id) {
  workers[id][1] = false
  runningworkers--
}

function init () {
  console.log('Initializing spdx-license-diff ' + version)
  restoreOptions()
}

init()
chrome.runtime.onStartup.addListener(init)
chrome.runtime.onMessage.addListener(handleMessage)
chrome.browserAction.onClicked.addListener(handleClick)
chrome.tabs.onActivated.addListener(handleActivate)
chrome.windows.onFocusChanged.addListener(handleFocusChanged)
chrome.storage.onChanged.addListener(handleStorageChange)
chrome.runtime.onSuspend.addListener(function () {
  console.log('Unloading.')
})
chrome.tabs.onUpdated.addListener(handleUpdated)
