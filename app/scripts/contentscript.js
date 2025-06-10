// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
/* eslint-disable no-empty, no-unused-vars */

import { selectRangeCoords, getSelectionText } from "./cc-by-sa.js";
import { filters, defaultoptions, readmePermissionsUrls } from "./const.js";
import { utils } from "./utils.js";
import $ from "jquery";
import _ from "underscore";

const api = typeof browser !== "undefined" ? browser : chrome;
var version = api.runtime.getManifest().version;
var selectedLicense = "";
var spdx = null;
var rawspdx = null;
var selection = "";
var lastselection = "";
var processTime = 0;
var diffsdone = 0;
var diffsdue = 0;
var diffdisplayed = false;
var diffs = {};
var options;
var msStart;
var selectedfilters;
var permissionDialogShown = false; // Flag to prevent repeated permission prompts
var pendingSelection = null; // Store selection for later processing when permissions are granted

// Function to apply custom diff colors from storage
function applyCustomDiffColors() {
  api.storage.local.get(['customDiffCSS'], function(result) {
    if (result.customDiffCSS) {
      // Remove any existing custom style element
      const existingStyle = document.getElementById('spdx-custom-diff-colors');
      if (existingStyle) {
        existingStyle.remove();
      }
      
      // Create new style element with custom colors
      const styleElement = document.createElement('style');
      styleElement.id = 'spdx-custom-diff-colors';
      styleElement.textContent = result.customDiffCSS;
      document.head.appendChild(styleElement);
      
      console.log('Applied custom diff colors');
    }
  });
}

// Show permission error with helpful links for different browsers
function showPermissionErrorDialog(message) {
  // Prevent repeated permission dialogs in the same session
  if (permissionDialogShown) {
    console.log("CONTENT SCRIPT: Permission dialog already shown, skipping repeated prompt");
    return;
  }
  
  permissionDialogShown = true;
  
  const specificReadmeUrl = utils.isFirefox() ? readmePermissionsUrls.firefox : readmePermissionsUrls.chrome;
  
  const helpfulMessage = `${message}\n\n` +
    `For detailed setup instructions, visit:\n${specificReadmeUrl}\n\n` +
    `License Diff will continue automatically once permissions are granted.\n\n` +
    `Click OK to open the setup instructions, or Cancel to dismiss this message.\n\n`;
  
  // Show as browser alert dialog instead of in bubble
  const userWantsHelp = window.confirm(helpfulMessage);
  
  if (userWantsHelp) {
    try {
      window.open(specificReadmeUrl, '_blank');
    } catch (error) {
      console.log('Could not open README instructions:', error);
      // Fallback: show a more prominent alert
      alert(`Please manually visit: ${specificReadmeUrl}`);
    }
  }
}

// init functions
restoreOptions();

// Event driven functions

