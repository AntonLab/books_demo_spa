import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuildPaths } from './types.ts';

// These files live in `config/webpack/`, so paths resolve against the package
// root rather than this directory.
const root = path.resolve(import.meta.dirname, '../..');

export const paths: BuildPaths = {
  root,
  src: path.resolve(root, 'src'),
  entry: path.resolve(root, 'src/index.tsx'),
  output: path.resolve(root, 'build'),
  html: path.resolve(root, 'public/index.html'),
  favicon: path.resolve(root, 'public/favicon.svg'),
  // The `shared` workspace ships TypeScript source, not a build (ADR-0006), so
  // swc-loader has to transpile it too. webpack follows the workspace link to
  // the real path before it matches a rule, which is what `import.meta.resolve`
  // returns, so the include names the directory webpack will actually see.
  sharedSrc: path.dirname(fileURLToPath(import.meta.resolve('shared'))),
};
