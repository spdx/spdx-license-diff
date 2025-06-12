// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

import _ from "underscore";
import { spdxkey, defaultoptions, urls, newLicenseUrl } from "./const.js";
import { checkLocalFileAccess } from "./cc-by-sa.js";

const api = typeof browser !== "undefined" ? browser : chrome;
const version = api.runtime.getManifest().version;
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
var workersInitialized = false;
var workersInitializing = false;

api.action.setBadgeText({
  text: "Diff"
});

// Send messages to options page if it's open
function sendMessageToOptionsPage(command, message, type = 'info') {
  // Try to send message to all extension pages (including options page)
  api.runtime.sendMessage({
    command: command,
    message: message,
    type: type
  }).catch(() => {
    // Options page may not be open, that's fine
    console.log('Options page not open, skipping status message');
  });
}

// Check if SPDX.org permission is granted
async function checkSpdxPermission() {
  try {
    console.log("BACKGROUND: Checking SPDX.org permission with api.permissions.contains()");
    console.log("BACKGROUND: Browser type:", typeof browser !== "undefined" ? "Firefox" : "Chrome");
    
    // For Chrome, check if permissions are already granted via manifest host_permissions
    const isChrome = typeof browser === "undefined";
    
    if (isChrome) {
      console.log("BACKGROUND: Chrome detected - checking if host permissions are pre-granted");
      
      // In Chrome, host_permissions in manifest.json are automatically granted
      // We should check if we can actually make requests to spdx.org instead of using permissions API
      // The permissions.contains() API is primarily for optional permissions, not manifest permissions
      
      // For now, let's assume Chrome has the permission if it's in host_permissions
      // This is a workaround for the Chrome API behavior
      console.log("BACKGROUND: Chrome has host_permissions for *.spdx.org in manifest - assuming granted");
      return true;
    }
    
    // For Firefox, use the permissions API as normal
    console.log("BACKGROUND: Firefox detected - using permissions API");
    const hasPermission = await api.permissions.contains({
      origins: ["*://*.spdx.org/*"]
    });
    
    console.log("BACKGROUND: Permission check result:", hasPermission);
    
    if (!hasPermission) {
      console.warn("BACKGROUND: SPDX.org permission not granted by user");
      return false;
    }
    
    console.log("BACKGROUND: SPDX.org permission confirmed");
    return true;
  } catch (error) {
    console.error("BACKGROUND: Error checking SPDX.org permission:", error);
    return false;
  }
}

// Request SPDX.org permission from user
async function requestSpdxPermission() {
  try {
    const granted = await api.permissions.request({
      origins: ["*://*.spdx.org/*"]
    });
    
    if (granted) {
      console.log("SPDX.org permission granted by user");
      return true;
    } else {
      console.warn("SPDX.org permission denied by user");
      // Show helpful message to user
      showPermissionError();
      return false;
    }
  } catch (error) {
    console.error("Error requesting SPDX.org permission:", error);
    return false;
  }
}

// Show error message when SPDX.org permission is missing
function showPermissionError() {
  // Send message to any active content scripts
  api.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      api.tabs.sendMessage(tabs[0].id, {
        command: "show_permission_error",
        message: "SPDX License Diff needs permission to access spdx.org to download license data. Please grant permission in the extension popup or settings."
      }).catch(() => {
        // If no content script, show notification
        if (api.notifications) {
          api.notifications.create({
            type: 'basic',
            iconUrl: 'images/spdx.png',
            title: 'SPDX License Diff',
            message: 'Permission needed to access spdx.org for license data. Please check extension settings.'
          });
        }
      });
    }
  });
}

// Show error message when content script injection fails due to permissions
function showContentScriptPermissionError(tabId) {
  // Send message to any active content scripts if possible
  api.tabs.sendMessage(tabId, {
    command: "show_permission_error",
    message: "SPDX License Diff needs permission to run on this page. Please grant the necessary permissions or reload the page."
  }).catch(() => {
    // If no content script available, show notification
    if (api.notifications) {
      api.notifications.create({
        type: 'basic',
        iconUrl: 'images/spdx.png',
        title: 'SPDX License Diff',
        message: 'Permission needed to run on this page. Please check extension permissions.'
      });
    }
  });
}

