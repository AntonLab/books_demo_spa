const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const common = require('./webpack.common.js');

const base = common(false);

// Composed by hand, with no merge helper: the shared `plugins` come first and
// this file's are appended, and `output` gains the file-name patterns — the
// only two keys both files set. Everything else here is this file's alone.
/** @type {import('webpack').Configuration} */
module.exports = {
  ...base,
  mode: 'production',
  devtool: 'source-map',
  output: {
    ...base.output,
    filename: 'static/js/[name].[contenthash:8].js',
    chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
  },
  plugins: [
    ...base.plugins,
    new MiniCssExtractPlugin({
      filename: 'static/css/[name].[contenthash:8].css',
      chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
    }),
  ],
  optimization: {
    // '...' keeps webpack's default JS minimizer (SWC/Terser) alongside the CSS one.
    minimizer: ['...', new CssMinimizerPlugin()],
    // Keeps the webpack runtime out of the entry chunk so vendor hashes stay
    // stable across app-only changes.
    runtimeChunk: 'single',
    splitChunks: {
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
};
