// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)
const webpack = require('webpack')

module.exports = {
  webpack: (config, { dev, vendor }) => {
    // unnecessary with proper import of modules
    // config.plugins.push(
    //   new webpack.ProvidePlugin({
    //     $: 'jquery',
    //     jQuery: 'jquery'
    //   }),
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
    // )

    return config
  }
}
