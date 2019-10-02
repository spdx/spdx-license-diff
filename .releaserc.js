module.exports = {
  branch: "master",
  plugins: [
    "@semantic-release/commit-analyzer",
    [
      "@semantic-release/exec",
      {
        verifyConditionsCmd: "yarn lint",
        verifyReleaseCmd:
          "cp app/manifest.json . && mversion ${nextRelease.version} && mv manifest.json app && git add app/manifest.json",
        prepareCmd: "yarn buildall"
      }
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogTitle: "# Changelog"
      }
    ],
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    [
      "@semantic-release/github",
      {
        assets: [
          {
            path: "packages/*.chrome.zip",
            label: "Chrome"
          },
          {
            path: "packages/*.firefox.xpi.zip",
            label: "Firefox"
          },
          {
            path: "packages/*.edge.zip",
            label: "Edge"
          },
          {
            path: "packages/*.opera.crx.zip",
            label: "Opera"
          }
        ]
      }
    ]
  ]
};
