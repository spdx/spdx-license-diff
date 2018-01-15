"use strict";

var promises=[];
var SPDXlist = {};


self.onmessage = function(event) {
  switch (event.data.command) {
    case "process":
    //'license':spdxid,'hash':hash, 'selection': selection
    //processSelection(event.data["license"], event.data["data"], event.data["selection"]);
    break;
    default:
    getSPDXlist(event.data["url"], event.data["selection"]);

  }
};

function getSPDXlist(baseurl, selection) {
  var files = [];
  //var SPDXlist = {};
  var url = baseurl + 'license-list/spdx.txt';
  var x = new XMLHttpRequest();
  x.open('GET', url);
  x.onload = function() {
    var lines = x.responseText.split("\n");
    postMessage({"command": "progressbarmax","value": lines.length});
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j]
      if (line.search(/\.txt/g) >= 0){
        var license = line.substring(0, line.search(/\.txt/g));
        files.push(license);
      }
    }

    var count2 = selection.length;
    console.log("Processing selection of " + count2 + " chars.");
    promises = files.map(
      function(value){
        return new Promise(function(resolve, reject) {
          url = baseurl + 'license-list/' + value + ".txt";
          x = new XMLHttpRequest();
          x.open ('GET', url);
          x.onload = function() {
            var md5 = require('md5-jkmyers')
            var hash = md5(this.responseText);
            var raw = this.responseText;
            var spdxid = value.replace(/\.template$/g, '');
            postMessage({"command": "license","spdxid": spdxid, "hash":hash});
            //var result = processVariables(raw); //strip out spdx variables
            //var data = result.data  
            var data = raw  
            var count = data.length
            var difference = Math.abs(count2 - count);
            var maxLength = Math.max(count, count2);
            if (difference <= maxLength && difference < 1000) {
              var distance = Levenshtein.get(cleanText(data), cleanText(selection));
              var percentage = ((maxLength - distance) / maxLength * 100).toFixed(1);
              console.log(spdxid + " - Levenshtein Distance (clean): " + distance + " (" + percentage + "%)");
              SPDXlist[spdxid] = {
              distance: distance,
              text: data,
              percentage: percentage,
              //patterns: result.patterns
              }
            }else {
              console.log(spdxid + " - Length Difference: " + difference);
              SPDXlist[spdxid] = {
                distance: difference,
                text: data,
                percentage: 0,
                //patterns: result.patterns
              }
            }
            postMessage({"command": "next", "spdxid":spdxid});
            //postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
            resolve(SPDXlist[spdxid])
          } 
          x.send();
        })

      });
      Promise.all(promises)
      .then(function(data){ //success
        var sortable = [];
        for (var license in SPDXlist) {
          sortable.push([
            license,
            SPDXlist[license]['distance'],
            SPDXlist[license]['text'],
            SPDXlist[license]['percentage']
          ]);
        }
        sortable.sort(function(a, b) {
          return b[3] - a[3];
        });
        postMessage({"command": "done","result": sortable});
      }

    );
  };

  x.send();


};
function processSelection(spdxid, data, selection) {
  var result = processVariables(data); //strip out spdx variables
  var data = result.data  
  var count = data.length
  var count2 = selection.length;
  var difference = Math.abs(count2 - count);
  var maxLength = Math.max(count, count2);
  if (difference <= maxLength && difference < 1000) {
    var distance = Levenshtein.get(cleanText(data), cleanText(selection));
    var percentage = ((maxLength - distance) / maxLength * 100).toFixed(1);
    console.log(spdxid + " - Levenshtein Distance (clean): " + distance + " (" + percentage + "%)");
    SPDXlist[spdxid] = {
      distance: distance,
      text: data,
      percentage: percentage,
      patterns: result.patterns
    }
  }else {
    console.log(spdxid + " - Length Difference: " + difference);
    SPDXlist[spdxid] = {
      distance: difference,
      text: data,
      percentage: 0,
      patterns: result.patterns
    }
  }
  postMessage({"command": "store", "spdxid":spdxid, "raw":data, "processed":result.data, "patterns": result.patterns});
  //resolve(SPDXlist[spdxid])
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
