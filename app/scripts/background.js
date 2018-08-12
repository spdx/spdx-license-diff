// Enable chromereload by uncommenting this line:
if(process.env.NODE_ENV === 'development'){
  require('chromereload/devonly')
}

var list = {};
var options;
var lastupdate;
var updating = false;
var runningworkers = 0;
var workers = [];
var workqueue = {};
var workqueuelength = 0;
var pendingcompare = false;
var comparequeue = [];
var activeTabId = null
var unsorted = {};
var selection = "";
var status = {}
var diffcount = {}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion)
})

chrome.browserAction.setBadgeText({
  text: `Diff`
})

chrome.browserAction.onClicked.addListener(function(tab) {
  // Send a message to the active tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"command": "clicked_browser_action"});
  });
});

chrome.runtime.onStartup.addListener(restore_options());

chrome.tabs.onActivated.addListener(function(activeinfo) {
  // Set the active tab
  activeTabId = activeinfo.tabId;
  //console.log("ActiveTabId changed", activeTabId)
});
chrome.windows.onFocusChanged.addListener(function(windowid) {
  // Set the active tab
  chrome.tabs.query({active: true, currentWindow: true}, function(queryinfo) {
    if (queryinfo.length > 0)
      activeTabId = queryinfo[0].id;
    //console.log("ActiveTabId changed", activeTabId)
  });
});

//This function responds to changes to storage
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area == "sync" && "options" in changes) {
      console.log("Detected changed options; reloading")
      restore_options();
    }
});

