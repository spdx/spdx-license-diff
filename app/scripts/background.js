// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

import _ from "underscore";
import { spdxkey, defaultoptions, urls, newLicenseUrl } from "./const.js";
import { checkLocalFileAccess } from "./cc-by-sa.js";

var version = browser.runtime.getManifest().version;
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
var activeTabId = null;
var unsorted = {};
var selection = "";
var status = {};
var diffcount = {};
var licensesLoaded = 0;
var pendingload = false;
var filtered = {};
var total = 0;
var completedcompares = 0;

chrome.browserAction.setBadgeText({
  text: `Diff`,
});

function handleClick(tab) {
  // Send a message to the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tab) {
    var activeTab = tab[0];
    activeTabId = activeTab.id;
    console.log("Click detected", status[activeTabId]);
    if (activeTab.url.toLowerCase().startsWith("file:")) {
      chrome.extension.isAllowedFileSchemeAccess(checkLocalFileAccess);
    }
    if (!status[activeTabId]) {
      injectContentScript(activeTabId);
    } else {
      chrome.tabs.sendMessage(
        activeTabId,
        { command: "clicked_browser_action" },
        messageResponse
      );
    }
  });
}

function injectContentScript(activeTabId) {
  chrome.tabs.insertCSS(activeTabId, { file: "/styles/contentscript.css" });
  chrome.tabs.executeScript(
    activeTabId,
    { file: "/scripts/contentscript.js" },
    function (result) {
      chrome.tabs.sendMessage(
        activeTabId,
        { command: "clicked_browser_action" },
        messageResponse
      );
    }
  );
}
function messageResponse(response) {
  console.log("Processing message response from " + activeTabId, response);
  if (!response) {
    console.log(
      activeTabId + " failed to respond; assuming not injected in tab"
    );
    status[activeTabId] = null;
  }
}

function handleActivate(activeinfo) {
  // Set the active tab
  activeTabId = activeinfo.tabId;
  // console.log("ActiveTabId changed", activeTabId)
  if (status[activeTabId]) {
    chrome.tabs.sendMessage(
      activeTabId,
      { command: "alive?" },
      messageResponse
    );
  }
}

function handleUpdated(tabId, changeInfo, tabInfo) {
  // console.log(tabId + " updated.");
  if (status[tabId]) {
    // reset status so we will inject content script again
    status[tabId] = null;
  }
}
function handleFocusChanged(windowid) {
  // Set the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (
    queryinfo
  ) {
    if (queryinfo.length > 0) {
      activeTabId = queryinfo[0].id;
    }
    // console.log("ActiveTabId changed", activeTabId)
  });
}

// This function responds to changes to storage
function handleStorageChange(changes, area) {
  if (area === "local" && "options" in changes) {
    console.log("Detected changed options; reloading");
    restoreOptions();
  }
}

