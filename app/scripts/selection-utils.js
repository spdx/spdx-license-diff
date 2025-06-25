// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
Gets the currently selected text from the page.
It intelligently checks for selections in input fields, textareas,
or the general document.
@returns {string} The selected text.
 */
function getSelectionText() {
  const activeEl = document.activeElement;
  const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;

  if (
    (activeElTagName === "textarea" ||
      (activeElTagName === "input" &&
        /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
    typeof activeEl.selectionStart === "number"
  ) {
    return activeEl.value.slice(
      activeEl.selectionStart,
      activeEl.selectionEnd
    );
  }

  const selection = window.getSelection();
  return selection ? selection.toString() : "";
}

/**
Get the [x, y] screen coordinates of the current text selection.
Returns [100, 100] if nothing is selected.
@returns {number[]} [x, y] coordinates.
 */
function selectRangeCoords() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    // Return a default, safe position if there's no selection
    return [100, 100];
  }

  const range = selection.getRangeAt(0).cloneRange();
  
  // getBoundingClientRect is the standard, modern way to get position.
  let rect = range.getBoundingClientRect();

  // If the selection is collapsed (e.g., just a cursor), the rect might be empty.
  // We can create a temporary element to get a valid position.
  if (rect.width === 0 && rect.height === 0) {
      const span = document.createElement("span");
      range.insertNode(span);
      rect = span.getBoundingClientRect();
      span.remove();
  }

  return [rect.left, rect.bottom];
}

/**
If local file access is not allowed, prompt the user to enable it in extension settings.
@param {boolean} isAllowedAccess
 */
function checkLocalFileAccess(isAllowedAccess) {
  if (isAllowedAccess) {
    return;
  }

  // Use the cross-browser `browser` or fallback to `chrome`
  const api = typeof browser !== "undefined" ? browser : chrome;

  alert(
    "To compare local files, please enable 'Allow access to file URLs' in the extension settings."
  );

  let extensionsPageUrl;
  if (api.runtime.getURL("").startsWith("moz-extension://")) {
    // Firefox
    extensionsPageUrl = "about:addons";
  } else {
    // Chrome, Edge, Opera
    extensionsPageUrl = `chrome://extensions/?id=${api.runtime.id}`;
  }

  if (extensionsPageUrl) {
    api.tabs.create({ url: extensionsPageUrl });
  }
}

export { 
  selectRangeCoords, 
  getSelectionText, 
  checkLocalFileAccess 
};
