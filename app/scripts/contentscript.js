"use strict";
// Enable chromereload by uncommenting this line:
if(process.env.NODE_ENV === 'development'){
  require('chromereload/devonly')
}

import { selectRangeCoords, getSelectionText} from './cc-by-sa.js'
var selectedLicense = "";
var spdx = null;
//var showBest = 10;
var selection = "";
var lastselection = "";
var processTime = 0;
var list = {};
var lastupdate = null;
var updating = false;
var pendingcompare = false;
var ms_start;
//var maxworkers = 10;
var runningworkers = 0;
var workers = [];
var workqueue = [];
var unsorted = {};
//var minpercentage = 25.0;
var diffsdone = 0;
var diffsdue = 0;
var diffdisplayed = false;
var options;

//init functions
restore_options();
createBubble();

// Event driven functions
//This function processes webworker messages which it launches
//through the workerqueue
function workeronmessage(event) {
  processqueue(); //Message received so see if queue can be cleared.
  switch (event.data.command) {
    case "progressbarmax":
    updateProgressBar(event.data.value, null)
    updateBubbleText(event.data.stage);
    break;
    case "next":
    updateProgressBar(-1, -1)
    break;
    case "store":
    //This path is intended to store a hash of a comparison. Complete
    updateProgressBar(-1, -1)
    var obj = {}
    obj[event.data.spdxid] = {
        hash:event.data.hash,
        raw:event.data.raw,
        processed:event.data.processed,
        patterns:event.data.patterns};

    chrome.storage.local.set(obj,
        function() {
          console.log('Setting', obj);
        });

    break;
    case "license":
    //This path is intended to determine if comparison already done. TODO: Complete
    var spdxid = event.data.spdxid;
    var hash= event.data.hash;
    // chrome.storage.local.get(spdxid, function(result) {
    //       if (result[spdxid] && result[spdxid].hash != hash){
    //         console.log('No match found', spdxid, hash, result);
    //         worker.postMessage({ 'command':'process', 'license':spdxid,'data':result[spdxid].processed, 'selection': selection});
    //
    //       }else {
    //         console.log('Found prior computed result', spdxid, hash, result);
    //
    //     }
    // });
    break;
    case "savelicenselist":
    var externallicenselist = event.data.value;
    console.log('Trying to save list', externallicenselist);
    chrome.storage.local.get(['list'], function(result) {
          if (result.list && result.list["licenseListVersion"]){
            var list = result.list;
            console.log('Existing License list version %s with %s licenses', list["licenseListVersion"],
                        Object.keys(list["licenses"]).length);
            if (list["licenseListVersion"] < externallicenselist["licenseListVersion"]){
              console.log('Newer license list version %s found with %s licenses',
                        externallicenselist["licenseListVersion"], Object.keys(externallicenselist["licenses"]).length);
              storeList(externallicenselist);
            } else {
              dowork({ 'command':'populatelicenselist', 'data':list});
              console.log('No new update found; same version %s and %s licenses', externallicenselist["licenseListVersion"], Object.keys(externallicenselist["licenses"]).length);
            }
          }else {
            console.log('No license list found');
            storeList(externallicenselist);
        }
    });
    break;
    case "savelicense":
    if (updating){
      var externallicenselist = event.data;
      var spdxid = event.data.spdxid
      console.log('Saving license', event.data);
      chrome.storage.local.get([spdxid], function(result) {
            if (result[spdxid] && externallicenselist.data && _.isEqual(result[spdxid], externallicenselist.data)){
              var license = result[spdxid];
              console.log('Ignoring existing license', spdxid);
            }else {
              console.log('Saving new', spdxid);
              var obj = {}
              obj[spdxid] = externallicenselist.data;
              chrome.storage.local.set(obj,
                  function() {
                    console.log('Storing', obj);
                  });
          }
      });
    } else {
      console.log('Not supposed to update but received savelicense request; ignoring', event.data);
    }
    break;
    case "updatedone":
    workerdone(event.data.id)
    var arr = event.data.result;
    if (typeof list["license"] === "undefined")
      list["license"] = {};
    for (var i=0; i < arr.length; i++){
      list["license"][arr[i]["licenseId"]] = arr[i]
    }
    updating = false;
    if (pendingcompare)
      compareSelection(selection)
      pendingcompare = false;
    break;
    case "comparenext":
    workerdone(event.data.id)
    updateProgressBar(-1, -1)
    var result = event.data.result;
    var spdxid = event.data.spdxid;
    unsorted[spdxid] = result;
    if (Object.keys(unsorted).length >= Object.keys(list["license"]).length){
      console.log("Requesting final sort", Object.keys(unsorted).length)
      dowork({ 'command':"sortlicenses", 'licenses':unsorted});
      unsorted = {};
    }
    break;
    case "sortdone":
    workerdone(event.data.id)
    spdx = event.data.result;
    var ms_end = (new Date()).getTime();
    processTime = ms_end - ms_start;
    console.log("processTime: " + processTime/1000 + ("s"));
    processLicenses(options.showBest, processTime)
    break;
    case "diffnext":
    var threadid = event.data.id;
    workerdone(threadid)
    diffsdone++
    var result = event.data.result;
    var spdxid = event.data.spdxid;
    var record = event.data.record;
    var entry = spdx[record];
    entry.push(result)
    spdx[record].entry
    var select = $("#licenses option[value='" + spdxid + "']").removeAttr("disabled")
    console.log("%s: Received diff for %s %s/%s", threadid, spdxid, diffsdone, diffsdue)
    if (diffdisplayed)
      return;
    if (diffsdone >= diffsdue){
      console.log("All diffs complete")
      displayDiff(spdx[0][4].html, spdx[0][4].time)
    } else if (spdx[0][4]){
      console.log("Best diff received; we can display")
      displayDiff(spdx[0][4].html, spdx[0][4].time)
    }
    break;
    default:

  }
}

