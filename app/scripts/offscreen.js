// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

// Offscreen document for managing Web Workers
let options = { maxworkers: 10 };
let workers = [];
let workerqueues = [];
let runningworkers = 0;

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message.command);
  
  switch (message.command) {
    case "initWorkerManager":
      options = message.options;
      console.log('Worker manager initialized with options:', options);
      break;
    case "spawnWorkers":
      spawnworkers();
      break;
    case "doWork":
      // Ensure workers are spawned before doing work
      if (workers.length === 0) {
        spawnworkers();
      }
      dowork(message.workMessage);
      break;
    case "processQueue":
      processqueue(message.priority);
      break;
    default:
      break;
  }
});

// Worker management functions (moved from background.js)
function spawnworkers() {
  console.log('spawnworkers called, max workers:', options.maxworkers);
  for (var i = 0; i < options.maxworkers; i++) {
    var worker = new Worker(chrome.runtime.getURL("scripts/worker.js"));
    
    worker.onmessage = function(event) {
      console.log('Worker message received:', event.data);
      var data = event.data;
      
      // Process the queue for this worker
      if (data.id !== undefined) {
        processWorkerQueue(data.id);
      }
      
      // Forward worker response to service worker
      chrome.runtime.sendMessage({
        command: "workerResponse",
        data: data
      }).catch(err => console.error('Error forwarding worker response:', err));
    };
    
    worker.onerror = function(error) {
      console.error('Worker error:', error);
    };
    
    workers.push(worker);
    workerqueues.push([]);
  }
  console.log('Workers spawned:', workers.length);
}

function dowork(message) {
  console.log('dowork called with message:', message);
  
  if (workers.length === 0) {
    console.error('No workers available!');
    return;
  }
  
  // Find worker with shortest queue
  var workerindex = 0;
  var mininqueue = workerqueues[0].length;
  for (var i = 0; i < workerqueues.length; i++) {
    if (workerqueues[i].length < mininqueue) {
      mininqueue = workerqueues[i].length;
      workerindex = i;
    }
  }
  
  // Add work to the queue for this worker
  message.id = workerindex;
  workerqueues[workerindex].push(message);
  
  console.log('Added work to worker', workerindex, 'queue length:', workerqueues[workerindex].length);
  
  // Process the queue immediately if worker is free
  processWorkerQueue(workerindex);
}

function processWorkerQueue(workerIndex) {
  if (workerqueues[workerIndex].length > 0) {
    var message = workerqueues[workerIndex].shift();
    console.log('Sending work to worker', workerIndex, 'remaining queue:', workerqueues[workerIndex].length);
    workers[workerIndex].postMessage(message);
  }
}

function processqueue(priority) {
  console.log('processqueue called with priority:', priority);
  // Process all queues
  for (let i = 0; i < workers.length; i++) {
    processWorkerQueue(i);
  }
}

function workerdone(id) {
  console.log('Worker', id, 'done');
  // Process next item in queue if available
  processWorkerQueue(id);
}

console.log('Offscreen document loaded');

// Handle worker messages and forward to service worker
function workeronmessage(event) {
  // Notify service worker to process queue
  chrome.runtime.sendMessage({
    command: "workerProcessQueue",
    priority: event.data.tabId || 0,
  });

  var threadid;
  switch (event.data.command) {
    case "progressbarmax":
    case "progressbarvalue":
    case "next":
      // Forward progress updates to service worker
      chrome.runtime.sendMessage({
        command: "forwardToTab",
        data: event.data,
      });
      break;
    case "store":
      // Forward storage request to service worker
      chrome.runtime.sendMessage({
        command: "workerStore",
        data: event.data,
      });
      break;
    case "license":
      // Handle license event
      break;
    case "savelicenselist":
      // Forward save request to service worker
      chrome.runtime.sendMessage({
        command: "workerSaveLicenseList",
        data: event.data,
      });
      break;
    case "saveitem":
      threadid = event.data.id;
      workerdone(threadid);
      // Forward save request to service worker
      chrome.runtime.sendMessage({
        command: "workerSaveItem",
        data: event.data,
      });
      break;
    case "sortlicenses":
      threadid = event.data.id;
      workerdone(threadid);
      // Forward results to service worker
      chrome.runtime.sendMessage({
        command: "workerSortComplete",
        data: event.data,
      });
      break;
    case "updatedone":
      workerdone(event.data.id);
      console.log("Received worker update completion for %s", event.data.type);
      // Forward update completion to service worker
      chrome.runtime.sendMessage({
        command: "workerUpdateDone",
        data: event.data,
      });
      break;
    case "compare":
      threadid = event.data.id;
      workerdone(threadid);
      // Forward compare results to service worker
      chrome.runtime.sendMessage({
        command: "workerCompareComplete",
        data: event.data,
      });
      break;
    case "generateDiff":
      threadid = event.data.id;
      workerdone(threadid);
      // Forward diff results to service worker
      chrome.runtime.sendMessage({
        command: "workerDiffComplete",
        data: event.data,
      });
      break;
    default:
      workerdone(event.data.id);
      break;
  }
}
