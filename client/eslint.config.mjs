import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide rules and the Prettier tail
// live in the root eslint.config.base.mjs. Only the React and browser specifics
// are below. The plugins are imported here and passed in because the root
// config cannot resolve them itself — see the comment in that file.
export default tseslint.config(
  ...createConfig(
    { js, tseslint, prettier, ignores: ['build'] },
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
      },
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
  )
);
