// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later or CC-BY-SA-3.0)

import $ from "jquery";

// https://stackoverflow.com/questions/2031518/javascript-selection-range-coordinates
function selectRangeCoords() {
  var selection = window.getSelection();
  
  // Check if there's a valid selection
  if (!selection || selection.rangeCount === 0) {
    console.log("No selection found, using default coordinates");
    return [100, 100]; // Default position if no selection
  }
  
  var range = selection.getRangeAt(0);
  if (!range || !range.startContainer) {
    console.log("Invalid range, using default coordinates");
    return [100, 100];
  }
  
  try {
    var $span = $("<span/>");
    var newRange = document.createRange();
    
    // Ensure we have a valid node to set the start
    var startNode = range.startContainer;
    if (startNode.nodeType === 3 && startNode.parentNode) { // TEXT_NODE = 3
      newRange.setStart(startNode, 0);
    } else if (startNode.nodeType === 1) { // ELEMENT_NODE = 1
      newRange.setStart(startNode, 0);
    } else {
      console.log("Unable to create valid range, using default coordinates");
      return [100, 100];
    }
    
    newRange.insertNode($span[0]); // using 'range' here instead of newRange unselects or causes flicker on chrome/webkit

    var posX = $span.offset().left;
    var posY = $span.offset().top;
    $span.remove();
    return [posX, posY];
  } catch (error) {
    console.error("Error getting selection coordinates:", error);
    return [100, 100]; // Fallback position
  }
}

// https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text
function getSelectionText() {
  var text = "";
  var activeEl = document.activeElement;
  var activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
  if (
    (activeElTagName === "textarea" ||
      (activeElTagName === "input" &&
        /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
    typeof activeEl.selectionStart === "number"
  ) {
    text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
  } else if (window.getSelection) {
    text = window.getSelection().toString();
  }
  return text;
}

// https://stackoverflow.com/questions/17438354/how-can-i-enable-my-chrome-extension-in-incognito-mode/17443982#17443982
function checkLocalFileAccess(isAllowedAccess) {
  if (isAllowedAccess) return;
  
  // Use cross-browser compatible API
  const api = typeof browser !== "undefined" ? browser : chrome;
  
  // Use i18n message
  const message = api.i18n.getMessage("localPermissionNeeded");
  alert(message);
  
  // Cross-browser extension management URLs
  let extensionUrl;
  if (typeof browser !== "undefined") {
    // Firefox
    extensionUrl = "about:addons";
  } else {
    // Chrome, Edge, Opera
    extensionUrl = "chrome://extensions/?id=" + api.runtime.id;
  }
  
  api.tabs.create({
    url: extensionUrl,
  });
}

export { selectRangeCoords, getSelectionText, checkLocalFileAccess };
