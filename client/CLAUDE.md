# Client — books_demo_spa

React 19 + TypeScript single-page app, bundled with webpack 5.

## Atomic Design

UI components follow Brad Frost's Atomic Design levels, extended with
**quarks** (design tokens) below atoms.

`src/components/` is grouped by level, not by feature: the former `auth/`,
`books/` and `layout/` directories are gone, replaced by `molecules/` and
`organisms/`. A level with nothing in it has no directory — create one when
the first component needs it rather than leaving empty folders around.

| Level     | Lives in                    | What it is                                          | Today                                                                                                                                            |
| --------- | --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quarks    | `src/theme/tokens.ts`       | Colors, spacing, typography, radii, shadows, widths | antd 6's defaults, plus one custom quark — `appSearchBarMaxWidth`. `appTheme` carries them into `<ConfigProvider theme={appTheme}>` in `App.tsx` |
| Atoms     | antd 6                      | Button, Input, Typography, Icon                     | Use antd directly; write an atom only where antd has no equivalent                                                                               |
| Molecules | `src/components/molecules/` | A few atoms doing one job                           | `SearchBar`                                                                                                                                      |
| Organisms | `src/components/organisms/` | A standalone section; may hold state and dispatch   | `AppHeader`, `BookList`, `BookCard`, `ErrorBoundary`, `AuthModals` + 4 modals                                                                    |
| Templates | `src/components/templates/` | Page skeleton, placeholder content                  | `App` — the composition root and the antd `Layout` shell around every route                                                                      |
| Pages     | `src/pages/`                | A template filled with real data and routed         | The seven routed pages                                                                                                                           |

### Rules

1. **Imports flow downward only** — quarks → atoms → molecules → organisms →
   templates → pages. A molecule never imports an organism. **One exemption:
   a page may import another page**, because composing a route out of an
   existing one is cheaper than extracting a shared organism for a single
   caller — `ResetPasswordRoute` renders `MainPage` under the reset-confirm
   modal. Nothing below the page level may import a page. Enforced at review
   time only: no lint rule checks this.
2. **Check before creating.** Search `src/components/` first. Never add a
   second component that does what an existing one already does.
3. **No business logic below organisms.** Atoms and molecules take props and
   render. `useAppSelector`, `useAppDispatch`, `src/api` calls and `src/queries`
   hooks belong in organisms and pages.
4. **Tokens, not hardcoded values.** No arbitrary hex colours or pixel values
   in components — read antd's tokens (`theme.useToken()`), or add the value to
   the `ConfigProvider` theme so it becomes a real quark. antd's set has gaps
   — it sizes controls by height and has no width token at all — so sometimes
   the quark has to be invented. Declare it in `src/theme/tokens.ts`: give it
   an `app` prefix, since antd flattens every token into one object and an
   unprefixed name could collide with one a later antd version adds, and
   augment antd's `AliasToken` in the same file so `theme.useToken()` types it
   at every call site. `src/theme/tokens.test.tsx` pins the pipeline that makes
   this work: antd derives its own tokens over ours, and nothing in its docs
   promises an unknown key survives that.
5. **Do not wrap antd for its own sake.** A passthrough around `<Button>` is
   over-atomization; wrap only to fix an awkward API or to fix a variant used
   in three or more places.
6. **Prototype complex work on a throwaway page** before wiring it into a
   template or a routed page.
7. **One folder per component**, PascalCase, tests beside the code — see
   Component folders below.

### Component folders

Every component is a self-contained directory — under `src/components/`
and under `src/pages/` alike, since a page is a component too. Tests,
styles and types sit beside the component, never in a mirrored global
folder. A component folder lives inside its Atomic Design level, a page
folder directly under `src/pages/`:

```text
src/components/organisms/BookCard/
├── BookCard.tsx        # logic and implementation
├── BookCard.test.tsx   # Jest + React Testing Library
├── BookCard.types.ts   # interfaces, when they are complex enough to move
├── BookCard.css        # scoped styles (or .module.css)
└── index.ts            # barrel: the folder's public API

src/pages/MainPage/
├── MainPage.tsx
├── MainPage.test.tsx
└── index.ts
```

- **PascalCase** for the folder, every file inside it, and the types.
- **Named exports in the component file.** `index.ts` exists only to
  re-export the public API and holds no logic of its own.
- **The rest of the app imports the folder, never a file inside it** —
  `import { BookCard } from '@/components/organisms/BookCard'`, not
  `.../BookCard/BookCard`. The barrel is what makes the internals private.