//This function responds to the UI and background.js
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if( request.message === "clicked_browser_action" ) {
      selection = getSelectionText();
      if (selection.length > 0) {
        createBubble();
        var selectCoords = selectRangeCoords();
        var posX = selectCoords[0], posY = selectCoords[1];
        renderBubble(posX, posY, selection);
        if (updating) {
          updateBubbleText('Update in progress; queuing compare');
          pendingcompare = true;
        } if (spdx && getSelectionText() == lastselection){ //diff previously done on selection
          processLicenses(options.showBest, processTime);
          return;
        } else {
          lastselection = selection;
          spdx = null;
          diffdisplayed = false;
          selectedLicense = "";
          diffsdue = 0;
          diffsdone = 0;
          diffdisplayed = false;
        }
        ms_start = (new Date()).getTime();
        if (typeof list === "undefined"){
          updateList()
          pendingcompare = true;
          console.log('Queing compare after update')
          return;
        }
        compareSelection(selection)
      } else {
        updateBubbleText('No selection to compare; please select');
        pendingcompare = false;
      }
    }
  }
);

//This function responds to changes to storage
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area == "sync" && "options" in changes) {
      console.log("Detected changed options; reloading")
      restore_options();
    }
});

// processing phase functions (these are called by the workeronmessage in order)
//Compare selection against a fully populated license list (must be loaded in list)
//This is the first phase to determine edit distance and return a sorted list
// for display in spdx
function compareSelection(selection){
  updateProgressBar(Object.keys(list["license"]).length, null)
  for (var license in list["license"]){
    dowork({'command':"compare", 'selection': selection, 'maxLengthDifference':options.maxLengthDifference, 'spdxid':license,'license':list["license"][license]});
  }
}

