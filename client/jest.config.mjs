/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  transform: {
    '^.+\\.[jt]sx?$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2020',
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
        // Jest runs CommonJS; swc must emit it.
        module: { type: 'commonjs' },
      },
    ],
  },
  // react-router 8 is ESM-only: its package.json is `"type": "module"` and its
  // exports map has no `require` condition, so Jest cannot require() it as
  // shipped. It must be transformed rather than ignored like the rest of
  // node_modules. antd needs no exception — it still ships CJS at lib/index.js.
  transformIgnorePatterns: ['/node_modules/(?!react-router/)'],
  moduleNameMapper: {
    // Order matters: a `@/…/x.css` import must hit the style mock, not the
    // alias. Both entries stay in step with tsconfig `paths` and webpack
    // `resolve.alias`.
    '\\.css$': '<rootDir>/src/test/styleMock.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