- `.types.ts` and `.css` are optional. Add them when there is something to
  put in them; do not create empty scaffolding.
- A page becoming a folder does not change what the `lazy()` calls in
  `App.tsx` name: `@/pages/MainPage` resolves to the barrel, which
  re-exports the same named `MainPage`, so the `default` remap is untouched.

All 18 (11 components, 7 pages) follow this layout, and the `@/` alias is
wired into the three tools that must agree on it: `paths` in
`tsconfig.json`, `resolve.alias` in `config/webpack.common.js`, and
`moduleNameMapper` in `jest.config.mjs`. Change one and change all three.

Two caveats:

- **`tsconfig.json` sets `paths` with no `baseUrl`.** `baseUrl` is
  deprecated in TypeScript 6 and errors as `TS5101`; without it,
  `moduleResolution: Bundler` resolves `paths` against the tsconfig
  directory, so the mapping value needs a leading `./` (`["./src/*"]`).
- **`.css` and `.module.css` both work, but nothing uses them yet.** Plain
  stylesheets always did — that is how `src/index.tsx` pulls in
  `antd/dist/reset.css`. CSS Modules were added alongside the folder rule:
  both webpack overlays carry a `/.module.css$/` rule with
  `css-loader`'s `modules` on (hashed class names in prod, readable ones in
  dev), the plain `.css` rule now excludes them, and `src/types/css.d.ts`
  declares `*.module.css` as a class-name map. Jest still maps every `.css`
  to `styleMock.ts`, so a module's classes come back `undefined` in tests —
  assert on roles and text, not class names. Atomic Design rule 4 still
  applies: reach for antd tokens before adding a stylesheet.

### Page loading and errors

Every routed page is code-split and guarded against a render error. The
rules, all of them live in `App.tsx`:

1. **Lazy-load every page**, and only pages. Nothing under `src/pages/` gets a
   static `import` in `App.tsx`; `AppHeader`, `AuthModals` and the store stay
   static, since they render on every route and splitting them buys nothing.
2. **Remap the named export.** `React.lazy` resolves a module's `default`, but
   pages are named exports (see Conventions), so each one needs
   `lazy(() => import('@/pages/MainPage').then((m) => ({ default: m.MainPage })))`.
   Do not add default exports to pages to make `lazy` shorter — the named-export
   rule is the load-bearing one.
3. **One `<Suspense>` and one `<ErrorBoundary>` around `<Routes>`**, both inside
   `Layout.Content`. That wraps all pages at once and keeps the header and auth
   modals mounted when a chunk is in flight or a page throws. Per-route
   boundaries are the fallback if a page ever needs its own recovery UI — do
   not add them pre-emptively.
4. **Key the boundary by route** (`<ErrorBoundary key={useLocation().pathname}>`)
   or a caught error persists across every later navigation.
5. **The error boundary is the one permitted class component.** React exposes
   no hook for `getDerivedStateFromError`, so `ErrorBoundary` is the documented
   exception to the functional-components-only rule in the root `CLAUDE.md`.
   It lives in `src/components/organisms/ErrorBoundary/` and is hand-written
   rather than pulled from a dependency. It defines `getDerivedStateFromError`
   only — no `componentDidCatch`, because React already logs an uncaught render
   error itself and the client has no logger to forward one to.

The route tests in `App.test.tsx` needed no changes for this: they
already `await screen.findByRole(...)`, which waits out the lazy chunk.

## Status

No longer a scaffold: the client has a working main page, header (nav, search,
three auth states), four auth modals, and a search page, backed by TanStack
Query for server state and Redux Toolkit for UI state, talking to the real
`/api`. The build toolchain and test runner
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
- `src/components/templates/App/` — `App`, the composition root (Redux
  `Provider`, antd `ConfigProvider`, `BrowserRouter`), and `AppShell`, the
  `Layout` around every route. Holds the `lazy()` call for each page plus the
  single `<Suspense>`/`<ErrorBoundary>` pair (see Page loading and errors).
  `AppShell` is exported separately because `App` mounts `BrowserRouter`,
  which a route test cannot point at an arbitrary path.
- `src/api/` — `client.ts` (the shared `request<T>()` fetch wrapper: prefixes
  every path with `/api`, sends `credentials: 'include'`, and turns non-2xx
  responses into a typed `ApiError`), plus `auth.ts` and `books.ts`, the
  per-resource typed calls built on it. Since the TanStack Query migration
  these are the bodies of the `queryFn`s and `mutationFn`s in `src/queries/`,
  not called directly from components.