// This will begin displaying diffs based off sorted list spdx
function processLicenses(showBest, processTime=0){
  if (spdx && (spdx.length == 0 || Number(spdx[0][3]) <= Number(options.minpercentage))){
    console.log("No results to display");
    displayDiff(null, processTime);
    return
  } else if (spdx && diffdisplayed) {
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage)
    displayDiff(spdx[0][4].html, spdx[0][4].time);
  } else {
    for (var i = 0; i < showBest; i++){
      var license = spdx[i][0];
      var data = spdx[i][2];
      var distance = spdx[i][1];
      var percentage = spdx[i][3];
      if (i == 0) {
        selectedLicense = license;
        console.log("Best match of " + showBest + " : " + license + ": " + distance + " (" + percentage+ "%)");
      } else if (Number(percentage) <= Number(options.minpercentage)) {
        console.log(license+ ": " + distance + " (" + percentage+ "%)");
        break;
      } else {
        console.log(license+ ": " + distance + " (" + percentage+ "%)");
      }
      dowork({'command':"generateDiff", 'selection': selection, 'spdxid':license,'license':data, 'record':i});
      diffsdue++;
    }
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage)
  }
}

//This is the actual diff display function, requires a populated spdx
function displayDiff(html, time=processTime){
  diffdisplayed = true;
  updateProgressBar(spdx.length, spdx.length)
  if (!html){
    updateBubbleText('Time: '+time/ 1000+' s<br />No results to display');
    return
  }
  var html = spdx[0][4].html;
  var time = spdx[0][4].time
  updateBubbleText('Time: '+(time+processTime)/ 1000+'s<br />' + html);
  var el = document.getElementById("licenses").addEventListener("change", function () {
    if (this.value != selectedLicense){
      selectedLicense = this.value;
      html = spdx[this.options.selectedIndex][4].html;
      time = spdx[this.options.selectedIndex][4].time;
      updateBubbleText('Time: '+(time+processTime)/ 1000+'s<br />' + html);
    } else {

    }
  }, false);
}

//This function will create a select form with the sorted licenses in arr
function addSelectFormFromArray(id, arr, number=arr.length, minimum=0) {
  if (form = document.getElementById(id))
    form.outerHTML="";
  if (!$('#license_form').length){
    var bubbleDOM = $('#license_bubble')[0];
    var bubbleDOMText = $('#bubble_text')[0];
    var form = bubbleDOM.insertBefore(document.createElement('form'), bubbleDOMText);
    form.setAttribute('id',"license_form");
  }
  form = document.getElementById("license_form");
  var select = form.appendChild(document.createElement('select'));
  select.id = id;
  for (var i=0; i < arr.length && i < number; i++){
    var value = arr[i][0];
    var percentage = arr[i][3]
    var text = value + " : " + arr[i][1] + " differences ("+ percentage +"% match)";
    if (Number(percentage) <= Number(minimum)){ //No match at all
      break;
    }
    var option = select.appendChild(document.createElement("option"));
    option.value = value;
    option.text = text;
    if (diffsdone ==0)
      option.setAttribute("disabled","disabled")
  }
}

//Display helper functions for modifying the DOM

// Add bubble to the top of the page.
function createBubble(){
  if ($('#license_bubble').length) return;
  var bubbleDOM = document.createElement('div');
  bubbleDOM.setAttribute('class', 'selection_bubble');
  bubbleDOM.setAttribute('id', 'license_bubble');
  document.body.appendChild(bubbleDOM);
  var progressbar = document.createElement('progress');
  progressbar.setAttribute('id','progress_bubble');
  progressbar.setAttribute('max',100);
  progressbar.value = 0;
  bubbleDOM.appendChild(progressbar);
  var bubbleDOMText = document.createElement('div');
  bubbleDOMText.setAttribute('id', 'bubble_text');
  bubbleDOM.appendChild(bubbleDOMText);
}
// Close the bubble when we click on the screen.
document.addEventListener('mousedown', function (e) {
  if (e.target.id == "license_bubble" ||
  $(e.target).parents("#license_bubble").length||
  $(window).outerWidth() <= e.clientX||
  document.documentElement.offsetWidth <= e.clientX) {
  } else {
    var bubbleDOM = $('#license_bubble')[0];
    bubbleDOM.remove();
    createBubble();
    var posX = e.clientX;
    var posY = e.clientY;
  }
}, false);

// Move that bubble to the appropriate location.
function renderBubble(mouseX, mouseY, selection) {
  updateProgressBar(-1, 1, true)
  var progressbar = $('#progress_bubble')[0];
  updateBubbleText("Processing...");
  var bubbleDOM = $('#license_bubble')[0];
  bubbleDOM.style.top = mouseY + 'px';
  bubbleDOM.style.left = mouseX + 'px';
  bubbleDOM.style.visibility = 'visible';
  $('html,body').animate(
    {
      scrollTop: $('#progress_bubble').offset().top
    },
    'fast');
}

