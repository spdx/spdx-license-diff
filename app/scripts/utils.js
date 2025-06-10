// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

// Utility functions to reduce code duplication
const utils = {
  // Browser detection
  isFirefox: () => navigator.userAgent.toLowerCase().includes('firefox'),
  
  // Common element creation
  createElement: (tag, attributes = {}, textContent = '') => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'textContent') {
        element.textContent = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    if (textContent) element.textContent = textContent;
    return element;
  },
  
  // Common button creation pattern
  createButton: (id, text, title, onClick) => {
    const button = utils.createElement('button', {
      type: 'button',
      id: id,
      title: title
    }, text);
    if (onClick) button.addEventListener('click', onClick);
    return button;
  },
  
  // Calculate best match count helper
  getBestMatchCount: (options, rawspdx) => {
    return options.showBest === 0 && rawspdx ? rawspdx.length : options.showBest;
  },
  
  // Check if running in popup
  isPopupPage: () => window.location.href.endsWith("/popup.html"),
  
  // Progress bar visibility helper
  setProgressVisibility: (visible) => {
    const progressbar = document.getElementById("progress_bubble");
    if (progressbar) {
      progressbar.style.visibility = visible ? "visible" : "hidden";
    }
  }
};

export { utils };
