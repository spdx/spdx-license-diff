# Making edits

## Entryfiles (bundles)

There are two kinds of entryfiles.

 1. All js-files in the root of the `./app/scripts` directory
 2. All css-,scss- and less-files in the root of the `./app/styles` directory

The main logic is in `/app/scripts/background.js`, `/app/scripts/contentscript.js` and `app/scripts/worker.js`.

## Adding dependencies

1. Use yarn or npm to add the dependency. e.g,. `$ yarn add underscore`
2. Import the library where needed. e.g., `import _ from 'underscore'`

## Building from source

### Installation of Prerequisites

 1. Install [node](https://nodejs.org/en/download/).
 2. Use yarn (preferred):`$ yarn install` or npm: `$ npm install`

### Building and Loading

 1. Build the extension
  - Production:
      - Chrome: Run `$ yarn run build chrome`
      - Firefox: Run `$ yarn run build firefox`
      - Opera: Run `$ yarn run build opera`
      - Edge: Run `$ yarn run build edge`
  - Development:
      - Chrome: Run `$ yarn run dev chrome`
      - Firefox: Run `$ yarn run dev firefox`
      - Opera: Run `$ yarn run dev opera`
      - Edge: Run `$ yarn run dev edge`

 2. Load the extension:
  - Chrome:
      - Load `dist/chrome` directory using Load Unpacked.

![Extensions menu](https://developer.chrome.com/static/images/get_started/load_extension.png)
  - Firefox:
      - Enter "about:debugging" in the URL bar
      - Click "Load Temporary Add-on"
      - Load `dist/firefox/manifest.json`

[![Firefox Addons](https://img.youtube.com/vi/cer9EUKegG4/0.jpg)](https://www.youtube.com/watch?v=cer9EUKegG4)

## Environment

The build tool also defines a variable named `process.env.NODE_ENV` in your scripts.
