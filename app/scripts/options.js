// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
/* eslint-disable no-unused-vars */
"use strict";
// Enable chromereload by uncommenting this line:
// if (process.env.NODE_ENV === 'development' && typeof browser === 'undefined') {
//   require('chromereload/devonly')
// }

import { filters, defaultoptions, readmePermissionsUrl, readmePermissionsUrls } from "./const.js";
import { utils } from "./utils.js";

const api = typeof browser !== "undefined" ? browser : chrome;

// Permission checking functions
async function checkSpdxPermission() {
  try {
    const hasPermission = await api.permissions.contains({
      origins: ["*://*.spdx.org/*"]
    });
    return hasPermission;
  } catch (error) {
    console.log("Permission check failed:", error);
    return false;
  }
}

async function requestSpdxPermission() {
  try {
    const granted = await api.permissions.request({
      origins: ["*://*.spdx.org/*"]
    });
    return granted;
  } catch (error) {
    console.log("Permission request failed:", error);
    return false;
  }
}

function getBrowserSpecificInstructions() {
  const isFirefox = utils.isFirefox();
  const extensionId = api.runtime.id;
  
  if (isFirefox) {
    return {
      browser: "Firefox",
      extensionsUrl: "about:addons",
      readmeUrl: readmePermissionsUrls.firefox,
      readmeText: "View Firefox Setup Instructions"
    };
  } else {
    return {
      browser: "Chrome/Edge",
      extensionsUrl: `chrome://extensions/?id=${extensionId}`,
      readmeUrl: readmePermissionsUrls.chrome,
      readmeText: "View Chrome/Edge Setup Instructions"
    };
  }
}

async function checkAndShowPermissionWarning() {
  const hasPermission = await checkSpdxPermission();
  const warningDiv = document.getElementById("permissionWarning");
  
  if (!hasPermission) {
    const browserInfo = getBrowserSpecificInstructions();
    const instructionsDiv = document.getElementById("permissionInstructions");
    
    // Create clickable link to README instructions
    instructionsDiv.innerHTML = `
      <p>For detailed setup instructions:</p>
      <p><a href="${browserInfo.readmeUrl}" target="_blank" rel="noopener noreferrer">${browserInfo.readmeText}</a></p>
    `;
    warningDiv.style.display = "block";
  } else {
    warningDiv.style.display = "none";
  }
}

// Saves options to chrome.storage
function saveOptions() {
  var updateFrequency = document.getElementById("updateFrequency").value;
  var showBest = document.getElementById("maxComparisons").value;
  var minpercentage = document.getElementById("minpercentage").value;
  var maxLengthDifference = document.getElementById("maxDifference").value;
  var diceCoefficient = document.getElementById("diceCoefficient").value;
  var maxworkers = document.getElementById("maxWorkers").value;
  var filters = {};
  if (document.getElementById("deprecated").checked) {
    filters.deprecated = document.getElementById("deprecated").value;
  }

  // Get color settings
  var diffColors = {
    light: {
      insertBg: document.getElementById("lightInsertBg").value,
      insertText: document.getElementById("lightInsertText").value,
      deleteBg: document.getElementById("lightDeleteBg").value,
      deleteText: document.getElementById("lightDeleteText").value,
      equalText: document.getElementById("lightEqualText").value,
      highlightBg: document.getElementById("lightHighlightBg").value
    },
    dark: {
      insertBg: document.getElementById("darkInsertBg").value,
      insertText: document.getElementById("darkInsertText").value,
      deleteBg: document.getElementById("darkDeleteBg").value,
      deleteText: document.getElementById("darkDeleteText").value,
      equalText: document.getElementById("darkEqualText").value,
      highlightBg: document.getElementById("darkHighlightBg").value
    }
  };

  var options = {
    updateFrequency: parseInt(updateFrequency),
    showBest: parseInt(showBest),
    minpercentage: parseInt(minpercentage),
    maxLengthDifference: parseInt(maxLengthDifference),
    diceCoefficient: parseFloat(diceCoefficient),
    maxworkers: parseInt(maxworkers),
    filters: filters,
    diffColors: diffColors,
  };
  api.storage.local.set({ options: options }, function () {
    // Update status to let user know options were saved.
    var status = document.getElementById("status");
    status.textContent = "Options saved.";
    
    // Update the diff colors in the content script
    updateDiffColors(diffColors);
    
    setTimeout(function () {
      status.textContent = "";
    }, 1500);
  });
}

