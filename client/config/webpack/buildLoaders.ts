import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import type { RuleSetRule } from 'webpack';

import type { BuildOptions } from './types.ts';

export const buildLoaders = ({
  isDevelopment,
  paths,
}: BuildOptions): RuleSetRule[] => {
  // Development injects styles for hot reload; production extracts them to
  // files.
  const styleLoader = isDevelopment
    ? 'style-loader'
    : MiniCssExtractPlugin.loader;

  const swcLoader: RuleSetRule = {
    test: /\.[jt]sx?$/,
    include: [paths.src, paths.sharedSrc],
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
            // ReactRefreshWebpackPlugin in buildPlugins.
            refresh: isDevelopment,
          },
        },
      },
    },
  };

  // `*.module.css` is scoped per component (ADR-0009,
  // .claude/rules/client/styling.md); every other stylesheet stays global,
  // which is what src/index.css, which layers antd's reset, relies on. The
  // plain rule excludes `.module.css` explicitly, so the two can never both
  // match.
  const cssModulesLoader: RuleSetRule = {
    test: /\.module\.css$/i,
    use: [
      styleLoader,
      {
        loader: 'css-loader',
        options: {
          modules: {
            // css-loader 7 turns `namedExport` on by default, which drops the
            // default export `src/types/css.d.ts` and Jest's `styleMock.ts`
            // both describe. `as-is` keeps camelCase class names reachable as
            // written.
            namedExport: false,
            exportLocalsConvention: 'as-is',
            localIdentName: isDevelopment
              ? '[name]__[local]--[hash:base64:5]'
              : '[hash:base64:8]',
          },
        },
      },
    ],
  };

  const cssLoader: RuleSetRule = {
    test: /\.css$/i,
    exclude: /\.module\.css$/i,
    use: [styleLoader, 'css-loader'],
  };

  return [swcLoader, cssModulesLoader, cssLoader];
};