// This function responds to the UI and background.js
api.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("CONTENT SCRIPT: Received message:", request.command);
  switch (request.command) {
    case "clicked_browser_action":
      console.log("CONTENT SCRIPT: Processing clicked_browser_action");
      sendResponse({ status: "1" }); // send receipt confirmation
      selection = getSelectionText();
      console.log("CONTENT SCRIPT: Selection text:", selection ? `"${selection.substring(0, 50)}..."` : "NONE");
      if (selection.length > 0) {
        // Check permissions first before proceeding with bubble creation and license comparison
        checkPermissionsAndProceed(selection);
      } else {
        console.log("CONTENT SCRIPT: No selection found, showing message");
        createBubble();
        updateBubbleText("No selection to compare; please select");
      }
      console.log("CONTENT SCRIPT: clicked_browser_action processing complete");
      break;
    case "progressbarmax":
      updateProgressBar(request.value, null);
      updateBubbleText(request.stage);
      break;
    case "progressbarvalue":
      updateProgressBar(-1, request.value);
      break;
    case "next":
      updateProgressBar(-1, -1);
      break;
    case "sortdone":
      rawspdx = request.result;
      var msEnd = new Date().getTime();
      processTime = msEnd - msStart;
      console.log("processTime: " + processTime / 1000 + "s");
      updateBubbleText("Sorting done");
      processLicenses(
        utils.getBestMatchCount(options, rawspdx),
        processTime
      );
      break;
    case "diffnext":
      updateProgressBar(-1, -1);
      var threadid = request.id;
      var result = request.result;
      var spdxid = request.spdxid;
      diffs[spdxid] = result;
      diffsdone++;
      if ($("#licenses option[value='" + spdxid + "']")) {
        $("#licenses option[value='" + spdxid + "']").removeAttr("disabled");
      }
      console.log(
        "%s: Received diff for %s %s/%s",
        threadid,
        spdxid,
        diffsdone,
        diffsdue
      );
      var bestspdxid = spdx[0].spdxid;
      if (diffsdone >= diffsdue) {
        console.log("All diffs complete; showing %s", bestspdxid);
        if (!diffdisplayed)
          displayDiff(diffs[bestspdxid].html, diffs[bestspdxid].time);
        updateBubbleText("Diffing done");
        document.getElementById("newTabButton").style.visibility = "visible";
      } else if (bestspdxid === spdxid) {
        console.log("Best diff %s received; we can display", bestspdxid);
        if (!diffdisplayed)
          displayDiff(diffs[bestspdxid].html, diffs[bestspdxid].time);
        updateBubbleText("Displaying diff");
      }
      break;
    case "newTab":
      diffs = request.diffs;
      spdx = request.spdx;
      selectedLicense =
        typeof selectedLicense !== "undefined"
          ? request.selectedLicense
          : spdx[0].spdxid;
      console.log("Received newTab request", request);
      updateProgressBar(1, 1, false);
      addSelectFormFromArray(
        "licenses",
        spdx,
        utils.getBestMatchCount(options, spdx),
        options.minpercentage
      );
      displayDiff(diffs[selectedLicense].html, diffs[selectedLicense].time);
      break;
    case "alive?":
      console.log("Received ping request");
      sendResponse({ status: "1" });
      break;
    case "show_permission_error":
      console.log("Showing permission error to user");
      showPermissionErrorDialog(request.message || "Permission denied: Cannot access SPDX.org. Please grant permission in extension settings or browser toolbar.");
      updateProgressBar(1, 1, false);
      break;
    case "permissions_granted":
      console.log("CONTENT SCRIPT: Permissions granted notification received");
      // Reset the permission dialog flag so user can try again
      permissionDialogShown = false;
      
      // If we have a pending selection, process it now
      if (pendingSelection) {
        console.log("CONTENT SCRIPT: Processing pending selection after permission grant");
        checkPermissionsAndProceed(pendingSelection);
        pendingSelection = null;
      }
      break;
    default:
      return true;
  }
});

// This function responds to changes to storage
api.storage.onChanged.addListener(function (changes, area) {
  if (area === "local" && "options" in changes) {
    console.log("Detected changed options; reloading");
    restoreOptions();
  }
});