// Restores values using the preferences
// stored in api.storage.
function restoreOptions() {
  api.storage.local.get(["options"], function (result) {
    if (result.options === undefined) {
      result.options = defaultoptions;
    }
    document.getElementById("updateFrequency").value =
      result.options.updateFrequency;
    document.getElementById("maxComparisons").value = result.options.showBest;
    document.getElementById("minpercentage").value =
      result.options.minpercentage;
    document.getElementById("maxDifference").value =
      result.options.maxLengthDifference;
    document.getElementById("diceCoefficient").value =
      result.options.diceCoefficient;
    document.getElementById("maxWorkers").value = result.options.maxworkers;
    
    // Restore color settings
    const colors = result.options.diffColors || defaultoptions.diffColors;
    document.getElementById("lightInsertBg").value = colors.light.insertBg;
    document.getElementById("lightInsertText").value = colors.light.insertText;
    document.getElementById("lightDeleteBg").value = colors.light.deleteBg;
    document.getElementById("lightDeleteText").value = colors.light.deleteText;
    document.getElementById("lightEqualText").value = colors.light.equalText || defaultoptions.diffColors.light.equalText;
    document.getElementById("lightHighlightBg").value = colors.light.highlightBg || defaultoptions.diffColors.light.highlightBg;
    document.getElementById("darkInsertBg").value = colors.dark.insertBg;
    document.getElementById("darkInsertText").value = colors.dark.insertText;
    document.getElementById("darkDeleteBg").value = colors.dark.deleteBg;
    document.getElementById("darkDeleteText").value = colors.dark.deleteText;
    document.getElementById("darkEqualText").value = colors.dark.equalText || defaultoptions.diffColors.dark.equalText;
    document.getElementById("darkHighlightBg").value = colors.dark.highlightBg || defaultoptions.diffColors.dark.highlightBg;
    
    // If this is a fresh install (no saved options), generate default custom CSS
    // This ensures the displayed colors match the default values shown in the options page
    if (result.options === undefined || !result.options.diffColors) {
      console.log('First time loading options - generating default color CSS');
      updateDiffColors(defaultoptions.diffColors);
    }
    
    showFilters(document.getElementById("exclude"), result);
    // document.getElementById('deprecated').checked = result.options.filters.deprecated
  });
}

function showFilters(form, result) {
  for (var filter in filters) {
    if (document.getElementById(filter)) {
      continue;
    }
    var checkbox = form.appendChild(document.createElement("input"));
    var label = checkbox.appendChild(document.createElement("label"));
    label.htmlFor = filter;
    form.appendChild(
      document.createTextNode(filter.charAt(0).toUpperCase() + filter.slice(1))
    );
    checkbox.type = "checkbox";
    checkbox.id = filter;
    checkbox.value = filters[filter];
    checkbox.defaultChecked = defaultoptions.filters[filter];
    checkbox.checked =
      result.options.filters !== undefined &&
      result.options.filters[filter] !== undefined
        ? result.options.filters[filter]
        : defaultoptions.filters[filter];
  }
}