//respond to content script
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    switch (request.command) {
      case "focused":
      activeTabId = sender.tab.id;
      console.log ("activeTabId", activeTabId)
      break;
      case "updatelicenselist":
      updateList()
      break;
      case "compareselection":
      selection = request.selection
      activeTabId = sender.tab.id
      if (updating){
        pendingcompare = true
        comparequeue.push({'selection':selection,'tabId':activeTabId});
        console.log("Update pending; queing compare for tab %s; %s queued", activeTabId, comparequeue.length);
        status[activeTabId] = "Pending"
        break;
      }
      console.log("tab %s: Starting compare: %s", activeTabId, selection.substring(0,25));
      status[activeTabId] = "Comparing"
      compareSelection(selection, activeTabId)
      break;
      case "generateDiff":
      activeTabId = sender.tab.id
      request["tabId"] = activeTabId;
      console.log("tab %s: Generating diff:", activeTabId, request);
      status[activeTabId] = "Diffing"
      diffcount[activeTabId] = diffcount[activeTabId] + 1
      dowork(request);
      break;
      default:
      // console.log("Proxying to worker", request);
      // chrome.tabs.sendMessage(activeTab.id, request);
      break;
    }
  }
);
// Workerqueue functions
// These functions are for allowing multiple workers.
function workeronmessage(event) {
  processqueue((status[activeTabId] && status[activeTabId] != "Done"
                && activeTabId)
                ? activeTabId : 0); //Message received so see if queue can be cleared.
  switch (event.data.command) {
    case "progressbarmax":
    var tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId;
    if (pendingcompare){ //broadcast to all
      for (var i=0; i < comparequeue.length; i++)
        chrome.tabs.sendMessage(comparequeue[i]["tabId"], event.data);
    }else if (tabId !== undefined && tabId){
      chrome.tabs.sendMessage(tabId, event.data);
    }
    break;
    case "progressbarvalue":
    var tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId;
    if (pendingcompare){ //broadcast to all
      for (var i=0; i < comparequeue.length; i++)
        chrome.tabs.sendMessage(comparequeue[i]["tabId"], event.data);
    }else if (tabId !== undefined && tabId){
      chrome.tabs.sendMessage(tabId, event.data);
    }
    break;
    case "next":
    var tabId = (event.data.tabId !== undefined) ? event.data.tabId : activeTabId;
    if (pendingcompare){ //broadcast to all
      for (var i=0; i < comparequeue.length; i++)
      chrome.tabs.sendMessage(comparequeue[i]["tabId"], event.data);
    }else if (tabId !== undefined && tabId){
      chrome.tabs.sendMessage(tabId, event.data);
    }

    break;
    case "store":
    //This path is intended to store a hash of a comparison. Complete
    // updateProgressBar(-1, -1)
    var obj = {}
    obj[event.data.spdxid] = {
        hash:event.data.hash,
        raw:event.data.raw,
        processed:event.data.processed,
        patterns:event.data.patterns};

    chrome.storage.local.set(obj,
        function() {
          console.log('Setting', obj);
        });

    break;
    case "license":
    //This path is intended to determine if comparison already done. TODO: Complete
    var spdxid = event.data.spdxid;
    var hash= event.data.hash;
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
    break;
    case "savelicenselist":
    var externallicenselist = event.data.value;
    console.log('Trying to save list', externallicenselist);
    chrome.storage.local.get(['list'], function(result) {
          if (result.list && result.list["licenseListVersion"]){
            var list = result.list;
            console.log('Existing License list version %s with %s licenses', list["licenseListVersion"],
                        Object.keys(list["licenses"]).length);
            if (list["licenseListVersion"] < externallicenselist["licenseListVersion"]){
              console.log('Newer license list version %s found with %s licenses',
                        externallicenselist["licenseListVersion"], Object.keys(externallicenselist["licenses"]).length);
              storeList(externallicenselist);
            } else {
              dowork({ 'command':'populatelicenselist', 'data':list});
              console.log('No new update found; same version %s and %s licenses', externallicenselist["licenseListVersion"], Object.keys(externallicenselist["licenses"]).length);
            }
          }else {
            console.log('No license list found');
            storeList(externallicenselist);
        }
    });
    break;
    case "savelicense":
    if (updating){
      var externallicenselist = event.data;
      var spdxid = event.data.spdxid
      console.log('Saving license', event.data);
      chrome.storage.local.get([spdxid], function(result) {
            if (result[spdxid] && externallicenselist.data && _.isEqual(result[spdxid], externallicenselist.data)){
              var license = result[spdxid];
              console.log('Ignoring existing license', spdxid);
            }else {
              console.log('Saving new', spdxid);
              var obj = {}
              obj[spdxid] = externallicenselist.data;
              chrome.storage.local.set(obj,
                  function() {
                    console.log('Storing', obj);
                  });
          }
      });
    } else {
      console.log('Not supposed to update but received savelicense request; ignoring', event.data);
    }
    break;
    case "updatedone":
    workerdone(event.data.id)
    var arr = event.data.result;
    if (typeof list["license"] === "undefined")
      list["license"] = {};
    for (var i=0; i < arr.length; i++){
      list["license"][arr[i]["licenseId"]] = arr[i]
    }
    updating = false;
    if (pendingcompare)
      while (comparequeue.length){
          var compare = comparequeue.shift();
          selection = compare["selection"];
          var tabId = compare["tabId"];
          console.log("Processing compare queue: compare for %s of selection length %s", tabId, selection.length);
          status[tabId] = "Comparing"
          compareSelection(selection, tabId)
      }
      pendingcompare = false;
    break;
    case "comparenext":
    var threadid = event.data.id;
    workerdone(threadid)
    var tabId = event.data.tabId;
    var result = event.data.result;
    var spdxid = event.data.spdxid;
    chrome.tabs.sendMessage(tabId, {"command": "next", "spdxid":spdxid,"id":threadid});
    unsorted[tabId][spdxid] = result;
    if (Object.keys(unsorted[tabId]).length >= Object.keys(list["license"]).length){
      console.log("Requesting final sort of %s for tab %s", Object.keys(unsorted[tabId]).length, tabId)
      status[tabId] = "Sorting"
      dowork({ 'command':"sortlicenses", 'licenses':unsorted[tabId], "tabId":tabId});
      unsorted[tabId]={};
      diffcount[tabId] = 0
    }
    break;
    case "sortdone":
    var threadid = event.data.id;
    workerdone(threadid)
    var tabId = event.data.tabId;
    var result = event.data.result;
    chrome.tabs.sendMessage(tabId, {"command": "sortdone","result": result,"id":threadid});
    break;
    case "diffnext":
    var threadid = event.data.id;
    workerdone(threadid)
    var tabId = event.data.tabId;
    var result = event.data.result;
    var spdxid = event.data.spdxid;
    var record = event.data.record;
    chrome.tabs.sendMessage(tabId, {"command": "diffnext", "spdxid":spdxid, "result":result, "record":record, "id":threadid, "details":list.license[spdxid]});
    diffcount[tabId] = diffcount[tabId] - 1;
    if (diffcount[tabId] = 0)
      status[tabId] = "Done"
    break;
    default:

  }
}
//storage functions
function storeList(externallicenselist){
  var obj = {};
  externallicenselist["lastupdate"] = Date.now()
  obj = {
      list:externallicenselist
    };
  chrome.storage.local.set(obj,
      function() {
        console.log('Storing cached copy of ', obj);
      });
}
function loadList(){
    chrome.storage.local.get(['list'], function(result) {
      if (result.list && result.list["licenseListVersion"]){
        list = result.list;
        lastupdate = list["lastupdate"]
        console.log('Loading License list version %s from storage with %s licenses last updated %s',
          list["licenseListVersion"], list.licenses.length, Date(lastupdate));
        if ((Date.now() - lastupdate) >= (options.updateFrequency * 86400000)){
          console.log('Last update was over %s days ago; update required', options.updateFrequency);
          updateList()
        }else{
          for (var j = 0; j < list.licenses.length; j++) {
            var line = list.licenses[j];
            var license = line["licenseId"];
            list["license"] = {}
            console.log('Attempting to load %s from storage', license);
            chrome.storage.local.get([license], function(result) {
              if (result && ! _.isEmpty(result)){
                license = Object.keys(result)[0]
                console.log('%s succesfully loaded from storage', license);
                list.license[license] = result[license];
              }else {
                console.log('%s not found in storage; requesting update', license);
                updateList()
              }
            });
          }
        }
      }else {
        console.log('No license list found in storage; requesting update');
        updateList()
      }
    });
}
function updateList(){
  if (updating){
    console.log("Ignoring redundant update request")
    return
  }else {
  updating = true;
  dowork({ 'command':"updatelicenselist", 'url':chrome.extension.getURL(""), 'remote':true});
  }
}

