// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
import DiffMatchPatch from 'diff-match-patch'
import Levenshtein from 'fast-levenshtein'

var promises = []
var SPDXlist = {}
var files = []
var id
var dmp = new DiffMatchPatch() // options may be passed to constructor; see below

self.onmessage = function (event) {
  id = event.data.id
  switch (event.data.command) {
    case 'process':
    // 'license':spdxid,'hash':hash, 'selection': selection
      break
    case 'updatelicenselist':
      getSPDXlist(event.data.url, event.data.remote)
      break
    case 'compare':
      var spdxid = event.data.spdxid
      var license = event.data.license
      var maxLengthDifference = event.data.maxLengthDifference
      var total = event.data.total
      var tabId = event.data.tabId
      var background = event.data.background
      comparelicense(event.data.selection, spdxid, license, tabId, maxLengthDifference, total, background)
      break
    case 'sortlicenses':
      tabId = event.data.tabId
      sortlicenses(event.data.licenses, tabId)
      break
    case 'generateDiff':
      spdxid = event.data.spdxid
      license = event.data.license
      var record = event.data.record
      tabId = event.data.tabId
      generateDiff(event.data.selection, spdxid, license, record, tabId)
      break

    default:
    // getSPDXlist(event.data["url"], event.data["selection"]);
  }
}
// load files array with list of files to download
function getSPDXlist (baseurl, remote = true) {
  if (typeof files === 'undefined') { files = [] }
  var url = ''
  if (remote) {
    url = 'https://spdx.org/licenses/licenses.json'
  } else {
    url = baseurl + 'license-list/spdx.txt'
  }
  var x = new XMLHttpRequest()
  x.open('GET', url)
  x.onload = function () {
    var lines = ''
    if (remote) {
      lines = JSON.parse(x.responseText)
      postMessage({ 'command': 'progressbarmax', 'value': lines.licenses.length, 'stage': 'Updating licenses', 'id': id, 'reset': true })
      postMessage({ 'command': 'savelicenselist', 'value': lines, 'id': id })
      console.log(id, 'Updating: ', lines)
      for (var j = 0; j < lines.licenses.length; j++) {
        var line = lines.licenses[j]
        var license = line.detailsUrl
        license = license.replace('http:', 'https:')
        files.push(license)
      }
    } else {
      lines = x.responseText.split('\n')
      postMessage({ 'command': 'progressbarmax', 'value': lines.licenses.length, 'stage': 'Updating licenses', 'id': id, 'reset': true })
      for (j = 0; j < lines.length; j++) {
        line = lines[j]
        if (line.search(/\.txt/g) >= 0) {
          license = line.substring(0, line.search(/\.txt/g))
          files.push(license)
        }
      }
    }
    processSPDXlist(files, true, baseurl)
  }
  x.send()
}
// download licenses from files array
function processSPDXlist (files, remote = true, baseurl) {
  promises = files.map(
    function (value, index) {
      return new Promise(function (resolve, reject) {
        var url = ''
        if (remote) {
          url = value
        } else {
          url = baseurl + 'license-list/' + value + '.txt'
        }
        var x = new XMLHttpRequest()
        x.open('GET', url)
        x.onload = function () {
          // var md5 = require('md5-jkmyers')
          var response, raw, spdxid //, hash
          if (remote) {
            response = JSON.parse(this.responseText)
            // hash = md5(response.licenseText)
            raw = response.licenseText
            spdxid = response.licenseId
          } else {
            response = {}
            // hash = md5(this.responseText)
            raw = this.responseText
            spdxid = value.replace(/\.template$/g, '')
            response.licenseText = raw
            response.licenseId = spdxid
          }
          postMessage({ 'command': 'savelicense', 'spdxid': spdxid, 'data': response, 'id': id })
          postMessage({ 'command': 'progressbarmax', 'value': files.length, 'stage': 'Updating licenses', 'id': id })
          postMessage({ 'command': 'progressbarvalue', 'value': index, 'spdxid': spdxid, 'id': id })
          SPDXlist[spdxid] = response
          // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
          resolve(SPDXlist[spdxid])
        }
        x.send()
      })
    })
  Promise.all(promises)
    .then(function (data) { // success
      console.log(id, 'License List Updated')
      postMessage({ 'command': 'updatedone', 'result': data, 'id': id })
    }

    )
}

function comparelicense (selection, spdxid, license, tabId, maxLengthDifference = 1000, total = 0, background = false) {
  if (!background) { postMessage({ 'command': 'progressbarmax', 'value': total, 'stage': 'Comparing licenses', 'id': id, 'reset': true, 'tabId': tabId }) }
  var result = {}
  var count2 = selection.length
  // console.log(id, "Processing selection of " + count2 + " chars.");
  var data = license.licenseText
  var count = data.length
  var locre = data.match(/\r?\n/g)
  var loc = (locre ? locre.length : 0)
  var locre2 = selection.match(/\r?\n/g)
  var loc2 = (locre2 ? locre2.length : 0)
  var difference = Math.abs(count2 - count)
  var locdiff = Math.abs(loc2 - loc)
  var maxLength = Math.max(count, count2)
  if (difference <= maxLength && ((maxLengthDifference === 0) || (difference < maxLengthDifference))) {
    var distance = Levenshtein.get(cleanText(data), cleanText(selection))
    var percentage = ((maxLength - distance) / maxLength * 100).toFixed(1)
    console.log(tabId, id, spdxid + ' - Levenshtein Distance (clean): ' + distance + ' (' + percentage + '%)' + ' Length Difference: ' + difference + ' LOC Diff:' + locdiff)
    result = {
      distance: distance,
      text: data,
      percentage: percentage,
      details: license
      // patterns: result.patterns
    }
  } else {
    console.log(tabId, id, spdxid + ' - Length Difference: ' + difference + ' LOC Diff:' + locdiff)
    result = {
      distance: difference,
      text: data,
      percentage: 0,
      details: null // details is unneeded since these will always be end of the list
      // patterns: result.patterns
    }
  }
  if (!background) { postMessage({ 'command': 'comparenext', 'spdxid': spdxid, 'result': result, 'id': id, 'tabId': tabId }) } else {
    postMessage({ 'command': 'backgroundcomparenext', 'spdxid': spdxid, 'result': result, 'id': id, 'tabId': tabId })
  }
  // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
}