function reset() {
  var form = document.getElementById("options");
  form.reset();
}
function loadList() {
  api.storage.local.get(["list"], function (result) {
    var licenseversion = document.getElementById("licenseversion");
    var status = document.getElementById("updatestatus");
    if (result.list && result.list.licenseListVersion) {
      var list = result.list;
      var lastupdate = list.lastupdate;
      var releaseDate = list.releaseDate;
      licenseversion.textContent =
        "v." +
        list.licenseListVersion +
        " (" +
        releaseDate +
        ") with " +
        list.licenses.length +
        " licenses";
      status.textContent = new Date(lastupdate).toLocaleString();

      // Display failed downloads if any
      const downloadStatusDiv = document.getElementById("downloadStatus");
      if (list.failedDownloads && list.failedDownloads.length > 0) {
        downloadStatusDiv.innerHTML = `
          <p class="status-title"><strong>Warning:</strong> The following licenses could not be downloaded during the last update:</p>
          <ul class="failed-list">
            ${list.failedDownloads.map(id => `<li>${id}</li>`).join('')}
          </ul>
        `;
        downloadStatusDiv.className = 'status-container status-warning';
      } else {
        downloadStatusDiv.innerHTML = '<p class="status-title status-success">All licenses were downloaded successfully.</p>';
        downloadStatusDiv.className = 'status-container status-success';
      }
    } else {
      licenseversion.textContent = "None";
      status.textContent = "Never";
    }
  });
}
async function updateList() {
  showUpdateStatus("Checking permissions...", "info");
  
  // Check if we have permission to access spdx.org
  const hasPermission = await checkSpdxPermission();
  if (!hasPermission) {
    showUpdateStatus("Requesting permission to access spdx.org...", "info");
    const granted = await requestSpdxPermission();
    if (!granted) {
      showUpdatePermissionError("Permission denied to access spdx.org. License list update requires access to spdx.org to download the latest license data.");
      return;
    }
  }
  
  showUpdateStatus("Updating license list...", "info");
  
  // Don't clear storage - let the background script handle it atomically
  api.runtime.sendMessage({
    command: "updatelicenselist",
    url: api.runtime.getURL(""),
    remote: true,
  });
}
function checkStorage() {
  var status = document.getElementById("storagestatus");
  try {
    // Use cross-browser API with getBytesInUse if available (Chrome)
    if (api.storage.local.getBytesInUse) {
      api.storage.local.getBytesInUse(null, function (result) {
        if (result) {
          status.textContent = (result / 1024 / 1024).toFixed(2) + " MB";
        } else {
          status.textContent = "0 MB";
        }
      });
    } else {
      // Fallback for Firefox which doesn't support getBytesInUse
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1385832
      api.storage.local.get(function (items) {
        var result = JSON.stringify(items).length;
        if (result) {
          status.textContent = (result / 1024 / 1024).toFixed(2) + " MB";
        } else {
          status.textContent = "0 MB";
        }
      });
    }
  } catch (err) {
    // Fallback error handling
    status.textContent = "Unable to check storage";
  }
}
function clearStorage() {
  api.storage.local.clear(function (result) {
    checkStorage();
  });
}

// Listen for messages from background script about update status
api.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  switch (request.command) {
    case "update_status":
      showUpdateStatus(request.message, request.type);
      // Refresh the display when update succeeds
      if (request.type === "success") {
        setTimeout(() => {
          loadList();
        }, 500); // Small delay to ensure storage is committed
      }
      break;
    case "update_permission_error":
      showUpdatePermissionError(request.message);
      break;
  }
});

function showUpdateStatus(message, type = 'info') {
  var status = document.getElementById("tempUpdateStatus");
  if (!status) {
    // Create temporary status element if it doesn't exist
    status = document.createElement("div");
    status.id = "tempUpdateStatus";
    status.style.marginTop = "10px";
    status.style.padding = "10px";
    status.style.borderRadius = "3px";
    document.getElementById("update").parentNode.appendChild(status);
  }
  
  status.textContent = message;
  status.className = type; // 'info', 'success', 'error'
  status.style.display = "block";
  
  if (type === 'success') {
    status.style.backgroundColor = '#d4edda';
    status.style.color = '#155724';
    status.style.border = '1px solid #c3e6cb';
  } else if (type === 'error') {
    status.style.backgroundColor = '#f8d7da';
    status.style.color = '#721c24';
    status.style.border = '1px solid #f5c6cb';
  } else {
    status.style.backgroundColor = '#d1ecf1';
    status.style.color = '#0c5460';
    status.style.border = '1px solid #bee5eb';
  }
  
  // Clear message after 5 seconds for success/info, keep error messages
  if (type !== 'error') {
    setTimeout(function() {
      status.textContent = "";
      status.style.display = "none";
    }, 5000);
  }
}

