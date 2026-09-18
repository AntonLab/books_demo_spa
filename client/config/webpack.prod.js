const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const common = require('./webpack.common.js');

const base = common(false);

// Composed by hand, with no merge helper: the shared `module.rules` and
// `plugins` come first and this file's are appended, and `output` gains the
// file-name patterns — the only three keys both files set. Everything else
// here is this file's alone.
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
  module: {
    ...base.module,
    rules: [
      ...base.module.rules,
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
