const { merge } = require('webpack-merge');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const common = require('./webpack.common.js');

/** @type {import('webpack').Configuration} */
module.exports = merge(common(false), {
  mode: 'production',
  devtool: 'source-map',
  output: {
    filename: 'static/js/[name].[contenthash:8].js',
    chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
  },
  module: {
    rules: [
      // `*.module.css` is scoped per component (see CLAUDE.md, Component
      // folders); every other stylesheet stays global, which is what
      // `antd/dist/reset.css` in src/index.tsx relies on. The plain rule
      // excludes `.module.css` explicitly, so the two can never both match.
      {
        test: /\.module\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: { localIdentName: '[hash:base64:8]' },
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        exclude: /\.module\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
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
});