- `src/queries/` — the TanStack Query layer, and the only thing that calls
  `src/api/`. `queryClient.ts` (the `createQueryClient` factory and the
  `queryClient` singleton, mirroring `createAppStore`/`store`), `keys.ts`
  (every cache key in one registry), `auth.ts` (`useSession` plus the five
  auth mutations) and `books.ts` (`useBooks`, `useSearchBooks`,
  `BOOKS_PAGE_SIZE`). Flat files, like `src/api/` and `src/store/`, and
  outside the Atomic Design levels for the same reason.

  Three things worth knowing before editing it:

  - **`retry` is off** and `staleTime` is 30s. Every error this API
    surfaces is a 4xx to show at once — a 401 from `/auth/me` is the
    _normal_ answer for an anonymous visitor, not a failure to retry.
  - **The session is `PublicUser | null`**, never `undefined`: `null` means
    "asked, nobody is signed in". `useSession` maps the 401 to it inside
    the `queryFn`. TanStack rejects an `undefined` return outright, which
    is what keeps the two apart.
  - **`useSearchBooks` is disabled on a blank term**, and a disabled query
    reports `isPending: true` with `fetchStatus: 'idle'` indefinitely. That
    is why `SearchPage` returns `<Empty>` before rendering `BookList`.

- `src/components/` — grouped by Atomic Design level (see above), not by
  feature. Each component becomes its own folder (see Component folders).
  - `molecules/` — `SearchBar`.
  - `organisms/` — `AppHeader` (nav menu, `SearchBar`, and the three auth
    states — signed out / loading / signed in); `AuthModals` (reads
    `activeModal` from `authSlice` and renders only that one, so only one
    modal is ever mounted at a time) plus `LoginModal`, `RegisterModal`,
    `ResetRequestModal` and `ResetConfirmModal`; `BookCard` and the
    presentational `BookList` (takes `items`/`status`/`error` as props so both
    `MainPage` and `SearchPage` can feed it from their own slice); and
    `ErrorBoundary`, the client's only class component.
- `src/pages/` — one folder per page (see Component folders): `MainPage`,
  `SearchPage`, `MyBooksPage`, `ProfilePage`,
  `SeriesPage`, `NotFoundPage`, and `ResetPasswordRoute` (reads the reset
  token off `/reset-password?token=...` and opens the confirm modal — not in
  the original spec's file list, added because the spec routed
  `/reset-password` to the confirm modal without naming the component that
  reads the token).
- `src/store/` — UI state only: `index.ts` (`createAppStore`, the `store`
  singleton, `RootState`/`AppStore`/`AppDispatch`), `hooks.ts` (pre-typed
  `useAppDispatch`/`useAppSelector`) and `authSlice.ts`, which holds
  `activeModal` and `resetToken` and nothing else. `booksSlice` and
  `searchSlice` are gone; the server state they cached by hand lives in
  `src/queries/`.
- `src/theme/` — `tokens.ts`, the quark layer: the `appTheme` `ThemeConfig`
  handed to `ConfigProvider` in `App.tsx`, and the `AliasToken` augmentation
  that makes our custom tokens typed everywhere `theme.useToken()` is called.
- `src/types/` — `user.ts`, `book.ts`, `api.ts` (the shared `ListResponse<T>`
  and `ApiErrorBody` shapes) and `css.d.ts`. Dates cross the wire as ISO
  strings, not `Date`, throughout — the server types them as `Date` in
  process but they arrive as JSON strings.
- `src/test/` — `setup.ts` (jsdom polyfills, see Testing below),
  `renderWithProviders.tsx` (wraps a component in the Redux `Provider`, antd's
  `ConfigProvider` and a `MemoryRouter`, returns the store), `httpFixtures.ts`
  (minimal
  `Response`-shaped fixtures, since jsdom has no `fetch`/`Response`) and
  `styleMock.ts` (the CSS-import mock `jest.config.mjs` maps `\.css$` to).
- `config/webpack.common.js` — shared config, exported as `(isDevelopment) => Configuration`
- `config/webpack.dev.js` / `config/webpack.prod.js` — env overlays, merged via `webpack-merge`
- `tsconfig.json` — strict, `noEmit`, `jsx: react-jsx`,
  `moduleResolution: Bundler`, target `ES2020`, and the `@/*` → `./src/*`
  path mapping
