# Client — books_demo_spa

React 19 + TypeScript single-page app, bundled with webpack 5.

## Status

No longer a scaffold: the client has a working main page, header (nav, search,
three auth states), four auth modals, and a search page, backed by Redux
Toolkit and talking to the real `/api`. The build toolchain and test runner
are both real: webpack 5 (dev server with React Fast Refresh, hashed
production build), TypeScript, ESLint, Prettier and Jest are all wired up.

Available scripts:

- `npm run dev` — webpack dev server on <http://localhost:3000> (HMR + Fast Refresh)
- `npm run build` — production bundle into `build/` (git-ignored)
- `npm test` / `npm run test:watch` — Jest + React Testing Library (jsdom), transformed by `@swc/jest`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format` / `npm run format:check` — Prettier (root `.prettierrc.json`)

## Layout

- `public/index.html` — HTML template consumed by `html-webpack-plugin`
- `src/index.tsx` — app entry, mounts `<App />` into `#root`
- `src/App.tsx` — root component (default export)
- `src/api/` — `client.ts` (the shared `request<T>()` fetch wrapper: prefixes
  every path with `/api`, sends `credentials: 'include'`, and turns non-2xx
  responses into a typed `ApiError`), plus `auth.ts` and `books.ts`, the
  per-resource typed calls built on it.
- `src/components/`
  - `auth/` — `AuthModals` (reads `activeModal` from `authSlice` and renders
    only that one, so only one modal is ever mounted at a time), plus
    `LoginModal`, `RegisterModal`, `ResetRequestModal`, `ResetConfirmModal`.
  - `books/` — `BookCard` and the presentational `BookList` (takes
    `items`/`status`/`error` as props so both `MainPage` and `SearchPage` can
    feed it from their own slice).
  - `layout/` — `AppHeader` (nav menu, `SearchBar`, and the three auth
    states — signed out / loading / signed in) and `SearchBar`.
- `src/pages/` — `MainPage`, `SearchPage`, `MyBooksPage`, `ProfilePage`,
  `SeriesPage`, `NotFoundPage`, and `ResetPasswordRoute` (reads the reset
  token off `/reset-password?token=...` and opens the confirm modal — not in
  the original spec's file list, added because the spec routed
  `/reset-password` to the confirm modal without naming the component that
  reads the token).
- `src/store/` — `index.ts` (`createAppStore`, the `store` singleton,
  `RootState`/`AppStore`/`AppDispatch`), `hooks.ts` (pre-typed
  `useAppDispatch`/`useAppSelector`), and `authSlice.ts` / `booksSlice.ts` /
  `searchSlice.ts`.
- `src/types/` — `user.ts`, `book.ts`, `api.ts` (the shared `ListResponse<T>`
  and `ApiErrorBody` shapes) and `css.d.ts`. Dates cross the wire as ISO
  strings, not `Date`, throughout — the server types them as `Date` in
  process but they arrive as JSON strings.
- `src/test/` — `setup.ts` (jsdom polyfills, see Testing below),
  `renderWithProviders.tsx` (wraps a component in the Redux `Provider` and a
  `MemoryRouter`, returns the store), `httpFixtures.ts` (minimal
  `Response`-shaped fixtures, since jsdom has no `fetch`/`Response`) and
  `styleMock.ts` (the CSS-import mock `jest.config.mjs` maps `\.css$` to).
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

## Testing

`npm test` runs Jest against jsdom, transformed by `@swc/jest` — the same
`@swc/core` webpack uses, so tests and bundle share one transform and no
Babel config exists. Tests are co-located (`Button.tsx` → `Button.test.tsx`).

The `test` script is not plain `jest`:

```
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

This is load-bearing, not incidental. `react-router` 8 is ESM-only — its
`package.json` is `"type": "module"` with no `require` condition — and its
package root re-exports server-runtime code (cookie signing, etc.) that uses
`import.meta`, which Jest's default CJS loader cannot parse.
`--experimental-vm-modules` is what lets Jest load that code at all.

- **`jest.config.mjs` carries
  `transformIgnorePatterns: ['/node_modules/(?!react-router/)']`.** Jest
  ignores all of `node_modules` for transformation by default; `react-router`
  is carved out of that ignore list so it gets transformed like first-party
  code, because it ships ESM only. Removing this line breaks every test that
  touches routing. `antd` needs no such exception — it still ships CJS.
- **`src/test/setup.ts` polyfills four things jsdom does not implement,**
  each confirmed necessary by removing it and watching tests fail:
  - `matchMedia` and `ResizeObserver` — antd's `Modal`, `Menu` and other
    responsive helpers call them on mount.
  - `TextEncoder` / `TextDecoder` — react-router's server-runtime builds a
    `TextEncoder` at module scope, so merely importing `react-router` throws
    before any test body runs unless this is polyfilled globally.
  - `MessageChannel` — antd's `Form` (via `@rc-component/form`'s field
    registration/watch mechanism) constructs one unconditionally on every
    `Form.Item` mount to schedule a macrotask, so no antd `Form` — none of
    the four auth modals included — can mount in a test without it.
- **`fetch` is stubbed per test** (`window.fetch = jest.fn()`); there is no
  MSW. `src/test/renderWithProviders.tsx` wraps a component in the Redux
  `Provider` and a `MemoryRouter` and returns the store so a test can assert
  on dispatched state directly.

## Conventions

- Functional components with hooks only — no class components.
- Do not mutate state directly — use setter functions or immutable updates.
- **Named exports everywhere, except `src/index.tsx` and `src/App.tsx`.**
  Those two are entry points consumed positionally — `index.tsx` mounts
  `App`'s default export and is never itself imported — so a default export
  costs nothing there and matches the common convention for an app root.
  Every component, hook, slice and type elsewhere is a named export.
- The client talks to the API only through `src/api/client.ts`. Its
  `request<T>()` prefixes every path with `/api` and sends
  `credentials: 'include'` — without that, the browser withholds the
  httpOnly `sid` cookie and every authenticated call fails as a 401.
