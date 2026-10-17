import globals from 'globals';
import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide and typed rules and the
// Prettier tail live in the root eslint.config.base.mjs. Only the Node
// specifics are below.
export default createConfig(
  { ignores: ['dist'], tsconfigRootDir: import.meta.dirname },
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // A sync call (fs, zlib, crypto) blocks the event loop for every request
  // in flight. Tests may use them; startup code disables this per line with
  // the reason.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/**/*.testkit.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression:matches([callee.name=/Sync$/], [callee.property.name=/Sync$/])',
          message:
            'Use the async API: a sync call blocks every request in flight.',
        },
      ],
    },
  }
);
