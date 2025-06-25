// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com> and Sujal Bhor <bhorsujal@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Gets the currently selected text from the page.
 * It intelligently checks for selections in input fields, textareas,
 * or the general document.
 * @returns {string} The selected text.
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
 * Calculates the screen coordinates of the current text selection.
 * Uses the standard `getBoundingClientRect` on the selection's range.
 * @returns {Array<number>} An array containing the [x, y] coordinates of the selection.
 *                          Returns a default position if no selection exists.
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
  if (rect.x === 0 && rect.y === 0) {
      const span = document.createElement("span");
      range.insertNode(span);
      rect = span.getBoundingClientRect();
      span.remove();
  }

  return [rect.left, rect.bottom];
}

/**
 * Guides the user to the browser's extension management page
 * to grant necessary permissions for local file access.
 * @param {boolean} isAllowedAccess - If true, the function does nothing.
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
