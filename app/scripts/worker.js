"use strict";

var promises=[];
var SPDXlist = {};
var files = [];
var id;
var dmp =  new DiffMatchPatch(); // options may be passed to constructor; see below

self.onmessage = function(event) {
  id = event.data.id
  switch (event.data.command) {
    case "process":
    //'license':spdxid,'hash':hash, 'selection': selection
    break;
    case "updatelicenselist":
    getSPDXlist(event.data["url"], event.data["selection"]);
    break;
    case "compare":
    var spdxid = event.data.spdxid
    var license = event.data.license
    var maxLengthDifference = event.data.maxLengthDifference
    comparelicense(event.data["selection"], spdxid, license, maxLengthDifference);
    break;
    case "sortlicenses":
    sortlicenses(event.data.licenses);
    break;
    case "generateDiff":
    var spdxid = event.data.spdxid
    var license = event.data.license
    var record = event.data.record
    generateDiff(event.data["selection"], spdxid, license, record);
    break;

    default:
    //getSPDXlist(event.data["url"], event.data["selection"]);

  }
};
// load files array with list of files to download
function getSPDXlist(baseurl, selection, remote=true) {
  if (typeof files === "undefined")
    var files = []
  if (remote) {
    var url = "https://spdx.org/licenses/licenses.json"
  } else {
    var url = baseurl + 'license-list/spdx.txt';
  }
  var x = new XMLHttpRequest();
  x.open('GET', url);
  x.onload = function() {
    if (remote){
      var lines = JSON.parse(x.responseText);
      postMessage({"command": "progressbarmax","value": lines.licenses.length, "stage":"Updating licenses","id":id});
      postMessage({"command": "savelicenselist","value": lines,"id":id});
      console.log(id, "Updating: ", lines);
      for (var j = 0; j < lines.licenses.length; j++) {
        var line = lines.licenses[j];
        var license = line["detailsUrl"];
        license = license.replace("http:","https:")
        files.push(license);
      }
    } else {
      var lines = x.responseText.split("\n");
      postMessage({"command": "progressbarmax","value": lines.licenses.length, "stage":"Updating licenses","id":id});
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j]
        if (line.search(/\.txt/g) >= 0){
          var license = line.substring(0, line.search(/\.txt/g));
          files.push(license);
        }
      }
    }
    processSPDXlist(files);
  }
  x.send();
};
// download licenses from files array
function processSPDXlist(files, remote=true) {
  promises = files.map(
    function(value){
      return new Promise(function(resolve, reject) {
        if (remote){
          var url = value;
        }else{
          var url = baseurl + 'license-list/' + value + ".txt";
        }
        var x = new XMLHttpRequest();
        x.open ('GET', url);
        x.onload = function() {
          var md5 = require('md5-jkmyers')
          if (remote){
            var response = JSON.parse(this.responseText);
            var hash = md5(response["licenseText"]);
            var raw = response["licenseText"];
            var spdxid = response["licenseId"];
          }else{
            var response = {};
            var hash = md5(this.responseText);
            var raw = this.responseText;
            var spdxid = value.replace(/\.template$/g, '');
            response["licenseText"] = raw;
            response["licenseId"] = spdxid
          }
          postMessage({"command": "savelicense","spdxid": spdxid, "data":response,"id":id});
          postMessage({"command": "next", "spdxid":spdxid,"id":id});
          SPDXlist[spdxid] = response
          //postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
          resolve(SPDXlist[spdxid])
        }
        x.send();
      })

    });
    Promise.all(promises)
    .then(function(data){ //success
      console.log(id, "License List Updated");
      postMessage({"command": "updatedone", "result":data,"id":id});
    }

  );
};

