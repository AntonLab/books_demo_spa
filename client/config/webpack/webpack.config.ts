import type { Configuration } from 'webpack';

import { buildWebpackConfig } from './buildWebpackConfig.ts';
import { paths } from './paths.ts';

/**
 * One config for both builds; `--mode` on the command line picks which.
 * webpack-cli reads the default export, so this file is the one exception to
 * the named-exports rule.
 */
const webpackConfig = (
  _env: Record<string, unknown>,
  argv: { mode?: Configuration['mode'] }
): Configuration =>
  buildWebpackConfig({ isDevelopment: argv.mode === 'development', paths });

export default webpackConfig;
