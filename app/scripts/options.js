"use strict";
// Enable chromereload by uncommenting this line:
if(process.env.NODE_ENV === 'development'){
  require('chromereload/devonly')
}

// Saves options to chrome.storage
function save_options() {
  var updateFrequency = document.getElementById('updateFrequency').value;
  var showBest = document.getElementById('maxComparisons').value;
  var minpercentage = document.getElementById('minpercentage').value;
  var maxLengthDifference = document.getElementById('maxDifference').value;
  var maxworkers = document.getElementById('maxWorkers').value;

  var options = {
    updateFrequency: updateFrequency,
    showBest: showBest,
    minpercentage: minpercentage,
    maxLengthDifference: maxLengthDifference,
    maxworkers: maxworkers
  };
  chrome.storage.sync.set({options:options}, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });
}

// Restores values using the preferences
// stored in chrome.storage.
function restore_options() {
  chrome.storage.sync.get(['options'], function(result) {
    document.getElementById('updateFrequency').value = result.options.updateFrequency;
    document.getElementById('maxComparisons').value = result.options.showBest;
    document.getElementById('minpercentage').value = result.options.minpercentage;
    document.getElementById('maxDifference').value = result.options.maxLengthDifference;
    document.getElementById('maxWorkers').value = result.options.maxworkers;
  });
}
function reset() {
  var form = document.getElementById('options');
  form.reset();
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('reset').addEventListener('click',reset);
document.getElementById('save').addEventListener('click',save_options);
