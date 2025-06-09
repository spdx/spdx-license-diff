// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
import { baseLicenseUrl, urls, spdxkey } from "./const.js";
import { makeDiff, cleanupSemantic, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from "@sanity/diff-match-patch";
import * as fastestlevenshtein from "fastest-levenshtein";
import dice from "fast-dice-coefficient";

/**
 * Convert a diff array into a pretty HTML report with dark mode support.
 * @param {Array} diffs Array of diff tuples.
 * @return {string} HTML representation.
 */
function diff_prettyHtml(diffs) {
  const html = [];
  const pattern_amp = /&/g;
  const pattern_lt = /</g;
  const pattern_gt = />/g;
  const pattern_para = /\n/g;
  
  for (let x = 0; x < diffs.length; x++) {
    const op = diffs[x][0]; // Operation (insert, delete, equal)
    const data = diffs[x][1]; // Text of change.
    let text = data.replace(pattern_amp, '&amp;')
                   .replace(pattern_lt, '&lt;')
                   .replace(pattern_gt, '&gt;')
                   .replace(pattern_para, '&para;<br>');
    
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins class="diff-insert">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del class="diff-delete">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        html[x] = '<span class="diff-equal">' + text + '</span>';
        break;
    }
  }
  
  return '<div class="diff-content">' + html.join('') + '</div>';
}

var id;

self.onmessage = function (event) {
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
      var diceCoefficientOption = event.data.diceCoefficient;
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
        diceCoefficientOption,
        total,
        background
      );
      break;
    case "sortlicenses":
      tabId = event.data.tabId;
      sortlicenses(event.data.licenses, tabId);
      break;
    case "generateDiff": {
      spdxid = event.data.spdxid;
      const text = event.data.license;
      var record = event.data.record;
      tabId = event.data.tabId;
      generateDiff(event.data.selection, spdxid, text, record, tabId);
      break;
    }
    default:
  }
};
// load files array with list of files to download
async function getSPDXlist() {
  for (const type of Object.keys(urls)) {
    var url = urls[type];
    try {
      var result = await getJSON(url);
      var total = result[type].length;
      var index = 0;
      postMessage({
        command: "progressbarmax",
        value: total,
        stage: "Updating " + type,
        id: id,
        reset: true,
      });
      postMessage({
        command: "savelicenselist",
        value: result,
        id: id,
        type: type,
      });
      console.log(id, "Updating: ", result);
      result[type] = result[type].map(async (item) => {
        url = item.detailsUrl;
        var urlRegex = new RegExp("^(?:[a-z]+:)?//", "i");
        if (urlRegex.test(url)) {
          url = url.replace("http:", "https:");
        } else {
          url = `${baseLicenseUrl}${url}`;
        }
        if (url.split(".").pop().toLowerCase() === "html")
          url = url.replace(".html", ".json");
        try {
          return await getJSON(url);
        } catch (err) {
          console.log("Error in Update");
          throw err;
        }
      });
      result[type] = result[type].map(async function (item) {
        item = await item;
        // var md5 = require('md5-jkmyers')
        // hash = md5(item)
        postMessage({
          command: "saveitem",
          data: item,
          id: id,
          type: type,
        });
        postMessage({
          command: "progressbarmax",
          value: total,
          stage: "Updating " + type,
          id: id,
          reset: true,
        });
        postMessage({
          command: "progressbarvalue",
          value: index++,
          id: id,
        });
        // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
      });
      await Promise.all(result[type]);
      console.log("All %s downloads completed", type);
      postMessage({ command: "updatedone", id: id, type: type });
    } catch (err) {
      // catch any error that happened along the way
      console.log("Error: " + err.message);
      
      // Check if this is a permission/network error
      if (err.message.includes("Network Error") || err.message.includes("Failed to fetch") || err.message.includes("403") || err.message.includes("ERR_BLOCKED_BY_CLIENT")) {
        postMessage({
          command: "updateerror",
          error: "Permission or network error accessing SPDX.org. Please check that you have granted permission to access spdx.org in your browser extension settings.",
          id: id,
          type: type
        });
      } else {
        postMessage({
          command: "updateerror", 
          error: `Failed to update ${type}: ${err.message}`,
          id: id,
          type: type
        });
      }
    }
  }
}

