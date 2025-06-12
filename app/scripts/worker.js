// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
import { baseLicenseUrl, urls, spdxkey } from "./const.js";
import { makeDiff, cleanupSemantic, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from "@sanity/diff-match-patch";
import * as fastestlevenshtein from "fastest-levenshtein";
import dice from "fast-dice-coefficient";

/**
 * Convert a diff array into a pretty HTML report with dark mode support and variable highlighting.
 * @param {Array} diffs Array of diff tuples.
 * @param {Object} templateMatch Optional template match data for variable highlighting.
 * @param {string} selection The original selection text for variable position mapping.
 * @return {string} HTML representation.
 */
function diff_prettyHtml(diffs, templateMatch, selection) {
  console.log("=== diff_prettyHtml called ===");
  console.log("Template match data:", templateMatch);
  console.log("Selection length:", selection ? selection.length : "undefined");
  
  const html = [];
  const pattern_amp = /&/g;
  const pattern_lt = /</g;
  const pattern_gt = />/g;
  const pattern_para = /\n/g;
  
  // Build a map of variable positions if template match data is available
  let variablePositions = [];
  if (templateMatch && templateMatch.variables && selection) {
    console.log("Building variable positions from", templateMatch.variables.length, "variables");
    for (let i = 0; i < templateMatch.variables.length; i++) {
      const variable = templateMatch.variables[i];
      if (variable.capturedText && variable.capturedText.trim()) {
        const capturedText = variable.capturedText.trim();
        const position = selection.indexOf(capturedText);
        if (position !== -1) {
          variablePositions.push({
            start: position,
            end: position + capturedText.length,
            variableName: variable.name || "Variable " + (i + 1),
            variableIndex: i,
            capturedText: capturedText
          });
          console.log(`Variable ${i}: "${capturedText}" at position ${position}-${position + capturedText.length}`);
        } else {
          console.log(`Variable ${i}: "${capturedText}" not found in selection`);
        }
      } else {
        console.log(`Variable ${i}: no captured text`);
      }
    }
    // Sort by position to handle overlaps correctly
    variablePositions.sort((a, b) => a.start - b.start);
    console.log("Final variable positions:", variablePositions.length);
  } else {
    console.log("No template match data or selection available for variable highlighting");
  }
  
  let currentPosition = 0;
  
  for (let x = 0; x < diffs.length; x++) {
    const op = diffs[x][0]; // Operation (insert, delete, equal)
    const data = diffs[x][1]; // Text of change.
    let text;
    
    // For EQUAL sections, check if they contain variable text that should be highlighted
    if (op === DIFF_EQUAL && variablePositions.length > 0) {
      // Apply variable highlighting to the original text first, then escape HTML
      text = wrapVariableTextInDiffWithEscaping(data, currentPosition, variablePositions);
    } else {
      // Normal HTML escaping for non-highlighted text
      text = data.replace(pattern_amp, '&amp;')
                 .replace(pattern_lt, '&lt;')
                 .replace(pattern_gt, '&gt;')
                 .replace(pattern_para, '&para;<br>');
    }
    
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins class="diff-insert">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del class="diff-delete">' + text + '</del>';
        // For DELETE sections, we don't update position since they're not in the selection
        currentPosition -= data.length;
        break;
      case DIFF_EQUAL:
        html[x] = '<span class="diff-equal">' + text + '</span>';
        break;
    }
    
    // Update position counter for next iteration (only for non-DELETE operations)
    currentPosition += data.length;
  }
  
  return '<div class="diff-content">' + html.join('') + '</div>';
}

/**
 * Wrap variable text segments with highlighting spans and apply HTML escaping properly.
 * @param {string} originalText The original unescaped text to process.
 * @param {number} textStartPos The starting position of this text segment in the overall selection.
 * @param {Array} variablePositions Array of variable position objects.
 * @return {string} HTML-escaped text with variable spans wrapped.
 */
