/**
 * Shared ESLint config for both packages.
 *
 * Two constraints shape this file:
 *
 * 1. ESLint does not search ancestor directories for a flat config — running it
 *    from `client/` with no local config reports "File ignored because no
 *    matching configuration was supplied". So each package keeps its own
 *    `eslint.config.mjs`, and that file calls `createConfig` from here.
 * 2. There is no root package.json, so a bare `import '@eslint/js'` in this file
 *    cannot resolve — Node walks up to `D:/node_modules` and finds nothing. The
 *    plugins are therefore injected by the caller. Both packages pin identical
 *    versions of all five (eslint, @eslint/js, typescript-eslint,
 *    eslint-config-prettier, globals); keep them in step when upgrading.
 *
 * Only `languageOptions` genuinely differ between the packages (browser globals
 * and ES2020 vs Node globals and ES2022), so those stay in the package configs.
 */

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
 * @param deps      the plugins the caller imported, plus that package's own
 *                  build-output directory to ignore (`build` or `dist`).
 * @param packageConfigs  config objects specific to the calling package; they
 *                  are spliced in before the Prettier tail.
 */
export const createConfig = (
  { js, tseslint, prettier, ignores = [] },
  ...packageConfigs
) => [
  { ignores: ['coverage', 'node_modules', ...ignores] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], rules: sharedRules },
  ...packageConfigs,
  // Disables stylistic rules that conflict with Prettier. Must stay last, which
  // is why this helper appends it instead of leaving it to each caller.
  prettier,
];
