const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

// These configs live in `config/`, so paths resolve against the package root
// rather than this directory.
const root = path.resolve(__dirname, '..');

// The `shared` workspace ships TypeScript source, not a build (ADR-0006), so
// swc-loader has to transpile it too. webpack follows the workspace link to
// the real path before it matches a rule, which is what `require.resolve`
// returns, so the include names the directory webpack will actually see.
const sharedSrc = path.dirname(require.resolve('shared'));

/**
 * Shared configuration. `webpack.dev.js` and `webpack.prod.js` spread it into
 * a plain object and append their own plugins; nothing here is environment
 * specific except what is derived from `isDevelopment`.
 *
 * @param {boolean} isDevelopment
 * @returns {import('webpack').Configuration}
 */
module.exports = (isDevelopment) => {
  // Development injects styles for hot reload; production extracts them to
  // files, which webpack.prod.js adds MiniCssExtractPlugin for.
  const styleLoader = isDevelopment
    ? 'style-loader'
    : MiniCssExtractPlugin.loader;

  return {
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
        // `*.module.css` is scoped per component (see CLAUDE.md, Component
        // folders); every other stylesheet stays global, which is what
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
    ],
  };
};
