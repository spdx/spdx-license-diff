'use strict'
// Enable chromereload by uncommenting this line:
// if (process.env.NODE_ENV === 'development' && typeof browser === 'undefined') {
//   require('chromereload/devonly')
// }

// Saves options to chrome.storage
function saveOptions () {
  var updateFrequency = document.getElementById('updateFrequency').value
  var showBest = document.getElementById('maxComparisons').value
  var minpercentage = document.getElementById('minpercentage').value
  var maxLengthDifference = document.getElementById('maxDifference').value
  var maxworkers = document.getElementById('maxWorkers').value

  var options = {
    updateFrequency: updateFrequency,
    showBest: showBest,
    minpercentage: minpercentage,
    maxLengthDifference: maxLengthDifference,
    maxworkers: maxworkers
  }
  chrome.storage.local.set({ options: options }, function () {
    // Update status to let user know options were saved.
    var status = document.getElementById('status')
    status.textContent = 'Options saved.'
    setTimeout(function () {
      status.textContent = ''
    }, 1500)
  })
}

// Restores values using the preferences
// stored in chrome.storage.
function restoreOptions () {
  chrome.storage.local.get(['options'], function (result) {
    document.getElementById('updateFrequency').value = result.options.updateFrequency
    document.getElementById('maxComparisons').value = result.options.showBest
    document.getElementById('minpercentage').value = result.options.minpercentage
    document.getElementById('maxDifference').value = result.options.maxLengthDifference
    document.getElementById('maxWorkers').value = result.options.maxworkers
  })
}
function reset () {
  var form = document.getElementById('options')
  form.reset()
}
function loadList () {
  chrome.storage.local.get(['list'], function (result) {
    var licenseversion = document.getElementById('licenseversion')
    var status = document.getElementById('updatestatus')
    if (result.list && result.list['licenseListVersion']) {
      var list = result.list
      var lastupdate = list['lastupdate']
      var releaseDate = list['releaseDate']
      licenseversion.textContent = 'v.' + list['licenseListVersion'] +
          ' (' + releaseDate + ') with ' + list.licenses.length + ' licenses'
      status.textContent = new Date(lastupdate).toLocaleString()
    } else {
      licenseversion.textContent = 'None'
      status.textContent = 'Never'
    }
  })
}
function updateList () {
  chrome.storage.local.remove(['list'], function (result) {
    chrome.runtime.sendMessage({ 'command': 'updatelicenselist',
      'url': chrome.extension.getURL(''),
      'remote': true })
  })
}
function checkStorage () {
  chrome.storage.local.getBytesInUse(null, function (result) {
    var status = document.getElementById('storagestatus')
    if (result) {
      status.textContent = (result / 1024 / 1024).toFixed(2) + ' MB'
    } else {
      status.textContent = '0 MB'
    }
  })
}
function clearStorage () {
  chrome.storage.local.clear(function (result) {
    checkStorage()
  })
}

document.addEventListener('DOMContentLoaded', restoreOptions)
document.addEventListener('DOMContentLoaded', loadList)
document.addEventListener('DOMContentLoaded', checkStorage)
chrome.storage.onChanged.addListener(loadList)
chrome.storage.onChanged.addListener(checkStorage)
document.getElementById('reset').addEventListener('click', reset)
document.getElementById('update').addEventListener('click', updateList)
document.getElementById('save').addEventListener('click', saveOptions)
document.getElementById('clearstorage').addEventListener('click', clearStorage)
