const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

// These configs live in `config/`, so paths resolve against the package root
// rather than this directory.
const root = path.resolve(__dirname, '..');

/**
 * Shared configuration. `webpack.dev.js` and `webpack.prod.js` merge their own
 * overrides on top of this; nothing here is environment specific except the
 * flags derived from `isDevelopment`.
 *
 * @param {boolean} isDevelopment
 * @returns {import('webpack').Configuration}
 */
module.exports = (isDevelopment) => ({
  // Pin the context to the package root so resolution does not depend on the
  // directory webpack was invoked from.
  context: root,
  entry: path.resolve(root, 'src/index.tsx'),
  output: {
    path: path.resolve(root, 'build'),
    publicPath: '/',
    assetModuleFilename: 'static/media/[name].[hash:8][ext]',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    // Must stay in step with `paths` in tsconfig.json and
    // `moduleNameMapper` in jest.config.mjs.
    alias: { '@': path.resolve(root, 'src') },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        include: path.resolve(root, 'src'),
        loader: 'swc-loader',
        options: {
          jsc: {
            target: 'es2020',
            parser: { syntax: 'typescript', tsx: true },
            transform: {
              react: {
                runtime: 'automatic',
                development: isDevelopment,
                // Injects the Fast Refresh runtime; paired with
                // ReactRefreshWebpackPlugin in webpack.dev.js.
                refresh: isDevelopment,
              },
            },
          },
        },
      },
      {
        test: /\.(png|jpe?g|gif|webp|avif|svg)$/i,
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: 8 * 1024 } },
      },
      {
        test: /\.(woff2?|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(root, 'public/index.html'),
      minify: !isDevelopment,
    }),
    // swc strips types without checking them, so types are checked in a
    // separate process instead of failing silently.
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: path.resolve(root, 'tsconfig.json'),
      },
    }),
  ],
});