// Check if we can inject content scripts (activeTab permission)
async function checkContentScriptPermission(tabId, url) {
  try {
    console.log("Checking content script permission for:", url);
    
    // Check if the URL is allowed for injection
    if (url && (url.startsWith('chrome://') || url.startsWith('moz-extension://') || url.startsWith('about:') || url.startsWith('chrome-extension://'))) {
      console.warn("Cannot inject into browser internal pages:", url);
      return false;
    }
    
    // For Firefox, additional checks for special URLs
    if (typeof browser !== "undefined") {
      if (url && (url.startsWith('moz://') || url.startsWith('resource://') || url.startsWith('jar:file://'))) {
        console.warn("Firefox: Cannot inject into special protocol pages:", url);
        return false;
      }
    }
    
    console.log("Content script injection allowed for:", url);
    return true;
  } catch (error) {
    console.error("Error checking content script permission:", error);
    return false;
  }
}

// Check if we have basic license data available
function _hasBasicLicenseData() {
  return list && 
         list.licenses && 
         list.exceptions && 
         list.licensesdict && 
         list.exceptionsdict &&
         Object.keys(list.licensesdict).length > 0;
}

function handleClick(_tab) {
  // Send a message to the active tab
  api.tabs.query({ active: true, currentWindow: true }, function (tab) {
    var activeTab = tab[0];
    activeTabId = activeTab.id;
    console.log("Click detected", status[activeTabId]);
    if (activeTab.url.toLowerCase().startsWith("file:")) {
      // In Manifest V3, we try injection and handle permission errors
      console.log("File URL detected, checking permissions");
      checkFileAccess(activeTabId, activeTab);
      return;
    }
    if (!status[activeTabId]) {
      injectContentScript(activeTabId);
    } else {
      api.tabs.sendMessage(
        activeTabId,
        { command: "clicked_browser_action" },
        messageResponse
      );
    }
  });
}

function checkFileAccess(activeTabId, _activeTab) {
  // In Manifest V3, we try to inject and handle permission errors
  // First attempt to inject CSS to test access
  api.scripting.insertCSS({
    target: { tabId: activeTabId },
    files: ["/styles/contentscript.css"]
  }).then(() => {
    // If CSS injection succeeds, file access is allowed
    console.log("File access confirmed, proceeding with injection");
    return api.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["/scripts/contentscript.js"]
    });
  }).then((_result) => {
    api.tabs.sendMessage(
      activeTabId,
      { command: "clicked_browser_action" },
      messageResponse
    );
  }).catch((error) => {
    console.error("File access denied:", error);
    // Call the checkLocalFileAccess function to show user guidance
    checkLocalFileAccess(false);
    status[activeTabId] = null;
  });
}

async function injectContentScript(activeTabId) {
  try {
    console.log("Attempting to inject content script into tab:", activeTabId);
    
    // Get tab info for permission checking
    const tab = await api.tabs.get(activeTabId);
    console.log("Tab info:", tab.url, tab.status);
    
    // For Firefox, ensure the tab is fully loaded before injection
    if (typeof browser !== "undefined" && tab.status !== "complete") {
      console.log("Firefox: Waiting for tab to complete loading");
      // Wait a bit for the tab to finish loading
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Check if we can inject content scripts
    const canInject = await checkContentScriptPermission(activeTabId, tab.url);
    if (!canInject) {
      console.error("Content script injection not allowed for this tab");
      status[activeTabId] = null;
      return;
    }
    
    console.log("Injecting CSS into tab:", activeTabId);
    // Inject CSS first
    await api.scripting.insertCSS({
      target: { tabId: activeTabId },
      files: ["/styles/contentscript.css"]
    });
    
    console.log("Injecting JavaScript into tab:", activeTabId);
    // Then inject the script
    await api.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["/scripts/contentscript.js"]
    });
    
    console.log("Content script injection successful, sending message");
    // Send message to the content script
    api.tabs.sendMessage(
      activeTabId,
      { command: "clicked_browser_action" },
      messageResponse
    );
  } catch (error) {
    console.error("Failed to inject content script:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // Provide specific error handling for different Firefox issues
    if (typeof browser !== "undefined") {
      if (error.message.includes("Missing host permission")) {
        console.warn("Firefox: Missing host permission for content script injection");
        showContentScriptPermissionError(activeTabId);
      } else if (error.message.includes("No tab with id")) {
        console.warn("Firefox: Tab no longer exists");
      } else if (error.message.includes("Cannot access a chrome")) {
        console.warn("Firefox: Cannot inject into privileged pages");
      } else if (error.message.includes("Script injection is disallowed")) {
        console.warn("Firefox: Script injection is disallowed on this page");
      } else {
        console.warn("Firefox: Unknown content script injection error");
        // For debugging: show the actual error to help identify issues
        if (api.notifications) {
          api.notifications.create({
            type: 'basic',
            iconUrl: 'images/spdx.png',
            title: 'SPDX License Diff Debug',
            message: `Content script injection failed: ${error.message}`
          });
        }
      }
    }
    
    // Mark the tab as failed so we don't try to inject again
    status[activeTabId] = null;
  }
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
    api.tabs.sendMessage(
      activeTabId,
      { command: "alive?" },
      messageResponse
    );
  }
}

