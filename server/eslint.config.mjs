import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Enforce the repo anti-patterns from CLAUDE.md.
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Disable stylistic rules that conflict with Prettier. Must stay last.
  prettier
);