function wrapVariableTextInDiffWithEscaping(originalText, textStartPos, variablePositions) {
  console.log(`wrapVariableTextInDiffWithEscaping called: textStartPos=${textStartPos}, originalText="${originalText.substring(0, 50).replace(/\n/g, '\\n')}..."`);
  
  const pattern_amp = /&/g;
  const pattern_lt = /</g;
  const pattern_gt = />/g;
  const pattern_para = /\n/g;
  
  // Find variables that overlap with this text segment
  let segmentVariables = [];
  for (const varPos of variablePositions) {
    const segmentStart = textStartPos;
    const segmentEnd = textStartPos + originalText.length;
    
    // Check if this variable overlaps with the current text segment
    if (varPos.start < segmentEnd && varPos.end > segmentStart) {
      const relativeStart = Math.max(0, varPos.start - segmentStart);
      const relativeEnd = Math.min(originalText.length, varPos.end - segmentStart);
      
      if (relativeStart < relativeEnd) {
        segmentVariables.push({
          ...varPos,
          relativeStart: relativeStart,
          relativeEnd: relativeEnd
        });
        console.log(`Variable ${varPos.variableIndex} ("${varPos.capturedText.replace(/\n/g, '\\n')}") overlaps at ${relativeStart}-${relativeEnd}`);
      }
    }
  }
  
  // If no variables in this segment, just escape and return
  if (segmentVariables.length === 0) {
    return originalText.replace(pattern_amp, '&amp;')
                      .replace(pattern_lt, '&lt;')
                      .replace(pattern_gt, '&gt;')
                      .replace(pattern_para, '&para;<br>');
  }
  
  // Sort by relative position to handle them in order
  segmentVariables.sort((a, b) => a.relativeStart - b.relativeStart);
  
  let result = '';
  let lastEnd = 0;
  
  // Process each variable in this segment
  for (const segVar of segmentVariables) {
    // Add text before this variable (HTML escaped)
    if (segVar.relativeStart > lastEnd) {
      const beforeText = originalText.substring(lastEnd, segVar.relativeStart);
      result += beforeText.replace(pattern_amp, '&amp;')
                         .replace(pattern_lt, '&lt;')
                         .replace(pattern_gt, '&gt;')
                         .replace(pattern_para, '&para;<br>');
    }
    
    // Add the variable text with highlighting span
    const variableText = originalText.substring(segVar.relativeStart, segVar.relativeEnd);
    const escapedVariableText = variableText.replace(pattern_amp, '&amp;')
                                           .replace(pattern_lt, '&lt;')
                                           .replace(pattern_gt, '&gt;')
                                           .replace(pattern_para, '&para;<br>');
    
    result += '<span class="diff-variable-highlight" data-variable-name="' + 
              escapeHtmlAttributes(segVar.variableName) + '" data-variable-index="' + segVar.variableIndex + '">' + 
              escapedVariableText + '</span>';
    
    console.log(`Added highlight span for variable ${segVar.variableIndex}: "${variableText.replace(/\n/g, '\\n')}"`);
    
    lastEnd = segVar.relativeEnd;
  }
  
  // Add any remaining text after the last variable (HTML escaped)
  if (lastEnd < originalText.length) {
    const afterText = originalText.substring(lastEnd);
    result += afterText.replace(pattern_amp, '&amp;')
                      .replace(pattern_lt, '&lt;')
                      .replace(pattern_gt, '&gt;')
                      .replace(pattern_para, '&para;<br>');
  }
  
  return result;
}

/**
 * Escape HTML attributes to prevent XSS attacks
 */
