# Client — books_demo_spa

React 19 + TypeScript single-page app, bundled with webpack 5.

## Status

Early scaffold, but the build toolchain is real: webpack 5 (dev server with React
Fast Refresh, hashed production build), TypeScript, ESLint, and Prettier are all
wired up. There is still **no test runner** — do not document or invoke `npm test`
until one is added.

Available scripts:

- `npm run dev` — webpack dev server on <http://localhost:3000> (HMR + Fast Refresh)
- `npm run build` — production bundle into `build/` (git-ignored)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format` / `npm run format:check` — Prettier (root `.prettierrc.json`)

## Layout

- `public/index.html` — HTML template consumed by `html-webpack-plugin`
- `src/index.tsx` — app entry, mounts `<App />` into `#root`
- `src/App.tsx` — root component (default export)
- `src/api/` — API client and typed requests _(empty — to be created)_
- `src/components/` — reusable UI components _(empty)_
- `src/pages/` — page-level components _(empty)_
- `src/store/` — client state _(empty)_
- `src/types/` — shared TypeScript types _(empty)_
- `config/webpack.common.js` — shared config, exported as `(isDevelopment) => Configuration`
- `config/webpack.dev.js` / `config/webpack.prod.js` — env overlays, merged via `webpack-merge`
- `tsconfig.json` — strict, `noEmit`, `jsx: react-jsx`,
  `moduleResolution: Bundler`, target `ES2020`
- `eslint.config.mjs` — ESLint flat config (TypeScript + React + hooks + jsx-a11y)

## Webpack

The three config files live in `config/` and resolve every path against the
package root (`const root = path.resolve(__dirname, '..')`, plus `context: root`),
so they behave the same wherever webpack is invoked from.

Entry is `src/index.tsx`; output goes to `build/` (cleaned on each build).

- **Transpile** — `swc-loader` (`@swc/core`) over `src/`, `jsc.target: es2020`,
  automatic JSX runtime. swc **strips types without checking them**, so
  `fork-ts-checker-webpack-plugin` type-checks in a parallel process against
  `tsconfig.json`; type errors fail the build and surface in the dev overlay.
- **Dev** (`config/webpack.dev.js`) — port 3000, `historyApiFallback` for client-side
  routes, `static: false` (there is no static passthrough folder — assets are
  imported from `src/` and go through the bundler). Fast Refresh comes from
  `@pmmmwh/react-refresh-webpack-plugin` plus swc's `transform.react.refresh`;
  **both must stay enabled together** or refresh silently breaks.
  `/api` is proxied to `http://localhost:4000` (the Express server), so the
  browser only ever talks to one origin in development.
- **Prod** (`config/webpack.prod.js`) — `[contenthash]` filenames under `static/js`,
  `static/css`, `static/media`; `runtimeChunk: 'single'` and a `vendors`
  cache group so vendor hashes stay stable across app-only changes; CSS
  extracted via `mini-css-extract-plugin` and minified by `css-minimizer-webpack-plugin`.
  Source maps are emitted for both builds.
- **Assets** — images under 8 KB inline as data URIs, larger ones and fonts emit
  to `static/media`. CSS is handled by `style-loader` in dev and extracted in prod.

The webpack configs are CommonJS (`require`), unlike everything in `src/`;
`eslint.config.mjs` has a dedicated block giving them Node globals and turning
off `@typescript-eslint/no-require-imports`.

## TypeScript

- Strict mode is enabled (`tsconfig.json`). Avoid `any`; prefer `unknown` or a
  proper type, and add a comment if `any` is truly unavoidable.
  `@typescript-eslint/no-explicit-any` is enforced as an error.
- `tsconfig` is `noEmit` — webpack produces the build; `tsc` only checks types.

## Conventions

- Functional components with hooks only — no class components.
- When a test runner is added, co-locate tests next to the component
  (`Button.tsx` → `Button.test.tsx`). No test runner is configured yet.
- Do not mutate state directly — use setter functions or immutable updates.

Note: the entry files use default exports (`export default App`). Pick an export
convention when real components are added and apply it consistently.
