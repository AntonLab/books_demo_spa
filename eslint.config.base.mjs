/**
 * Shared ESLint config for every workspace.
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
 *
 * TypeScript files are linted with type information: the block for .ts and
 * .tsx files turns on the project service, which reads the calling package's
 * own tsconfig.json — hence `tsconfigRootDir`, which each package passes as
 * its own directory. JavaScript files (webpack configs, jest.config.mjs, the
 * eslint configs themselves) stay outside that block and are never parsed
 * with types.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// The repo-wide anti-patterns from CLAUDE.md, applied to every package.
const sharedRules = {
  'no-console': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  // noUncheckedIndexedAccess types a miss as undefined; application code
  // handles it. Tests may assert it away (the override below).
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

// A few typed rules rather than the whole recommendedTypeChecked preset: the
// promise mistakes the untyped rules cannot see, and a switch over an
// `as const` union (the repo's enum) that misses a member. node:test's `test`,
// `describe`, `it` and `suite` return promises the runner itself tracks, so
// they are exempt — typescript-eslint's documented form for that API.
const typedRules = {
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/no-floating-promises': [
    'error',
    {
      allowForKnownSafeCalls: [
        {
          from: 'package',
          package: 'node:test',
          name: ['test', 'describe', 'it', 'suite'],
        },
      ],
    },
  ],
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
};

/**
 * @param {{ ignores?: string[], tsconfigRootDir: string }} options
 *   `ignores`: the calling package's own build-output directories (`build`
 *   or `dist`). `tsconfigRootDir`: the calling package's directory — pass
 *   `import.meta.dirname` — where the project service finds its tsconfig.
 * @param {...object} packageConfigs  config objects specific to the calling
 *   package; they are spliced in before the Prettier tail.
 */
export const createConfig = (
  { ignores = [], tsconfigRootDir },
  ...packageConfigs
) => {
  if (typeof tsconfigRootDir !== 'string') {
    throw new Error(
      'createConfig needs tsconfigRootDir: pass import.meta.dirname from the package eslint.config.mjs'
    );
  }

  return defineConfig(
    { ignores: ['coverage', 'node_modules', ...ignores] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: { ...sharedRules, ...typedRules },
    },
    {
      files: [
        '**/*.{spec,test}.{ts,tsx}',
        '**/*.testkit.ts',
        'src/test/**/*.{ts,tsx}',
      ],
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
    ...packageConfigs,
    // Disables stylistic rules that conflict with Prettier. Must stay last,
    // which is why this helper appends it instead of leaving it to each caller.
    prettier
  );
};
