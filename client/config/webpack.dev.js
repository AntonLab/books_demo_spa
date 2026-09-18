const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const common = require('./webpack.common.js');

const base = common(true);

// Composed by hand, with no merge helper: the shared `module.rules` and
// `plugins` come first and this file's are appended, and `output` gains the
// file-name patterns — the only three keys both files set. Everything else
// here is this file's alone.
/** @type {import('webpack').Configuration} */
module.exports = {
  ...base,
  mode: 'development',
  devtool: 'eval-cheap-module-source-map',
  output: {
    ...base.output,
    filename: 'static/js/[name].bundle.js',
    chunkFilename: 'static/js/[name].chunk.js',
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
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: { localIdentName: '[name]__[local]--[hash:base64:5]' },
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        exclude: /\.module\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [...base.plugins, new ReactRefreshWebpackPlugin({ overlay: false })],
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
};
