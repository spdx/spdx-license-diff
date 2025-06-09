# Browser-Specific README URL Enhancement

## Overview

Enhanced the SPDX License Diff extension to use browser-specific README anchor links instead of a generic permissions section, providing users with more targeted setup instructions.

## Implementation Details

### Constants Added to `const.js`

```javascript
const readmePermissionsUrls = {
  firefox: "https://github.com/spdx/spdx-license-diff#firefox",
  chrome: "https://github.com/spdx/spdx-license-diff#chrome-edge-opera",
  fallback: "https://github.com/spdx/spdx-license-diff#granting-permissions"
};
```

### Files Modified

1. **`app/scripts/const.js`**
   - Added `readmePermissionsUrls` object with browser-specific URLs
   - Exported the new constant for use across modules

2. **`app/scripts/contentscript.js`**
   - Updated import to include `readmePermissionsUrls`
   - Modified `showPermissionErrorDialog()` to use browser-specific URLs
   - Enhanced browser detection to select appropriate README section

3. **`app/scripts/options.js`**
   - Updated import to include `readmePermissionsUrls`
   - Modified `getBrowserSpecificInstructions()` to use browser-specific URLs
   - Updated link text to be more descriptive

## Browser Detection Logic

The extension detects the browser using `navigator.userAgent.toLowerCase().includes('firefox')`:

- **Firefox**: Links to `#firefox` section with specific Firefox add-ons instructions
- **Chrome/Edge/Opera**: Links to `#chrome-edge-opera` section with unified Chromium-based browser instructions
- **Fallback**: Uses general `#granting-permissions` section if needed

## README Anchor Links

The enhancement leverages GitHub's automatic anchor link generation from markdown headings:

- `#### Firefox:` → `#firefox`
- `#### Chrome, Edge, Opera:` → `#chrome-edge-opera`
- `### Granting Permissions` → `#granting-permissions`

## Benefits

1. **Targeted Instructions**: Users get browser-specific setup guidance immediately
2. **Better UX**: No need to scroll through irrelevant browser instructions
3. **Maintainable**: Single source of truth for URLs in constants file
4. **Fallback Support**: General permissions section available as backup

## Testing

- ✅ ESLint passes with no errors
- ✅ All browsers build successfully (Chrome, Firefox, Opera, Edge)
- ✅ Browser detection logic tested and verified
- ✅ Anchor links confirmed to exist in README

## Usage

When users encounter permission errors:

1. **Firefox users** see: "View Firefox Setup Instructions" → Links to Firefox-specific section
2. **Chrome/Edge/Opera users** see: "View Chrome/Edge Setup Instructions" → Links to Chromium section
3. **All users** get targeted help instead of generic instructions

This enhancement improves the user experience by providing immediate access to relevant setup instructions for their specific browser.