// processing phase functions (these are called by the workeronmessage in order)
// Check permissions first, then proceed with license comparison if permissions are OK
async function checkPermissionsAndProceed(selection) {
  console.log("CONTENT SCRIPT: Checking permissions before proceeding");
  
  try {
    // Ask background script to check permissions since Firefox doesn't expose permissions API to content scripts
    const permissionResponse = await api.runtime.sendMessage({
      command: "checkPermissions",
      origins: ["*://*.spdx.org/*"]
    });
    
    console.log("CONTENT SCRIPT: Permission check response:", permissionResponse);
    
    if (!permissionResponse.hasPermission) {
      console.log("CONTENT SCRIPT: No SPDX.org permissions - requesting permission");
      
      // Ask background script to request permissions
      const requestResponse = await api.runtime.sendMessage({
        command: "requestPermissions",
        origins: ["*://*.spdx.org/*"]
      });
      
      console.log("CONTENT SCRIPT: Permission request response:", requestResponse);
      
      if (!requestResponse.granted) {
        console.log("CONTENT SCRIPT: Permissions denied - storing selection for later and showing error dialog");
        // Store the selection so we can process it later if permissions are granted
        pendingSelection = selection;
        showPermissionErrorDialog("SPDX License Diff needs permission to access spdx.org to download license data. Please grant permission to continue.");
        return;
      }
    }
    
    // If we have permissions, proceed with the normal license comparison flow
    console.log("CONTENT SCRIPT: Permissions OK - creating bubble and proceeding with license comparison");
    
    // Create and render bubble
    console.log("CONTENT SCRIPT: Creating and rendering bubble");
    createBubble();
    var selectCoords = selectRangeCoords();
    var posX = selectCoords[0];
    var posY = selectCoords[1];
    console.log("CONTENT SCRIPT: Bubble position:", posX, posY);
    renderBubble(posX, posY, selection);
    
    // Check if we already have results for this selection
    if (spdx && selection === lastselection) {
      // diff previously done on selection
      updateProgressBar(1, 1, false);
      updateBubbleText("Done");
      processLicenses(
        utils.getBestMatchCount(options, spdx),
        processTime
      );
      return;
    } else {
      // Clear all previous data including template matches
      rawspdx = null;
      spdx = null;
      diffdisplayed = false;
      selectedLicense = "";
      diffsdue = 0;
      diffsdone = 0;
      diffs = {};
    }
    
    msStart = new Date().getTime();
    compareSelection(selection);
    
    // Set lastselection only after we've successfully started the comparison process
    lastselection = selection;
    
  } catch (error) {
    console.error("CONTENT SCRIPT: Error checking permissions:", error);
    showPermissionErrorDialog("Unable to check permissions. Please try again or check your browser settings.");
  }
}

// Compare selection against a fully populated license list (must be loaded in list)
// This is the second phase after permissions are confirmed
// This determines edit distance and returns a sorted list for display in spdx
function compareSelection(selection) {
  console.log("CONTENT SCRIPT: Sending compareselection message to background script");
  api.runtime.sendMessage({
    command: "compareselection",
    selection: selection,
  }).then((response) => {
    console.log("CONTENT SCRIPT: Background script responded to compareselection:", response);
  }).catch((error) => {
    console.error("CONTENT SCRIPT: Failed to send compareselection message:", error);
  });
}

// This will begin displaying diffs based off sorted list spdx
function processLicenses(showBest, processTime = 0) {
  var license;
  spdx = filterSPDX(rawspdx);
  console.log(
    "Processing diffs for %s items exceeding %s% match",
    showBest,
    Number(options.minpercentage)
  );
  if (
    spdx &&
    (spdx.length === 0 ||
      Number(spdx[0].percentage) <= Number(options.minpercentage))
  ) {
    console.log("No results to display");
    displayDiff(null, processTime);
    updateProgressBar(spdx.length, spdx.length);
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage);
  } else if (spdx && diffdisplayed) {
    updateProgressBar(1, 1, false);
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage);
    license = spdx[0].spdxid;
    if (diffs[license] !== undefined) {
      displayDiff(diffs[license].html, diffs[license].time);
    }
  } else {
    diffsdue = 0;
    for (var i = 0; i < showBest; i++) {
      license = spdx[i].spdxid;
      var data = spdx[i].difftext;
      var distance = spdx[i].distance;
      var percentage = spdx[i].percentage;
      if (i === 0) {
        selectedLicense = license;
        console.log(
          "Best match of " +
            showBest +
            " : " +
            license +
            ": " +
            distance +
            " (" +
            percentage +
            "%)"
        );
      } else if (Number(percentage) < Number(options.minpercentage)) {
        break;
      } else {
        console.log(license + ": " + distance + " (" + percentage + "%)");
      }
      if (diffs[license] === undefined) {
        diffsdue++;
        api.runtime.sendMessage({
          command: "generateDiff",
          selection: selection,
          spdxid: license,
          license: data,
          record: i,
          templateMatch: spdx[i].templateMatch, // Pass template match data for highlighting
        });
        console.log("Generating diff for " + license + " total " + diffsdue);
      } else {
        console.log("Diff found for " + license);
      }
    }
    if (diffsdue > diffsdone) {
      updateProgressBar(diffsdue, 0);
      updateBubbleText("Diffing");
    }
    addSelectFormFromArray("licenses", spdx, showBest, options.minpercentage);
    license = spdx[0].spdxid;
    if (diffs[license] !== undefined) {
      displayDiff(diffs[license].html, diffs[license].time);
    }
  }
  if (diffsdue <= diffsdone) {
    updateProgressBar(1, 1, false);
    updateBubbleText("Done");
  }
}

