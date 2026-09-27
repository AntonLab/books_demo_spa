import type { Configuration } from 'webpack';

import { buildDevServer } from './buildDevServer.ts';
import { buildLoaders } from './buildLoaders.ts';
import { buildOptimization } from './buildOptimization.ts';
import { buildPlugins } from './buildPlugins.ts';
import { buildResolve } from './buildResolve.ts';
import type { BuildOptions } from './types.ts';

export const buildWebpackConfig = (options: BuildOptions): Configuration => {
  const { isDevelopment, paths } = options;
  const hash = isDevelopment ? '' : '.[contenthash:8]';

  return {
    devtool: isDevelopment ? 'eval-cheap-module-source-map' : 'source-map',
    // Pin the context to the package root so resolution does not depend on the
    // directory webpack was invoked from.
    context: paths.root,
    entry: paths.entry,
    output: {
      path: paths.output,
      publicPath: '/',
      filename: `static/js/[name]${hash}.js`,
      chunkFilename: `static/js/[name]${hash}.chunk.js`,
      clean: true,
    },
    resolve: buildResolve(paths),
    module: { rules: buildLoaders(options) },
    plugins: buildPlugins(options),
    optimization: isDevelopment ? undefined : buildOptimization(),
    devServer: buildDevServer(),
  };
};