// respond to content script
function handleMessage(request, sender, sendResponse) {
  switch (request.command) {
    case "focused":
      activeTabId = sender.tab.id;
      console.log("activeTabId", activeTabId);
      break;
    case "updatelicenselist":
      updateList();
      break;
    case "compareselection":
      selection = request.selection;
      activeTabId = sender.tab.id;
      if (
        updating ||
        list.licenses === undefined ||
        list.exceptions === undefined ||
        licensesLoaded < list.licenses.length + list.exceptions.length
      ) {
        pendingcompare = true;
        var priorIndex = comparequeue.findIndex((item) => {
          return item.tabId === activeTabId;
        });
        if (comparequeue.length > 0 && priorIndex > -1) {
          comparequeue[priorIndex] = {
            selection: selection,
            tabId: activeTabId,
          };
        } else comparequeue.push({ selection: selection, tabId: activeTabId });
        status[activeTabId] = "Pending";
        var timeElapsed = updating ? Date.now() - updating : 0;
        if (updating && timeElapsed <= 120000) {
          console.log(
            "Update pending %s seconds; queing compare for tab %s; %s queued",
            (timeElapsed / 1000).toFixed(2),
            activeTabId,
            comparequeue.length
          );
        } else if (updating) {
          console.log(
            "Update pending %s seconds exceeded timeout; forcing load list; %s queued",
            (timeElapsed / 1000).toFixed(2),
            comparequeue.length
          );
          loadList();
        } else {
          console.log(
            "License load needed; queing compare for tab %s; %s queued",
            activeTabId,
            comparequeue.length
          );
          loadList();
        }
        break;
      }
      if (status[activeTabId] !== "Comparing") {
        console.log(
          "tab %s: Starting compare: %s",
          activeTabId,
          selection.substring(0, 25)
        );
        status[activeTabId] = "Comparing";
        compareSelection(selection, activeTabId);
      } else {
        console.log(
          "tab %s: Ignoring redundant compare: %s",
          activeTabId,
          selection.substring(0, 25)
        );
      }
      break;
    case "generateDiff":
      activeTabId = sender.tab.id;
      request.tabId = activeTabId;
      console.log("tab %s: Generating diff:", activeTabId, request);
      status[activeTabId] = "Diffing";
      diffcount[activeTabId] = diffcount[activeTabId] + 1;
      dowork(request);
      break;
    case "submitNewLicense": {
      activeTabId = sender.tab.id;
      const injectCode = `
          document.getElementById('sourceUrl').value = '${request.url}';
          document.getElementById('comments').value = 'Prepared by spdx-license-diff ${version}';
          document.getElementById('text').value = \`${request.selection}\`;
        `;
      console.log(
        "tab %s: Submitting new license with %s:",
        activeTabId,
        injectCode,
        request
      );
      browser.tabs.create({ url: newLicenseUrl }).then(() => {
        browser.tabs.executeScript({
          code: injectCode,
        });
      });
      break;
    }
    default:
      // console.log("Proxying to worker", request);
      // chrome.tabs.sendMessage(activeTab.id, request);
      break;
  }
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function workeronmessage(event) {
  processqueue(
    status[activeTabId] && status[activeTabId] !== "Done" && activeTabId
      ? activeTabId
      : 0
  ); // Message received so see if queue can be cleared.
  var result;
  var threadid;
  var type;
  var item;
  switch (event.data.command) {
    case "progressbarmax":
      var tabId =
        event.data.tabId !== undefined ? event.data.tabId : activeTabId;
      if (pendingcompare) {
        // broadcast to all
        for (var i = 0; i < comparequeue.length; i++) {
          chrome.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data);
      }
      break;
    case "progressbarvalue":
      tabId = event.data.tabId !== undefined ? event.data.tabId : activeTabId;
      if (pendingcompare) {
        // broadcast to all
        for (i = 0; i < comparequeue.length; i++) {
          chrome.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data);
      }
      break;
    case "next":
      tabId = event.data.tabId !== undefined ? event.data.tabId : activeTabId;
      if (pendingcompare) {
        // broadcast to all
        for (i = 0; i < comparequeue.length; i++) {
          chrome.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        chrome.tabs.sendMessage(tabId, event.data);
      }

      break;
    case "store":
      // This path is intended to store a hash of a comparison. TODO: Complete
      // updateProgressBar(-1, -1)
      var obj = {};
      obj[event.data.spdxid] = {
        hash: event.data.hash,
        raw: event.data.raw,
        processed: event.data.processed,
        patterns: event.data.patterns,
      };

      setStorage(obj);

      break;
    case "license":
      // This path is intended to determine if comparison already done. TODO: Complete
      var spdxid = event.data.spdxid;
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
      break;
    case "savelicenselist":
      type = event.data.type;
      var externallicenselist = event.data.value;
      var externalversion = externallicenselist.licenseListVersion;
      var externalcount = externallicenselist[type]
        ? Object.keys(externallicenselist[type]).length
        : 0;
      console.log("Trying to save list", externallicenselist);
      getStorage("list").then(function (result) {
        if (result.list && result.list.licenseListVersion) {
          var storedlist = result.list;
          var version = storedlist.licenseListVersion;
          var count = storedlist[type]
            ? Object.keys(storedlist[type]).length
            : 0;
          console.log(
            "Existing License list version %s with %s %s",
            version,
            count,
            type
          );
          if (version < externalversion) {
            storedlist[type] = externallicenselist[type];
            console.log(
              "Newer license list version %s found with %s %s",
              externalversion,
              externalcount,
              type
            );
            storeList(storedlist);
            if (list[type + "dict"]) {
              storedlist[type + "dict"] = list[type + "dict"];
            }
            list[type] = storedlist[type];
          } else if (count < externalcount) {
            storedlist[type] = externallicenselist[type];
            console.log(
              "New list version %s found with %s %s more than old list with %s %s",
              externalversion,
              externalcount,
              type,
              count,
              type
            );
            storeList(storedlist);
            if (list[type + "dict"]) {
              storedlist[type + "dict"] = list[type + "dict"];
            }
            list[type] = storedlist[type];
          } else {
            // dowork({ 'command': 'populatelicenselist', 'data': list })
            console.log(
              "No new update found; same version %s and with %s %s",
              externalversion,
              externalcount,
              type
            );
            if (list[type + "dict"]) {
              storedlist[type + "dict"] = list[type + "dict"];
            }
            list[type] = storedlist[type];
          }
        } else {
          console.log("No existing license list found; storing");
          storeList(externallicenselist);
          list = externallicenselist;
        }
        checkUpdateDone();
      });

      break;
    case "saveitem":
      if (updating) {
        item = event.data;
        type = event.data.type;
        spdxid = item.data[spdxkey[type].id];
        if (list[type + "dict"] === undefined) {
          list[type + "dict"] = {};
        }
        list[type + "dict"][spdxid] = item.data;
        checkUpdateDone();
        console.log("Saving %s: %s", type, spdxid, item.data);
        getStorage(spdxid).then(function (result) {
          if (
            result[spdxid] &&
            item.data &&
            _.isEqual(result[spdxid], item.data)
          ) {
            // var license = result[spdxid]
            console.log("Ignoring existing %s %s", type, spdxid);
          } else {
            console.log("Saving new %s %s", type, spdxid);
            var obj = {};
            obj[spdxid] = item.data;
            chrome.storage.local.set(obj, function () {
              console.log("Storing", obj);
            });
          }
        });
      } else {
        console.log(
          "Not supposed to update but received saveitem request; ignoring",
          event.data
        );
      }
      break;
    case "updatedone":
      workerdone(event.data.id);
      type = event.data.type;
      console.log("Received worker update completion for %s", type);
      checkUpdateDone();
      break;
    case "comparenext":
      threadid = event.data.id;
      workerdone(threadid);
      tabId = event.data.tabId;
      result = event.data.result;
      spdxid = event.data.spdxid;
      chrome.tabs.sendMessage(tabId, {
        command: "next",
        spdxid: spdxid,
        id: threadid,
      });
      unsorted[tabId][spdxid] = result;
      completedcompares++;
      if (completedcompares === Object.keys(unsorted[tabId]).length) {
        console.log(
          "Requesting final sort of %s for tab %s",
          Object.keys(unsorted[tabId]).length,
          tabId
        );
        status[tabId] = "Sorting";
        dowork({
          command: "sortlicenses",
          licenses: unsorted[tabId],
          tabId: tabId,
        });
        // unsorted[tabId] = {}
        diffcount[tabId] = 0;
      }
      break;
    case "sortdone":
      threadid = event.data.id;
      workerdone(threadid);
      tabId = event.data.tabId;
      result = event.data.result;
      chrome.tabs.sendMessage(tabId, {
        command: "sortdone",
        result: result,
        id: threadid,
      });
      break;
    case "diffnext":
      threadid = event.data.id;
      workerdone(threadid);
      tabId = event.data.tabId;
      result = event.data.result;
      spdxid = event.data.spdxid;
      var record = event.data.record;
      chrome.tabs.sendMessage(tabId, {
        command: "diffnext",
        spdxid: spdxid,
        result: result,
        record: record,
        id: threadid,
      });
      diffcount[tabId] = diffcount[tabId] - 1;
      if (diffcount[tabId] === 0) {
        status[tabId] = "Done";
        for (const filter of Object.keys(filtered[tabId])) {
          if (filter === "results") continue;
          for (const item in filtered[tabId][filter]) {
            const type = filtered[tabId][filter][item].type;
            const itemdict = list[type + "dict"][item];
            status[tabId] = "Background comparing";
            console.log("Background compare for %s", item);
            dowork({
              command: "compare",
              selection: selection,
              maxLengthDifference: options.maxLengthDifference,
              diceCoefficient: options.diceCoefficient,
              spdxid: item,
              itemdict: itemdict,
              total: total,
              tabId: tabId,
              type: type,
              background: true,
            });
          }
        }
      }
      break;
    case "backgroundcomparenext":
      threadid = event.data.id;
      workerdone(threadid);
      tabId = event.data.tabId;
      result = event.data.result;
      spdxid = event.data.spdxid;
      chrome.tabs.sendMessage(tabId, {
        command: "next",
        spdxid: spdxid,
        id: threadid,
      });
      if (filtered[tabId].results === undefined) {
        filtered[tabId].results = {};
      }
      filtered[tabId].results[spdxid] = result;
      unsorted[tabId][spdxid] = result;
      completedcompares++;
      total = Object.keys(urls).reduce((total, type) => {
        return total + Object.keys(list[type + "dict"]).length;
      }, 0);
      if (completedcompares === total) {
        console.log(
          "Done with background compare of %s for tab %s",
          Object.keys(filtered[tabId].results).length,
          tabId
        );
        status[tabId] = "Done";
        dowork({
          command: "sortlicenses",
          licenses: unsorted[tabId],
          tabId: tabId,
        });
        // unsorted[tabId] = {}
        diffcount[tabId] = 0;
      }
      break;
    default:
  }
}
// storage functions
function storeList(externallicenselist) {
  var obj = {};
  externallicenselist.lastupdate = Date.now();
  obj = {
    list: externallicenselist,
  };
  setStorage(obj);
}
function loadList() {
  if (pendingload) {
    console.log("Ignoring redundant loadList request");
  } else {
    pendingload = true;
    console.log("Attempting to load list from storage");
    getStorage("list").then((result, intspdxkey = spdxkey) => {
      if (result.list && result.list.licenseListVersion) {
        list = result.list;
        lastupdate = list.lastupdate;
        var version = list.licenseListVersion;
        var lcount = list.licenses ? Object.keys(list.licenses).length : 0;
        var ecount = list.exceptions ? Object.keys(list.exceptions).length : 0;

        console.log(
          "Loading License list version %s from storage with %s licenses %s exceptions last updated %s",
          version,
          lcount,
          ecount,
          new Date(lastupdate)
        );
        if (Date.now() - lastupdate >= options.updateFrequency * 86400000) {
          console.log(
            "Last update was over %s days ago; update required",
            options.updateFrequency
          );
          updateList();
        } else {
          for (const type of Object.keys(urls)) {
            if (!list[type]) {
              continue;
            }
            if (typeof list[type + "dict"] === "undefined") {
              list[type + "dict"] = {};
            }
            for (let j = 0; j < list[type].length; j++) {
              const line = list[type][j];
              let item = line[intspdxkey[type].id];
              console.log("Attempting to load %s from storage", item);
              getStorage(item).then((result, types = Object.keys(urls)) => {
                if (result && !_.isEmpty(result)) {
                  item = Object.keys(result)[0];
                  list[type + "dict"][item] = result[item];
                  licensesLoaded++;
                  console.log(
                    "%s succesfully loaded from storage %s/%s (%s)",
                    item,
                    Object.keys(list[type + "dict"]).length,
                    list[type].length,
                    type
                  );
                } else if (updating) {
                  console.log("%s not found in storage; update pending", item);
                } else {
                  console.log(
                    "%s not found in storage; requesting update",
                    item
                  );
                  updateList();
                }
                if (
                  types.every((type) => {
                    return (
                      list[type] &&
                      list[type + "dict"] &&
                      list[type].length ===
                        Object.keys(list[type + "dict"]).length
                    );
                  })
                ) {
                  pendingload = false;
                  launchPendingCompares();
                }
              });
            }
          }
        }
      } else {
        pendingload = false;
        console.log("No license list found in storage; requesting update");
        updateList();
      }
    });
  }
}

function updateList() {
  if (updating) {
    console.log("Ignoring redundant update request");
  } else {
    updating = Date.now();
    licensesLoaded = 0;
    dowork({ command: "updatelicenselist" });
  }
}

// processing phase functions (these are called by the workeronmessage in order)
// Compare selection against a fully populated license list (must be loaded in list)
// This is the first phase to determine edit distance and return a sorted list
// for display in spdx
function compareSelection(selection, tabId = activeTabId) {
  unsorted[tabId] = {};
  if (filtered === undefined) {
    filtered = {};
  }
  filtered[tabId] = {};
  completedcompares = 0;
  for (const type of Object.keys(urls)) {
    for (const item of Object.keys(list[type + "dict"])) {
      for (const filter in options.filters) {
        if (list[type + "dict"][item][options.filters[filter]]) {
          if (filtered[tabId][filter] === undefined) {
            filtered[tabId][filter] = {};
          }
          filtered[tabId][filter][item] = {};
          filtered[tabId][filter][item].type = type;
          console.log("Deferring %s %s because its %s", type, item, filter);
        }
        if (
          filtered[tabId] === undefined ||
          filtered[tabId][filter] === undefined ||
          filtered[tabId][filter][item] === undefined
        ) {
          unsorted[tabId][item] = list[type + "dict"][item];
          unsorted[tabId][item].type = type;
        }
      }
    }
  }
  total = Object.keys(unsorted[tabId]).length;
  for (const item in unsorted[tabId]) {
    const type = unsorted[tabId][item].type;
    const itemdict = list[type + "dict"][item];
    dowork({
      command: "compare",
      selection: selection,
      maxLengthDifference: options.maxLengthDifference,
      diceCoefficient: options.diceCoefficient,
      spdxid: item,
      itemdict: itemdict,
      total: total,
      tabId: tabId,
      type: type,
    });
    chrome.tabs.sendMessage(tabId, {
      message: "progressbarmax",
      value: total,
      stage: "Comparing licenses",
      reset: true,
    });
  }
}

function launchPendingCompares() {
  if (pendingcompare) {
    console.log("Processing pending %s compare items", comparequeue.length);
  }
  while (comparequeue.length) {
    var compare = comparequeue.shift();
    selection = compare.selection;
    var tabId = compare.tabId;
    console.log(
      "Processing compare queue: compare for %s of selection length %s",
      tabId,
      selection.length
    );
    status[tabId] = "Comparing";
    compareSelection(selection, tabId);
  }
  pendingcompare = false;
}

function restoreOptions(callbackFunction = null) {
  getStorage("options").then(function (result) {
    options = result.options;
    if (options === undefined) {
      options = defaultoptions;
    }
    if (callbackFunction !== null) callbackFunction();
  });
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function spawnworkers() {
  if (workers.length >= options.maxworkers) {
    return;
  }
  console.log("Spawning %s workers", options.maxworkers);
  for (var i = 0; i < options.maxworkers; i++) {
    var worker = new Worker(chrome.runtime.getURL("scripts/worker.js"));
    worker.onmessage = workeronmessage;
    workers[i] = [worker, false];
  }
}
// queue and start work
// priority defines a tabId to search for
function processqueue(priority = 0) {
  var work = null;
  while (workqueuelength > 0 && options.maxworkers > runningworkers) {
    if (
      priority > 0 &&
      workqueue[priority] &&
      (work = workqueue[priority].shift())
    ) {
      dowork(work);
      workqueuelength--;
      console.log(
        "Prioritizing tab %s work with %s items, total queue %s items",
        priority,
        workqueue[priority].length,
        workqueuelength
      );
    } else {
      for (var tabId in workqueue) {
        work = workqueue[tabId].shift();
        if (work) {
          dowork(work);
          workqueuelength--;
        }
      }
    }
  }
}
function dowork(message) {
  spawnworkers();
  runningworkers = runningworkers >= 0 ? runningworkers : 0;
  var offset = options.maxworkers - runningworkers;
  if (options.maxworkers > runningworkers) {
    for (
      var i = runningworkers % options.maxworkers;
      i < options.maxworkers + offset - 1;
      i = (i + 1) % options.maxworkers
    ) {
      if (!workers[i][1]) {
        // worker is available
        message.id = i;
        var worker = workers[i][0];
        workers[i][1] = true;
        worker.postMessage(message);
        runningworkers++;
        break;
      } else {
        continue;
      }
    }
  } else {
    // queue up work
    queuework(message);
  }
}
function queuework(message) {
  var tabId;
  if (!message.tabId) {
    tabId = 0;
  } else {
    tabId = message.tabId;
  }
  if (!workqueue[tabId]) {
    workqueue[tabId] = [];
  }
  workqueue[tabId].push(message);
  workqueuelength++;
}

function workerdone(id) {
  workers[id][1] = false;
  runningworkers--;
}

// promisfy gets
const getStorage = function (item) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(item, function (result) {
      if (chrome.runtime.lastError) {
        reject(Error(chrome.runtime.lastError));
      } else {
        resolve(result);
      }
    });
  });
};