// This will filter the spdx
function filterSPDX(rawspdx) {
  var spdx = [];
  var filtered = 0;
  if (selectedfilters === undefined) {
    selectedfilters = options.filters;
  }
  var showBest =
    options.showBest === 0 && rawspdx ? rawspdx.length : options.showBest;
  for (var i = 0; i < showBest + filtered; i++) {
    var license = rawspdx[i].spdxid;
    var details = rawspdx[i].details;
    var skiplicense = false;
    for (var filter of Object.keys(selectedfilters)) {
      if (details && details[selectedfilters[filter]]) {
        skiplicense = true;
        filtered++;
        console.log(
          "Filtering %s because its %s: %s total",
          license,
          filter,
          filtered
        );
        break;
      }
    }
    if (skiplicense) {
      continue;
    }
    spdx.push(rawspdx[i]);
  }
  return spdx;
}

// This is the actual diff display function, requires a populated spdx
function displayDiff(html, time = processTime) {
  diffdisplayed = true;
  if (!html) {
    updateBubbleText(
      "Time: " + time / 1000 + " s<br /><hr />No results to display",
      "#result_text"
    );
    return;
  }
  var spdxid = spdx[0].spdxid;
  var details = spdx[0].details;
  if (selectedLicense) {
    for (var index in spdx) {
      if (spdx[index].spdxid === selectedLicense) {
        spdxid = selectedLicense;
        details = spdx[index].details;
        break;
      }
    }
  }
  updateBubbleText(prepDiff(spdxid, time, html, details), "#result_text");
  var licenseElement = document.getElementById("licenses");
  licenseElement.addEventListener(
    "change",
    function () {
      if (this.value !== selectedLicense) {
        selectedLicense = this.value;
        spdxid = spdx[this.options.selectedIndex].spdxid;
        html = diffs[spdxid].html;
        time = diffs[spdxid].time;
        details = spdx[this.options.selectedIndex].details;
        updateBubbleText(prepDiff(spdxid, time, html, details), "#result_text");
        createNewTabButton(
          document.getElementById("license_form"),
          selectedLicense
        );
      } else {
      }
    },
    false
  );
  licenseElement.value = selectedLicense;
  licenseElement.dispatchEvent(new Event("change"));
}

// This formats template variables as an HTML table
function formatTemplateTable(templateMatch) {
  if (!templateMatch || !templateMatch.variables || templateMatch.variables.length === 0) {
    return "";
  }
  
  var tableHtml = '<div class="template-info"><h4>Template Variables:</h4><table class="template-table">';
  tableHtml += '<thead><tr><th>Variable</th><th>Captured Text</th><th>Regex Pattern</th></tr></thead><tbody>';
  
  for (var i = 0; i < templateMatch.variables.length; i++) {
    var variable = templateMatch.variables[i];
    var name = variable.name || "Variable " + (i + 1);
    var pattern = variable.match || "";
    var capturedText = variable.capturedText || ""; // Only use capturedText, don't fall back to original/description
    
    // Add data attributes for interactive highlighting
    tableHtml += '<tr class="template-variable-row" data-variable-name="' + _.escape(name) + '" data-variable-index="' + i + '">';
    tableHtml += '<td><code>' + _.escape(name) + '</code></td>';
    tableHtml += '<td class="captured-text-cell">' + _.escape(capturedText) + '</td>';
    tableHtml += '<td><code>' + _.escape(pattern) + '</code></td>';
    tableHtml += '</tr>';
  }
  
  tableHtml += '</tbody></table></div><hr />';
  return tableHtml;
}

