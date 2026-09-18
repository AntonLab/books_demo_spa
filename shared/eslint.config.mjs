import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide and typed rules and the
// Prettier tail live in the root eslint.config.base.mjs. Only this package's
// directory is passed, for typed linting: it holds types and constants for
// both the browser and Node, so it declares neither one's globals, and it has
// no build output to ignore.
export default createConfig({ tsconfigRootDir: import.meta.dirname });