function handleUpdated(tabId, _changeInfo, _tabInfo) {
  // console.log(tabId + " updated.");
  if (status[tabId]) {
    // reset status so we will inject content script again
    status[tabId] = null;
  }
}
function handleFocusChanged(_windowid) {
  // Set the active tab
  api.tabs.query(
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

// respond to content script
async function handleMessage(request, sender, _sendResponse) {
  // Handle messages from offscreen document workers
  if (request.source === 'offscreen-worker') {
    // Add the workerId to the data so workeronmessage can access it
    const eventData = { ...request.data, id: request.workerId };
    workeronmessage({ data: eventData });
    return;
  }
  
  switch (request.command) {
    case "focused":
      activeTabId = sender.tab.id;
      console.log("activeTabId", activeTabId);
      break;
    case "updatelicenselist":
      updateList(true); // User-initiated from options page
      break;
    case "compareselection": {
      selection = request.selection;
      activeTabId = sender.tab.id;
      
      // Since the content script checks permissions first, we can assume they are granted
      console.log("Background: Received compareselection request from content script");
      
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
          loadList(true); // User-initiated via compareselection
        } else {
          console.log(
            "License load needed; queing compare for tab %s; %s queued",
            activeTabId,
            comparequeue.length
          );
          loadList(true); // User-initiated via compareselection
        }
        // Send acknowledgment back to content script for pending case
        return { status: "pending", message: "License comparison queued" };
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
      // Send acknowledgment back to content script
      return { status: "processing", message: "License comparison started" };
    }
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
      console.log(
        "tab %s: Submitting new license:",
        activeTabId,
        request
      );
      api.tabs.create({ url: newLicenseUrl }).then(
        (tab) => {
          setTimeout(() => {
            api.scripting.executeScript({
              target: { tabId: tab.id },
              func: (data) => {
                // Fill form fields with the license data
                try {
                  console.log("Filling form with data:", data);
                  
                  // Try common field names for source URL
                  const sourceUrlFields = ['sourceUrl', 'source_url', 'url', 'licenseUrl'];
                  for (const fieldName of sourceUrlFields) {
                    const field = document.getElementById(fieldName) || document.querySelector(`input[name="${fieldName}"]`);
                    if (field) {
                      field.value = data.url;
                      console.log(`Set ${fieldName} to:`, data.url);
                      break;
                    }
                  }
                  
                  // Try common field names for comments
                  const commentFields = ['comments', 'comment', 'description', 'notes'];
                  for (const fieldName of commentFields) {
                    const field = document.getElementById(fieldName) || document.querySelector(`textarea[name="${fieldName}"]`);
                    if (field) {
                      field.value = `Prepared by spdx-license-diff ${data.version}`;
                      console.log(`Set ${fieldName} to version info`);
                      break;
                    }
                  }
                  
                  // Try common field names for license text
                  const textFields = ['text', 'licenseText', 'license_text', 'content'];
                  for (const fieldName of textFields) {
                    const field = document.getElementById(fieldName) || document.querySelector(`textarea[name="${fieldName}"]`);
                    if (field) {
                      field.value = data.selection;
                      console.log(`Set ${fieldName} to license text (${data.selection.length} chars)`);
                      break;
                    }
                  }
                  
                  console.log("Form filling completed");
                } catch (error) {
                  console.error("Error filling form:", error);
                }
              },
              args: [{
                url: request.url,
                selection: request.selection,
                version: version
              }]
            });
          }, 1000); // Increased timeout to allow page to load
        },
        (error) => {
          console.log(`Error creating tab: ${error}`);
        }
      );
      break;
    }
    case "newTab": {
      activeTabId = sender.tab.id;
      console.log("tab %s: Creating new tab with:", activeTabId, request);
      api.tabs.create({ url: "/pages/popup.html" }).then(
        (tab) => {
          console.log("Tab %s created", tab.id);
          setTimeout(() => {
            api.tabs.sendMessage(tab.id, request);
          }, 250);
        },
        (error) => {
          console.log(`Error starting new tab: ${error}`);
        }
      );
      break;
    }
    case "checkPermissions":
      // Handle permission check request from content script
      console.log("BACKGROUND: Received checkPermissions message from content script");
      try {
        const hasPermission = await checkSpdxPermission();
        console.log("BACKGROUND: Responding with hasPermission:", hasPermission);
        return { hasPermission: hasPermission };
      } catch (error) {
        console.error("BACKGROUND: Error checking permissions:", error);
        return { hasPermission: false, error: error.message };
      }
    case "requestPermissions":
      // Handle permission request from content script
      try {
        const granted = await requestSpdxPermission();
        return { granted: granted };
      } catch (error) {
        console.error("Error requesting permissions:", error);
        return { granted: false, error: error.message };
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
          api.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        api.tabs.sendMessage(tabId, event.data);
      }
      break;
    case "progressbarvalue":
      tabId = event.data.tabId !== undefined ? event.data.tabId : activeTabId;
      if (pendingcompare) {
        // broadcast to all
        for (i = 0; i < comparequeue.length; i++) {
          api.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        api.tabs.sendMessage(tabId, event.data);
      }
      break;
    case "next":
      tabId = event.data.tabId !== undefined ? event.data.tabId : activeTabId;
      if (pendingcompare) {
        // broadcast to all
        for (i = 0; i < comparequeue.length; i++) {
          api.tabs.sendMessage(comparequeue[i].tabId, event.data);
        }
      } else if (tabId !== undefined && tabId) {
        api.tabs.sendMessage(tabId, event.data);
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
            api.storage.local.set(obj, function () {
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
    case "updateerror": {
      workerdone(event.data.id);
      const updateType = event.data.type;
      const errorMessage = event.data.error;
      console.error("Update error for %s: %s", updateType, errorMessage);
      
      // Reset updating flag
      updating = false;
      
      // Send error message to options page
      sendMessageToOptionsPage("update_permission_error", `Failed to update ${updateType} licenses: ${errorMessage}`);
      
      // Show error to user
      showPermissionError();
      break;
    }
    case "comparenext":
      threadid = event.data.id;
      workerdone(threadid);
      tabId = event.data.tabId;
      result = event.data.result;
      spdxid = event.data.spdxid;
      api.tabs.sendMessage(tabId, {
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
      api.tabs.sendMessage(tabId, {
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
      api.tabs.sendMessage(tabId, {
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
      api.tabs.sendMessage(tabId, {
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
function loadList(userInitiated = false) {
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
          updateList(userInitiated);
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
                  updateList(userInitiated);
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
        updateList(userInitiated);
      }
    });
  }
}

async function updateList(userInitiated = false) {
  if (updating) {
    console.log("Ignoring redundant update request");
    if (userInitiated) {
      // Notify options page that update is already in progress
      sendMessageToOptionsPage("update_status", "Update already in progress...", "info");
    }
  } else {
    // Check if we have permission to access spdx.org
    const hasPermission = await checkSpdxPermission();
    if (!hasPermission) {
      if (userInitiated) {
        // Only try to request permission if this is a user-initiated action
        console.log("User-initiated update: attempting to request SPDX.org permission");
        sendMessageToOptionsPage("update_status", "Requesting permission to access SPDX.org...", "info");
        const granted = await requestSpdxPermission();
        if (!granted) {
          console.error("Cannot update license list: SPDX.org permission denied by user");
          sendMessageToOptionsPage("update_permission_error", "Cannot update license list: Permission to access SPDX.org was denied. The extension needs access to SPDX.org to download license data.");
          showPermissionError();
          return;
        }
      } else {
        // For automatic updates, just skip silently
        console.log("Automatic update skipped: SPDX.org permission not granted");
        return;
      }
    }
    
    updating = Date.now();
    licensesLoaded = 0;
    if (userInitiated) {
      sendMessageToOptionsPage("update_status", "Starting license list download...", "info");
    }
    // Get enabled sources from options
    api.storage.local.get(["options"], function(result) {
      const enableSpdxSource = result.options?.enableSpdxSource !== false;
      const enableScancodeSource = result.options?.enableScancodeSource !== false;
      dowork({ command: "updatelicenselist", enableSpdxSource, enableScancodeSource });
    });
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
    // Initialize workers after options are loaded, but only if not already initialized
    if (!workersInitialized && !workersInitializing) {
      spawnWorkers();
    }
    if (callbackFunction !== null) callbackFunction();
  });
}

// Initialize workers through offscreen document or direct worker creation
async function spawnWorkers() {
  // Prevent multiple simultaneous initialization attempts
  if (workersInitialized || workersInitializing) {
    console.log('Workers already initialized or initializing, skipping');
    return;
  }
  
  workersInitializing = true;
  
  try {
    // Check if browser supports offscreen documents (Chrome/Edge)
    if (typeof chrome !== 'undefined' && chrome.offscreen) {
      // Check if offscreen document already exists
      const clients = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      if (clients.length === 0) {
        console.log('Creating offscreen document for workers');
        await chrome.offscreen.createDocument({
          url: "pages/offscreen.html",
          reasons: ["WORKERS"],
          justification: "Needed for running Web Workers."
        });
        // Give the offscreen document time to load
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.log('Using existing offscreen document');
      }
      
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'spawnWorkers',
        options: options
      }).then((response) => {
        console.log('spawnWorkers response:', response);
      });
      
      // Initialize workers array for tracking
      workers = [];
      for (let i = 0; i < options.maxworkers; i++) {
        workers[i] = [null, false]; // [worker_reference, busy_status]
      }
      
      workersInitialized = true;
      workersInitializing = false;
      console.log(`Initialized ${options.maxworkers} workers via offscreen document`);
    } else {
      // Firefox fallback: create workers directly in background script
      console.log('Offscreen documents not supported, creating workers directly');
      workers = [];
      for (let i = 0; i < options.maxworkers; i++) {
        try {
          const worker = new Worker(api.runtime.getURL("scripts/worker.js"), { type: 'module' });
          worker.onmessage = (event) => {
            // Add the workerId to the data so workeronmessage can access it
            const eventData = { ...event.data, id: i };
            workeronmessage({ data: eventData });
          };
          workers[i] = [worker, false]; // [worker_reference, busy_status]
        } catch (error) {
          console.error(`Failed to create worker ${i}:`, error);
          workers[i] = [null, false];
        }
      }
      
      workersInitialized = true;
      workersInitializing = false;
      console.log(`Initialized ${options.maxworkers} workers directly`);
    }
    
    // Process any queued work now that workers are ready
    processqueue();
  } catch (error) {
    console.error('Failed to spawn workers:', error);
    workersInitializing = false;
    
    // If offscreen document creation fails due to existing document, try to continue
    if (error.message && error.message.includes('Only a single offscreen document')) {
      try {
        console.log('Retrying with existing offscreen document');
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'spawnWorkers',
          options: options
        }).then((response) => {
          console.log('spawnWorkers retry response:', response);
        });
        
        // Initialize workers array for tracking
        workers = [];
        for (let i = 0; i < options.maxworkers; i++) {
          workers[i] = [null, false]; // [worker_reference, busy_status]
        }
        
        workersInitialized = true;
        console.log(`Initialized ${options.maxworkers} workers via existing offscreen document`);
        
        // Process any queued work now that workers are ready
        processqueue();
      } catch (retryError) {
        console.error('Failed to spawn workers on retry:', retryError);
      }
    }
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
  runningworkers = runningworkers >= 0 ? runningworkers : 0;
  
  // Ensure workers array is initialized
  if (!workersInitialized) {
    console.log('Workers not initialized, queueing work');
    queuework(message);
    return;
  }
  
  var offset = options.maxworkers - runningworkers;
  if (options.maxworkers > runningworkers) {
    for (
      var i = runningworkers % options.maxworkers;
      i < options.maxworkers + offset - 1;
      i = (i + 1) % options.maxworkers
    ) {
      if (workers[i] && !workers[i][1]) {
        // worker is available
        message.id = i;
        workers[i][1] = true;
        
        // Check if we're using offscreen documents or direct workers
        if (typeof chrome !== 'undefined' && chrome.offscreen) {
          // Send work to offscreen document
          chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'postToWorker',
            workerId: i,
            data: message
          }).catch((error) => {
            console.error('Failed to send message to offscreen worker:', error);
            // Mark worker as not busy if message fails
            if (workers[i]) {
              workers[i][1] = false;
            }
            runningworkers--;
          });
        } else {
          // Send work directly to worker (Firefox)
          if (workers[i][0]) {
            workers[i][0].postMessage(message);
          } else {
            console.error('Worker not available:', i);
            workers[i][1] = false;
            runningworkers--;
            break;
          }
        }
        
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
  if (workers && workers[id]) {
    workers[id][1] = false;
    runningworkers--;
  }
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
      // Notify options page of successful update
      sendMessageToOptionsPage("update_status", "License list updated successfully!", "success");
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
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      title: "License-Diff selection",
      id: "spdxLicenseDiff",
      contexts: ["selection"],
    });
  });
}

init();
api.runtime.onStartup.addListener(init);
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle async message responses properly
  const result = handleMessage(request, sender, sendResponse);
  
  // Since handleMessage is async, it always returns a Promise
  if (result instanceof Promise) {
    result.then((response) => {
      console.log("BACKGROUND: Sending async response:", response);
      sendResponse(response);
    }).catch(error => {
      console.error("BACKGROUND: Error in message handler:", error);
      sendResponse({ error: error.message });
    });
    return true; // Indicates we will send a response asynchronously
  }
  
  // Fallback for synchronous responses (shouldn't happen since handleMessage is async)
  if (result !== undefined) {
    console.log("BACKGROUND: Sending sync response:", result);
    sendResponse(result);
  }
  
  return false; // For synchronous responses
});
api.action.onClicked.addListener(handleClick);
api.tabs.onActivated.addListener(handleActivate);
api.windows.onFocusChanged.addListener(handleFocusChanged);
api.storage.onChanged.addListener(handleStorageChange);
api.tabs.onUpdated.addListener(handleUpdated);
api.contextMenus.onClicked.addListener(handleClick);
api.runtime.onInstalled.addListener(async () => {
  // Cleanup any existing offscreen documents on install/reload (Chrome only)
  if (typeof chrome !== "undefined" && chrome.runtime.getContexts) {
    try {
      const clients = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      if (clients.length > 0) {
        console.log("Cleaning up existing offscreen documents");
        // Close existing offscreen documents
        await chrome.offscreen.closeDocument();
      }
    } catch (error) {
      console.log("No existing offscreen document to clean up:", error.message);
    }
  }
});

// Listen for permission changes to notify content scripts
if (api.permissions && api.permissions.onAdded) {
  api.permissions.onAdded.addListener(function(permissions) {
    console.log("Background: Permissions added:", permissions);
    
    // Check if SPDX.org permissions were added
    if (permissions.origins && permissions.origins.some(origin => origin.includes('spdx.org'))) {
      console.log("Background: SPDX.org permissions granted, notifying content scripts");
      
      // Notify all content scripts that permissions have been granted
      api.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          api.tabs.sendMessage(tab.id, {
            command: "permissions_granted",
            permissions: permissions
          }).catch(() => {
            // Content script may not be loaded on this tab, that's fine
            console.log(`No content script on tab ${tab.id}`);
          });
        });
      });
    }
  });
}