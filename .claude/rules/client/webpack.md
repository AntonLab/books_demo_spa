---
paths:
  - 'client/config/**'
  - 'client/tsconfig.json'
  - 'client/eslint.config.mjs'
---

# Webpack and build config

- The config is TypeScript in `config/webpack/`, one `build*` part per
  section (loaders, plugins, resolve, dev server, optimization) plus `paths.ts`
  and `types.ts`. webpack-cli `import()`s `webpack.config.ts` and Node strips
  its types, so there is no ts-node or tsx: only erasable syntax, relative
  imports ending in `.ts`, and `"type": "module"` in `client/package.json`
  (without it Node warns `MODULE_TYPELESS_PACKAGE_JSON` and parses twice).
- `config/tsconfig.json` is a second, Node-typed program (no DOM,
  `NodeNext`); `npm run typecheck` runs it after the browser one.
  `eslint.config.mjs` keeps the React and browser rules off `config/`.
- **`webpack.config.ts` is the one default export** in the package, because
  webpack-cli reads `.default`; every part exports by name.
- `paths.ts` resolves every path against the package root
  (`import.meta.dirname`), and the config pins `context` to it, so webpack
  behaves the same wherever it runs from.
- `webpack.config.ts` exports `(env, argv) => Configuration`; the `dev` and
  `build` scripts pass `--mode`, and every difference between the two builds
  branches on `isDevelopment`, derived from `argv.mode`. A run without
  `--mode` builds production.
- **`swc-loader` strips types without checking them**, and nothing in the
  build checks them either: a type error still bundles. `npm run typecheck`
  (and CI's `typecheck` job) is the check.
- **The loader `include` names `shared`'s real path** via
  `import.meta.resolve('shared')`: `shared` ships TypeScript, and webpack follows
  the workspace link before matching a rule.
- **Fast Refresh needs both** `@pmmmwh/react-refresh-webpack-plugin` and swc's
  `transform.react.refresh`; with one alone it silently breaks.
- Dev: `historyApiFallback`, `static: false` (everything is bundled from `src/`,
  which imports no image or font, so there is no asset rule; html-webpack-plugin's
  `favicon` option emits `public/favicon.svg`),
  `/api` proxied to `http://localhost:4000` so the browser sees one origin.
- Prod: `[contenthash]` names, `runtimeChunk: 'single'` and a `vendors` cache
  group so vendor hashes survive app-only changes. The group takes
  `chunks: 'initial'`: with `'all'` it also swallows the libraries only lazy
  pages import, and the first load grows by about half.
- `tsconfig.json` enables `allowImportingTsExtensions` for `shared`, whose
  relative imports end in `.ts` because Node loads it too; this package's own
  imports stay extensionless.
