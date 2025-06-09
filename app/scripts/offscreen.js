var workers = []; // Store workers in an array

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message);
  if (message.target === 'offscreen') {
    handleOffscreenMessage(message, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

function handleOffscreenMessage(message, sendResponse) {
  console.log('Handling offscreen message:', message.action);
  switch (message.action) {
    case 'spawnWorkers':
      spawnworkers(message.options);
      sendResponse({ success: true });
      break;
    case 'postToWorker':
      postToWorker(message.workerId, message.data);
      sendResponse({ success: true });
      break;
    case 'terminateWorkers':
      terminateWorkers();
      sendResponse({ success: true });
      break;
    default:
      console.warn('Unknown offscreen action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
}

function spawnworkers(options) {
  // Check if workers are already spawned
  if (workers.length >= options.maxworkers) {
    console.log("Workers already spawned, count:", workers.length);
    return;
  }

  // Terminate any existing workers first
  terminateWorkers();

  console.log("Spawning %s workers", options.maxworkers);
  for (var i = 0; i < options.maxworkers; i++) {
    var worker = new Worker(chrome.runtime.getURL("scripts/worker.js"), { type: 'module' });
    
    // Create a closure to capture the correct worker ID
    worker.onmessage = (function(workerId) {
      return function(event) {
        // Forward worker messages back to the service worker
        chrome.runtime.sendMessage({
          source: 'offscreen-worker',
          workerId: workerId,
          data: event.data
        });
      };
    })(i);
    
    worker.onerror = (function(workerId) {
      return function(error) {
        console.error(`Worker ${workerId} error:`, error);
        chrome.runtime.sendMessage({
          source: 'offscreen-worker',
          workerId: workerId,
          data: { error: error.message, filename: error.filename, lineno: error.lineno }
        });
      };
    })(i);
    
    workers[i] = [worker, false];
  }
}

function postToWorker(workerId, data) {
  console.log(`Posting to worker ${workerId}:`, data);
  if (workers[workerId] && workers[workerId][0]) {
    workers[workerId][0].postMessage(data);
  } else {
    console.error(`Worker ${workerId} not found or not initialized`);
  }
}

function terminateWorkers() {
  workers.forEach(([worker, busy]) => {
    if (worker) {
      worker.terminate();
    }
  });
  workers = [];
}

function workeronmessage(event) {
  console.log("Worker message:", event.data);
  // Forward to service worker
  chrome.runtime.sendMessage({
    source: 'offscreen-worker',
    data: event.data
  });
}