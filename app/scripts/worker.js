// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
import { urls, spdxkey } from "./const.js";
import DiffMatchPatch from "diff-match-patch";
import Levenshtein from "js-levenshtein";

var id;
var dmp = new DiffMatchPatch(); // options may be passed to constructor; see below

self.onmessage = function(event) {
  id = event.data.id;
  switch (event.data.command) {
    case "process":
      // 'license':spdxid,'hash':hash, 'selection': selection
      break;
    case "updatelicenselist":
      getSPDXlist();
      break;
    case "compare":
      var spdxid = event.data.spdxid;
      var itemdict = event.data.itemdict;
      var maxLengthDifference = event.data.maxLengthDifference;
      var total = event.data.total;
      var tabId = event.data.tabId;
      var background = event.data.background;
      var type = event.data.type;
      compareitem(
        event.data.selection,
        spdxid,
        itemdict,
        tabId,
        type,
        maxLengthDifference,
        total,
        background
      );
      break;
    case "sortlicenses":
      tabId = event.data.tabId;
      sortlicenses(event.data.licenses, tabId);
      break;
    case "generateDiff":
      spdxid = event.data.spdxid;
      let text = event.data.license;
      var record = event.data.record;
      tabId = event.data.tabId;
      generateDiff(event.data.selection, spdxid, text, record, tabId);
      break;

    default:
  }
};
// load files array with list of files to download
function getSPDXlist() {
  for (let type of Object.keys(urls)) {
    var url = urls[type];
    getJSON(url)
      .then(function(result) {
        var total = result[type].length;
        var index = 0;
        postMessage({
          command: "progressbarmax",
          value: total,
          stage: "Updating " + type,
          id: id,
          reset: true
        });
        postMessage({
          command: "savelicenselist",
          value: result,
          id: id,
          type: type
        });
        console.log(id, "Updating: ", result);
        return result[type]
          .map(item => {
            return getJSON(item.detailsUrl.replace("http:", "https:"));
          })
          .reduce(function(sequence, itemPromise) {
            return sequence
              .then(function() {
                return itemPromise;
              })
              .then(function(item) {
                // var md5 = require('md5-jkmyers')
                // hash = md5(item)
                postMessage({
                  command: "saveitem",
                  data: item,
                  id: id,
                  type: type
                });
                postMessage({
                  command: "progressbarvalue",
                  value: index++,
                  id: id
                });
                // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
              });
          }, Promise.resolve());
      })
      .then(function(response) {
        console.log("All %s downloads completed", type);
        postMessage({ command: "updatedone", id: id, type: type });
      })
      .catch(function(err) {
        // catch any error that happened along the way
        console.log("Error: " + err.message);
      });
  }
}

function compareitem(
  selection,
  spdxid,
  item,
  tabId,
  type,
  maxLengthDifference = 1000,
  total = 0,
  background = false
) {
  if (!background) {
    postMessage({
      command: "progressbarmax",
      value: total,
      stage: "Comparing items",
      id: id,
      reset: true,
      tabId: tabId
    });
  }
  var result = {};
  var count2 = selection.length;
  // console.log(id, "Processing selection of " + count2 + " chars.");
  var data = item[spdxkey[type].text];
  var count = data.length;
  var locre = data.match(/\r?\n/g);
  var loc = locre ? locre.length : 0;
  var locre2 = selection.match(/\r?\n/g);
  var loc2 = locre2 ? locre2.length : 0;
  var difference = Math.abs(count2 - count);
  var locdiff = Math.abs(loc2 - loc);
  var maxLength = Math.max(count, count2);
  if (
    difference <= maxLength &&
    (maxLengthDifference === 0 || difference < maxLengthDifference)
  ) {
    var distance = Levenshtein(cleanText(data), cleanText(selection));
    var percentage = (((maxLength - distance) / maxLength) * 100).toFixed(1);
    console.log(
      tabId,
      id,
      spdxid +
        " - Levenshtein Distance (clean): " +
        distance +
        " (" +
        percentage +
        "%)" +
        " Length Difference: " +
        difference +
        " LOC Diff:" +
        locdiff
    );
    result = {
      distance: distance,
      text: data,
      percentage: percentage,
      details: item
      // patterns: result.patterns
    };
  } else {
    console.log(
      tabId,
      id,
      spdxid + " - Length Difference: " + difference + " LOC Diff:" + locdiff
    );
    result = {
      distance: difference,
      text: data,
      percentage: 0,
      details: null // details is unneeded since these will always be end of the list
      // patterns: result.patterns
    };
  }
  if (!background) {
    postMessage({
      command: "comparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId
    });
  } else {
    postMessage({
      command: "backgroundcomparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId
    });
  }
  // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
}

