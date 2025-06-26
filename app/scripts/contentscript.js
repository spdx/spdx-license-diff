// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
/* eslint-disable no-empty, no-unused-vars */
/* global MutationObserver, Node */

import { selectRangeCoords, getSelectionText } from "./selection-utils.js";
import { filters, defaultoptions, readmePermissionsUrls } from "./const.js";
import { utils, initializeInteractionTracking, getSelectionTextWithIframes, selectRangeCoordsWithIframes, lastInteractionContext } from "./utils.js";
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
var permissionsConfirmed = false; // Track if permissions have been confirmed for this session
var pendingHighlightingSetup = false; // Flag to prevent duplicate highlighting setup attempts

// Function to apply custom diff colors from storage
function applyCustomDiffColors() {
  // Remove any existing custom style elements first
  const existingDefault = document.getElementById('spdx-custom-diff-colors');
  const existingCustom = document.getElementById('spdx-custom-override-colors');
  if (existingDefault) existingDefault.remove();
  if (existingCustom) existingCustom.remove();
  
  // Check for custom colors and apply them as overrides to the default CSS
  api.storage.local.get(['customDiffCSS'], function(result) {
    if (result.customDiffCSS) {
      // Only apply custom CSS if it exists - defaults are now in contentscript.css
      const styleElement = document.createElement('style');
      styleElement.id = 'spdx-custom-override-colors';
      styleElement.textContent = result.customDiffCSS;
      document.head.appendChild(styleElement);
      
      console.log('Applied custom color overrides');
    } else {
      console.log('No custom colors found - using defaults from CSS file');
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

// Initialize interaction tracking for context-aware selection
initializeInteractionTracking();

// Event driven functions

// This function responds to the UI and background.js
api.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("CONTENT SCRIPT: Received message:", request.command);
  switch (request.command) {
    case "clicked_browser_action":
      console.log("CONTENT SCRIPT: Processing clicked_browser_action");
      sendResponse({ status: "1" }); // send receipt confirmation
      selection = getSelectionTextWithIframes();
      console.log("CONTENT SCRIPT: Selection text:", selection ? `"${selection.substring(0, 50)}..."` : "NONE");
      if (selection.length > 0) {
        // Check permissions first before proceeding with bubble creation and license comparison
        checkPermissionsAndProceed(selection);
      } else {
        console.log("CONTENT SCRIPT: No selection found, showing message");
        createBubble();
        // Even without selection, try to position the bubble near the cursor or at a sensible location
        var selectCoords = selectRangeCoordsWithIframes();
        var posX = selectCoords[0];
        var posY = selectCoords[1];
        console.log("CONTENT SCRIPT: Bubble position (no selection):", posX, posY);
        renderBubble(posX, posY, "");
        
        // Check if user was interacting with a frame that might have restricted access
        if (lastInteractionContext.type === 'iframe' || lastInteractionContext.type === 'frame') {
          updateBubbleText("No text selection found. If you selected text in a frame, iframe, or embedded content, it may not be accessible due to browser security restrictions. Please try selecting text in the main page area.");
        } else {
          updateBubbleText("No text selection found. Please select some text to compare against SPDX licenses.");
        }
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
        
        // Make fullscreen button visible with error handling
        const newTabButton = document.getElementById("newTabButton");
        if (newTabButton) {
          newTabButton.style.visibility = "visible";
          console.log("Fullscreen button made visible");
        } else {
          console.warn("Fullscreen button not found when trying to make visible");
          // Try to create it if it doesn't exist
          const form = document.getElementById("license_form");
          if (form) {
            createNewTabButton(form, selectedLicense);
            const retryButton = document.getElementById("newTabButton");
            if (retryButton) {
              retryButton.style.visibility = "visible";
              console.log("Fullscreen button created and made visible");
            }
          }
        }
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
      
      // Ensure we have a bubble for popup pages
      if (utils.isPopupPage() && !document.getElementById("license_bubble")) {
        createBubble();
        // Make the bubble always visible in popup pages
        const bubble = document.getElementById("license_bubble");
        if (bubble) {
          bubble.style.visibility = "visible";
          bubble.style.position = "static";
          bubble.style.top = "auto";
          bubble.style.left = "auto";
          bubble.style.margin = "10px";
          bubble.style.maxWidth = "none";
          bubble.style.width = "auto";
          
          // Apply dark mode if it was active in the original window
          if (request.isDarkMode) {
            bubble.classList.add('spdx-dark-mode');
            // Also add dark mode class to body for popup-specific styling
            document.body.classList.add('spdx-dark-mode');
          }
          
          // Set document body to indicate popup mode for CSS
          document.body.setAttribute('data-is-popup', 'true');
        }
      }
      
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
      
      // Mark permissions as confirmed
      permissionsConfirmed = true;
      console.log("CONTENT SCRIPT: Permissions confirmed via delayed grant - highlighting can now proceed");
      
      // If we have a pending selection, process it now
      if (pendingSelection) {
        console.log("CONTENT SCRIPT: Processing pending selection after permission grant");
        checkPermissionsAndProceed(pendingSelection);
        pendingSelection = null;
      }
      
      // Retry highlighting setup if there's template content already loaded
      retryHighlightingSetupIfNeeded();
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
    } else {
      console.log("CONTENT SCRIPT: Permissions already granted");
    }
    
    // If we have permissions, proceed with the normal license comparison flow
    console.log("CONTENT SCRIPT: Permissions OK - creating bubble and proceeding with license comparison");
    
    // Mark permissions as confirmed
    permissionsConfirmed = true;
    console.log("CONTENT SCRIPT: Permissions confirmed - highlighting setup can now proceed");
    
    // Create and render bubble
    console.log("CONTENT SCRIPT: Creating and rendering bubble");
    createBubble();
    var selectCoords = selectRangeCoordsWithIframes();
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
  
  const preparedDiff = prepDiff(spdxid, time, html, details);
  
  // Use callback approach to setup highlighting immediately after DOM injection
  updateBubbleText(preparedDiff, "#result_text", () => {
    // This callback runs after DOM is updated
    console.log("=== DISPLAYDIFF CALLBACK: DOM updated, checking for highlighting setup ===");
    if (preparedDiff.includes('template-variable-row') && preparedDiff.includes('diff-variable-highlight')) {
      console.log("Content has both template and diff elements - setting up highlighting");
      if (permissionsConfirmed) {
        // Setup highlighting immediately since we know the DOM is ready
        const success = setupInteractiveHighlightingDirect();
        console.log("Highlighting setup result:", success);
      } else {
        pendingHighlightingSetup = true;
        console.log("Permissions not confirmed - flagging for later setup");
      }
    }
  });
  
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
        
        const newPreparedDiff = prepDiff(spdxid, time, html, details);
        updateBubbleText(newPreparedDiff, "#result_text", () => {
          // Setup highlighting for new selection too
          if (newPreparedDiff.includes('template-variable-row') && newPreparedDiff.includes('diff-variable-highlight')) {
            if (permissionsConfirmed) {
              setupInteractiveHighlightingDirect();
            }
          }
        });
        
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

// Direct interactive highlighting setup without race condition detection
function setupInteractiveHighlightingDirect() {
  console.log("=== Setting up interactive highlighting (DIRECT) ===");
  
  // Get all template variable rows and diff variable highlights
  const variableRows = document.querySelectorAll('.template-variable-row');
  const diffHighlights = document.querySelectorAll('.diff-variable-highlight');
  
  console.log(`Found elements: ${variableRows.length} template rows, ${diffHighlights.length} diff highlights`);
  
  // Early return if no elements found
  if (variableRows.length === 0) {
    console.warn("No template variable rows found - highlighting setup skipped");
    return false;
  }
  
  if (diffHighlights.length === 0) {
    console.warn("No diff variable highlights found - highlighting setup skipped");
    return false;
  }
  
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
  return true;
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

// Helper function to setup highlighting with robust DOM completion waiting
function setupHighlightingWithRetry() {
  console.log("Starting highlighting setup with robust DOM completion detection");
  
  // Clear any pending setup to avoid duplicates
  if (pendingHighlightingSetup === 'active') {
    console.log("Highlighting setup already in progress, skipping duplicate");
    return;
  }
  pendingHighlightingSetup = 'active';
  
  let observer;
  let timeoutId;
  const maxWaitTime = 5000; // Maximum 5 seconds wait
  
  function checkAndSetupHighlighting() {
    const variableRows = document.querySelectorAll('.template-variable-row');
    const diffHighlights = document.querySelectorAll('.diff-variable-highlight');
    
    console.log(`DOM check: Found ${variableRows.length} template rows and ${diffHighlights.length} diff highlights`);
    
    if (variableRows.length > 0 && diffHighlights.length > 0) {
      console.log("All required elements found - setting up highlighting");
      
      // Clean up observer and timeout
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      setupInteractiveHighlighting();
      pendingHighlightingSetup = false;
      return true;
    } else if (variableRows.length > 0 && diffHighlights.length === 0) {
      console.log("Found template rows but no diff highlights - will continue waiting");
    } else if (variableRows.length === 0 && diffHighlights.length > 0) {
      console.log("Found diff highlights but no template rows - will continue waiting");
    } else {
      console.log("No relevant elements found yet - will continue waiting");
    }
    return false;
  }
  
  function setupMutationObserver() {
    // Use MutationObserver to watch for DOM changes
    console.log("Setting up MutationObserver to watch for DOM completion");
    observer = new MutationObserver((mutations) => {
      // Check if any mutations added template or diff elements
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList && 
                  (node.classList.contains('template-variable-row') || 
                   node.classList.contains('diff-variable-highlight') ||
                   node.querySelector && 
                   (node.querySelector('.template-variable-row') || 
                    node.querySelector('.diff-variable-highlight')))) {
                shouldCheck = true;
                break;
              }
            }
          }
          if (shouldCheck) break;
        }
      }
      
      if (shouldCheck) {
        console.log("Relevant DOM changes detected, checking for highlighting setup");
        checkAndSetupHighlighting();
      }
    });
    
    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    // Fallback timeout to prevent infinite waiting
    timeoutId = setTimeout(() => {
      console.warn("Highlighting setup timed out after maximum wait time - attempting setup anyway");
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      
      // Try one final setup attempt
      setupInteractiveHighlighting();
      pendingHighlightingSetup = false;
    }, maxWaitTime);
    
    console.log(`MutationObserver and timeout fallback (${maxWaitTime}ms) set up for DOM completion detection`);
  }
  
  // Try immediate setup first
  if (checkAndSetupHighlighting()) {
    return;
  }
  
  // Try again after a short delay to handle immediate DOM updates
  setTimeout(() => {
    console.log("Immediate check failed, trying after 100ms delay");
    if (checkAndSetupHighlighting()) {
      return;
    }
    
    // Try once more after a longer delay for slower renders
    setTimeout(() => {
      console.log("Second check failed, trying after 300ms delay");
      if (checkAndSetupHighlighting()) {
        return;
      }
      
      // Now set up the MutationObserver for ongoing monitoring
      console.log("Manual retries failed, setting up MutationObserver for ongoing monitoring");
      setupMutationObserver();
    }, 300);
  }, 100);
}

// Function to retry highlighting setup if needed (called when permissions are granted)
function retryHighlightingSetupIfNeeded() {
  console.log("Checking if highlighting setup retry is needed");
  console.log("Pending highlighting setup:", pendingHighlightingSetup);
  console.log("Permissions confirmed:", permissionsConfirmed);
  
  if ((pendingHighlightingSetup === true || pendingHighlightingSetup === 'active') && permissionsConfirmed) {
    console.log("Retrying highlighting setup after permission confirmation");
    pendingHighlightingSetup = false; // Reset flag
    const success = setupInteractiveHighlightingDirect();
    console.log("Retry highlighting setup result:", success);
  } else {
    console.log("No highlighting setup retry needed");
  }
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
  
  const result = title + timehtml + templateTable + html;
  
  // Setup highlighting directly in the next frame after content is injected
  // This approach eliminates race conditions by being synchronous with the DOM update
  if (templateTable && html && html.includes('diff-variable-highlight')) {
    console.log("=== PREPDF: Content includes both template and diff highlights ===");
    // Schedule highlighting setup for the next animation frame
    // This is more reliable than the detection-based approach
    setTimeout(() => {
      console.log("Setting up highlighting from prepDiff");
      if (permissionsConfirmed) {
        setupInteractiveHighlightingDirect();
      } else {
        pendingHighlightingSetup = true;
      }
    }, 0); // Immediate execution but async
  }
  
  return result;
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
  
  // Add close button for frameset bubbles since click dismiss might be difficult
  const currentBubbleDOM = document.getElementById("license_bubble");
  if (currentBubbleDOM && currentBubbleDOM.classList.contains('frameset-bubble')) {
    createCloseButton(form);
  }
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
  
  // For framesets, we need to create the bubble in the top-level document
  // Check if we're in a frameset context
  let targetDocument = document;
  let targetWindow = window;
  
  // If we're inside a frame, try to access the top-level document
  if (window.parent && window.parent !== window) {
    try {
      // Try to access the parent document (this will fail for cross-origin)
      if (window.parent.document && window.parent.document.body) {
        targetDocument = window.parent.document;
        targetWindow = window.parent;
        console.log("CONTENT SCRIPT: Creating bubble in parent document (frameset context)");
      }
    } catch (error) {
      console.log("CONTENT SCRIPT: Cannot access parent document (cross-origin), creating bubble in current frame");
      // Fall back to current document if we can't access parent
    }
  }
  
  // Check if the target document has a frameset or if body doesn't exist/is not attachable
  const isFrameset = targetDocument.querySelector('frameset') !== null;
  const hasNoBody = !targetDocument.body;
  const isParentDocument = targetDocument !== document;
  const needsSpecialHandling = isFrameset || hasNoBody;
  let bubbleDOM;
  
  if (needsSpecialHandling) {
    console.log("CONTENT SCRIPT: Detected frameset document or missing body, using alternative bubble positioning");
    console.log("CONTENT SCRIPT: isFrameset:", isFrameset, "hasNoBody:", hasNoBody, "isParentDocument:", isParentDocument);
    
    // For framesets or documents without proper body, create a positioned overlay
    bubbleDOM = targetDocument.createElement("div");
    bubbleDOM.setAttribute("class", "selection_bubble frameset-bubble");
    bubbleDOM.setAttribute("id", "license_bubble");
    
    // Add data attribute to track parent document context
    if (isParentDocument) {
      bubbleDOM.setAttribute("data-parent-doc", "true");
    }
    
    // Use fixed positioning to overlay on top of the frameset/document
    bubbleDOM.style.position = "fixed";
    bubbleDOM.style.top = "20px";
    bubbleDOM.style.left = "20px";
    bubbleDOM.style.zIndex = "2147483647";
    bubbleDOM.style.maxWidth = "calc(100vw - 40px)";
    bubbleDOM.style.maxHeight = "calc(100vh - 40px)";
    bubbleDOM.style.overflow = "auto";
    
    // Try to append to document.documentElement first, then body as fallback
    let appendTarget = null;
    if (targetDocument.documentElement) {
      appendTarget = targetDocument.documentElement;
      console.log("CONTENT SCRIPT: Appending to documentElement");
    } else if (targetDocument.body) {
      appendTarget = targetDocument.body;
      console.log("CONTENT SCRIPT: Appending to body as fallback");
    } else {
      console.log("CONTENT SCRIPT: No valid append target found - this may fail");
      appendTarget = targetDocument.documentElement || targetDocument.body;
    }
    
    if (appendTarget) {
      appendTarget.appendChild(bubbleDOM);
    } else {
      // Last resort: try to append to document
      if (targetDocument.appendChild) {
        targetDocument.appendChild(bubbleDOM);
      } else {
        console.error("CONTENT SCRIPT: Could not find any valid target to append bubble");
        // Create in current document as absolute last resort
        bubbleDOM = document.createElement("div");
        bubbleDOM.setAttribute("class", "selection_bubble frameset-bubble");
        bubbleDOM.setAttribute("id", "license_bubble");
        bubbleDOM.setAttribute("data-fallback", "true");
        document.body.appendChild(bubbleDOM);
      }
    }
  } else {
    // Normal document - use standard approach
    bubbleDOM = targetDocument.createElement("div");
    bubbleDOM.setAttribute("class", "selection_bubble");
    bubbleDOM.setAttribute("id", "license_bubble");
    targetDocument.body.appendChild(bubbleDOM);
  }
  
  var progressbar = targetDocument.createElement("progress");
  progressbar.setAttribute("id", "progress_bubble");
  progressbar.setAttribute("max", 100);
  progressbar.value = 0;
  bubbleDOM.appendChild(progressbar);
  var bubbleDOMText = targetDocument.createElement("div");
  bubbleDOMText.setAttribute("id", "bubble_text");
  bubbleDOM.appendChild(bubbleDOMText);
  var resultText = targetDocument.createElement("div");
  resultText.setAttribute("id", "result_text");
  bubbleDOM.appendChild(resultText);
  
  // Add click dismiss behavior for frameset bubbles in parent document
  if (needsSpecialHandling && isParentDocument && targetDocument !== document) {
    console.log("CONTENT SCRIPT: Adding click dismiss listener to parent document for frameset bubble");
    targetDocument.addEventListener(
      "mousedown",
      function (e) {
        if (
          e.target.id === "license_bubble" ||
          (targetDocument.querySelector && targetDocument.querySelector("#license_bubble") && 
           targetDocument.querySelector("#license_bubble").contains(e.target)) ||
          (typeof jQuery !== 'undefined' && jQuery(e.target).parents("#license_bubble").length)
        ) {
          // Clicked inside bubble - do nothing
        } else {
          // Clicked outside bubble - remove it
          var bubbleDOM = targetDocument.querySelector("#license_bubble");
          if (bubbleDOM) {
            console.log("CONTENT SCRIPT: Removing frameset bubble due to outside click");
            bubbleDOM.remove();
            // Recreate bubble in current context
            createBubble();
          }
        }
      },
      false
    );
  }
  
  // Store target document info for later use by button creation functions
  if (needsSpecialHandling) {
    bubbleDOM.setAttribute("data-target-document", isParentDocument ? "parent" : "current");
  }
  
  console.log("CONTENT SCRIPT: Bubble created successfully");
  
  // Apply theme colors immediately after bubble creation
  setTimeout(() => {
    applyCustomDiffColors();
  }, 0);
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
function createNewLicenseButton(form, targetDoc = document) {
  // Detect if we need to use a different target document for frameset bubbles
  const bubbleDOM = document.getElementById("license_bubble") || targetDoc.getElementById("license_bubble");
  if (bubbleDOM && bubbleDOM.hasAttribute("data-target-document")) {
    const targetDocType = bubbleDOM.getAttribute("data-target-document");
    if (targetDocType === "parent" && window.parent && window.parent !== window) {
      try {
        if (window.parent.document) {
          targetDoc = window.parent.document;
        }
      } catch (error) {
        // Cross-origin, stick with current document
      }
    }
  }
  
  if ((targetDoc.querySelector("#newLicenseButton")) || utils.isPopupPage()) return;
  
  const button = targetDoc.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("id", "newLicenseButton");
  button.setAttribute("title", "Submit this text as a new license to SPDX.org");
  button.textContent = "Submit new license";
  button.addEventListener("click", () => {
    api.runtime.sendMessage({
      command: "submitNewLicense",
      selection: selection,
      url: location.href,
    });
  });
  
  form.appendChild(button);
  form.appendChild(targetDoc.createElement("br"));
}

// Add new tab button.
function createNewTabButton(form, selectedLicense, targetDoc = document) {
  // Detect if we need to use a different target document for frameset bubbles
  const bubbleDOM = document.getElementById("license_bubble") || targetDoc.getElementById("license_bubble");
  if (bubbleDOM && bubbleDOM.hasAttribute("data-target-document")) {
    const targetDocType = bubbleDOM.getAttribute("data-target-document");
    if (targetDocType === "parent" && window.parent && window.parent !== window) {
      try {
        if (window.parent.document) {
          targetDoc = window.parent.document;
        }
      } catch (error) {
        // Cross-origin, stick with current document
      }
    }
  }
  
  if (utils.isPopupPage()) return;
  if (targetDoc.querySelector("#newTabButton")) {
    const existingButton = targetDoc.getElementById("newTabButton");
    if (existingButton) {
      existingButton.removeEventListener("click", newTab);
      existingButton.addEventListener("click", newTab);
      return;
    }
  }
  
  const button = targetDoc.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("id", "newTabButton");
  button.setAttribute("title", "Open diff results in a new tab (fullscreen view)");
  
  // Apply critical positioning styles inline to ensure they work
  button.style.position = "absolute";
  button.style.top = "2px";
  button.style.right = "26px";
  button.style.zIndex = "1001";
  button.style.width = "24px";
  button.style.height = "20px";
  
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M4.5 11H3v4h4v-1.5H4.5V11zM3 7h1.5V4.5H7V3H3v4zm10.5 6.5H11V15h4v-4h-1.5v2.5zM11 3v1.5h2.5V7H15V3h-4z"/></svg>';
  button.style.visibility = "hidden";
  button.addEventListener("click", newTab);
  
  // Append to bubble container instead of form for title bar positioning
  const bubble = targetDoc.getElementById("license_bubble");
  if (bubble) {
    bubble.appendChild(button);
  } else {
    form.appendChild(button);
  }
}

// Add theme toggle dropdown.
function createThemeToggleButton(form, targetDoc = document) {
  // Detect if we need to use a different target document for frameset bubbles
  const bubbleDOM = document.getElementById("license_bubble") || targetDoc.getElementById("license_bubble");
  if (bubbleDOM && bubbleDOM.hasAttribute("data-target-document")) {
    const targetDocType = bubbleDOM.getAttribute("data-target-document");
    if (targetDocType === "parent" && window.parent && window.parent !== window) {
      try {
        if (window.parent.document) {
          targetDoc = window.parent.document;
        }
      } catch (error) {
        // Cross-origin, stick with current document
      }
    }
  }
  
  if (targetDoc.querySelector("#themeToggleSelect")) {
    return; // Dropdown already exists
  }
  
  const select = targetDoc.createElement("select");
  select.setAttribute("id", "themeToggleSelect");
  select.setAttribute("title", "Select theme for diff display");
  
  // Apply critical positioning styles inline to ensure they work
  select.style.position = "absolute";
  select.style.top = "2px";
  select.style.right = "56px";
  select.style.zIndex = "1001";
  select.style.height = "20px";
  
  // Create theme options
  const lightOption = targetDoc.createElement("option");
  lightOption.setAttribute("value", "light");
  lightOption.textContent = "Light";
  
  const darkOption = targetDoc.createElement("option");
  darkOption.setAttribute("value", "dark");
  darkOption.textContent = "Dark";
  
  select.appendChild(lightOption);
  select.appendChild(darkOption);
  
  // Append to bubble container instead of form for title bar positioning
  const bubble = targetDoc.getElementById("license_bubble");
  if (bubble) {
    bubble.appendChild(select);
  } else {
    form.appendChild(select);
  }
  
  // Check current theme state and set the selected option
  const bubbleForTheme = targetDoc.getElementById("license_bubble") || document.getElementById("license_bubble");
  const isDarkMode = bubbleForTheme && bubbleForTheme.classList.contains('spdx-dark-mode');
  select.value = isDarkMode ? "dark" : "light";
  
  select.addEventListener("change", function() {
    const shouldBeDark = this.value === "dark";
    const currentlyDark = bubbleForTheme && bubbleForTheme.classList.contains('spdx-dark-mode');
    
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
    // Also update body class if in popup mode
    if (document.body.hasAttribute('data-is-popup')) {
      document.body.classList.remove('spdx-dark-mode');
    }
  } else {
    // Switch to dark mode
    bubbleDOM.classList.add('spdx-dark-mode');
    if (select) select.value = "dark";
    // Also update body class if in popup mode
    if (document.body.hasAttribute('data-is-popup')) {
      document.body.classList.add('spdx-dark-mode');
    }
  }
  
  // Apply any custom color overrides to work with the new theme
  applyCustomDiffColors();
  
  console.log('Theme toggled to:', isDarkMode ? 'light' : 'dark');
}

function newTab() {
  var license = selectedLicense;
  const bubbleDOM = document.getElementById("license_bubble");
  const isDarkMode = bubbleDOM && bubbleDOM.classList.contains('spdx-dark-mode');
  
  api.runtime.sendMessage({
    command: "newTab",
    diffs: diffs,
    selectedLicense: license,
    spdx: spdx,
    isDarkMode: isDarkMode, // Pass current theme state
  });
}

// Move that bubble to the appropriate location.
function renderBubble(mouseX, mouseY, selection) {
  updateProgressBar(-1, 1, true);
  // var progressbar = $('#progress_bubble')[0]
  updateBubbleText("Processing...");
  var bubbleDOM = $("#license_bubble")[0];
  
  // Check if this is a frameset bubble with fixed positioning
  const isFramesetBubble = bubbleDOM.classList.contains('frameset-bubble');
  
  if (isFramesetBubble) {
    // For frameset bubbles, use viewport-relative positioning with bounds checking
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // Ensure coordinates are within reasonable bounds for fixed positioning
    const finalX = Math.max(20, Math.min(mouseX, viewportWidth - 100));
    const finalY = Math.max(20, Math.min(mouseY, viewportHeight - 100));
    
    bubbleDOM.style.top = finalY + "px";
    bubbleDOM.style.left = finalX + "px";
    console.log("CONTENT SCRIPT: Positioned frameset bubble at:", finalX, finalY);
  } else {
    // Standard bubble positioning for normal documents
    // Account for scroll position to ensure accurate positioning
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    
    // Adjust coordinates to account for scroll position
    const adjustedX = mouseX + scrollX;
    const adjustedY = mouseY + scrollY;
    
    // Ensure bubble stays within viewport bounds
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    const bubbleWidth = 300; // Approximate bubble width
    const bubbleHeight = 200; // Approximate bubble height
    
    const finalX = Math.max(10, Math.min(adjustedX, scrollX + viewportWidth - bubbleWidth - 10));
    const finalY = Math.max(10, Math.min(adjustedY, scrollY + viewportHeight - bubbleHeight - 10));
    
    bubbleDOM.style.top = finalY + "px";
    bubbleDOM.style.left = finalX + "px";
    
    console.log("CONTENT SCRIPT: Positioned normal bubble at:", finalX, finalY, "(scroll:", scrollX, scrollY, ")");
  }
  
  bubbleDOM.style.visibility = "visible";
  
  // Only animate scroll for non-frameset bubbles to avoid potential issues
  if (!isFramesetBubble) {
    $("html,body").animate(
      {
        scrollTop: $("#progress_bubble").offset().top,
      },
      "fast"
    );
  }
}

function updateBubbleText(text, target = "#bubble_text", onComplete = null) {
  var bubbleDOMText = $(target)[0];
  // Directly set innerHTML to preserve HTML structure and CSS classes
  // The XML serialization was breaking diff CSS classes
  bubbleDOMText.innerHTML = text;
  
  // Setup interactive highlighting if this update contains template content OR diff content
  if (text.includes('template-variable-row') || text.includes('diff-variable-highlight')) {
    console.log("=== BUBBLE TEXT UPDATE WITH INTERACTIVE CONTENT ===");
    console.log("Setting up interactive highlighting after updating", target);
    console.log("Text includes template-variable-row:", text.includes('template-variable-row'));
    console.log("Text includes diff-variable-highlight:", text.includes('diff-variable-highlight'));
    console.log("Target:", target);
    console.log("Permissions confirmed:", permissionsConfirmed);
    console.log("Pending highlighting setup:", pendingHighlightingSetup);
    
    // Only setup highlighting if permissions are confirmed
    if (permissionsConfirmed) {
      // Use requestAnimationFrame to ensure DOM is fully rendered, with fallback
      const rafCallback = () => {
        console.log("Setting up interactive highlighting via requestAnimationFrame");
        setupInteractiveHighlightingDirect();
        if (onComplete) onComplete();
      };
      
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(rafCallback);
      } else {
        // Fallback for environments without requestAnimationFrame
        setTimeout(rafCallback, 16); // ~60fps
      }
    } else {
      console.log("Permissions not yet confirmed - highlighting setup will be deferred");
      pendingHighlightingSetup = true;
      if (onComplete) onComplete();
    }
  } else {
    if (onComplete) onComplete();
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

// Add close button for frameset bubbles.
function createCloseButton(form, targetDoc = document) {
  // Detect if we need to use a different target document for frameset bubbles
  const bubbleDOM = document.getElementById("license_bubble") || targetDoc.getElementById("license_bubble");
  if (bubbleDOM && bubbleDOM.hasAttribute("data-target-document")) {
    const targetDocType = bubbleDOM.getAttribute("data-target-document");
    if (targetDocType === "parent" && window.parent && window.parent !== window) {
      try {
        if (window.parent.document) {
          targetDoc = window.parent.document;
        }
      } catch (error) {
        // Cross-origin, stick with current document
      }
    }
  }
  
  if (targetDoc.querySelector("#closeButton")) {
    return; // Button already exists
  }
  
  const button = targetDoc.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("id", "closeButton");
  button.setAttribute("title", "Close license comparison bubble");
  button.innerHTML = '×';
  
  // Apply critical positioning styles inline to ensure they work
  button.style.position = "absolute";
  button.style.top = "2px";
  button.style.right = "2px";
  button.style.zIndex = "1001";
  button.style.width = "20px";
  button.style.height = "20px";
  
  button.addEventListener("click", function() {
    const bubbleToClose = targetDoc.getElementById("license_bubble");
    if (bubbleToClose) {
      console.log("CONTENT SCRIPT: Closing frameset bubble via close button");
      bubbleToClose.remove();
    }
  });
  
  // Append to bubble container instead of form for title bar positioning
  const bubble = targetDoc.getElementById("license_bubble");
  if (bubble) {
    bubble.appendChild(button);
  } else {
    form.appendChild(button);
  }
}
