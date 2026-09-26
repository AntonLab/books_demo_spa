---
paths:
  - 'client/config/**'
  - 'client/tsconfig.json'
  - 'client/eslint.config.mjs'
---

# Webpack and build config

- The configs resolve every path against the package root (`context: root`),
  so they behave the same wherever webpack runs from. They are CommonJS;
  `eslint.config.mjs` gives them Node globals and allows `require`.
- One `webpack.config.js` exports `(env, argv) => Configuration`; the `dev`
  and `build` scripts pass `--mode`, and every difference between the two
  builds branches on `argv.mode`. A run without `--mode` builds production.
- **`swc-loader` strips types without checking them**, and nothing in the
  build checks them either: a type error still bundles. `npm run typecheck`
  (and CI's `typecheck` job) is the check.
- **The loader `include` names `shared`'s real path** via
  `require.resolve('shared')`: `shared` ships TypeScript, and webpack follows
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