function escapeHtmlAttributes(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

var id;

self.onmessage = function (event) {
  id = event.data.id;
  switch (event.data.command) {
    case "process":
      // 'license':spdxid,'hash':hash, 'selection': selection
      break;
    case "updatelicenselist":
      getSPDXlist(event.data.enableSpdxSource, event.data.enableScancodeSource);
      break;
    case "compare":
      var spdxid = event.data.spdxid;
      var itemdict = event.data.itemdict;
      var maxLengthDifference = event.data.maxLengthDifference;
      var diceCoefficientOption = event.data.diceCoefficient;
      var total = event.data.total;
      var tabId = event.data.tabId;
      var background = event.data.background;
      var type = event.data.type;
      compareitem(
        event.data.selection,
        spdxid,
        itemdict,
        tabId,
        type,
        maxLengthDifference,
        diceCoefficientOption,
        total,
        background
      );
      break;
    case "sortlicenses":
      tabId = event.data.tabId;
      sortlicenses(event.data.licenses, tabId);
      break;
    case "generateDiff": {
      spdxid = event.data.spdxid;
      const text = event.data.license;
      var record = event.data.record;
      var templateMatch = event.data.templateMatch; // Get template match data
      tabId = event.data.tabId;
      generateDiff(event.data.selection, spdxid, text, record, tabId, templateMatch);
      break;
    }
    default:
  }
};
// load files array with list of files to download
async function getSPDXlist(enableSpdxSource = true, enableScancodeSource = true) {
  // Fetch SPDX and Scancode license/exception lists, then merge them
  const typesToMerge = [
    { spdx: 'licenses', scancode: 'scancode_licenses' },
    { spdx: 'exceptions', scancode: 'scancode_exceptions' }
  ];

  for (const { spdx, scancode } of typesToMerge) {
    try {
      // Only fetch enabled sources
      const fetches = [];
      if (enableSpdxSource) fetches.push(getJSON(urls[spdx])); else fetches.push(Promise.resolve({ [spdx]: [] }));
      if (enableScancodeSource) fetches.push(getJSON(urls[scancode])); else fetches.push(Promise.resolve({ [scancode]: [] }));
      const [spdxResult, scancodeResult] = await Promise.all(fetches);
      let spdxList = spdxResult[spdx] || [];
      let scancodeList = scancodeResult[scancode] || [];
      // Add source property
      spdxList = spdxList.map(item => ({ ...item, source: 'SPDX' }));
      scancodeList = scancodeList.map(item => ({ ...item, source: 'Scancode' }));
      // Merge by id (licenseId for SPDX, key for Scancode)
      const merged = {};
      for (const item of spdxList) {
        const id = item.licenseId || item.licenseExceptionId;
        if (id) merged[id] = item;
      }
      for (const item of scancodeList) {
        const id = item.key || item.license_exception_key;
        if (id) {
          if (merged[id]) {
            // Merge details if needed, or keep both sources
            merged[id].scancode = item;
          } else {
            merged[id] = item;
          }
        }
      }
      const mergedList = Object.values(merged);
      const total = mergedList.length;
      let index = 0;
      postMessage({
        command: "progressbarmax",
        value: total,
        stage: `Updating merged ${spdx}`,
        id: id,
        reset: true,
      });
      postMessage({
        command: "savelicenselist",
        value: { [spdx]: mergedList },
        id: id,
        type: spdx,
      });
      for (const item of mergedList) {
        postMessage({
          command: "saveitem",
          data: item,
          id: id,
          type: spdx,
        });
        postMessage({
          command: "progressbarmax",
          value: total,
          stage: `Updating merged ${spdx}`,
          id: id,
          reset: true,
        });
        postMessage({
          command: "progressbarvalue",
          value: index++,
          id: id,
        });
      }
      console.log(`All merged ${spdx} downloads completed`);
      postMessage({ command: "updatedone", id: id, type: spdx });
    } catch (err) {
      console.log("Error: " + err.message);
      if (err.message.includes("Network Error") || err.message.includes("Failed to fetch") || err.message.includes("403") || err.message.includes("ERR_BLOCKED_BY_CLIENT")) {
        postMessage({
          command: "updateerror",
          error: `Permission or network error accessing data sources. Please check that you have granted permission to access the required URLs in your browser extension settings.`,
          id: id,
          type: spdx
        });
      } else {
        postMessage({
          command: "updateerror",
          error: `Failed to update ${spdx}: ${err.message}`,
          id: id,
          type: spdx
        });
      }
    }
  }
}

function compareitem(
  selection,
  spdxid,
  item,
  tabId,
  type,
  maxLengthDifference = 1000,
  diceCoefficientOption = 0.9,
  total = 0,
  background = false
) {
  if (!background) {
    postMessage({
      command: "progressbarmax",
      value: total,
      stage: "Comparing items",
      id: id,
      reset: true,
      tabId: tabId,
    });
  }
  var result = {};
  var count2 = selection.length;
  // console.log(id, "Processing selection of " + count2 + " chars.");
  var data = item[spdxkey[type].text];
  var templateData = item.standardLicenseTemplate;
  var count = data.length;
  var locre = data.match(/\r?\n/g);
  var loc = locre ? locre.length : 0;
  var locre2 = selection.match(/\r?\n/g);
  var loc2 = locre2 ? locre2.length : 0;
  var difference = Math.abs(count2 - count);
  var locdiff = Math.abs(loc2 - loc);
  var maxLength = Math.max(count, count2);
  var templateMatch =
    typeof templateData !== "undefined" ? processTemplate(templateData) : false;
  var distance = 100;
  var diceCoefficient = 0;
  var percentage;
  if (templateMatch) {
    var regex = new RegExp("^" + cleanText(templateMatch.matchRegex) + "$", "i");
    var matchResult = cleanText(selection).match(regex);
    if (matchResult) {
      distance = 0;
      percentage = 100;
      console.log(tabId, id, spdxid + " - Template Match");
      
      // Template-structure-based parsing approach
      console.log(tabId, id, spdxid + " - Template matched, parsing using template structure to identify separators");
      console.log(tabId, id, spdxid + " - Original template:", templateData.substring(0, 100) + "...");
      
      // Parse template to identify variable blocks and non-template separators
      // First, preprocess the template to remove optional section markers
      var templateText = templateData;
      
      // Remove optional section markers - these are template processing directives, not separators
      var optionalRegex = /<<beginOptional>>([\s\S]*?)<<endOptional>>/g;
      var processedTemplate = templateText.replace(optionalRegex, "$1");
      
      console.log(tabId, id, spdxid + " - Processed template (optional markers removed):", processedTemplate.substring(0, 100) + "...");
      
      templateText = processedTemplate;
      var varPattern = /<<var;[^>]+>>/g;
      var templateParts = [];
      var lastIndex = 0;
      var match;
      
      console.log(tabId, id, spdxid + " - STEP 1: Parsing template structure");
      
      // Find all variables and the text between them
      while ((match = varPattern.exec(templateText)) != null) {
        // Add non-template text before this variable (if any)
        if (match.index > lastIndex) {
          var nonTemplateText = templateText.substring(lastIndex, match.index);
          if (nonTemplateText.trim()) {
            templateParts.push({ type: 'separator', text: nonTemplateText });
            console.log(tabId, id, spdxid + " - Found separator: '" + nonTemplateText.substring(0, 30).replace(/\n/g, "\\n") + "...'");
          } else {
            console.log(tabId, id, spdxid + " - Skipped whitespace-only separator: '" + nonTemplateText.replace(/\n/g, "\\n") + "'");
          }
        }
        
        // Add this variable
        var currentVariableIndex = templateParts.filter(p => p.type === 'variable').length;
        templateParts.push({ type: 'variable', text: match[0], index: currentVariableIndex });
        console.log(tabId, id, spdxid + " - Found variable " + currentVariableIndex + ": " + match[0].substring(0, 50) + "...");
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining non-template text
      if (lastIndex < templateText.length) {
        var finalRemainingText = templateText.substring(lastIndex);
        if (finalRemainingText.trim()) {
          templateParts.push({ type: 'separator', text: finalRemainingText });
          console.log(tabId, id, spdxid + " - Found final separator: '" + finalRemainingText.substring(0, 30).replace(/\n/g, "\\n") + "...'");
        }
      }
      
      console.log(tabId, id, spdxid + " - STEP 1 COMPLETE: Template structure parsed into " + templateParts.length + " parts");
      for (var i = 0; i < templateParts.length; i++) {
        var structurePart = templateParts[i];
        if (structurePart.type === 'variable') {
          console.log(tabId, id, spdxid + " - Part " + i + ": VARIABLE (index " + structurePart.index + ")");
        } else {
          console.log(tabId, id, spdxid + " - Part " + i + ": SEPARATOR '" + structurePart.text.substring(0, 20).replace(/\n/g, "\\n") + "...'");
        }
      }
      
      console.log(tabId, id, spdxid + " - STEP 2: Splitting selection using separators");
      console.log(tabId, id, spdxid + " - Original selection:", cleanText(selection).substring(0, 100) + "...");
      
      // Split selection using non-template text as separators
      var selectionParts = [cleanText(selection)];
      var currentSelectionIndex = 0;
      
      for (var partIdx = 0; partIdx < templateParts.length; partIdx++) {
        var separatorPart = templateParts[partIdx];
        if (separatorPart.type === 'separator' && currentSelectionIndex < selectionParts.length) {
          var currentSelection = selectionParts[currentSelectionIndex];
          var separatorText = cleanText(separatorPart.text);
          
          console.log(tabId, id, spdxid + " - Looking for separator: '" + separatorText.substring(0, 30) + "...' in selection part " + currentSelectionIndex);
          
          // Find this separator in the current selection part
          var separatorIndex = currentSelection.indexOf(separatorText.substring(0, Math.min(50, separatorText.length)));
          if (separatorIndex > -1) {
            // Split the selection at this separator
            var beforeSeparator = currentSelection.substring(0, separatorIndex);
            var afterSeparator = currentSelection.substring(separatorIndex + separatorText.length);
            
            selectionParts[currentSelectionIndex] = beforeSeparator;
            selectionParts.push(afterSeparator);
            currentSelectionIndex++;
            
            console.log(tabId, id, spdxid + " - Split selection at separator: '" + separatorText.substring(0, 30) + "...'");
            console.log(tabId, id, spdxid + " - Before separator: '" + beforeSeparator.substring(0, 50) + "...'");
            console.log(tabId, id, spdxid + " - After separator: '" + afterSeparator.substring(0, 50) + "...'");
          } else {
            console.log(tabId, id, spdxid + " - Separator not found in current selection part");
          }
        }
      }
      
      console.log(tabId, id, spdxid + " - STEP 2 COMPLETE: Selection split into " + selectionParts.length + " parts");
      for (var j = 0; j < selectionParts.length; j++) {
        console.log(tabId, id, spdxid + " - Selection part " + j + ": '" + selectionParts[j].substring(0, 50) + "...'");
      }
      
      console.log(tabId, id, spdxid + " - STEP 3: Sequential variable matching");
      
      // Now apply sequential variable matching to each selection part that should contain variables
      var variableIndex = 0;
      var partIndex = 0;
      
      for (var tPartIdx = 0; tPartIdx < templateParts.length; tPartIdx++) {
        var templatePart = templateParts[tPartIdx];
        
        if (templatePart.type === 'variable') {
          // This template part contains a variable - process it from current selection part
          if (partIndex < selectionParts.length) {
            var selectionPart = selectionParts[partIndex].trim();
            var variable = templateMatch.variables[variableIndex];
            
            if (variable && variable.match && selectionPart.length > 0) {
              console.log(tabId, id, spdxid + " - Processing variable '" + (variable.name || "unnamed") + "' in selection part " + partIndex);
              console.log(tabId, id, spdxid + " - Variable pattern: '" + variable.match.substring(0, 30) + "...'");
              console.log(tabId, id, spdxid + " - Selection text: '" + selectionPart.substring(0, 50) + "...'");
              
              // Apply the variable pattern to the beginning of this selection part
              var variableRegex = new RegExp("^(" + variable.match + ")", "i");
              var variableMatch = selectionPart.match(variableRegex);
              
              if (variableMatch) {
                console.log(tabId, id, spdxid + " - Found " + (variableMatch.length - 1) + " capture groups");
                
                // Find the longest match from multiple capture groups
                var longestMatch = "";
                for (var groupIdx = 1; groupIdx < variableMatch.length; groupIdx++) {
                  if (variableMatch[groupIdx] && variableMatch[groupIdx].length > longestMatch.length) {
                    longestMatch = variableMatch[groupIdx];
                    console.log(tabId, id, spdxid + " - Group " + groupIdx + ": '" + variableMatch[groupIdx] + "' (length: " + variableMatch[groupIdx].length + ")");
                  }
                }
                
                var capturedText = longestMatch || variableMatch[0];
                variable.capturedText = capturedText.trim();
                
                console.log(tabId, id, spdxid + " - Variable '" + (variable.name || "unnamed") + "' captured: '" + capturedText + "'");
                
                // Remove captured text from this selection part for next variable in same part
                var capturedRemainingText = selectionPart.substring(variableMatch[0].length).trim();
                selectionParts[partIndex] = capturedRemainingText;
                console.log(tabId, id, spdxid + " - Remaining text after capture: '" + capturedRemainingText.substring(0, 50) + "...'");
              } else {
                console.log(tabId, id, spdxid + " - Variable '" + (variable.name || "unnamed") + "' no match found");
              }
            } else {
              console.log(tabId, id, spdxid + " - Skipping variable '" + (variable ? variable.name || "unnamed" : "undefined") + "' - empty selection part");
            }
            
            variableIndex++;
          }
        } else if (templatePart.type === 'separator') {
          console.log(tabId, id, spdxid + " - Moving to next selection part after separator");
          // Move to the next selection part after separator
          partIndex++;
        }
      }
      
      console.log(tabId, id, spdxid + " - STEP 3 COMPLETE: Variable matching finished");
      console.log(tabId, id, spdxid + " - Final captured variables:");
      for (var varIdx = 0; varIdx < templateMatch.variables.length; varIdx++) {
        var finalVar = templateMatch.variables[varIdx];
        console.log(tabId, id, spdxid + " - " + (finalVar.name || "unnamed") + ": '" + (finalVar.capturedText || "[not captured]") + "'");
      }
    }
  }
  diceCoefficient = dice(cleanText(data), cleanText(selection));
  if (
    (difference <= maxLength &&
      (maxLengthDifference === 0 || difference < maxLengthDifference)) ||
    diceCoefficient >= diceCoefficientOption
  ) {
    if (distance !== 0) {
      // allow process if no match
      distance = fastestlevenshtein.distance(
        cleanText(data),
        cleanText(selection)
      );
      percentage = (((maxLength - distance) / maxLength) * 100).toFixed(1);
      console.log(
        tabId,
        id,
        spdxid +
          " - Levenshtein Distance (clean): " +
          distance +
          " (" +
          percentage +
          "%)" +
          " Length Difference: " +
          difference +
          " LOC Diff:" +
          locdiff +
          " Dice-Coefficient:" +
          diceCoefficient
      );
    }
    result = {
      distance: distance,
      text: data,
      percentage: percentage,
      details: item,
      dice: diceCoefficient.toFixed(2),
      templateMatch: templateMatch
      // patterns: result.patterns
    };
  } else {
    console.log(
      tabId,
      id,
      spdxid +
        " - Length Difference: " +
        difference +
        " LOC Diff:" +
        locdiff +
        " Dice-Coefficient:" +
        diceCoefficient
    );
    result = {
      distance: difference,
      text: data,
      percentage: 0,
      details: null, // details is unneeded since these will always be end of the list
      dice: diceCoefficient.toFixed(2),
      templateMatch: templateMatch
      // patterns: result.patterns
    };
  }
  if (!background) {
    postMessage({
      command: "comparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId,
    });
  } else {
    postMessage({
      command: "backgroundcomparenext",
      spdxid: spdxid,
      result: result,
      id: id,
      tabId: tabId,
    });
  }
  // postMessage({"command": "store", "spdxid":spdxid, "raw":data, "hash":hash, "processed":result.data, "patterns": result.patterns});
}

function sortlicenses(licenses, tabId) {
  postMessage({
    command: "progressbarmax",
    value: Object.keys(licenses).length,
    stage: "Sorting licenses",
    id: id,
    reset: true,
    tabId: tabId,
  });
  console.log(
    tabId,
    id,
    "Sorting " + Object.keys(licenses).length + " licenses"
  );
  var sortable = [];
  for (var license in licenses) {
    sortable.push({
      spdxid: license,
      distance: licenses[license].distance,
      difftext: licenses[license].text,
      percentage: licenses[license].percentage,
      details: licenses[license].details,
      dice: licenses[license].dice,
      templateMatch: licenses[license].templateMatch,
    });
    postMessage({ command: "next", spdxid: license, id: id, tabId: tabId });
  }
  sortable.sort(function (a, b) {
    return b.percentage - a.percentage;
  });
  postMessage({ command: "sortdone", result: sortable, id: id, tabId: tabId });
}

function generateDiff(selection, spdxid, license, record, tabId, templateMatch) {
  // postMessage({"command": "progressbarmax","value": total, "stage":"Generating Diff","id":id});
  var result = {};
  var data = license;
  // Note: @sanity/diff-match-patch doesn't have timeout option like original
  var msStart = new Date().getTime();
  var textDiff = makeDiff(data, selection); // produces diff array
  cleanupSemantic(textDiff); // semantic cleanup
  var msEnd = new Date().getTime();
  result = { html: diff_prettyHtml(textDiff, templateMatch, selection), time: msEnd - msStart };
  console.log("%s %s: %s diff:%o", tabId, id, spdxid, result);
  postMessage({
    command: "diffnext",
    spdxid: spdxid,
    result: result,
    record: record,
    id: id,
    tabId: tabId,
  });
}

function cleanText(str, removeNewLines = true) {
  // this will replace unicode spaces, collapse spaces and then replace newlines and trim
  if (removeNewLines) {
    return replaceSmartQuotes(collapseSpaces(removeLineNumbers(str)))
      .replace(/(\r\n|\n|\r)/gm, " ")
      .trim();
  } else {
    return replaceSmartQuotes(collapseSpaces(removeLineNumbers(str))).trim();
  }
}

function collapseSpaces(str) {
  return str.replace(/\s+/g, " ");
}

function replaceSmartQuotes(str) {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

function removeLineNumbers(str, percentage = 0.8) {
  // remove line numbering if we detect at least 80% of total lines of code
  var locre = str.match(/\r?\n/g);
  var loc = locre ? locre.length : 0;
  var linenumbersre = str.match(/((\n|^)\s*)\d+/g);
  var linenumbercount = linenumbersre ? linenumbersre.length : 0;
  if (linenumbercount / loc > percentage) {
    // TODO: Replace .8 with option
    str = str.replace(/((\n|^)\s*)\d+/g, "$2");
  }
  return str;
}
function escapeRegex(str) {
  // eslint-disable-next-line no-useless-escape
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"); // need to escape regex characters
}
function processTemplate(str) {
  // processes a template and returns a dictionary
  // matchRegex contains the regex for matching
  // patterns lists all replacement match regex for each variable
  // variables returns all variables discovered the template
  var varPattern = /<<var;(.+?)>>/g;
  var result = {
    matchRegex: escapeRegex(str),
    patterns: [],
    variables: [],
  };
  var match;
  var variables = [];
  var patterns = [];
  var matchPattern = "";
  while ((match = varPattern.exec(str)) != null) {
    var variable = {};
    var variablestring = match[1].split(";");
    // process any variables inside the string for potential later use
    for (var i = 0; i < variablestring.length; i++) {
      var keyvalue = variablestring[i].split("=");
      variable[
        String(keyvalue[0]).replace(/^["']/, "").replace(/["']$/, "")
      ] = String(keyvalue[1]).replace(/^["']/, "").replace(/["']$/, "");
    }
    try {
      matchPattern = variable.match;
      patterns.push(matchPattern);
      result.matchRegex = result.matchRegex.replace(
        escapeRegex(match[0]),
        "(" + matchPattern + ")"
      );
    } catch (e) {
      console.log("Bad regex detected in " + match + " error: " + e);
    }
    variables.push(variable);
  }
  result.variables = variables;
  result.patterns = patterns;
  // handle optional tags
  var optionalRegex = /<<beginOptional>>(?:\s*)((?!<<beginOptional>)(?:[\S\s](?!<beginOptional>))*?)(?:\s*)<<endOptional>>/g;
  while (result.matchRegex.match(optionalRegex)) {
    result.matchRegex = result.matchRegex.replace(
      optionalRegex,
      "(\\s?$1\\s?)?"
    );
  }
  // corner case covering boundary between optionalRegex/matchRegex
  result.matchRegex = result.matchRegex.replace(/\\s+\?\)\?+ /g, "\\s?)?\\s*");
  // corner case covering boundary matchRegex and .
  result.matchRegex = result.matchRegex.replace(/\) \\\./g, ")\\s*\\.");
  return result;
}

// promisfy gets
const get = function (url) {
  return new Promise((resolve, reject) => {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.onload = function () {
      if (x.status === 200) {
        resolve(x.response);
      } else {
        reject(Error(x.statusText));
      }
    };
    x.onerror = function () {
      reject(Error("Network Error"));
    };
    x.send();
  });
};

const getJSON = async function (url) {
  return get(url).then(JSON.parse);
};
