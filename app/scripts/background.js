// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

import _ from "underscore";
import { spdxkey, defaultoptions, urls, newLicenseUrl } from "./const.js";

// Service worker compatible version of checkLocalFileAccess
function checkLocalFileAccess(isAllowedAccess) {
  if (isAllowedAccess) return;
  console.log(chrome.i18n.getMessage("localPermissionNeeded"));
  chrome.tabs.create({
    url: "chrome://extensions/?id=" + chrome.runtime.id,
  });
}

var version = chrome.runtime.getManifest().version;
var list = {};
var options;
var lastupdate;
var updating = false;
// Offscreen document management
var offscreenReady = false;
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

chrome.action.setBadgeText({
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
  chrome.scripting.insertCSS({
    target: { tabId: activeTabId },
    files: ["/styles/contentscript.css"],
  });
  chrome.scripting.executeScript(
    {
      target: { tabId: activeTabId },
      files: ["/scripts/contentscript.js"],
    },
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
  chrome.tabs.query(
    { active: true, currentWindow: true },
    function (queryinfo) {
      if (queryinfo.length > 0) {
        activeTabId = queryinfo[0].id;
      }
      // console.log("ActiveTabId changed", activeTabId)
    }
  );
}

// This function responds to changes to storage
function handleStorageChange(changes, area) {
  if (area === "local" && "options" in changes) {
    console.log("Detected changed options; reloading");
    restoreOptions();
  }
}

// respond to content script and offscreen document
function handleMessage(request, sender, sendResponse) {
  // Handle messages from offscreen document (if no tab, it's from offscreen)
  if (!sender.tab) {
    // Message from offscreen document
    if (request.command === "workerResponse") {
      // Handle worker response from offscreen document
      handleWorkerResponse(request.data);
      return;
    }
    if (request.command === "workerProcessQueue") {
      processqueue(request.priority);
      return;
    }
    if (request.command === "forwardToTab") {
      forwardMessageToTab(request.data);
      return;
    }
    if (request.command === "workerStore") {
      handleWorkerStore(request.data);
      return;
    }
    if (request.command === "workerSaveLicenseList") {
      handleWorkerSaveLicenseList(request.data);
      return;
    }
    if (request.command === "workerSaveItem") {
      handleWorkerSaveItem(request.data);
      return;
    }
    if (request.command === "workerSortComplete") {
      handleWorkerSortComplete(request.data);
      return;
    }
    if (request.command === "workerUpdateDone") {
      handleWorkerUpdateDone(request.data);
      return;
    }
    if (request.command === "workerCompareComplete") {
      handleWorkerCompareComplete(request.data);
      return;
    }
    if (request.command === "workerDiffComplete") {
      handleWorkerDiffComplete(request.data);
      return;
    }
    return; // Offscreen message handled
  }

  // Handle regular content script messages
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
          console.log("Receiving injected code from tab:" + ${activeTabId})
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
      chrome.tabs.create({ url: newLicenseUrl }).then(
        () => {
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: activeTabId },
              func: function (activeTabId, url, version, selection) {
                console.log("Receiving injected code from tab:" + activeTabId);
                document.getElementById("sourceUrl").value = url;
                document.getElementById("comments").value =
                  "Prepared by spdx-license-diff " + version;
                document.getElementById("text").value = selection;
              },
              args: [activeTabId, request.url, version, request.selection],
            });
          }, 250);
        },
        (error) => {
          console.log(`Error injecting code: ${error}`);
        }
      );
      break;
    }
    case "newTab": {
      activeTabId = sender.tab.id;
      console.log("tab %s: Creating new tab with:", activeTabId, request);
      chrome.tabs.create({ url: "/pages/popup.html" }).then(
        (tab) => {
          console.log("Tab %s created", tab.id);
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, request);
          }, 250);
        },
        (error) => {
          console.log(`Error starting new tab: ${error}`);
        }
      );
      break;
    }
    default:
      // console.log("Proxying to worker", request);
      // chrome.tabs.sendMessage(activeTab.id, request);
      break;
  }
}

