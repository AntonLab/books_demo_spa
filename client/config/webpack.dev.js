const { merge } = require('webpack-merge');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const common = require('./webpack.common.js');

/** @type {import('webpack').Configuration} */
module.exports = merge(common(true), {
  mode: 'development',
  devtool: 'eval-cheap-module-source-map',
  output: {
    filename: 'static/js/[name].bundle.js',
    chunkFilename: 'static/js/[name].chunk.js',
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [new ReactRefreshWebpackPlugin({ overlay: false })],
  devServer: {
    port: 3000,
    hot: true,
    open: false,
    // Serve index.html for client-side routes instead of 404ing.
    historyApiFallback: true,
    // public/index.html is injected by html-webpack-plugin; everything else is
    // bundled from src/, so there is no static passthrough folder.
    static: false,
    client: {
      overlay: { errors: true, warnings: false },
    },
    // Forwards API calls to the Express server (server/src/index.ts, port 4000)
    // so the browser only ever talks to one origin in development.
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    ],
  },
});
