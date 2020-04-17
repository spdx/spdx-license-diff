module.exports = {
  branch: "master",
  plugins: [
    "@semantic-release/commit-analyzer",
    [
      "@semantic-release/exec",
      {
        // verifyReleaseCmd:
        //   "cd app && yarn run mversion ${nextRelease.version} && git add manifest.json",
        prepareCmd: "yarn buildall",
      },
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogTitle: "# Changelog",
      },
    ],
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    [
      "@semantic-release/github",
      {
        assets: [
          {
            path: "packages/*.chrome.zip",
            label: "Chrome",
          },
          {
            path: "packages/*.firefox.xpi.zip",
            label: "Firefox",
          },
          {
            path: "packages/*.edge.zip",
            label: "Edge",
          },
          {
            path: "packages/*.opera.crx.zip",
            label: "Opera",
          },
        ],
      },
    ],
    [
      "semantic-release-chrome",
      {
        prepare: [
          {
            path: "dist/chrome",
            asset: "spdx-license-diff.v${version}.chrome.zip",
          },
        ],
        publish: [
          {
            asset: "spdx-license-diff.v${version}.chrome.zip",
            extensionId: "kfoadicmilbgnicoldjmccpaicejacdh",
          },
        ],
      },
    ],
    [
      "semantic-release-firefox-add-on",
      {
        verifyConditions: [
          {
            extensionId: "{95b7d495-ee73-4a03-b918-670a9d77c871}",
            targetXpi: "spdx-license-diff.v${version}.firefox.xpi.zip",
            sourceDir: "dist/firefox",
            manifestPath: "manifest.json",
          },
        ],
        prepare: [
          {
            sourceDir: "dist/firefox",
            manifestPath: "manifest.json",
          },
        ],
        publish: [
          {
            targetXpi: "spdx-license-diff.v${version}.firefox.xpi.zip",
            sourceDir: "dist/firefox",
            extensionId: "{95b7d495-ee73-4a03-b918-670a9d77c871}",
          },
        ],
      },
    ],
  ],
};