function updateBubbleText(text) {
  var bubbleDOMText = $('#bubble_text')[0];
  bubbleDOMText.innerHTML = text;
}

// max will increase if > 0; value will be set if not null and >=0
// else incremented by absolute value for negative numbers
function updateProgressBar(max, value, visible=true) {
  var progressbar = $('#progress_bubble')[0];
  progressbar.style.visibility = visible ?'visible': 'hidden'
  if (max > 0){
    progressbar.setAttribute('max',max);
  }
  if (value !== null){
    if (value >= 0) {
      progressbar.value = value;
    } else {
      progressbar.value = progressbar.value + Math.abs(value)
    }
  }
}

//storage functions
function storeList(externallicenselist){
  var obj = {};
  externallicenselist["lastupdate"] = Date.now()
  obj = {
      list:externallicenselist
    };
  chrome.storage.local.set(obj,
      function() {
        console.log('Storing cached copy of ', obj);
      });
}
function loadList(){
    chrome.storage.local.get(['list'], function(result) {
      if (result.list && result.list["licenseListVersion"]){
        list = result.list;
        lastupdate = list["lastupdate"]
        console.log('Loading License list version %s from storage with %s licenses last updated %s',
          list["licenseListVersion"], list.licenses.length, Date(lastupdate));
        if ((Date.now() - lastupdate) >= (options.updateFrequency * 86400000)){
          console.log('Last update was over %s days ago; update required', options.updateFrequency);
          updateList()
        }else{
          for (var j = 0; j < list.licenses.length; j++) {
            var line = list.licenses[j];
            var license = line["licenseId"];
            list["license"] = {}
            console.log('Attempting to load %s from storage', license);
            chrome.storage.local.get([license], function(result) {
              if (result && ! _.isEmpty(result)){
                license = Object.keys(result)[0]
                console.log('%s succesfully loaded from storage', license);
                list.license[license] = result[license];
              }else {
                console.log('%s not found in storage; requesting update', license);
                updateList()
              }
            });
          }
        }
      }else {
        console.log('No license list found in storage; requesting update');
        updateList()
      }
    });
}
function updateList(){
  if (updating){
    console.log("Ignoring redundant update request")
    return
  }else {
  updating = true;
  dowork({ 'command':"updatelicenselist", 'url':chrome.extension.getURL(""), 'remote':true});
  }
}

function restore_options() {
  chrome.storage.sync.get(['options'], function(result) {
    options = result.options;
    if (options === undefined) {
      options = {
        updateFrequency: 90,
        showBest: 10,
        minpercentage: 25,
        maxLengthDifference: 1000,
        maxworkers: 10
      };
    }
    loadList();
  });
}

// Workerqueue functions
// These functions are for allowing multiple workers.
function spawnworkers(){
  if (workers.length == options.maxworkers)
    return
  console.log("Spawning %s workers", options.maxworkers)
  for (var i = 0; i < options.maxworkers; i++){
    var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'));
    worker.onmessage = workeronmessage;
    workers[i]= [worker , false];
  }
}
//queue and start work
function processqueue(){
  while (workqueue.length && options.maxworkers > runningworkers){
      var work = workqueue.shift();
      dowork(work)
  }
}
function dowork(message, ){
  spawnworkers()
  var offset = options.maxworkers - runningworkers
  if (options.maxworkers > runningworkers ){
    for (var i = runningworkers % options.maxworkers; i < options.maxworkers + offset - 1; i = (i + 1) % options.maxworkers){
      if (!workers[i][1]) {// worker is available
        message["id"] = i;
        var worker = workers[i][0]
        workers[i][1] = true
        worker.postMessage(message)
        runningworkers++
        break
      }else {
        continue
      }
    }
  }else{ // queue up work
    workqueue.push(message)
  }
}
function workerdone(id){
  workers[id][1] = false
  runningworkers--
}