const setStorage = function (obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, function () {
      if (chrome.runtime.lastError) {
        reject(Error(chrome.runtime.lastError));
      } else {
        console.log("Storing", obj);
        resolve();
      }
    });
  });
};

const checkUpdateDone = function () {
  const types = Object.keys(urls);
  try {
    if (
      types.every((type) => {
        return (
          list[type] &&
          list[type + "dict"] &&
          list[type].length === Object.keys(list[type + "dict"]).length
        );
      })
    ) {
      console.log("Update completed");
      updating = false;
      launchPendingCompares();
    } else {
      types.map((type) => {
        console.log(
          "Update in progress for %s %s/%s",
          type,
          list[type + "dict"] ? Object.keys(list[type + "dict"]).length : 0,
          list[type] ? list[type].length : 0
        );
      });
    }
  } catch (err) {
    console.log("Error in checkUpdateDone");
    throw err;
  }
};

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    console.log("Updating list");
  } else if (details.reason === "update") {
    console.log(
      "Updated from " +
        details.previousVersion +
        " to " +
        version +
        "; forcing list update"
    );
    restoreOptions(updateList);
  }
});

function init() {
  console.log("Initializing spdx-license-diff " + version);
  restoreOptions(loadList);
}

init();
chrome.runtime.onStartup.addListener(init);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.browserAction.onClicked.addListener(handleClick);
chrome.tabs.onActivated.addListener(handleActivate);
chrome.windows.onFocusChanged.addListener(handleFocusChanged);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.tabs.onUpdated.addListener(handleUpdated);

chrome.contextMenus.onClicked.addListener(handleClick);
chrome.contextMenus.create({
  title: "License-Diff selection",
  contexts: ["selection"],
  id: "contextId",
});