// Offscreen worker message handlers
function handleWorkerResponse(data) {
  // Process worker response from offscreen document
  // This is essentially the workeronmessage function adapted for offscreen communication
  var result;
  var threadid;
  var type;
  var item;
  var tabId;
  var spdxid;
  
  switch (data.command) {
    case "license":
      spdxid = data.spdxid;
      break;
    case "savelicenselist":
      handleWorkerSaveLicenseList(data);
      break;
    case "saveitem":
      handleWorkerSaveItem(data);
      break;
    case "updatedone":
      handleWorkerUpdateDone(data);
      break;
    case "comparenext":
      handleWorkerCompareComplete(data);
      break;
    case "sortdone":
      handleWorkerSortComplete(data);
      break;
    case "diffnext":
      handleWorkerDiffComplete(data);
      break;
    default:
      console.log("Unknown worker response command:", data.command);
      break;
  }
}

function forwardMessageToTab(data) {
  var tabId = data.tabId !== undefined ? data.tabId : activeTabId;
  if (pendingcompare) {
    // broadcast to all
    for (var i = 0; i < comparequeue.length; i++) {
      chrome.tabs.sendMessage(comparequeue[i].tabId, data);
    }
  } else if (tabId !== undefined && tabId) {
    chrome.tabs.sendMessage(tabId, data);
  }
}

function handleWorkerStore(data) {
  var obj = {};
  obj[data.spdxid] = {
    hash: data.hash,
    raw: data.raw,
    processed: data.processed,
    patterns: data.patterns,
  };
  setStorage(obj);
}

function handleWorkerSaveLicenseList(data) {
  workeronmessage({ data: data });
}

function handleWorkerSaveItem(data) {
  workeronmessage({ data: data });
}

function handleWorkerSortComplete(data) {
  var threadid = data.id;
  var tabId = data.tabId;
  var result = data.result;
  
  chrome.tabs.sendMessage(tabId, {
    command: "sortdone",
    result: result,
    id: threadid,
  });
}

function handleWorkerUpdateDone(data) {
  checkUpdateDone();
}

function handleWorkerCompareComplete(data) {
  var threadid = data.id;
  var tabId = data.tabId;
  var result = data.result;
  var spdxid = data.spdxid;
  
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
    diffcount[tabId] = 0;
  }
}

function handleWorkerDiffComplete(data) {
  var threadid = data.id;
  var tabId = data.tabId;
  var result = data.result;
  var spdxid = data.spdxid;
  var record = data.record;
  
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
    // Handle filtered licenses in background if any
    for (const filter of Object.keys(filtered[tabId])) {
      if (filter === "results") continue;
      for (const item in filtered[tabId][filter]) {
        const type = filtered[tabId][filter][item].type;
        const itemdict = list[type + "dict"][item];
        status[tabId] = "Background comparing";
        chrome.tabs.sendMessage(tabId, {
          command: "background",
          stage: "Comparing filtered licenses",
          spdxid: item,
          type: type,
        });
      }
    }
  }
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function workeronmessage(event) {
  // Simplified function - most processing now handled by offscreen document
  var result;
  var threadid;
  var type;
  var item;
  var tabId;
  var spdxid;
  switch (event.data.command) {
    case "license":
      // This path is intended to determine if comparison already done. TODO: Complete
      spdxid = event.data.spdxid;
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
      type = event.data.type;
      console.log("Received worker update completion for %s", type);
      checkUpdateDone();
      break;
    case "comparenext":
      threadid = event.data.id;
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
      command: "progressbarmax",
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

// Offscreen document functions (replaces worker management)
async function ensureOffscreenDocument() {
  if (offscreenReady) return;

  // Check if offscreen API is available (Chrome)
  if (typeof chrome !== 'undefined' && chrome.offscreen) {
    try {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("pages/offscreen.html"),
        reasons: ["WORKERS"],
        justification: "Manage Web Workers for license comparison processing",
      });
      offscreenReady = true;
    } catch (error) {
      console.log("Offscreen document already exists or error:", error);
      offscreenReady = true;
    }
  } else {
    // Firefox: Use event page directly - initialize workers in background
    console.log("Using Firefox event page approach - initializing workers directly");
    initDirectWorkers();
    offscreenReady = true;
  }
}

