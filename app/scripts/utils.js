// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

import $ from 'jquery';
import { selectRangeCoords as getSelectionCoords } from './selection-utils.js';

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

// Track last known mouse position for fallback positioning
let lastMousePosition = { x: 0, y: 0 };

// Track last user interaction context
let lastInteractionContext = {
  type: 'none', // 'main-document', 'iframe', 'frame', 'input'
  target: null,
  frameIndex: -1, // -1 means not a frame, >= 0 is frame index (includes both iframes and frames)
  timestamp: 0,
  frameElement: null // Store reference to the actual iframe or frame element
};

// Initialize interaction tracking
function initializeInteractionTracking() {
  // Track mouse movement for fallback positioning
  document.addEventListener('mousemove', function(event) {
    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;
  });

  // Track clicks and focus events on main document
  document.addEventListener('click', function(event) {
    updateInteractionContext('main-document', event.target, -1, null);
  });
  
  document.addEventListener('focus', function(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      updateInteractionContext('input', event.target, -1, null);
    }
  });
  
  // Track iframe interactions
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe, index) => {
    // Track when iframe gets focus
    iframe.addEventListener('focus', function() {
      updateInteractionContext('iframe', iframe, index, iframe);
    });
    
    // Track clicks on iframe (if accessible)
    try {
      iframe.addEventListener('load', function() {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            iframeDoc.addEventListener('click', function() {
              updateInteractionContext('iframe', iframe, index, iframe);
            });
            iframeDoc.addEventListener('focus', function() {
              updateInteractionContext('iframe', iframe, index, iframe);
            });
          }
        } catch (error) {
          // Cross-origin iframe - can't track internal interactions
          console.log(`Cannot track interactions in iframe ${index} (cross-origin):`, error.message);
        }
      });
    } catch (error) {
      console.log(`Cannot set up interaction tracking for iframe ${index}:`, error.message);
    }
  });
  
  // Track frameset and frame interactions (legacy frame support)
  const frames = document.querySelectorAll('frame');
  frames.forEach((frame, index) => {
    // Track when frame gets focus
    frame.addEventListener('focus', function() {
      updateInteractionContext('frame', frame, index, frame);
    });
    
    // Track clicks on frame (if accessible)
    try {
      frame.addEventListener('load', function() {
        try {
          const frameDoc = frame.contentDocument || frame.contentWindow.document;
          if (frameDoc) {
            frameDoc.addEventListener('click', function() {
              updateInteractionContext('frame', frame, index, frame);
            });
            frameDoc.addEventListener('focus', function() {
              updateInteractionContext('frame', frame, index, frame);
            });
          }
        } catch (error) {
          // Cross-origin frame - can't track internal interactions
          console.log(`Cannot track interactions in frame ${index} (cross-origin):`, error.message);
        }
      });
    } catch (error) {
      console.log(`Cannot set up interaction tracking for frame ${index}:`, error.message);
    }
  });

}

function updateInteractionContext(type, target, frameIndex, frameElement) {
  lastInteractionContext = {
    type: type,
    target: target,
    frameIndex: frameIndex,
    timestamp: Date.now(),
    frameElement: frameElement
  };
  const frameType = type === 'iframe' ? 'iframe' : type === 'frame' ? 'frame' : type;
  console.log(`User interaction tracked: ${frameType}${frameIndex >= 0 ? ` (${frameType} ${frameIndex})` : ''}`);
}

