// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
'use strict'
// Enable chromereload by uncommenting this line:
// if (process.env.NODE_ENV === 'development' && typeof browser === 'undefined') {
//   require('chromereload/devonly')
// }

import { filters, version, defaultoptions } from './const.js'

// Saves options to chrome.storage
function saveOptions () {
  var updateFrequency = document.getElementById('updateFrequency').value
  var showBest = document.getElementById('maxComparisons').value
  var minpercentage = document.getElementById('minpercentage').value
  var maxLengthDifference = document.getElementById('maxDifference').value
  var maxworkers = document.getElementById('maxWorkers').value
  var filters = {}
  if (document.getElementById('deprecated').checked)
    filters['deprecated'] = document.getElementById('deprecated').value

  var options = {
    updateFrequency: parseInt(updateFrequency),
    showBest: parseInt(showBest),
    minpercentage: parseInt(minpercentage),
    maxLengthDifference: parseInt(maxLengthDifference),
    maxworkers: parseInt(maxworkers),
    filters: filters
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
    if (result.options === undefined) {
      result.options = defaultoptions
    }
    document.getElementById('updateFrequency').value = result.options.updateFrequency
    document.getElementById('maxComparisons').value = result.options.showBest
    document.getElementById('minpercentage').value = result.options.minpercentage
    document.getElementById('maxDifference').value = result.options.maxLengthDifference
    document.getElementById('maxWorkers').value = result.options.maxworkers
    showFilters(document.getElementById('exclude'), result)
    //document.getElementById('deprecated').checked = result.options.filters.deprecated
  })
}

function showFilters(form, result) {
  for (var filter in filters) {
    if (document.getElementById(filter))
      continue
    var checkbox = form.appendChild(document.createElement('input'))
    var label = checkbox.appendChild(document.createElement('label'))
    label.htmlFor = filter
    form.appendChild(document.createTextNode(filter.charAt(0).toUpperCase() + filter.slice(1)))
    checkbox.type = "checkbox"
    checkbox.id = filter
    checkbox.value = filters[filter]
    checkbox.defaultChecked = defaultoptions.filters[filter]
    checkbox.checked = (result.options.filters !== undefined && result.options.filters[filter] !== undefined ?
        result.options.filters[filter] : defaultoptions.filters[filter])
  }
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
  var status = document.getElementById('storagestatus')
  try {
    chrome.storage.local.getBytesInUse(null, function (result) {
      if (result) {
        status.textContent = (result / 1024 / 1024).toFixed(2) + ' MB'
      } else {
        status.textContent = '0 MB'
      }
    })
  } catch (err) {
    // Necessary since Firefox doesn't support getBytesInUse
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1385832
    browser.storage.local.get(function(items) {
      var result = JSON.stringify(items).length
      if (result) {
        status.textContent = (result / 1024 / 1024).toFixed(2) + ' MB'
      } else {
        status.textContent = '0 MB'
      }
    })
  }

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
