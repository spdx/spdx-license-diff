// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

const filters = {
  deprecated: "isDeprecatedLicenseId",
  OSIApproved: "isOsiApproved",
  FSFLibre: "isFsfLibre",
};

const defaultoptions = {
  updateFrequency: 90,
  showBest: 10,
  minpercentage: 25,
  diceCoefficient: 0.9,
  maxLengthDifference: 1500,
  maxworkers: 10,
  filters: {
    deprecated: "isDeprecatedLicenseId",
  },
  diffColors: {
    light: {
      insertBg: "#d4edda",
      insertText: "#155724",
      deleteBg: "#f8d7da",
      deleteText: "#721c24",
      equalText: "#333333",
      highlightBg: "#ffeb3b"
    },
    dark: {
      insertBg: "#0d4920",
      insertText: "#7dd3fc",
      deleteBg: "#5a1e1e",
      deleteText: "#fca5a5",
      equalText: "#e5e7eb",
      highlightBg: "#ffeb3b"
    }
  },
};

const baseLicenseUrl = "https://spdx.org/licenses/";
const baseScancodeUrl = "https://scancode-licensedb.aboutcode.org/";

const urls = {
  licenses: `${baseLicenseUrl}licenses.json`,
  exceptions: `${baseLicenseUrl}exceptions.json`,
  scancode_licenses: `${baseScancodeUrl}licenses-index.json`,
  scancode_exceptions: `${baseScancodeUrl}exceptions-index.json`,
};

const newLicenseUrl = "https://tools.spdx.org/app/submit_new_license/";

const readmePermissionsUrl = "https://github.com/spdx/spdx-license-diff#granting-permissions";

const readmePermissionsUrls = {
  firefox: "https://github.com/spdx/spdx-license-diff#firefox",
  chrome: "https://github.com/spdx/spdx-license-diff#chrome-edge-opera",
  fallback: readmePermissionsUrl
};

const spdxkey = {
  licenses: {
    id: "licenseId",
    text: "licenseText",
  },
  exceptions: {
    id: "licenseExceptionId",
    text: "licenseExceptionText",
  },
};

export {
  filters,
  defaultoptions,
  urls,
  spdxkey,
  newLicenseUrl,
  baseLicenseUrl,
  readmePermissionsUrl,
  readmePermissionsUrls,
};
