import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { createConfig } from '../eslint.config.base.mjs';

const tests = ['**/*.test.{ts,tsx}', 'src/test/**'];

// no-restricted-imports takes one option set per file, and a later block
// replaces an earlier one, so each block below repeats what it inherits.
const noReactDefault = {
  name: 'react',
  importNames: ['default'],
  message:
    'Import the names you need; the automatic JSX runtime needs no React.',
};
// Every call goes component → src/queries → src/api → request(). ApiError is
// the one value a component needs, for `instanceof` on a failed query.
const noApiValues = {
  regex: '^@/api/(?!client(/client)?$)',
  allowTypeImports: true,
  message: 'Components reach the API through src/queries hooks.',
};
const below = (...levels) => ({
  group: levels,
  message: 'Imports flow downward only (client/CLAUDE.md, Atomic Design).',
});
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', { paths: [noReactDefault], patterns }],
});

// The shared ignores, recommended sets, repo-wide rules and the Prettier tail
// live in the root eslint.config.base.mjs. Only the React and browser
// specifics are below.
export default createConfig(
  { ignores: ['build'], tsconfigRootDir: import.meta.dirname },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Components are arrow functions typed with `FC` (see CLAUDE.md). The
      // autofix converts the declaration form; the `FC` annotation is manual.
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      ...restrictImports(),
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      // A fetch that skips request() loses the session cookie and CSRF token.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Call the API through request().' },
      ],
    },
  },
  {
    files: ['src/api/client.ts', 'src/api/client/client.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  // Jest's CSS mapping and the CSS Modules declaration need a default export.
  {
    files: ['src/test/styleMock.ts', 'src/types/css.d.ts'],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    files: ['src/components/templates/**', 'src/pages/**'],
    ignores: tests,
    rules: restrictImports(noApiValues),
  },
  {
    files: ['src/components/organisms/**'],
    ignores: tests,
    rules: restrictImports(
      noApiValues,
      below('@/components/templates/**', '@/pages/**')
    ),
  },
  {
    files: ['src/components/molecules/**'],
    ignores: tests,
    rules: restrictImports(
      noApiValues,
      below(
        '@/components/organisms/**',
        '@/components/templates/**',
        '@/pages/**',
        '@/queries/**',
        '@/store/**'
      )
    ),
  },
  // Webpack config files are CommonJS and run in Node, not the browser.
  {
    files: ['config/webpack.*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