// Setup interactive highlighting between template variables table and diff content
function setupInteractiveHighlighting() {
  console.log("=== Setting up interactive highlighting ===");
  
  // Get all template variable rows and diff variable highlights
  const variableRows = document.querySelectorAll('.template-variable-row');
  const diffHighlights = document.querySelectorAll('.diff-variable-highlight');
  
  console.log(`Found elements: ${variableRows.length} template rows, ${diffHighlights.length} diff highlights`);
  
  // Early return if no elements found
  if (variableRows.length === 0) {
    console.warn("No template variable rows found - highlighting setup skipped");
    return;
  }
  
  if (diffHighlights.length === 0) {
    console.warn("No diff variable highlights found - highlighting setup skipped");
    return;
  }
  
  // Log the first few elements for debugging
  console.log("First template row:", variableRows[0]);
  console.log("First template row classes:", variableRows[0].className);
  console.log("First template row data-variable-index:", variableRows[0].getAttribute('data-variable-index'));
  
  console.log("First diff highlight:", diffHighlights[0]);
  console.log("First diff highlight classes:", diffHighlights[0].className);
  console.log("First diff highlight data-variable-index:", diffHighlights[0].getAttribute('data-variable-index'));
  
  // Add event listeners for template table rows
  variableRows.forEach((row, index) => {
    const variableIndex = row.getAttribute('data-variable-index');
    console.log(`Setting up row ${index} with variable index: ${variableIndex}`);
    
    row.addEventListener('mouseenter', () => {
      console.log("=== HOVER ENTER on template row for variable", variableIndex, "===");
      // Highlight corresponding diff spans
      const matchingSpans = document.querySelectorAll(`.diff-variable-highlight[data-variable-index="${variableIndex}"]`);
      console.log(`Found ${matchingSpans.length} matching spans for variable ${variableIndex}`);
      matchingSpans.forEach(span => {
        console.log("Adding highlighted class to span:", span);
        span.classList.add('highlighted');
      });
      row.classList.add('highlighted');
      console.log("Added highlighted class to row");
    });
    
    row.addEventListener('mouseleave', () => {
      console.log("=== HOVER LEAVE on template row for variable", variableIndex, "===");
      // Remove highlights
      const matchingSpans = document.querySelectorAll(`.diff-variable-highlight[data-variable-index="${variableIndex}"]`);
      matchingSpans.forEach(span => span.classList.remove('highlighted'));
      row.classList.remove('highlighted');
    });
  });
  
  // Add event listeners for diff variable highlights
  diffHighlights.forEach((span, index) => {
    const variableIndex = span.getAttribute('data-variable-index');
    console.log(`Setting up diff highlight ${index} with variable index: ${variableIndex}`);
    
    span.addEventListener('mouseenter', () => {
      console.log("=== HOVER ENTER on diff highlight for variable", variableIndex, "===");
      // Highlight corresponding table row
      const matchingRow = document.querySelector(`.template-variable-row[data-variable-index="${variableIndex}"]`);
      if (matchingRow) {
        console.log("Found matching row:", matchingRow);
        matchingRow.classList.add('highlighted');
      } else {
        console.log("No matching row found for variable", variableIndex);
      }
      // Highlight all matching diff spans
      const matchingSpans = document.querySelectorAll(`.diff-variable-highlight[data-variable-index="${variableIndex}"]`);
      console.log(`Found ${matchingSpans.length} matching spans for variable ${variableIndex}`);
      matchingSpans.forEach(s => s.classList.add('highlighted'));
    });
    
    span.addEventListener('mouseleave', () => {
      console.log("=== HOVER LEAVE on diff highlight for variable", variableIndex, "===");
      // Remove highlights
      const matchingRow = document.querySelector(`.template-variable-row[data-variable-index="${variableIndex}"]`);
      if (matchingRow) {
        matchingRow.classList.remove('highlighted');
      }
      const matchingSpans = document.querySelectorAll(`.diff-variable-highlight[data-variable-index="${variableIndex}"]`);
      matchingSpans.forEach(s => s.classList.remove('highlighted'));
    });
  });
  
  console.log(`Interactive highlighting setup complete: ${variableRows.length} rows, ${diffHighlights.length} highlights`);
}

