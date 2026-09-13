import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide rules and the Prettier tail
// live in the root eslint.config.base.mjs. Nothing is added here: this package
// holds types and constants for both the browser and Node, so it declares
// neither one's globals, and it has no build output to ignore.
export default createConfig();