- `eslint.config.mjs` — ESLint flat config (TypeScript + React + hooks +
  jsx-a11y), plus `react/function-component-definition` set to
  `arrow-function`

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
- **The API is mocked per test, not the network.** Component and query
  tests `jest.mock('@/api/auth')` or `'@/api/books')` and drive the mock;
  only `src/api/*.test.ts` stubs `window.fetch` directly, against the
  `Response`-shaped fixtures in `httpFixtures.ts`. There is no MSW.
  `src/test/renderWithProviders.tsx` wraps a component in a
  `QueryClientProvider`, the Redux `Provider`, antd's `ConfigProvider` and
  a `MemoryRouter`, and returns both the store and the query client so a
  test can seed a session (`queryClient.setQueryData(queryKeys.session,
user)`) or a UI action (`store.dispatch(openResetConfirm(token))`).
  Its client comes from `src/test/queryClient.ts` and is **fresh per
  render** — a shared one leaks cached data between tests — with
  `staleTime: Infinity` so seeded data is never refetched behind a test's
  back, and `gcTime: Infinity` so no timer outlives the test.

### What a component test must cover

Every component has a `ComponentName.test.tsx` next to it, asserting:

1. It renders with its default and required props.
2. It behaves correctly across prop variants — `disabled`, `loading`, empty,
   error, and whatever else changes the output.
3. User interaction, driven by `userEvent` (preferred) or `fireEvent`.

Test the inputs and the outputs: props in, rendered DOM and fired callbacks
out. Do not assert on internal state — a test that knows how a component
stores something breaks on every refactor that changes nothing a user sees.

Every component and page has a test file. The stub pages (`MyBooksPage`,
`ProfilePage`, `SeriesPage`) take no props and have nothing to click, so
their tests cover only the heading and the placeholder — that is the whole
contract, not a shortcut.

## Conventions

- Functional components with hooks only — no class components, with the single
  `ErrorBoundary` exception noted under Page loading and errors above.
- **Components are arrow functions assigned to a `const` and typed with `FC`**,
  never `function` declarations:

  ```tsx
  import type { FC } from 'react';

  type Props = { book: PublicBook };

  export const BookCard: FC<Props> = ({ book }) => { ... };
  ```

  Write `FC`, imported as a named type — not `React.FC`. They are the same
  type, but the automatic JSX runtime (`jsx: react-jsx`) means no file in
  `src/` imports the `React` namespace, and pulling one in for the prefix adds
  an import for nothing. A component with no props is
  `export const AppHeader: FC = () => { ... }`.

  `@types/react` 19 gives `FC` **no implicit `children`** (that was dropped in
  v18), so a component accepting children must declare
  `children: ReactNode` in its own `Props`.

  This covers components only; plain helpers, custom hooks and thunks keep
  whichever form reads best. The arrow half is **enforced**:
  `react/function-component-definition` is set to `arrow-function` in
  `eslint.config.mjs`, so `lint` fails on a `function` component and
  `lint:fix` rewrites it. That rule does not add the `FC` annotation — that
  half is convention, checked in review.

- Do not mutate state directly — use setter functions or immutable updates.
- **Named exports everywhere, except `src/index.tsx`,
  `src/test/styleMock.ts` and the ambient declaration in
  `src/types/css.d.ts`.** `index.tsx` is the webpack entry: it is never
  imported by anything, so what it exports is moot. `App` used to default-export
  too, as the app root; once it moved into a component folder behind a barrel
  it became an ordinary named export like the rest. The other two are not
  choices at all — each matches a tool's contract. Jest's `moduleNameMapper`
  requires the module it maps `\.css$` imports to resolve to a default export,
  so `styleMock.ts` provides one. `css-loader` with `modules` on emits a CSS
  Module's class-name map as that module's default export, so
  `declare module '*.module.css'` has to describe it as one — and that file
  types other people's modules rather than exporting anything of its own.
  Every component, hook, slice and type elsewhere is a named export.
- The client talks to the API only through `src/api/client.ts`. Its
  `request<T>()` prefixes every path with `/api` and sends
  `credentials: 'include'` — without that, the browser withholds the
  httpOnly `sid` cookie and every authenticated call fails as a 401.
  Components reach it through `src/queries/`, never directly; a `queryFn`
  calling `fetch` itself would drop `credentials: 'include'` and turn every
  authenticated call into a 401.