// Enhanced iframe-aware text selection based on user interaction context
function getSelectionTextWithIframes() {
  let text = "";
  let selectionSource = "none";
  
  console.log(`Checking selections based on last interaction: ${lastInteractionContext.type}${lastInteractionContext.frameIndex >= 0 ? ` (${lastInteractionContext.type} ${lastInteractionContext.frameIndex})` : ''}`);
  
  // Check based on last user interaction context
  if (lastInteractionContext.type === 'input') {
    // User last interacted with an input/textarea - check it first
    const activeEl = document.activeElement;
    const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
    if (activeEl && 
        (activeElTagName === "textarea" ||
         (activeElTagName === "input" &&
          /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
        typeof activeEl.selectionStart === "number") {
      text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
      if (text) {
        selectionSource = "input";
        console.log("Found input/textarea selection (based on last interaction):", `"${text.substring(0, 50)}..."`);
        return text;
      }
    }
  } else if ((lastInteractionContext.type === 'iframe' || lastInteractionContext.type === 'frame') && lastInteractionContext.frameIndex >= 0) {
    // User last interacted with a specific iframe or frame - check it first
    const frameElements = lastInteractionContext.type === 'iframe' ? 
      document.querySelectorAll('iframe') : 
      document.querySelectorAll('frame');
    const targetFrame = frameElements[lastInteractionContext.frameIndex];
    
    if (targetFrame) {
      console.log(`Checking last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex} first`);
      try {
        const frameDoc = targetFrame.contentDocument || targetFrame.contentWindow.document;
        if (frameDoc) {
          const frameSelection = targetFrame.contentWindow.getSelection();
          if (frameSelection && frameSelection.toString().trim()) {
            text = frameSelection.toString();
            selectionSource = `${lastInteractionContext.type}-${lastInteractionContext.frameIndex}`;
            console.log(`Found selection in last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex}:`, `"${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch (error) {
        console.log(`Cannot access last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex} (likely cross-origin):`, error.message);
        // For cross-origin frames, we can't access selection - continue with fallback logic
      }
    }
  } else if (lastInteractionContext.type === 'main-document') {
    // User last interacted with main document - check it first
    if (window.getSelection) {
      const mainSelection = window.getSelection().toString().trim();
      if (mainSelection) {
        text = mainSelection;
        selectionSource = "main-document";
        console.log("Found main document selection (based on last interaction):", `"${text.substring(0, 50)}..."`);
        return text;
      }
    }
  }
  
  // Fallback: check all contexts if nothing found in last interaction context
  console.log("No selection found in last interaction context, checking all contexts...");
  
  // Check input/textarea selections
  const activeEl = document.activeElement;
  const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
  if (activeEl && 
      (activeElTagName === "textarea" ||
       (activeElTagName === "input" &&
        /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
      typeof activeEl.selectionStart === "number") {
    text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
    if (text) {
      selectionSource = "input-fallback";
      console.log("Found input/textarea selection (fallback):", `"${text.substring(0, 50)}..."`);
      return text;
    }
  }
  
  // Check all iframes and frames
  const iframes = document.querySelectorAll('iframe');
  const frames = document.querySelectorAll('frame');
  console.log(`Checking ${iframes.length} iframes and ${frames.length} frames for selection (fallback)`);
  
  // Check iframes first
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        const iframeSelection = iframe.contentWindow.getSelection();
        if (iframeSelection && iframeSelection.toString().trim()) {
          text = iframeSelection.toString();
          selectionSource = `iframe-${i}-fallback`;
          console.log(`Found selection in iframe ${i} (fallback):`, `"${text.substring(0, 50)}..."`);
          return text;
        }
      }
    } catch (error) {
      console.log(`Cannot access iframe ${i} (fallback, likely cross-origin):`, error.message);
      // Continue to next iframe rather than failing completely
    }
  }
  
  // Check frames next
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    try {
      const frameDoc = frame.contentDocument || frame.contentWindow.document;
      if (frameDoc) {
        const frameSelection = frame.contentWindow.getSelection();
        if (frameSelection && frameSelection.toString().trim()) {
          text = frameSelection.toString();
          selectionSource = `frame-${i}-fallback`;
          console.log(`Found selection in frame ${i} (fallback):`, `"${text.substring(0, 50)}..."`);
          return text;
        }
      }
    } catch (error) {
      console.log(`Cannot access frame ${i} (fallback, likely cross-origin):`, error.message);
      // Continue to next frame rather than failing completely
    }
  }
  
  // Check main document last
  if (window.getSelection) {
    const mainSelection = window.getSelection().toString().trim();
    if (mainSelection) {
      text = mainSelection;
      selectionSource = "main-document-fallback";
      console.log("Found main document selection (fallback):", `"${mainSelection.substring(0, 50)}..."`);
      return text;
    }
  }
  
  console.log(`Final selection result from ${selectionSource}:`, text ? `"${text.substring(0, 50)}..."` : "NONE");
  return text;
}

// Enhanced iframe-aware coordinate calculation for main document bubble
function selectRangeCoordsWithIframes() {
  let selection, range;
  let coordinateSource = "none";
  
  console.log(`Calculating coordinates based on last interaction: ${lastInteractionContext.type}${lastInteractionContext.iframeIndex >= 0 ? ` (iframe ${lastInteractionContext.iframeIndex})` : ''}`);
  
  // Check based on last user interaction context
  if (lastInteractionContext.type === 'input') {
    // User last interacted with an input/textarea - check it first
    const activeEl = document.activeElement;
    const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
    if (activeEl && 
        (activeElTagName === "textarea" ||
         (activeElTagName === "input" &&
          /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
        typeof activeEl.selectionStart === "number" &&
        activeEl.selectionStart !== activeEl.selectionEnd) {
      // For input/textarea, use element position
      const rect = activeEl.getBoundingClientRect();
      coordinateSource = "input";
      console.log("Using input/textarea coordinates (based on last interaction)");
      return [rect.left + 10, rect.top + rect.height + 5];
    }
  } else if ((lastInteractionContext.type === 'iframe' || lastInteractionContext.type === 'frame') && lastInteractionContext.frameIndex >= 0) {
    // User last interacted with a specific iframe or frame - check it first
    const frameElements = lastInteractionContext.type === 'iframe' ? 
      document.querySelectorAll('iframe') : 
      document.querySelectorAll('frame');
    const targetFrame = frameElements[lastInteractionContext.frameIndex];
    
    if (targetFrame) {
      console.log(`Checking coordinates for last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex} first`);
      try {
        const frameDoc = targetFrame.contentDocument || targetFrame.contentWindow.document;
        if (frameDoc) {
          const frameWindow = targetFrame.contentWindow;
          const frameSelection = frameWindow.getSelection();
          
          if (frameSelection && frameSelection.rangeCount > 0) {
            const frameRange = frameSelection.getRangeAt(0);
            if (frameRange && frameRange.startContainer && frameSelection.toString().trim()) {
              coordinateSource = `${lastInteractionContext.type}-${lastInteractionContext.frameIndex}`;
              console.log(`Found selection range in last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex}, calculating coordinates`);
              return calculateCoordinatesInFrame(frameRange, targetFrame);
            }
          }
        }
      } catch (error) {
        console.log(`Cannot access coordinates for last interacted ${lastInteractionContext.type} ${lastInteractionContext.frameIndex} (likely cross-origin):`, error.message);
        // For cross-origin frames, fall back to default positioning
        coordinateSource = `${lastInteractionContext.type}-${lastInteractionContext.frameIndex}-cross-origin-fallback`;
        console.log("Using default position due to cross-origin frame restrictions");
        return [100, 100];
      }
    }
  } else if (lastInteractionContext.type === 'main-document') {
    // User last interacted with main document - check it first
    selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
      if (range && range.startContainer && selection.toString().trim()) {
        coordinateSource = "main-document";
        console.log("Using main document selection for coordinates (based on last interaction)");
        return getSelectionCoords();
      }
    }
  }
  
  // Fallback: check all contexts if nothing found in last interaction context
  console.log("No coordinates found in last interaction context, checking all contexts...");
  
  // Check input/textarea selections
  const activeEl = document.activeElement;
  const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
  if (activeEl && 
      (activeElTagName === "textarea" ||
       (activeElTagName === "input" &&
        /^(?:text|search|password|tel|url)$/i.test(activeEl.type))) &&
      typeof activeEl.selectionStart === "number" &&
      activeEl.selectionStart !== activeEl.selectionEnd) {
    // For input/textarea, use element position
    const rect = activeEl.getBoundingClientRect();
    coordinateSource = "input-fallback";
    console.log("Using input/textarea coordinates (fallback)");
    return [rect.left + 10, rect.top + rect.height + 5];
  }
  
  // Check all iframes and frames
  const iframes = document.querySelectorAll('iframe');
  const frames = document.querySelectorAll('frame');
  console.log(`Checking ${iframes.length} iframes and ${frames.length} frames for selection coordinates (fallback)`);
  
  // Check iframes first
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        const iframeWindow = iframe.contentWindow;
        const iframeSelection = iframeWindow.getSelection();
        
        if (iframeSelection && iframeSelection.rangeCount > 0) {
          const iframeRange = iframeSelection.getRangeAt(0);
          if (iframeRange && iframeRange.startContainer && iframeSelection.toString().trim()) {
            coordinateSource = `iframe-${i}-fallback`;
            console.log(`Found selection range in iframe ${i} (fallback), calculating coordinates`);
            return calculateCoordinatesInFrame(iframeRange, iframe);
          }
        }
      }
    } catch (error) {
      console.log(`Cannot access iframe ${i} selection coordinates (fallback, likely cross-origin):`, error.message);
      // For cross-origin iframes, we can't determine selection position
      // Continue to next iframe or use default positioning
    }
  }
  
  // Check frames next
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    try {
      const frameDoc = frame.contentDocument || frame.contentWindow.document;
      if (frameDoc) {
        const frameWindow = frame.contentWindow;
        const frameSelection = frameWindow.getSelection();
        
        if (frameSelection && frameSelection.rangeCount > 0) {
          const frameRange = frameSelection.getRangeAt(0);
          if (frameRange && frameRange.startContainer && frameSelection.toString().trim()) {
            coordinateSource = `frame-${i}-fallback`;
            console.log(`Found selection range in frame ${i} (fallback), calculating coordinates`);
            return calculateCoordinatesInFrame(frameRange, frame);
          }
        }
      }
    } catch (error) {
      console.log(`Cannot access frame ${i} selection coordinates (fallback, likely cross-origin):`, error.message);
      // For cross-origin frames, we can't determine selection position
      // Continue to next frame or use default positioning
    }
  }
  
  // Check main document last
  selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
    if (range && range.startContainer && selection.toString().trim()) {
      coordinateSource = "main-document-fallback";
      console.log("Using main document selection for coordinates (fallback)");
      return getSelectionCoords();
    }
  }
  
  console.log(`No selection found in any context for coordinates, checking frame context for fallback (source: ${coordinateSource})`);
  
  // Check if user recently interacted with a frame (iframe or frame) - if so, use frame position as fallback
  if ((lastInteractionContext.type === 'iframe' || lastInteractionContext.type === 'frame') && lastInteractionContext.frameElement) {
    try {
      const frameRect = lastInteractionContext.frameElement.getBoundingClientRect();
      const fallbackX = Math.max(10, Math.min(frameRect.left + 10, window.innerWidth - 100));
      const fallbackY = Math.max(10, Math.min(frameRect.top + 10, window.innerHeight - 100));
      console.log(`Using ${lastInteractionContext.type}-based fallback coordinates: x=${fallbackX}, y=${fallbackY}`);
      return [fallbackX, fallbackY];
    } catch (error) {
      console.log(`Error getting ${lastInteractionContext.type} fallback coordinates:`, error);
    }
  }
  
  // Final fallback - use cursor position if available, otherwise use a position that's visible but not intrusive
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  
  // Use last known mouse position if it's reasonable, otherwise use default position
  const mouseX = lastMousePosition.x;
  const mouseY = lastMousePosition.y;
  
  let fallbackX, fallbackY;
  
  if (mouseX > 0 && mouseX < viewportWidth && mouseY > 0 && mouseY < viewportHeight) {
    // Use mouse position with some offset to avoid covering potential text
    fallbackX = Math.max(10, Math.min(mouseX + 10, viewportWidth - 100));
    fallbackY = Math.max(10, Math.min(mouseY + 10, viewportHeight - 100));
    console.log(`Using mouse position for fallback coordinates: x=${fallbackX}, y=${fallbackY}`);
  } else {
    // Use viewport-based position
    fallbackX = Math.min(100, viewportWidth * 0.1);
    fallbackY = Math.min(100, viewportHeight * 0.1);
    console.log(`Using viewport-based fallback coordinates: x=${fallbackX}, y=${fallbackY}`);
  }
  
  return [fallbackX, fallbackY];
}

function calculateCoordinatesInFrame(range, frameElement) {
  try {
    const frameRect = frameElement.getBoundingClientRect();
    const frameType = frameElement.tagName.toLowerCase();
    console.log(`${frameType} position: left=${frameRect.left}, top=${frameRect.top}, width=${frameRect.width}, height=${frameRect.height}`);
    
    // Check if we can access the frame content
    let frameDoc;
    try {
      frameDoc = frameElement.contentDocument || frameElement.contentWindow.document;
      if (!frameDoc) {
        throw new Error(`Cannot access ${frameType} document`);
      }
    } catch (accessError) {
      console.log(`Cannot access ${frameType} content (likely cross-origin), using ${frameType} position as fallback:`, accessError.message);
      // For cross-origin frames, position bubble near the frame but use default location
      const fallbackX = Math.max(10, Math.min(frameRect.left + 10, window.innerWidth - 100));
      const fallbackY = Math.max(10, Math.min(frameRect.top + 10, window.innerHeight - 100));
      console.log(`Cross-origin ${frameType} fallback coordinates: x=${fallbackX}, y=${fallbackY}`);
      // Return default position to avoid issues with cross-origin frame positioning
      return [100, 100];
    }
    
    const $span = $(frameDoc.createElement("span"));
    const newRange = frameDoc.createRange();
    
    const startNode = range.startContainer;
    if (startNode.nodeType === 3 && startNode.parentNode) { // TEXT_NODE
      newRange.setStart(startNode, range.startOffset);
    } else if (startNode.nodeType === 1) { // ELEMENT_NODE
      newRange.setStart(startNode, 0);
    } else {
      console.log(`Unable to create valid range in ${frameType}, using ${frameType} top-left + offset`);
      return [frameRect.left + 10, frameRect.top + 10];
    }
    
    newRange.insertNode($span[0]);
    
    // Get position relative to frame viewport
    const spanRect = $span[0].getBoundingClientRect();
    console.log(`Selection position in ${frameType}: left=${spanRect.left}, top=${spanRect.top}`);
    $span.remove();
    
    // Calculate absolute position in main document
    const absoluteX = frameRect.left + spanRect.left;
    const absoluteY = frameRect.top + spanRect.top;
    
    console.log(`Calculated absolute coordinates: x=${absoluteX}, y=${absoluteY}`);
    
    // Ensure coordinates are within reasonable bounds
    const finalX = Math.max(10, Math.min(absoluteX, window.innerWidth - 100));
    const finalY = Math.max(10, Math.min(absoluteY, window.innerHeight - 100));
    
    console.log(`Final coordinates (bounded): x=${finalX}, y=${finalY}`);
    return [finalX, finalY];
  } catch (error) {
    const frameTypeInError = frameElement.tagName.toLowerCase();
    console.error(`Error calculating ${frameTypeInError} coordinates:`, error);
    const frameRect = frameElement.getBoundingClientRect();
    const fallbackX = frameRect.left + 10;
    const fallbackY = frameRect.top + 10;
    console.log(`Using fallback coordinates: x=${fallbackX}, y=${fallbackY}`);
    return [fallbackX, fallbackY];
  }
}

export { 
  utils, 
  initializeInteractionTracking, 
  getSelectionTextWithIframes, 
  selectRangeCoordsWithIframes,
  lastInteractionContext
};
