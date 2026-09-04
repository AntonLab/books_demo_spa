import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { createConfig } from '../eslint.config.base.mjs';

// The shared ignores, recommended sets, repo-wide rules and the Prettier tail
// live in the root eslint.config.base.mjs. Only the Node specifics are below.
// The plugins are imported here and passed in because the root config cannot
// resolve them itself — see the comment in that file.
export default tseslint.config(
  ...createConfig(
    { js, tseslint, prettier, ignores: ['dist'] },
    {
      files: ['**/*.ts'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node },
      },
    }
  )
);
