// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later or CC-BY-SA-3.0)

import $ from "jquery";

// https://stackoverflow.com/questions/2031518/javascript-selection-range-coordinates
function selectRangeCoords() {
  var node = window.getSelection();
  var $span = $("<span/>");
  var newRange = document.createRange();
  newRange.setStart(node.focusNode, 0);
  newRange.insertNode($span[0]); // using 'range' here instead of newRange unselects or causes flicker on chrome/webkit

  var posX = $span.offset().left;
  var posY = $span.offset().top;
  $span.remove();
  return [posX, posY];
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
  alert(chrome.i18n.getMessage("localPermissionNeeded"));
  chrome.tabs.create({
    url: "chrome://extensions/?id=" + chrome.runtime.id,
  });
}

export { selectRangeCoords, getSelectionText, checkLocalFileAccess };