// This wraps the diff display
function prepDiff(spdxid, time, html, details) {
  var hoverInfo = "tags: ";
  for (var filter in filters) {
    if (details[filters[filter]]) {
      hoverInfo += filter + " ";
    }
  }
  if (details.licenseComments) {
    hoverInfo += "&#10;comments: " + _.escape(details.licenseComments);
  }
  var title = `<a href="https://spdx.org/licenses/${spdxid}.html" target="_blank" title="${hoverInfo}">${details.name} (${spdxid})</a>`;
  var timehtml =
    " processed in " + (time + processTime) / 1000 + "s<br /><hr />";
  
  // Find templateMatch data for this license - only show for actual template matches
  var templateTable = "";
  if (spdx) {
    for (var i = 0; i < spdx.length; i++) {
      if (spdx[i].spdxid === spdxid && 
          spdx[i].templateMatch && 
          spdx[i].percentage === 100 && 
          spdx[i].distance === 0) {
        templateTable = formatTemplateTable(spdx[i].templateMatch);
        break;
      }
    }
  }
  
  return title + timehtml + templateTable + html;
}

// This shows available filters as checkboxes
function showFilters(form) {
  if (document.getElementById("filters") || utils.isPopupPage()) {
    return;
  }
  
  var div = form.appendChild(utils.createElement("div", { id: "filters" }));
  var label = form.appendChild(utils.createElement("label"));
  label.appendChild(document.createTextNode("Exclude: "));
  
  for (var filter in filters) {
    var checkbox = form.appendChild(utils.createElement("input", {
      type: "checkbox",
      id: filter,
      value: filters[filter]
    }));
    
    checkbox.checked = options.filters[filter];
    
    label = checkbox.appendChild(utils.createElement("label", { htmlFor: filter }));
    form.appendChild(
      document.createTextNode(filter.charAt(0).toUpperCase() + filter.slice(1))
    );
    
    checkbox.addEventListener("change", function () {
      console.log("%s changed to %s", this, this.checked);
      if (this.checked) {
        selectedfilters[this.id] = this.value;
      } else {
        delete selectedfilters[this.id];
      }
      diffdisplayed = false;
      processLicenses(
        utils.getBestMatchCount(options, spdx),
        processTime
      );
    }, false);
  }
  form.appendChild(document.createElement("br"));
}

// This function will create a select form with the sorted licenses in arr
function addSelectFormFromArray(id, arr, number = arr.length, minimum = 0) {
  var form = document.getElementById(id);
  if (form) {
    form.outerHTML = "";
  }
  if (!$("#license_form").length) {
    var bubbleDOM = $("#license_bubble")[0];
    var bubbleDOMText = $("#result_text")[0];
    form = bubbleDOM.insertBefore(
      document.createElement("form"),
      bubbleDOMText
    );
    form.setAttribute("id", "license_form");
  }
  form = document.getElementById("license_form");
  showFilters(form);
  var select = form.appendChild(document.createElement("select"));
  select.id = id;
  for (var i = 0; i < arr.length && i < number; i++) {
    var value = arr[i].spdxid;
    var percentage = arr[i].percentage;
    var dice = arr[i].dice;
    var text =
      value +
      " : " +
      percentage +
      "% match (" +
      arr[i].distance +
      " differences / dice-coefficient " +
      dice +
      ")";
    if (percentage === 100) {
      text =
        value +
        " : " +
        percentage +
        "% template match (" +
        arr[i].distance +
        " differences / dice-coefficient " +
        dice +
        ")";
    }

    if (Number(percentage) < Number(minimum)) {
      // No match at all
      break;
    }
    var option = select.appendChild(document.createElement("option"));
    option.value = value;
    option.text = text;
    if (diffs[value] === undefined) {
      option.setAttribute("disabled", "disabled");
    }
  }
  createNewLicenseButton(form);
  createNewTabButton(form, selectedLicense);
  createThemeToggleButton(form);
}

// Display helper functions for modifying the DOM