function sortlicenses (licenses, tabId) {
  postMessage({ 'command': 'progressbarmax', 'value': Object.keys(licenses).length, 'stage': 'Sorting licenses', 'id': id, 'reset': true, 'tabId': tabId })
  console.log(tabId, id, 'Sorting ' + Object.keys(licenses).length + ' licenses')
  var sortable = []
  for (var license in licenses) {
    sortable.push({
      'spdxid': license,
      'distance': licenses[license].distance,
      'difftext': licenses[license].text,
      'percentage': licenses[license].percentage,
      'details': licenses[license].details
    })
    postMessage({ 'command': 'next', 'spdxid': license, 'id': id, 'tabId': tabId })
  }
  sortable.sort(function (a, b) {
    return b.percentage - a.percentage
  })
  postMessage({ 'command': 'sortdone', 'result': sortable, 'id': id, 'tabId': tabId })
}

function generateDiff (selection, spdxid, license, record, tabId) {
  // postMessage({"command": "progressbarmax","value": total, "stage":"Generating Diff","id":id});
  var result = {}
  var data = license
  dmp.Diff_Timeout = 0
  //    dmp.Diff_Timeout = parseFloat(document.getElementById('timeout').value);
  var msStart = (new Date()).getTime()
  var textDiff = dmp.diff_main(data, cleanText(selection, false)) // produces diff array
  dmp.diff_cleanupSemantic(textDiff) // semantic cleanup
  // dmp.diff_cleanupEfficiency(textDiff);
  var msEnd = (new Date()).getTime()
  result = { 'html': dmp.diff_prettyHtml(textDiff), 'time': (msEnd - msStart) }
  console.log('%s %s: %s diff:%o', tabId, id, spdxid, result)
  postMessage({ 'command': 'diffnext', 'spdxid': spdxid, 'result': result, 'record': record, 'id': id, 'tabId': tabId })
}

function cleanText (str, removeNewLines = true) {
  // this will replace unicode spaces, collapse spaces and then replace newlines
  if (removeNewLines) { return collapseSpaces(removeLineNumbers(str)).replace(/(\r\n|\n|\r)/gm, ' ') } else { return collapseSpaces(removeLineNumbers(str)) }
}

function collapseSpaces (str) {
  return str.replace(/\s+/g, ' ')
}

function removeLineNumbers (str, percentage = 0.8) {
  // remove line numbering if we detect at least 80% of total lines of code
  var locre = str.match(/\r?\n/g)
  var loc = (locre ? locre.length : 0)
  var linenumbersre = str.match(/((\n|^)\s*)\d+/g)
  var linenumbercount = (linenumbersre ? linenumbersre.length : 0)
  if (linenumbercount / loc > percentage) { // TODO: Replace .8 with option
    str = str.replace(/((\n|^)\s*)\d+/g, '$2')
  }
  return str
}
function escapeRegex (str) {
  // eslint-disable-next-line no-useless-escape
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&') // need to escape regex characters
}
function processVariables (str) { // eslint-disable-line no-unused-vars
  var pattern = /(^|(?:\s*(?!<<)\S+(?!<<)\s*){0,3}?)<<var;(.+?)>>($|(?:\s*(?!<<)\S+(?!<<)\s*){0,3})/g // Capture up to six words before and after
  // to use this pattern match[1] must be match[2]
  // var pattern = /<<var;(.*?)>>/g; // Do a literal match
  var pattern2 = ''
  var result = {
    'data': str,
    'patterns': []
  }
  var match
  var variable = {}
  var patterns = []
  while ((match = pattern.exec(str)) != null) {
    var variablestring = match[2].split(';')
    // process any variables inside the string for potential later use
    for (var i = 0; i < variablestring.length; i++) {
      var keyvalue = variablestring[i].split('=')
      variable[keyvalue[0]] = keyvalue[1]
    }
    // pattern2 = match[1] + "<<var;"+variable['match']+">>" + match[3];
    pattern2 = escapeRegex(match[1]) + '(' + String(variable.match) + '?)' + escapeRegex(match[3])
    patterns.push(pattern2)
    result.data = result.data.replace(new RegExp(pattern2), match[1] + variable.original + match[3])
    pattern.lastIndex -= match[3].length
  }
  result.patterns = patterns
  result.data = result.data.replace(/<<beginOptional;.*?>>/g, '').replace(/<<endOptional>>/g, '')
  return result
}
