// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  webpack: (config, { dev: _dev, vendor: _vendor }) => {
    config.plugins.unshift( //  unshift to run plugin first
      new CopyPlugin({
        patterns: [
          {
            from: '../LICENSE',
            to: config.target
          },
          {
            from: '../oss-attribution/attribution.txt',
            to: config.target
          }
        ]
      })
    );

    return config
  }
}
