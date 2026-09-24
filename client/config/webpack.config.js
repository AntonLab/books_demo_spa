const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// This config lives in `config/`, so paths resolve against the package root
// rather than this directory.
const root = path.resolve(__dirname, '..');

// The `shared` workspace ships TypeScript source, not a build (ADR-0006), so
// swc-loader has to transpile it too. webpack follows the workspace link to
// the real path before it matches a rule, which is what `require.resolve`
// returns, so the include names the directory webpack will actually see.
const sharedSrc = path.dirname(require.resolve('shared'));

/**
 * One config for both builds; `--mode` on the command line picks which.
 *
 * @returns {import('webpack').Configuration}
 */
module.exports = (_env, argv) => {
  const isDevelopment = argv.mode === 'development';

  // Development injects styles for hot reload; production extracts them to
  // files.
  const styleLoader = isDevelopment
    ? 'style-loader'
    : MiniCssExtractPlugin.loader;

  return {
    mode: isDevelopment ? 'development' : 'production',
    devtool: isDevelopment ? 'eval-cheap-module-source-map' : 'source-map',
    // Pin the context to the package root so resolution does not depend on the
    // directory webpack was invoked from.
    context: root,
    entry: path.resolve(root, 'src/index.tsx'),
    output: {
      path: path.resolve(root, 'build'),
      publicPath: '/',
      filename: isDevelopment
        ? 'static/js/[name].bundle.js'
        : 'static/js/[name].[contenthash:8].js',
      chunkFilename: isDevelopment
        ? 'static/js/[name].chunk.js'
        : 'static/js/[name].[contenthash:8].chunk.js',
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
          include: [path.resolve(root, 'src'), sharedSrc],
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
                  // ReactRefreshWebpackPlugin below.
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
        // `*.module.css` is scoped per component (ADR-0009,
        // .claude/rules/client/styling.md); every other stylesheet stays
        // global, which is what
        // src/index.css, which layers antd's reset, relies on. The plain rule
        // excludes `.module.css` explicitly, so the two can never both match.
        {
          test: /\.module\.css$/i,
          use: [
            styleLoader,
            {
              loader: 'css-loader',
              options: {
                modules: {
                  // css-loader 7 turns `namedExport` on by default, which drops
                  // the default export `src/types/css.d.ts` and Jest's
                  // `styleMock.ts` both describe. `as-is` keeps camelCase
                  // class names reachable as written.
                  namedExport: false,
                  exportLocalsConvention: 'as-is',
                  localIdentName: isDevelopment
                    ? '[name]__[local]--[hash:base64:5]'
                    : '[hash:base64:8]',
                },
              },
            },
          ],
        },
        {
          test: /\.css$/i,
          exclude: /\.module\.css$/i,
          use: [styleLoader, 'css-loader'],
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
      isDevelopment
        ? new ReactRefreshWebpackPlugin({ overlay: false })
        : new MiniCssExtractPlugin({
            filename: 'static/css/[name].[contenthash:8].css',
            chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
          }),
    ],
    optimization: isDevelopment
      ? undefined
      : {
          // '...' keeps webpack's default JS minimizer (SWC/Terser) alongside
          // the CSS one.
          minimizer: ['...', new CssMinimizerPlugin()],
          // Keeps the webpack runtime out of the entry chunk so vendor hashes
          // stay stable across app-only changes.
          runtimeChunk: 'single',
          splitChunks: {
            cacheGroups: {
              vendors: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                // 'initial', not 'all': 'all' pulls every lazy page's
                // libraries (antd pickers, dnd-kit) into the first load.
                chunks: 'initial',
              },
            },
          },
        },
    devServer: {
      port: 3000,
      hot: true,
      open: false,
      // Serve index.html for client-side routes instead of 404ing.
      historyApiFallback: true,
      // public/index.html is injected by html-webpack-plugin; everything else
      // is bundled from src/, so there is no static passthrough folder.
      static: false,
      client: {
        overlay: { errors: true, warnings: false },
      },
      // Forwards API calls to the Express server (server/src/index.ts, port
      // 4000) so the browser only ever talks to one origin in development.
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      ],
    },
  };
};
