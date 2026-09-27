import type { Configuration } from 'webpack';

import type { BuildPaths } from './types.ts';

export const buildResolve = (paths: BuildPaths): Configuration['resolve'] => ({
  extensions: ['.tsx', '.ts', '.jsx', '.js'],
  // Must stay in step with `paths` in tsconfig.json and `moduleNameMapper` in
  // jest.config.mjs.
  alias: { '@': paths.src },
});
