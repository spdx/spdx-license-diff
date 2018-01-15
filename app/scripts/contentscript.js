"use strict";
// Enable chromereload by uncommenting this line:
//import 'chromereload/devonly'

// content.js

var selectedLicense = "";
var spdx = null;
var showBest = 10;
var selection = "";
var maxDifference=500;
var processTime = 0;
createBubble();
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if( request.message === "clicked_browser_action" ) {
      if (spdx && getSelectionText() == selection){
        processLicenses(spdx, showBest, processTime);
        return;
      } else {
        selection = getSelectionText();
        spdx = null;
      }
      if (selection.length > 0) {
        if (!$('#license_bubble').length) createBubble();
        //https://stackoverflow.com/questions/2031518/javascript-selection-range-coordinates
        var node = window.getSelection();
        var $span= $("<span/>");
        var newRange = document.createRange();
        newRange.setStart(node.focusNode, 0);
        newRange.insertNode($span[0]); // using 'range' here instead of newRange unselects or causes flicker on chrome/webkit

        var posX = $span.offset().left;
        var posY = $span.offset().top;
        $span.remove();
        renderBubble(posX, posY, selection);
      }
      var ms_start = (new Date()).getTime();
      var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'));
      worker.postMessage({ 'url':chrome.extension.getURL(""), 'selection': selection});
      worker.onmessage = function(event) {
        var progressbar = $('#progress_bubble')[0];
        switch (event.data.command) {
          case "progressbarmax":
          progressbar.setAttribute('max',event.data.value);
          break;
          case "next":
          progressbar.value++;
          break;
          case "store":
          progressbar.value++;
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
          case "done":
          spdx = event.data.result;
          var ms_end = (new Date()).getTime();
          processTime = ms_end - ms_start;
          console.log("processTime: " + processTime/1000 + ("s"));
          processLicenses(event.data.result, showBest, processTime)
          break;
          default:

        }
      }
    }
  }
);
//https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text
function getSelectionText() {
  var text = "";
  var activeEl = document.activeElement;
  var activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
  if (
    (activeElTagName == "textarea") || (activeElTagName == "input" &&
    /^(?:text|search|password|tel|url)$/i.test(activeEl.type)) &&
    (typeof activeEl.selectionStart == "number")
  ) {
    text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
  } else if (window.getSelection) {
    text = window.getSelection().toString();
  }
  return text;
}

// Add bubble to the top of the page.
function createBubble(){
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
var posX = 0;
var posY = 0;
document.addEventListener('mousedown', function (e) {
  if (e.target.id == "license_bubble" ||
  $(e.target).parents("#license_bubble").length||
  $(window).outerWidth() <= e.clientX||
  document.documentElement.offsetWidth <= e.clientX) {
  } else {
    var bubbleDOM = $('#license_bubble')[0];
    bubbleDOM.remove();
    if (!$('#license_bubble').length) createBubble();
    posX = e.clientX;
    posY = e.clientY;
  }
}, false);

// Move that bubble to the appropriate location.
function renderBubble(mouseX, mouseY, selection) {
  var progressbar = $('#progress_bubble')[0];
  progressbar.style.visibility = 'visible'
  progressbar.value = 1;
  var bubbleDOMText = $('#bubble_text')[0];
  bubbleDOMText.innerHTML = "Processing...";
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
  function addSelectFormFromArray(id, arr, number=arr.length) {
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
          var text = value + " : " + arr[i][1] + " ("+ percentage +"%)";
          if (percentage == 0){ //No match at all
            break;
          }
          var option = select.appendChild(document.createElement("option"));
          option.value = value;
          option.text = text;

    }
  }
  function processLicenses(sortable, showBest, processTime=0){
    var data = sortable[0][2];
    for (var i = 0; i < showBest; i++){
      var license = sortable[i][0];
      var distance = sortable[i][1];
      var percentage = sortable[i][3];
      if (i == 0) {
        var selectedLicense = license;
        console.log("Best match of " + showBest + " : " + license + ": " + distance + " (" + percentage+ "%)");
      }  else {
        console.log(license+ ": " + distance + " (" + percentage+ "%)");
      }
      addSelectFormFromArray("licenses", sortable, showBest)
      displayDiff(data, selection, processTime);
      var el = document.getElementById("licenses").addEventListener("change", function () {
        if (this.value != selectedLicense){
          selectedLicense = this.value;
          var data = sortable[this.options.selectedIndex][2];
          displayDiff(data, selection, processTime)
        } else {

        }
      }, false);
    }
  }
  function displayDiff(data, selection, processTime=0){
    var dmp =  new DiffMatchPatch(); // options may be passed to constructor; see below
    dmp.Diff_Timeout=0;
//    dmp.Diff_Timeout = parseFloat(document.getElementById('timeout').value);
    var ms_start = (new Date()).getTime();
    var textDiff = dmp.diff_main(data, selection); // produces diff array
    dmp.diff_cleanupSemantic(textDiff); // semantic cleanup
    //dmp.diff_cleanupEfficiency(textDiff);
    var ms_end = (new Date()).getTime();
    var bubbleDOMText = $('#bubble_text')[0];
    bubbleDOMText.innerHTML = 'Time: ' + (processTime + ms_end - ms_start) / 1000 + 's<br />' + dmp.diff_prettyHtml(textDiff);
    $('html,body').animate({
      scrollTop: $(licenses).offset().top},
      'fast');
    }
