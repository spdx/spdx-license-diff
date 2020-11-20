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
};

const urls = {
  licenses: "https://spdx.org/licenses/licenses.json",
  exceptions: "https://spdx.org/licenses/exceptions.json",
};

const newLicenseUrl = "https://tools.spdx.org/app/submit_new_license/";

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
export { filters, defaultoptions, urls, spdxkey, newLicenseUrl };