function showUpdatePermissionError(message) {
  const isFirefox = utils.isFirefox();
  const extensionId = api.runtime.id;
  
  let permissionUrl = '';
  let instructions = '';
  
  if (isFirefox) {
    permissionUrl = 'about:addons';
    instructions = 'Go to about:addons → Extensions → SPDX License Diff → Permissions → Allow access to spdx.org';
  } else {
    permissionUrl = `chrome://extensions/?id=${extensionId}`;
    instructions = 'Go to chrome://extensions → SPDX License Diff → Details → Site access → Allow on spdx.org';
  }
  
  const fullMessage = `${message}\n\nTo fix this:\n${instructions}\n\nClick OK to open ${isFirefox ? 'Firefox Add-ons Manager' : 'Chrome Extensions page'}`;
  
  showUpdateStatus(fullMessage, 'error');
  
  if (window.confirm(fullMessage)) {
    try {
      window.open(permissionUrl, '_blank');
    } catch (error) {
      console.log('Could not automatically open permissions page:', error);
      showUpdateStatus(`Please manually open: ${permissionUrl}`, 'error');
    }
  }
}

// Color management functions
function updateDiffColors(colors) {
  // Helper function to convert hex to rgba with opacity
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Inject custom CSS with the new colors
  const customCSS = `
    ins.diff-insert, .diff-insert {
      background-color: ${colors.light.insertBg} !important;
      color: ${colors.light.insertText} !important;
    }
    del.diff-delete, .diff-delete {
      background-color: ${colors.light.deleteBg} !important;
      color: ${colors.light.deleteText} !important;
    }
    span.diff-equal, .diff-equal {
      color: ${colors.light.equalText} !important;
    }
    
    /* Variable highlighting for light mode */
    .diff-variable-highlight {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    
    .diff-variable-highlight:hover,
    .diff-variable-highlight.highlighted {
      background-color: ${hexToRgba(colors.light.highlightBg || '#ffeb3b', 0.3)} !important;
      border-color: ${hexToRgba(colors.light.highlightBg || '#ffeb3b', 0.6)} !important;
      box-shadow: 0 0 0 2px ${hexToRgba(colors.light.highlightBg || '#ffeb3b', 0.15)} !important;
    }
    
    .template-variable-row:hover,
    .template-variable-row.highlighted {
      background-color: ${hexToRgba(colors.light.highlightBg || '#ffeb3b', 0.2)} !important;
    }
    
    /* Dark mode via system preference */
    @media (prefers-color-scheme: dark) {
      ins.diff-insert, .diff-insert {
        background-color: ${colors.dark.insertBg} !important;
        color: ${colors.dark.insertText} !important;
      }
      del.diff-delete, .diff-delete {
        background-color: ${colors.dark.deleteBg} !important;
        color: ${colors.dark.deleteText} !important;
      }
      span.diff-equal, .diff-equal {
        color: ${colors.dark.equalText} !important;
      }
      
      .diff-variable-highlight {
        background-color: transparent !important;
        border-color: transparent !important;
      }
      
      .diff-variable-highlight:hover,
      .diff-variable-highlight.highlighted {
        background-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.4)} !important;
        border-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.7)} !important;
        box-shadow: 0 0 0 2px ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.2)} !important;
      }
      
      .template-variable-row:hover,
      .template-variable-row.highlighted {
        background-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.25)} !important;
      }
    }
    
    /* Dark mode via manual theme toggle (overrides system preference) */
    .spdx-dark-mode ins.diff-insert,
    .spdx-dark-mode .diff-insert {
      background-color: ${colors.dark.insertBg} !important;
      color: ${colors.dark.insertText} !important;
    }
    .spdx-dark-mode del.diff-delete,
    .spdx-dark-mode .diff-delete {
      background-color: ${colors.dark.deleteBg} !important;
      color: ${colors.dark.deleteText} !important;
    }
    .spdx-dark-mode span.diff-equal,
    .spdx-dark-mode .diff-equal {
      color: ${colors.dark.equalText} !important;
    }
    
    .spdx-dark-mode .diff-variable-highlight {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    
    .spdx-dark-mode .diff-variable-highlight:hover,
    .spdx-dark-mode .diff-variable-highlight.highlighted {
      background-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.4)} !important;
      border-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.7)} !important;
      box-shadow: 0 0 0 2px ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.2)} !important;
    }
    
    .spdx-dark-mode .template-variable-row:hover,
    .spdx-dark-mode .template-variable-row.highlighted {
      background-color: ${hexToRgba(colors.dark.highlightBg || '#ffeb3b', 0.25)} !important;
    }
    
    /* Light mode override when not in spdx-dark-mode (for cases where system is dark but user chose light) */
    .selection_bubble:not(.spdx-dark-mode) ins.diff-insert,
    .selection_bubble:not(.spdx-dark-mode) .diff-insert {
      background-color: ${colors.light.insertBg} !important;
      color: ${colors.light.insertText} !important;
    }
    .selection_bubble:not(.spdx-dark-mode) del.diff-delete,
    .selection_bubble:not(.spdx-dark-mode) .diff-delete {
      background-color: ${colors.light.deleteBg} !important;
      color: ${colors.light.deleteText} !important;
    }
    .selection_bubble:not(.spdx-dark-mode) span.diff-equal,
    .selection_bubble:not(.spdx-dark-mode) .diff-equal {
      color: ${colors.light.equalText} !important;
    }
  `;
  
  // Store the custom CSS in storage so content scripts can access it
  api.storage.local.set({ customDiffCSS: customCSS });
}