function processqueue(priority = 0) {
  if (!offscreenReady) return;
  
  if (typeof chrome !== 'undefined' && chrome.offscreen) {
    // Chrome: Send message to offscreen document
    chrome.runtime.sendMessage({
      command: "processQueue",
      priority: priority,
    });
  } else {
    // Firefox: Process direct worker queues
    for (let i = 0; i < directWorkers.length; i++) {
      processDirectWorkerQueue(i);
    }
  }
}

function dowork(message) {
  ensureOffscreenDocument().then(() => {
    setTimeout(() => {
      try {
        // Check if we're using offscreen (Chrome) or direct workers (Firefox)
        if (typeof chrome !== 'undefined' && chrome.offscreen) {
          // Chrome: Send to offscreen document
          chrome.runtime.sendMessage({
            command: "initWorkerManager",
            options: options,
          });
          
          chrome.runtime.sendMessage({
            command: "doWork",
            workMessage: message,
          });
        } else {
          // Firefox: Send work directly to workers
          sendWorkDirectly(message);
        }
      } catch (error) {
        console.error("Error in dowork:", error);
      }
    }, 50);
  }).catch((error) => {
    console.error("Error ensuring offscreen document:", error);
  });
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

// Firefox-compatible worker management
let directWorkers = [];
let directWorkerQueues = [];

function initDirectWorkers() {
  if (directWorkers.length > 0) return; // Already initialized
  
  console.log('Initializing direct workers for Firefox');
  const maxworkers = options?.maxworkers || 10;
  
  for (let i = 0; i < maxworkers; i++) {
    const worker = new Worker(chrome.runtime.getURL("scripts/worker.js"));
    
    worker.onmessage = function(event) {
      try {
        // Use the same handler as offscreen
        handleWorkerResponse(event.data);
        if (event.data.id !== undefined) {
          processDirectWorkerQueue(event.data.id);
        }
      } catch (error) {
        console.error('Error handling worker message:', error, event.data);
      }
    };
    
    worker.onerror = function(error) {
      console.error('Direct worker error:', error);
    };
    
    directWorkers.push(worker);
    directWorkerQueues.push([]);
  }
  console.log('Direct workers initialized:', directWorkers.length);
}

function processDirectWorkerQueue(workerIndex) {
  if (directWorkerQueues[workerIndex].length > 0) {
    const message = directWorkerQueues[workerIndex].shift();
    directWorkers[workerIndex].postMessage(message);
  }
}

function sendWorkDirectly(message) {
  if (directWorkers.length === 0) {
    initDirectWorkers();
  }
  
  // Find worker with shortest queue
  let workerindex = 0;
  let mininqueue = directWorkerQueues[0].length;
  for (let i = 0; i < directWorkerQueues.length; i++) {
    if (directWorkerQueues[i].length < mininqueue) {
      mininqueue = directWorkerQueues[i].length;
      workerindex = i;
    }
  }
  
  message.id = workerindex;
  directWorkerQueues[workerindex].push(message);
  processDirectWorkerQueue(workerindex);
}

function init() {
  console.log("Initializing spdx-license-diff " + version);
  restoreOptions(() => {
    ensureOffscreenDocument().then(() => {
      loadList();
    });
  });
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      title: "License-Diff selection",
      id: "spdxLicenseDiff",
      contexts: ["selection"],
    });
  });
}

init();
chrome.runtime.onStartup.addListener(init);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.action.onClicked.addListener(handleClick);
chrome.tabs.onActivated.addListener(handleActivate);
chrome.windows.onFocusChanged.addListener(handleFocusChanged);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.tabs.onUpdated.addListener(handleUpdated);
chrome.contextMenus.onClicked.addListener(handleClick);