function sortlicenses(licenses, tabId) {
  postMessage({
    command: "progressbarmax",
    value: Object.keys(licenses).length,
    stage: "Sorting licenses",
    id: id,
    reset: true,
    tabId: tabId
  });
  console.log(
    tabId,
    id,
    "Sorting " + Object.keys(licenses).length + " licenses"
  );
  var sortable = [];
  for (var license in licenses) {
    sortable.push({
      spdxid: license,
      distance: licenses[license].distance,
      difftext: licenses[license].text,
      percentage: licenses[license].percentage,
      details: licenses[license].details
    });
    postMessage({ command: "next", spdxid: license, id: id, tabId: tabId });
  }
  sortable.sort(function(a, b) {
    return b.percentage - a.percentage;
  });
  postMessage({ command: "sortdone", result: sortable, id: id, tabId: tabId });
}

function generateDiff(selection, spdxid, license, record, tabId) {
  // postMessage({"command": "progressbarmax","value": total, "stage":"Generating Diff","id":id});
  var result = {};
  var data = license;
  dmp.Diff_Timeout = 0;
  //    dmp.Diff_Timeout = parseFloat(document.getElementById('timeout').value);
  var msStart = new Date().getTime();
  var textDiff = dmp.diff_main(data, cleanText(selection, false)); // produces diff array
  dmp.diff_cleanupSemantic(textDiff); // semantic cleanup
  // dmp.diff_cleanupEfficiency(textDiff);
  var msEnd = new Date().getTime();
  result = { html: dmp.diff_prettyHtml(textDiff), time: msEnd - msStart };
  console.log("%s %s: %s diff:%o", tabId, id, spdxid, result);
  postMessage({
    command: "diffnext",
    spdxid: spdxid,
    result: result,
    record: record,
    id: id,
    tabId: tabId
  });
}

function cleanText(str, removeNewLines = true) {
  // this will replace unicode spaces, collapse spaces and then replace newlines
  if (removeNewLines) {
    return collapseSpaces(removeLineNumbers(str)).replace(
      /(\r\n|\n|\r)/gm,
      " "
    );
  } else {
    return collapseSpaces(removeLineNumbers(str));
  }
}

function collapseSpaces(str) {
  return str.replace(/\s+/g, " ");
}

function removeLineNumbers(str, percentage = 0.8) {
  // remove line numbering if we detect at least 80% of total lines of code
  var locre = str.match(/\r?\n/g);
  var loc = locre ? locre.length : 0;
  var linenumbersre = str.match(/((\n|^)\s*)\d+/g);
  var linenumbercount = linenumbersre ? linenumbersre.length : 0;
  if (linenumbercount / loc > percentage) {
    // TODO: Replace .8 with option
    str = str.replace(/((\n|^)\s*)\d+/g, "$2");
  }
  return str;
}
function escapeRegex(str) {
  // eslint-disable-next-line no-useless-escape
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"); // need to escape regex characters
}
// eslint-disable-next-line no-unused-vars
function processVariables(str) {
  var pattern = /(^|(?:\s*(?!<<)\S+(?!<<)\s*){0,3}?)<<var;(.+?)>>($|(?:\s*(?!<<)\S+(?!<<)\s*){0,3})/g; // Capture up to six words before and after
  // to use this pattern match[1] must be match[2]
  // var pattern = /<<var;(.*?)>>/g; // Do a literal match
  var pattern2 = "";
  var result = {
    data: str,
    patterns: []
  };
  var match;
  var variable = {};
  var patterns = [];
  while ((match = pattern.exec(str)) != null) {
    var variablestring = match[2].split(";");
    // process any variables inside the string for potential later use
    for (var i = 0; i < variablestring.length; i++) {
      var keyvalue = variablestring[i].split("=");
      variable[keyvalue[0]] = keyvalue[1];
    }
    // pattern2 = match[1] + "<<var;"+variable['match']+">>" + match[3];
    pattern2 =
      escapeRegex(match[1]) +
      "(" +
      String(variable.match) +
      "?)" +
      escapeRegex(match[3]);
    patterns.push(pattern2);
    result.data = result.data.replace(
      new RegExp(pattern2),
      match[1] + variable.original + match[3]
    );
    pattern.lastIndex -= match[3].length;
  }
  result.patterns = patterns;
  result.data = result.data
    .replace(/<<beginOptional;.*?>>/g, "")
    .replace(/<<endOptional>>/g, "");
  return result;
}

// promisfy gets
const get = function(url) {
  return new Promise((resolve, reject) => {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.onload = function() {
      if (x.status === 200) {
        resolve(x.response);
      } else {
        reject(Error(x.statusText));
      }
    };
    x.onerror = function() {
      reject(Error("Network Error"));
    };
    x.send();
  });
};

const getJSON = function(url) {
  return get(url).then(JSON.parse);
};