function resetColors() {
  const defaultColors = defaultoptions.diffColors;
  document.getElementById("lightInsertBg").value = defaultColors.light.insertBg;
  document.getElementById("lightInsertText").value = defaultColors.light.insertText;
  document.getElementById("lightDeleteBg").value = defaultColors.light.deleteBg;
  document.getElementById("lightDeleteText").value = defaultColors.light.deleteText;
  document.getElementById("lightEqualText").value = defaultColors.light.equalText;
  document.getElementById("lightHighlightBg").value = defaultColors.light.highlightBg;
  document.getElementById("darkInsertBg").value = defaultColors.dark.insertBg;
  document.getElementById("darkInsertText").value = defaultColors.dark.insertText;
  document.getElementById("darkDeleteBg").value = defaultColors.dark.deleteBg;
  document.getElementById("darkDeleteText").value = defaultColors.dark.deleteText;
  document.getElementById("darkEqualText").value = defaultColors.dark.equalText;
  document.getElementById("darkHighlightBg").value = defaultColors.dark.highlightBg;
  
  // Update preview if visible
  const preview = document.getElementById("colorPreview");
  if (preview.style.display !== "none") {
    updateColorPreview();
  }
}

function updateColorPreview() {
  const lightColors = {
    insertBg: document.getElementById("lightInsertBg").value,
    insertText: document.getElementById("lightInsertText").value,
    deleteBg: document.getElementById("lightDeleteBg").value,
    deleteText: document.getElementById("lightDeleteText").value,
    equalText: document.getElementById("lightEqualText").value,
    highlightBg: document.getElementById("lightHighlightBg").value
  };
  
  const darkColors = {
    insertBg: document.getElementById("darkInsertBg").value,
    insertText: document.getElementById("darkInsertText").value,
    deleteBg: document.getElementById("darkDeleteBg").value,
    deleteText: document.getElementById("darkDeleteText").value,
    equalText: document.getElementById("darkEqualText").value,
    highlightBg: document.getElementById("darkHighlightBg").value
  };
  
  // Helper function to convert hex to rgba
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  // Update light mode preview
  const lightInsert = document.querySelector("#lightPreview .preview-insert");
  const lightDelete = document.querySelector("#lightPreview .preview-delete");
  const lightEqual = document.querySelector("#lightPreview .preview-equal");
  const lightHighlight = document.querySelector("#lightPreview .preview-highlight");
  if (lightInsert) {
    lightInsert.style.backgroundColor = lightColors.insertBg;
    lightInsert.style.color = lightColors.insertText;
  }
  if (lightDelete) {
    lightDelete.style.backgroundColor = lightColors.deleteBg;
    lightDelete.style.color = lightColors.deleteText;
  }
  if (lightEqual) {
    lightEqual.style.color = lightColors.equalText;
  }
  if (lightHighlight) {
    lightHighlight.style.backgroundColor = hexToRgba(lightColors.highlightBg, 0.3);
    lightHighlight.style.padding = "2px 4px";
    lightHighlight.style.borderRadius = "3px";
    lightHighlight.style.border = `1px solid ${hexToRgba(lightColors.highlightBg, 0.5)}`;
  }
  
  // Update dark mode preview
  const darkInsert = document.querySelector("#darkPreview .preview-insert-dark");
  const darkDelete = document.querySelector("#darkPreview .preview-delete-dark");
  const darkEqual = document.querySelector("#darkPreview .preview-equal-dark");
  const darkHighlight = document.querySelector("#darkPreview .preview-highlight-dark");
  if (darkInsert) {
    darkInsert.style.backgroundColor = darkColors.insertBg;
    darkInsert.style.color = darkColors.insertText;
  }
  if (darkDelete) {
    darkDelete.style.backgroundColor = darkColors.deleteBg;
    darkDelete.style.color = darkColors.deleteText;
  }
  if (darkEqual) {
    darkEqual.style.color = darkColors.equalText;
  }
  if (darkHighlight) {
    darkHighlight.style.backgroundColor = hexToRgba(darkColors.highlightBg, 0.3);
    darkHighlight.style.padding = "2px 4px";
    darkHighlight.style.borderRadius = "3px";
    darkHighlight.style.border = `1px solid ${hexToRgba(darkColors.highlightBg, 0.5)}`;
  }
}