// processing phase functions (these are called by the workeronmessage in order)
//Compare selection against a fully populated license list (must be loaded in list)
//This is the first phase to determine edit distance and return a sorted list
// for display in spdx
function compareSelection(selection, tabId=activeTabId){
  unsorted[tabId] = {}
  var total = Object.keys(list["license"]).length;
  chrome.tabs.sendMessage(tabId, {"message": "progressbarmax","value": total, "stage":"Comparing licenses", "reset":true});
  //updateProgressBar(Object.keys(list["license"]).length, null)
  for (var license in list["license"]){
     dowork({'command':"compare", 'selection': selection, 'maxLengthDifference':options.maxLengthDifference, 'spdxid':license,'license':list["license"][license],'total': total, 'tabId':tabId});
  }
}

function restore_options() {
  chrome.storage.sync.get(['options'], function(result) {
    options = result.options;
    if (options === undefined) {
      options = {
        updateFrequency: 90,
        showBest: 10,
        minpercentage: 25,
        maxLengthDifference: 1000,
        maxworkers: 10
      };
    }
    loadList();
  });
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function spawnworkers(){
  if (workers.length == options.maxworkers)
    return
  console.log("Spawning %s workers", options.maxworkers)
  for (var i = 0; i < options.maxworkers; i++){
    var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'));
    worker.onmessage = workeronmessage;
    workers[i]= [worker , false];
  }
}
//queue and start work
//priority defines a tabId to search for
function processqueue(priority=0){
  var work = null;
  while (workqueuelength > 0 && options.maxworkers > runningworkers){
    if ((priority > 0)
        && (workqueue[priority])
        && (work = workqueue[priority].shift())){
      dowork(work)
      workqueuelength--;
      console.log("Prioritizing tab %s work with %s items, total queue %s items", priority, workqueue[priority].length, workqueuelength)
    }else{
      for (var tabId in workqueue){
        if(work = workqueue[tabId].shift()){
          dowork(work)
          workqueuelength--;
        }
      }
    }
  }
}
function dowork(message){
  spawnworkers()
  var offset = options.maxworkers - runningworkers
  if (options.maxworkers > runningworkers ){
    for (var i = runningworkers % options.maxworkers; i < options.maxworkers + offset - 1; i = (i + 1) % options.maxworkers){
      if (!workers[i][1]) {// worker is available
        message["id"] = i;
        var worker = workers[i][0]
        workers[i][1] = true
        worker.postMessage(message)
        runningworkers++
        break
      }else {
        continue
      }
    }
  }else{ // queue up work
    queuework(message)
  }
}
function queuework(message){
  var tabId;
  if (!message["tabId"]){
    tabId = 0;
  }else{
    tabId = message["tabId"]
  }
  if (!workqueue[tabId]){
    workqueue[tabId] = []
  }
  workqueue[tabId].push(message)
  workqueuelength++;
}

function workerdone(id){
  workers[id][1] = false
  runningworkers--
}
