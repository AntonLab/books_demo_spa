/**
 * Shared ESLint config for both workspaces.
 *
 * ESLint does not search ancestor directories for a flat config — running it
 * from `client/` with no local config reports "File ignored because no
 * matching configuration was supplied". So each package keeps its own
 * `eslint.config.mjs`, and that file calls `createConfig` from here.
 *
 * The plugins are imported directly: the root package.json declares them and
 * npm hoists them into the root `node_modules`, so bare specifiers resolve
 * from this file. Only `languageOptions` genuinely differ between the packages
 * (browser globals and ES2020 vs Node globals and ES2022), so those stay in
 * the package configs.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// The repo-wide anti-patterns from CLAUDE.md, applied to both packages.
const sharedRules = {
  'no-console': 'warn',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

/**
 * @param ignores  the calling package's own build-output directory
 *                 (`build` or `dist`).
 * @param packageConfigs  config objects specific to the calling package; they
 *                 are spliced in before the Prettier tail.
 */
export const createConfig = (ignores = [], ...packageConfigs) =>
  tseslint.config(
    { ignores: ['coverage', 'node_modules', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    { files: ['**/*.{ts,tsx}'], rules: sharedRules },
    ...packageConfigs,
    // Disables stylistic rules that conflict with Prettier. Must stay last,
    // which is why this helper appends it instead of leaving it to each caller.
    prettier
  );