function toggleColorPreview() {
  const preview = document.getElementById("colorPreview");
  if (preview.style.display === "none" || preview.style.display === "") {
    preview.style.display = "block";
    updateColorPreview();
    document.getElementById("previewColors").textContent = "Hide Preview";
  } else {
    preview.style.display = "none";
    document.getElementById("previewColors").textContent = "Preview Colors";
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.addEventListener("DOMContentLoaded", loadList);
document.addEventListener("DOMContentLoaded", checkStorage);
document.addEventListener("DOMContentLoaded", checkAndShowPermissionWarning);
api.storage.onChanged.addListener(loadList);
api.storage.onChanged.addListener(checkStorage);
document.getElementById("reset").addEventListener("click", reset);
document.getElementById("update").addEventListener("click", updateList);
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("clearstorage").addEventListener("click", clearStorage);
document.getElementById("resetColors").addEventListener("click", resetColors);
document.getElementById("previewColors").addEventListener("click", toggleColorPreview);

// Add event listeners for color inputs to update preview in real-time
["lightInsertBg", "lightInsertText", "lightDeleteBg", "lightDeleteText", "lightEqualText", "lightHighlightBg",
 "darkInsertBg", "darkInsertText", "darkDeleteBg", "darkDeleteText", "darkEqualText", "darkHighlightBg"].forEach(id => {
  document.getElementById(id).addEventListener("input", function() {
    // Update preview if visible
    const preview = document.getElementById("colorPreview");
    if (preview.style.display !== "none") {
      updateColorPreview();
    }
  });
});

// Permission button event listeners
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("checkPermissions").addEventListener("click", async function() {
    await checkAndShowPermissionWarning();
    // Also update the list status
    loadList();
    checkStorage();
  });
});