function compareitem(
  selection,
  spdxid,
  item,
  tabId,
  type,
  maxLengthDifference = 1000,
  diceCoefficientOption = 0.9,
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
      tabId: tabId,
    });
  }
  var result = {};
  var count2 = selection.length;
  // console.log(id, "Processing selection of " + count2 + " chars.");
  var data = item[spdxkey[type].text];
  var templateData = item.standardLicenseTemplate;
  var count = data.length;
  var locre = data.match(/\r?\n/g);
  var loc = locre ? locre.length : 0;
  var locre2 = selection.match(/\r?\n/g);
  var loc2 = locre2 ? locre2.length : 0;
  var difference = Math.abs(count2 - count);
  var locdiff = Math.abs(loc2 - loc);
  var maxLength = Math.max(count, count2);
  var templateMatch =
    typeof templateData !== "undefined" ? processTemplate(templateData) : false;
  var distance = 100;
  var diceCoefficient = 0;
  var percentage;
  if (
    templateMatch &&
    cleanText(selection).match(
      new RegExp("^" + cleanText(templateMatch.matchRegex) + "$", "ig")
    )
  ) {
    distance = 0;
    percentage = 100;
    console.log(tabId, id, spdxid + " - Template Match");
  }
  diceCoefficient = dice(cleanText(data), cleanText(selection));
  if (
    (difference <= maxLength &&
      (maxLengthDifference === 0 || difference < maxLengthDifference)) ||
    diceCoefficient >= diceCoefficientOption
  ) {
    if (distance !== 0) {
      // allow process if no match
      distance = fastestlevenshtein.distance(
        cleanText(data),
        cleanText(selection)
      );
      percentage = (((maxLength - distance) / maxLength) * 100).toFixed(1);
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
          locdiff +
          " Dice-Coefficient:" +
          diceCoefficient
      );
    }
    result = {
      distance: distance,
      text: data,
      percentage: percentage,
      details: item,
      dice: diceCoefficient.toFixed(2),
      templateMatch: templateMatch
      // patterns: result.patterns
    };
  } else {
    console.log(
      tabId,
      id,
      spdxid +
        " - Length Difference: " +
        difference +
        " LOC Diff:" +
        locdiff +
        " Dice-Coefficient:" +
        diceCoefficient
    );
    result = {
      distance: difference,
      text: data,
      percentage: 0,
      details: null, // details is unneeded since these will always be end of the list
      dice: diceCoefficient.toFixed(2),
      templateMatch: templateMatch
      // patterns: result.patterns
    };
  }
  if (!background) {
    postMessage({
      command: "comparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId,
    });
  } else {
    postMessage({
      command: "backgroundcomparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId,
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
    tabId: tabId,
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
      details: licenses[license].details,
      dice: licenses[license].dice,
      templateMatch: licenses[license].templateMatch,
    });
    postMessage({ command: "next", spdxid: license, id: id, tabId: tabId });
  }
  sortable.sort(function (a, b) {
    return b.percentage - a.percentage;
  });
  postMessage({ command: "sortdone", result: sortable, id: id, tabId: tabId });
}

function generateDiff(selection, spdxid, license, record, tabId) {
  // postMessage({"command": "progressbarmax","value": total, "stage":"Generating Diff","id":id});
  var result = {};
  var data = license;
  // Note: @sanity/diff-match-patch doesn't have timeout option like original
  var msStart = new Date().getTime();
  var textDiff = makeDiff(data, selection); // produces diff array
  cleanupSemantic(textDiff); // semantic cleanup
  var msEnd = new Date().getTime();
  result = { html: diff_prettyHtml(textDiff), time: msEnd - msStart };
  console.log("%s %s: %s diff:%o", tabId, id, spdxid, result);
  postMessage({
    command: "diffnext",
    spdxid: spdxid,
    result: result,
    record: record,
    id: id,
    tabId: tabId,
  });
}

function cleanText(str, removeNewLines = true) {
  // this will replace unicode spaces, collapse spaces and then replace newlines and trim
  if (removeNewLines) {
    return replaceSmartQuotes(collapseSpaces(removeLineNumbers(str)))
      .replace(/(\r\n|\n|\r)/gm, " ")
      .trim();
  } else {
    return replaceSmartQuotes(collapseSpaces(removeLineNumbers(str))).trim();
  }
}

function collapseSpaces(str) {
  return str.replace(/\s+/g, " ");
}

function replaceSmartQuotes(str) {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
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
function processTemplate(str) {
  // processes a template and returns a dictionary
  // matchRegex contains the regex for matching
  // patterns lists all replacement match regex for each variable
  // variables returns all variables discovered the template
  var varPattern = /<<var;(.+?)>>/g;
  var result = {
    matchRegex: escapeRegex(str),
    patterns: [],
    variables: [],
  };
  var match;
  var variables = [];
  var patterns = [];
  var matchPattern = "";
  while ((match = varPattern.exec(str)) != null) {
    var variable = {};
    var variablestring = match[1].split(";");
    // process any variables inside the string for potential later use
    for (var i = 0; i < variablestring.length; i++) {
      var keyvalue = variablestring[i].split("=");
      variable[
        String(keyvalue[0]).replace(/^["']/, "").replace(/["']$/, "")
      ] = String(keyvalue[1]).replace(/^["']/, "").replace(/["']$/, "");
    }
    try {
      matchPattern = variable.match;
      patterns.push(matchPattern);
      result.matchRegex = result.matchRegex.replace(
        escapeRegex(match[0]),
        "(" + matchPattern + ")"
      );
    } catch (e) {
      console.log("Bad regex detected in " + match + " error: " + e);
    }
    variables.push(variable);
  }
  result.variables = variables;
  result.patterns = patterns;
  // handle optional tags
  var optionalRegex = /<<beginOptional>>(?:\s*)((?!<<beginOptional>)(?:[\S\s](?!<beginOptional>))*?)(?:\s*)<<endOptional>>/g;
  while (result.matchRegex.match(optionalRegex)) {
    result.matchRegex = result.matchRegex.replace(
      optionalRegex,
      "(\\s?$1\\s?)?"
    );
  }
  // corner case covering boundary between optionalRegex/matchRegex
  result.matchRegex = result.matchRegex.replace(/\\s+\?\)\?+ /g, "\\s?)?\\s*");
  // corner case covering boundary matchRegex and .
  result.matchRegex = result.matchRegex.replace(/\) \\\./g, ")\\s*\\.");
  return result;
}

// promisfy gets
const get = function (url) {
  return new Promise((resolve, reject) => {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.onload = function () {
      if (x.status === 200) {
        resolve(x.response);
      } else {
        reject(Error(x.statusText));
      }
    };
    x.onerror = function () {
      reject(Error("Network Error"));
    };
    x.send();
  });
};

const getJSON = async function (url) {
  return get(url).then(JSON.parse);
};
