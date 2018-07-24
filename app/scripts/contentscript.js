"use strict";
// Enable chromereload by uncommenting this line:
import 'chromereload/devonly'

//import './cc-by-sa.js'
// content.js

var selectedLicense = "";
var spdx = null;
var showBest = 10;
var selection = "";
var maxDifference=500;
var processTime = 0;
var list = {};
var lastupdate = null;
var updating = false;
var pendingcompare = false;
var ms_start;
var maxworkers = 10;
var runningworkers = 0;
//load worker
var workers = [];
var workqueue = [];
var unsorted = {};
//var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'));

createBubble();
loadList();

function workeronmessage(event) {
  var progressbar = $('#progress_bubble')[0];
  processqueue(); //Message received so see if queue can be cleared.
  switch (event.data.command) {
    case "progressbarmax":
    if(event.data.value > 0){
      progressbar.setAttribute('max',event.data.value);
      progressbar.value = 0;
    }
    updateBubbleText(event.data.stage);
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
    case "savelicenselist":
    var externallicenselist = event.data.value;
    console.log('Trying to save list', externallicenselist);
    chrome.storage.local.get(['list'], function(result) {
          if (result.list && result.list["licenseListVersion"]){
            var list = result.list;
            console.log('Existing License list version', list["licenseListVersion"]);
            if (list["licenseListVersion"] < externallicenselist["licenseListVersion"]){
              console.log('Newer license list found', externallicenselist["licenseListVersion"]);
              storeList(externallicenselist);
            } else {
              dowork({ 'command':'populatelicenselist', 'data':list});
              console.log('No new update found; same version', externallicenselist["licenseListVersion"]);
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
            if (result[spdxid] && externallicenselist.data[spdxid]){
              var license = result[spdxid];
              console.log('Existing license', spdxid);
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
    workers[event.data.id][1] = false
    runningworkers--
    var arr = event.data.result;
    if (typeof list === "undefined")
      list["license"] = {};
    for (var i=0; i < arr.length; i++){
      list["license"][arr[i]["licenseId"]] = arr[i]
    }
    updating = false;
    if (pendingcompare)
      var progressbar = $('#progress_bubble')[0];
      progressbar.setAttribute('max',Object.keys(list["license"]).length);
      for (var license in list["license"]){
        dowork({'command':"compare", 'selection': selection, 'spdxid':license,'license':list["license"][license]});
      }
      pendingcompare = false;
    break;
    case "comparenext":
    workers[event.data.id][1] = false
    runningworkers--
    progressbar.value++;
    var result = event.data.result;
    var spdxid = event.data.spdxid;
    unsorted[spdxid] = result
    if (Object.keys(unsorted).length >= Object.keys(list["license"]).length){
      console.log("Requesting final sort", Object.keys(unsorted).length)
      dowork({ 'command':"sortlicenses", 'licenses':unsorted});
    }
    break;
    case "done":
    workers[event.data.id][1] = false
    runningworkers--
    spdx = event.data.result;
    var ms_end = (new Date()).getTime();
    processTime = ms_end - ms_start;
    console.log("processTime: " + processTime/1000 + ("s"));
    processLicenses(event.data.result, showBest, processTime)
    break;
    default:

  }
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if( request.message === "clicked_browser_action" ) {
      if (spdx && getSelectionText() == selection){ //diff previously done on selection
        displayLicenses(spdx, showBest, processTime);
        return;
      } else {
        selection = getSelectionText();
        spdx = null;
      }
      if (selection.length > 0) {
        if (!$('#license_bubble').length) createBubble();
        var selectCoords = selectRangeCoords();
        var posX = selectCoords[0], posY = selectCoords[1];
        renderBubble(posX, posY, selection);
      }
      ms_start = (new Date()).getTime();
      if (typeof list === "undefined"){
        updateList()
        pendingcompare = true;
        console.log('Queing compare after update')
        return;
      }
      var progressbar = $('#progress_bubble')[0];
      progressbar.setAttribute('max',Object.keys(list["license"]).length);
      for (var license in list["license"]){
        dowork({'command':"compare", 'selection': selection, 'spdxid':license,'license':list["license"][license]});
      }

    }
  }
);

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
    if (sortable && sortable.length == 0){
      console.log("No results to display");
      displayDiff(data, selection, processTime);
      return
    }
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
    if (!data){
      var bubbleDOMText = $('#bubble_text')[0];
      bubbleDOMText.innerHTML = 'No results to display';
      return
    }
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
  function spawnworkers(){
    if (workers.length == maxworkers)
      return
    console.log("Spawning workers", maxworkers)
    for (var i = 0; i < maxworkers; i++){
      var worker = new Worker(chrome.runtime.getURL('scripts/worker.js'));
      worker.onmessage = workeronmessage;
      workers[i]= [worker , false];
    }
  }
  //queue and start work
  function processqueue(){
    while (workqueue.length && maxworkers > runningworkers){
        var work = workqueue.shift();
        dowork(work)
    }
  }
  function dowork(message){
    spawnworkers()
    var offset = maxworkers - runningworkers
    if (maxworkers > runningworkers ){
      for (var i = runningworkers % maxworkers; i < maxworkers + offset - 1; i = (i + 1) % maxworkers){
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
              console.log('Loading License list version from storage', list["licenseListVersion"], list["lastupdate"]);
              lastupdate = list["lastupdate"]
              for (var j = 0; j < list.licenses.length; j++) {
                var line = list.licenses[j];
                var license = line["licenseId"];
                list["license"] = {}
                console.log('Attempting to load license from storage', license);
                chrome.storage.local.get([license], function(result) {
                  if (result){
                    license = Object.keys(result)[0]
                    console.log('Loading license from storage', license);
                    list.license[license] = result[license];
                  }else {
                    console.log('No license found in storage', license);
                  }
                });
              }
            }else {
              console.log('No license list found in storage; updating');
              updateList()
            }
          });

        }
        function updateList(){
          if (updating){
            console.log("Ignoring redundant update request")
            return
          }else{
          updating = true;
          dowork({ 'command':"updatelicenselist"});
          }
        }

    //https://stackoverflow.com/questions/2031518/javascript-selection-range-coordinates
    function selectRangeCoords(){
      var node = window.getSelection();
      var $span= $("<span/>");
      var newRange = document.createRange();
      newRange.setStart(node.focusNode, 0);
      newRange.insertNode($span[0]); // using 'range' here instead of newRange unselects or causes flicker on chrome/webkit

      var posX = $span.offset().left;
      var posY = $span.offset().top;
      $span.remove();
      return [posX, posY]
      }

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
