// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  webpack: (config, { dev, vendor }) => {
    config.plugins.unshift( //  unshift to run plugin first
      new CopyPlugin([
        {
          from: '../LICENSE',
          to: config.target
        },
        {
          from: '../oss-attribution/attribution.txt',
          to: config.target
        }
      ])

      // unnecessary to add actual dependencies with proper import of modules
    //   new webpack.ProvidePlugin({
    //     $: 'jquery',
    //     jQuery: 'jquery'
    //   new webpack.ProvidePlugin({
    //     _: 'underscore',
    //     underscore: 'underscore'
    //   }),
    //   new webpack.ProvidePlugin({
    //     Levenshtein: 'fast-levenshtein'
    //   }),
    //   new webpack.ProvidePlugin({
    //     DiffMatchPatch: 'diff-match-patch'
    //   }),
    //   new webpack.ProvidePlugin({
    //     md5: 'md5-jkmyers'
    //   })
    )

    return config
  }
}
