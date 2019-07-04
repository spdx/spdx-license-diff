var filters = {
  deprecated: "isDeprecatedLicenseId",
  OSIApproved: "isOsiApproved",
  FSFLibre: "isFsfLibre"
}
var version = "0.1.1"
var defaultoptions = {
        updateFrequency: 90,
        showBest: 10,
        minpercentage: 25,
        maxLengthDifference: 1500,
        maxworkers: 10,
        deprecated: true
}

export { filters, version, defaultoptions }
