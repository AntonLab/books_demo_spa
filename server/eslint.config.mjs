import globals from 'globals';
import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide rules and the Prettier tail
// live in the root eslint.config.base.mjs. Only the Node specifics are below.
export default createConfig(['dist'], {
  files: ['**/*.ts'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: { ...globals.node },
  },
});
