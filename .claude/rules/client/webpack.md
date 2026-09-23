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
- `webpack.common.js` exports `(isDevelopment) => Configuration` and holds
  every loader rule. `dev`/`prod` spread it and extend by hand; there is no
  merge helper, because `plugins` and `output` are the only keys both add to.
- **`swc-loader` strips types without checking them.**
  `fork-ts-checker-webpack-plugin` type-checks in parallel; errors fail the
  build and show in the dev overlay.
- **The loader `include` names `shared`'s real path** via
  `require.resolve('shared')`: `shared` ships TypeScript, and webpack follows
  the workspace link before matching a rule.
- **Fast Refresh needs both** `@pmmmwh/react-refresh-webpack-plugin` and swc's
  `transform.react.refresh`; with one alone it silently breaks.
- Dev: `historyApiFallback`, `static: false` (assets are imported from `src/`),
  `/api` proxied to `http://localhost:4000` so the browser sees one origin.
- Prod: `[contenthash]` names, `runtimeChunk: 'single'` and a `vendors` cache
  group so vendor hashes survive app-only changes.
- `tsconfig.json` enables `allowImportingTsExtensions` for `shared`, whose
  relative imports end in `.ts` because Node loads it too; this package's own
  imports stay extensionless.
