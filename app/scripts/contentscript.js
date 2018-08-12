"use strict";
// Enable chromereload by uncommenting this line:
if(process.env.NODE_ENV === 'development'){
  require('chromereload/devonly')
}

import { selectRangeCoords, getSelectionText} from './cc-by-sa.js'
var selectedLicense = "";
var spdx = null;
var selection = "";
var lastselection = "";
var processTime = 0;
var lastupdate = null;
var ms_start;
var diffsdone = 0;
var diffsdue = 0;
var diffdisplayed = false;
var options;

//init functions
restore_options();
createBubble();

// Event driven functions

//This function responds to the UI and background.js
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    switch (request.command){
    case "clicked_browser_action":
      selection = getSelectionText();
      if (selection.length > 0) {
        createBubble();
        var selectCoords = selectRangeCoords();
        var posX = selectCoords[0], posY = selectCoords[1];
        renderBubble(posX, posY, selection);
        if (spdx && getSelectionText() == lastselection){ //diff previously done on selection
          processLicenses((options.showBest == 0)? spdx.length: options.showBest, processTime)
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
        compareSelection(selection)
      } else {
        updateBubbleText('No selection to compare; please select');
      }
    break;
    case "progressbarmax":
      updateProgressBar(request.value, 0 ? request.reset : null)
      updateBubbleText(request.stage);
    break;
    case "progressbarvalue":
      updateProgressBar(-1, request.value)
    break;
    case "next":
      updateProgressBar(-1, -1)
    break;
    case "sortdone":
      spdx = request.result;
      var ms_end = (new Date()).getTime();
      processTime = ms_end - ms_start;
      console.log("processTime: " + processTime/1000 + ("s"));
      processLicenses((options.showBest == 0)? spdx.length: options.showBest, processTime)
    break;
    case "diffnext":
      updateProgressBar(-1, -1)
      diffsdone++
      var threadid = request.id;
      var result = request.result;
      var spdxid = request.spdxid;
      var record = request.record;
      var details = request.details;
      spdx[record]["html"] = result["html"]
      spdx[record]["time"] = result["time"]
      for (var k in details){
        spdx[record][k] = details[k];
      }
      var select = $("#licenses option[value='" + spdxid + "']").removeAttr("disabled")
      console.log("%s: Received diff for %s %s/%s", threadid, spdxid, diffsdone, diffsdue)
      if (diffdisplayed)
        return;
      if (diffsdone >= diffsdue){
        console.log("All diffs complete")
        displayDiff(spdx[0]["html"], spdx[0]["time"])
      } else if (spdx[0]["html"]){
        console.log("Best diff received; we can display")
        displayDiff(spdx[0]["html"], spdx[0]["time"])
      }
    break;
    default:
    break;
  }
});

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
  chrome.runtime.sendMessage({ 'command':"compareselection", 'selection':selection});
}

// This will begin displaying diffs based off sorted list spdx
function processLicenses(showBest, processTime=0){
  console.log("Processing diffs for %s items exceeding %s% match", showBest, Number(options.minpercentage))
  if (spdx && (spdx.length == 0 || Number(spdx[0]["percentage"]) <= Number(options.minpercentage))){
    console.log("No results to display");
    displayDiff(null, processTime);
    updateProgressBar(spdx.length, spdx.length)
    return
  } else if (spdx && diffdisplayed) {
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage)
    displayDiff(spdx[0]["html"], spdx[0]["time"]);
  } else {
    updateBubbleText("Diffing results")
    for (var i = 0; i < showBest; i++){
      var license = spdx[i]["spdxid"];
      var data = spdx[i]["difftext"];
      var distance = spdx[i]["distance"];
      var percentage = spdx[i]["percentage"];
      if (i == 0) {
        selectedLicense = license;
        console.log("Best match of " + showBest + " : " + license + ": " + distance + " (" + percentage+ "%)");
      } else if (Number(percentage) < Number(options.minpercentage)) {
        break;
      } else {
        console.log(license+ ": " + distance + " (" + percentage+ "%)");
      }
      chrome.runtime.sendMessage({'command':"generateDiff", 'selection': selection, 'spdxid':license,'license':data, 'record':i});
      diffsdue++;
    }
    updateProgressBar(diffsdue, 0)
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage)
  }
}

//This is the actual diff display function, requires a populated spdx
function displayDiff(html, time=processTime){
  diffdisplayed = true;
  if (!html){
    updateBubbleText('Time: '+time/ 1000+' s<br />No results to display');
    return
  }
  var html = spdx[0]["html"];
  var time = spdx[0]["time"];
  var spdxid = spdx[0]["spdxid"];
  var title = `<a href="https://spdx.org/licenses/${spdxid}.html" target="_blank">${spdxid}</a>`
  var timehtml = ' processed in '+(time+processTime)/ 1000+'s<br />'
  updateBubbleText(title + timehtml + html);
  var el = document.getElementById("licenses").addEventListener("change", function () {
    if (this.value != selectedLicense){
      selectedLicense = this.value;
      spdxid = spdx[this.options.selectedIndex]["spdxid"]
      html = spdx[this.options.selectedIndex]["html"];
      time = spdx[this.options.selectedIndex]["time"];
      title = `<a href="https://spdx.org/licenses/${spdxid}.html" target="_blank">${spdxid}</a>`
      timehtml = ' processed in '+(time+processTime)/ 1000+'s<br />'
      updateBubbleText(title + timehtml + html);
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
    var value = arr[i]["spdxid"];
    var percentage = arr[i]["percentage"]
    var text = value + " : " + arr[i]["distance"] + " differences ("+ percentage +"% match)";
    if (Number(percentage) < Number(minimum)){ //No match at all
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
    } else if (progressbar.value < progressbar.getAttribute('max')){
      progressbar.value = progressbar.value + Math.abs(value)
    }
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
  });
}
