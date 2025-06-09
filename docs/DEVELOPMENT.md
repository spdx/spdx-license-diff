# Development Guide

This guide provides comprehensive instructions for developers working on the SPDX License Diff extension.

## Architecture Overview

The SPDX License Diff extension uses Manifest V3 architecture with the following components:

- **Service Worker** (`/app/scripts/background.js`) - Main extension logic and permission handling
- **Content Script** (`/app/scripts/contentscript.js`) - Webpage integration and UI injection
- **Web Workers** (`/app/scripts/worker.js`) - SPDX license processing via offscreen document
- **Offscreen Document** (`/app/scripts/offscreen.js`) - Worker lifecycle and message forwarding
- **Options Page** (`/app/scripts/options.js`) - Extension configuration and permission management

## Prerequisites

1. Install [Node.js](https://nodejs.org/en/download/) (latest LTS version recommended)
2. Install dependencies using yarn (preferred) or npm:
   ```bash
   yarn install
   # or
   npm install
   ```

## Project Structure

### Entry Files (Bundles)

There are two kinds of entry files:

1. **JavaScript files** in the root of `./app/scripts` directory
2. **CSS/SCSS/Less files** in the root of `./app/styles` directory

### Key Files

- `app/scripts/background.js` - Service worker with permission management
- `app/scripts/contentscript.js` - Content script with error handling
- `app/scripts/worker.js` - Web worker for SPDX processing
- `app/scripts/offscreen.js` - Worker lifecycle management
- `app/scripts/const.js` - Shared constants and browser-specific URLs
- `app/scripts/options.js` - Options page with permission UI

## Building from Source

### Development Build

For development with hot reloading and source maps:

```bash
# Chrome
yarn run dev chrome

# Firefox  
yarn run dev firefox

# Opera
yarn run dev opera

# Edge
yarn run dev edge
```

### Production Build

For optimized production builds:

```bash
# Chrome
yarn run build chrome

# Firefox
yarn run build firefox

# Opera
yarn run build opera

# Edge
yarn run build edge

# Build all browsers
yarn test
```

## Loading the Extension

### Chrome/Edge/Opera

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" 
3. Click "Load unpacked"
4. Select the `dist/chrome` (or `dist/edge`, `dist/opera`) directory

![Extensions menu](https://developer.chrome.com/static/images/get_started/load_extension.png)

### Firefox

1. Navigate to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Select `dist/firefox/manifest.json`

[![Firefox Addons](https://img.youtube.com/vi/cer9EUKegG4/0.jpg)](https://www.youtube.com/watch?v=cer9EUKegG4)

## Adding Dependencies

1. Add the dependency using your package manager:
   ```bash
   yarn add package-name
   # or
   npm install package-name
   ```

2. Import the library where needed:
   ```javascript
   import packageName from 'package-name';
   ```

## Key Features Implementation

### Permission Management System

The extension implements comprehensive permission handling for SPDX.org access:

- **No automatic permission requests** during startup or background operations
- **User-initiated requests only** for explicit user actions
- **Graceful degradation** when permissions are denied
- **Browser-specific guidance** for Chrome/Firefox differences

### Cross-Browser Compatibility

```javascript
// Cross-browser API compatibility pattern
const api = typeof browser !== "undefined" ? browser : chrome;
```

### Error Handling

The extension includes robust error handling for:
- Permission denied scenarios
- Network failures
- Cross-browser API differences
- Worker communication errors

## Testing

For comprehensive testing instructions, see [`docs/TESTING.md`](TESTING.md).

Quick verification:
```bash
# Lint and build all browsers
yarn test

# Run just linting
yarn lint
```

## Environment Variables

The build tool defines `process.env.NODE_ENV` in your scripts for environment-specific behavior.

## Contributing

For contribution guidelines, see [`CONTRIBUTING.md`](../CONTRIBUTING.md) in the project root.
