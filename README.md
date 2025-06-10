# SPDX License Diff

[![Actions Status](https://github.com/spdx/spdx-license-diff/workflows/semantic-release/badge.svg)](https://github.com/spdx/spdx-license-diff/actions)[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

Diff selected text against SPDX licenses and find the best match. This extension creates a browser button in Chrome, Firefox, Edge, and Opera to compare any selected text against the SPDX [License List](https://spdx.org/licenses/).

**✨ Now supports Manifest V3** for enhanced security and performance in modern browsers with full cross-browser compatibility.

The SPDX License List is a list of commonly found licenses and exceptions used in free and open source and other collaborative software or documentation. The purpose of the SPDX License List is to enable easy and efficient identification of such licenses and exceptions in an SPDX document, in source files or elsewhere. The SPDX License List includes a standardized short identifier, full name, vetted license text including matching guidelines markup as appropriate, and a canonical permanent URL for each license and exception.

![spdx-diff in action](images/spdx-diff.gif)

# Installation

Get it from the:
- [Chrome Web Store](https://chrome.google.com/webstore/detail/spdx-diff/kfoadicmilbgnicoldjmccpaicejacdh) (Chrome, Edge)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/spdx-license-diff) (Firefox)
- Opera Add-ons (Opera - via Chrome Web Store or sideloading)

## Browser Compatibility

This extension is fully compatible with:
- **Chrome** (Manifest V3 with offscreen documents)
- **Firefox** (Manifest V3 with worker fallback)
- **Microsoft Edge** (Manifest V3 with offscreen documents)
- **Opera** (Manifest V3 with offscreen documents)

## Permissions

The extension requires access to SPDX.org to download the latest license data. When you first use the extension, you may be asked to grant permission to access SPDX.org. This is required for the extension to function properly.

### Granting Permissions

If you see a "Permission denied" error, please grant access to SPDX.org:

#### Chrome, Edge, Opera:
1. Go to your browser's Extensions page: `chrome://extensions/`
2. Find "SPDX License Diff" and click "Details"
3. Click "Site access" or "Permissions"
4. Allow access to `spdx.org`

#### Firefox:
1. Go to Firefox Add-ons: `about:addons`
2. Find "SPDX License Diff" and click on it
3. Go to the "Permissions" tab
4. Enable "Access your data for sites in the spdx.org domain"

**Note**: Due to browser security models, host permissions cannot be granted automatically. The extension will display helpful error messages with specific instructions for your browser when permissions are needed.

### Troubleshooting

- **Permission errors**: The extension will show browser-specific instructions when SPDX.org access is needed
- **Update failures**: Check that SPDX.org permissions are granted in your browser settings
- **Need help?**: Visit the [official repository](https://github.com/spdx/spdx-license-diff/) for support and issue reporting

# Contributing

[Come help out!](CONTRIBUTING.md)

# Credits

- Scaffolding from [webextension-toolbox](https://github.com/HaNdTriX/webextension-toolbox)
- See [third-party licenses](oss-attribution/attribution.txt) for production attribution.

# License

We are initially [GPL-3.0-or-later](LICENSE) but will move to Apache-2.0 as soon as we [refactor the stackoverflow code](https://github.com/spdx/spdx-license-diff/issues/7).