function comparelicense(selection, spdxid, license, maxLengthDifference=1000) {
  postMessage({"command": "progressbarmax","value": 0, "stage":"Comparing licenses","id":id});
  var result = {}
  var count2 = selection.length;
  //console.log(id, "Processing selection of " + count2 + " chars.");
  var data = license.licenseText
  var count = data.length
  var locre = data.match(/\r?\n/g)
  var loc = (locre ? locre.length: 0);
  var locre2 = selection.match(/\r?\n/g)
  var loc2 = (locre2 ? locre2.length: 0);
  var difference = Math.abs(count2 - count);
  var locdiff = Math.abs(loc2 - loc);
  var maxLength = Math.max(count, count2);
  var lcs = "";//longestCommonSubstring(cleanText(data), cleanText(selection));
  if (difference <= maxLength && difference < maxLengthDifference) {
    var distance = Levenshtein.get(cleanText(data), cleanText(selection));
    var percentage = ((maxLength - distance) / maxLength * 100).toFixed(1);
    console.log(id, spdxid + " - Levenshtein Distance (clean): " + distance + " (" + percentage + "%)" + " Length Difference: " + difference + " LOC Diff:" + locdiff);
    result = {
      distance: distance,
      text: data,
      percentage: percentage,
      //patterns: result.patterns
    }
  }else{
    console.log(id, spdxid + " - Length Difference: " + difference + " LOC Diff:" + locdiff);
    result = {
      distance: difference,
      text: data,
      percentage: 0,
      //patterns: result.patterns
    }
    console.log(id, spdxid + " - LCS: " + lcs + " length: " + lcs.length);

  }
  postMessage({"command": "comparenext", "spdxid":spdxid, "result":result, "id":id});
  //postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
};
function sortlicenses(licenses) {
  postMessage({"command": "progressbarmax","value": Object.keys(licenses).length, "stage":"Sorting licenses","id":id});
  console.log(id, "Sorting " + Object.keys(licenses).length + " licenses");
  var sortable = [];
  for (var license in licenses) {
    sortable.push([
      license,
      licenses[license]['distance'],
      licenses[license]['text'],
      licenses[license]['percentage']
    ]);
    postMessage({"command": "next", "spdxid":license,"id":id});
  }
  sortable.sort(function(a, b) {
    return b[3] - a[3];
  });
  postMessage({"command": "sortdone","result": sortable,"id":id});
};

function generateDiff(selection, spdxid, license, record) {
  //postMessage({"command": "progressbarmax","value": 0, "stage":"Generating Diff","id":id});
  var result = {}
  var data = license
  dmp.Diff_Timeout=0;
//    dmp.Diff_Timeout = parseFloat(document.getElementById('timeout').value);
  var ms_start = (new Date()).getTime();
  var textDiff = dmp.diff_main(data, selection); // produces diff array
  dmp.diff_cleanupSemantic(textDiff); // semantic cleanup
  //dmp.diff_cleanupEfficiency(textDiff);
  var ms_end = (new Date()).getTime();
  result = { "html":dmp.diff_prettyHtml(textDiff), "time":(ms_end - ms_start)}
  console.log("%s: %s diff:%o", id, spdxid, result);
  postMessage({"command": "diffnext", "spdxid":spdxid, "result":result, "record":record, "id":id});
};

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/(\r\n|\n|\r)/gm, ' ');
}
function escapeRegex(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"); //need to escape regex characters
}
function processVariables(str) {
  var pattern = /(^|(?:\s*(?!<<)\S+(?!<<)\s*){0,3}?)<<var;(.+?)>>($|(?:\s*(?!<<)\S+(?!<<)\s*){0,3})/g; // Capture up to six words before and after
  // to use this pattern match[1] must be match[2]
  //var pattern = /<<var;(.*?)>>/g; // Do a literal match
  var pattern2 = "";
  var result={
      'data':str,
      'patterns' : []
  };
  var match;
  var variable ={};
  var patterns = [];
  while ((match = pattern.exec(str)) != null){
    var variablestring = match[2].split(";");
    //process any variables inside the string for potential later use
    for (var i=0; i < variablestring.length; i++){
      var keyvalue = variablestring[i].split("=");
      variable[keyvalue[0]] = keyvalue[1];
    }
    //pattern2 = match[1] + "<<var;"+variable['match']+">>" + match[3];
    pattern2 = escapeRegex(match[1]) +"(" +String(variable['match']) +"?)"+ escapeRegex(match[3]);
    patterns.push(pattern2);
    result.data = result.data.replace(new RegExp(pattern2), match[1] + variable["original"] + match[3])
    pattern.lastIndex -= match[3].length;
  }
  result.patterns = patterns;
  result.data = result.data.replace(/<<beginOptional;.*?>>/g, "").replace(/<<endOptional>>/g, "");
  return result;
}

//https://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Longest_common_substring#JavaScript
function longestCommonSubstring(string1, string2){
  // init max value
  var longestCommonSubstring = 0;
  // init 2D array with 0
  var table = [],
            len1 = string1.length,
            len2 = string2.length,
            result = "",
            row, col;
  for(row = 0; row <= len1; row++){
    table[row] = [];
    for(col = 0; col <= len2; col++){
      table[row][col] = 0;
    }
  }
  // fill table
        var i, j;
  for(i = 0; i < len1; i++){
    for(j = 0; j < len2; j++){
      if(string1[i] === string2[j]){
        if(table[i][j] === 0){
          table[i+1][j+1] = 1;
        } else {
          table[i+1][j+1] = table[i][j] + 1;
        }
        if(table[i+1][j+1] > longestCommonSubstring){
          longestCommonSubstring = table[i+1][j+1];
          result = string1.substring(i - longestCommonSubstring + 1,i + 1);
        }
      } else {
        table[i+1][j+1] = 0;
      }
    }
  }
  return result;
}