// Add bubble to the top of the page.
function createBubble() {
  // Remove any existing bubble before creating a new one
  var existingBubble = $("#license_bubble")[0];
  if (existingBubble) {
    console.log("CONTENT SCRIPT: Removing existing bubble before creating new one");
    existingBubble.remove();
  }
  
  console.log("CONTENT SCRIPT: Creating new bubble");
  var bubbleDOM = document.createElement("div");
  bubbleDOM.setAttribute("class", "selection_bubble");
  bubbleDOM.setAttribute("id", "license_bubble");
  document.body.appendChild(bubbleDOM);
  var progressbar = document.createElement("progress");
  progressbar.setAttribute("id", "progress_bubble");
  progressbar.setAttribute("max", 100);
  progressbar.value = 0;
  bubbleDOM.appendChild(progressbar);
  var bubbleDOMText = document.createElement("div");
  bubbleDOMText.setAttribute("id", "bubble_text");
  bubbleDOM.appendChild(bubbleDOMText);
  var resultText = document.createElement("div");
  resultText.setAttribute("id", "result_text");
  bubbleDOM.appendChild(resultText);
  console.log("CONTENT SCRIPT: Bubble created successfully");
}
// Close the bubble when we click on the screen.
document.addEventListener(
  "mousedown",
  function (e) {
    if (
      e.target.id === "license_bubble" ||
      $(e.target).parents("#license_bubble").length ||
      $(window).outerWidth() <= e.clientX ||
      document.documentElement.offsetWidth <= e.clientX
    ) {
    } else {
      var bubbleDOM = $("#license_bubble")[0];
      if (bubbleDOM) {
        bubbleDOM.remove();
        createBubble();
      }
    }
  },
  false
);

// Add new license button.
function createNewLicenseButton(form) {
  if ($("#newLicenseButton").length || utils.isPopupPage()) return;
  
  const button = utils.createButton(
    "newLicenseButton",
    "Submit new license",
    "Submit this text as a new license to SPDX.org",
    () => {
      api.runtime.sendMessage({
        command: "submitNewLicense",
        selection: selection,
        url: location.href,
      });
    }
  );
  
  form.appendChild(button);
  form.appendChild(document.createElement("br"));
}

// Add new tab button.
function createNewTabButton(form, selectedLicense) {
  if (utils.isPopupPage()) return;
  if ($("#newTabButton").length) {
    document
      .getElementById("newTabButton")
      .removeEventListener("click", newTab);
    document.getElementById("newTabButton").addEventListener("click", newTab);
    return;
  }
  
  const button = utils.createElement("button", {
    type: "button",
    id: "newTabButton",
    title: "Open diff results in a new tab (fullscreen view)"
  });
  
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M4.5 11H3v4h4v-1.5H4.5V11zM3 7h1.5V4.5H7V3H3v4zm10.5 6.5H11V15h4v-4h-1.5v2.5zM11 3v1.5h2.5V7H15V3h-4z"/></svg>';
  button.style.visibility = "hidden";
  button.addEventListener("click", newTab);
  
  form.appendChild(button);
  form.appendChild(document.createElement("br"));
}

// Add theme toggle dropdown.
function createThemeToggleButton(form) {
  if (utils.isPopupPage() || $("#themeToggleSelect").length) {
    return; // Dropdown already exists or not needed
  }
  
  const select = utils.createElement("select", {
    id: "themeToggleSelect",
    title: "Select theme for diff display"
  });
  
  // Apply consistent styling
  Object.assign(select.style, {
    position: "absolute",
    top: "0",
    right: "32px", // Position to the left of the full screen button
    background: "white",
    border: "1px solid #ccc",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    height: "24px",
    zIndex: "1000"
  });
  
  // Create theme options
  const lightOption = utils.createElement("option", { value: "light" }, "Light");
  const darkOption = utils.createElement("option", { value: "dark" }, "Dark");
  
  select.appendChild(lightOption);
  select.appendChild(darkOption);
  form.appendChild(select);
  
  // Check current theme state and set the selected option
  const bubbleDOM = document.getElementById("license_bubble");
  const isDarkMode = bubbleDOM && bubbleDOM.classList.contains('spdx-dark-mode');
  select.value = isDarkMode ? "dark" : "light";
  
  select.addEventListener("change", function() {
    const shouldBeDark = this.value === "dark";
    const currentlyDark = bubbleDOM && bubbleDOM.classList.contains('spdx-dark-mode');
    
    if (shouldBeDark !== currentlyDark) {
      toggleDiffTheme();
    }
  });
}

