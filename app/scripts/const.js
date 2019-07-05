var filters = {
  deprecated: "isDeprecatedLicenseId",
  OSIApproved: "isOsiApproved",
  FSFLibre: "isFsfLibre"
}
var version = "0.2.0"
var defaultoptions = {
        updateFrequency: 90,
        showBest: 10,
        minpercentage: 25,
        maxLengthDifference: 1500,
        maxworkers: 10,
        filters:
          {
          deprecated: "isDeprecatedLicenseId"
          }
}

export { filters, version, defaultoptions }