// Toggle between light and dark mode for diff display
function toggleDiffTheme() {
  const bubbleDOM = document.getElementById("license_bubble");
  const select = document.getElementById("themeToggleSelect");
  
  if (!bubbleDOM) return;
  
  const isDarkMode = bubbleDOM.classList.contains('spdx-dark-mode');
  
  if (isDarkMode) {
    // Switch to light mode
    bubbleDOM.classList.remove('spdx-dark-mode');
    if (select) select.value = "light";
  } else {
    // Switch to dark mode
    bubbleDOM.classList.add('spdx-dark-mode');
    if (select) select.value = "dark";
  }
  
  // Reapply custom colors to ensure they work with the new theme
  applyCustomDiffColors();
  
  console.log('Theme toggled to:', isDarkMode ? 'light' : 'dark');
}

function newTab() {
  var license = selectedLicense;
  api.runtime.sendMessage({
    command: "newTab",
    diffs: diffs,
    selectedLicense: license,
    spdx: spdx,
  });
}

// Move that bubble to the appropriate location.
function renderBubble(mouseX, mouseY, selection) {
  updateProgressBar(-1, 1, true);
  // var progressbar = $('#progress_bubble')[0]
  updateBubbleText("Processing...");
  var bubbleDOM = $("#license_bubble")[0];
  bubbleDOM.style.top = mouseY + "px";
  bubbleDOM.style.left = mouseX + "px";
  bubbleDOM.style.visibility = "visible";
  $("html,body").animate(
    {
      scrollTop: $("#progress_bubble").offset().top,
    },
    "fast"
  );
}

function updateBubbleText(text, target = "#bubble_text") {
  var bubbleDOMText = $(target)[0];
  // Directly set innerHTML to preserve HTML structure and CSS classes
  // The XML serialization was breaking diff CSS classes
  bubbleDOMText.innerHTML = text;
  
  // Setup interactive highlighting if this update contains template content
  if (text.includes('template-variable-row')) {
    console.log("Setting up interactive highlighting after updating", target);
    console.log("Text includes template-variable-row:", text.includes('template-variable-row'));
    console.log("Target:", target);
    
    // Use a more reliable approach to wait for DOM elements to be available
    function waitForElementsAndSetup(attempts = 0) {
      const maxAttempts = 20; // Max 2 seconds (20 * 100ms)
      const variableRows = document.querySelectorAll('.template-variable-row');
      const diffHighlights = document.querySelectorAll('.diff-variable-highlight');
      
      console.log(`Attempt ${attempts + 1}: Found ${variableRows.length} template rows and ${diffHighlights.length} diff highlights`);
      
      if (variableRows.length > 0 && diffHighlights.length > 0) {
        console.log("Both elements found, setting up highlighting");
        setupInteractiveHighlighting();
      } else if (attempts < maxAttempts) {
        console.log(`Elements not ready, retrying in 100ms (attempt ${attempts + 1}/${maxAttempts})`);
        setTimeout(() => waitForElementsAndSetup(attempts + 1), 100);
      } else {
        console.warn("Failed to find required elements for highlighting after maximum attempts");
        // Try setup anyway in case some elements are available
        setupInteractiveHighlighting();
      }
    }
    
    // Start checking immediately, then with retries
    waitForElementsAndSetup();
  }
}

// max will increase if > 0; value will be set if not null and >=0
// else incremented by absolute value for negative numbers
function updateProgressBar(max, value, visible = true) {
  var progressbar = $("#progress_bubble")[0];
  if (progressbar) {
    progressbar.style.visibility = visible ? "visible" : "hidden";
    if (max > 0) {
      progressbar.setAttribute("max", max);
    }
    if (value !== null) {
      if (value >= 0) {
        progressbar.value = value;
      } else if (progressbar.value < progressbar.getAttribute("max")) {
        progressbar.value = progressbar.value + Math.abs(value);
      }
    }
  }
}

function restoreOptions() {
  api.storage.local.get(["options"], function (result) {
    options = result.options;
    if (options === undefined) {
      options = defaultoptions;
    }
  });
}

// Listen for storage changes to update colors dynamically
api.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local' && changes.customDiffCSS) {
    applyCustomDiffColors();
  }
});

// Initialize the content script
restoreOptions();
applyCustomDiffColors();

console.log("Spdx-license-diff " + version + " ContentScript injected");
