# Client — books_demo_spa

React 19 + TypeScript SPA bundled with webpack 5. Server state lives in
TanStack Query (`src/queries/`). Client state that outlives the component
showing it and never reaches the server, Unsaved text and Device preferences,
lives in Redux Toolkit (`src/store/`, kept in `localStorage`). All other UI
state lives in the component that uses it (ADR-0010).

## Topic rules

The detail lives in `.claude/rules/client/`, one topic per file. Each loads on
its own when you Read a file its `paths:` names — writing or editing one does
not. Before creating a file, or changing a topic whose files you have not
read, read the rule first:

| Rule            | Covers                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `api.md`        | `request()`, its body and CSRF traps, the per-module request contract  |
| `queries.md`    | retries, the session shape, mutation wrapping, invalidation            |
| `store.md`      | the two slices, `localStorage` persistence, binding to the Account     |
| `components.md` | component traps: menus, comments, cards, images, icons, sortable lists |
| `pages.md`      | routing, lazy loading and the error boundary, page-level rules         |
| `styling.md`    | tokens and quarks, CSS Modules, the antd cascade layer                 |
| `testing.md`    | the Jest setup, jsdom polyfills, mocking, what a test must cover       |
| `webpack.md`    | the one webpack config                                                 |

## Commands

Install from the repo root. Scripts run here or from the root with `-w client`:
`npm run dev` (port 3000, `/api` proxied to 4000), `npm run build` (`build/`),
`npm test` / `npm run test:watch`, `npm run typecheck`, `npm run lint`,
`npm run lint:fix`. Prettier is root-only.

## Atomic Design

`src/components/` is grouped by level, not by feature. A level with nothing in
it has no directory.

| Level     | Lives in                    | What it is                                                      |
| --------- | --------------------------- | --------------------------------------------------------------- |
| Quarks    | `src/theme/tokens.ts`       | Design tokens: antd 6's defaults plus our `app*` tokens         |
| Atoms     | antd 6                      | Used directly; write one only where antd has no equivalent      |
| Molecules | `src/components/molecules/` | A few atoms doing one job; props in, render out                 |
| Organisms | `src/components/organisms/` | A standalone section; may hold state and call queries           |
| Templates | `src/components/templates/` | `App`: the composition root and the `Layout` around every route |
| Pages     | `src/pages/`                | A routed template filled with real data                         |

1. **Imports flow downward only.** ESLint enforces it (`no-restricted-imports`
   per level, tests exempt).
2. **Search `src/components/` before creating** a component.
3. **Business logic stays in organisms and pages.** `useAppSelector`,
   `useAppDispatch` and `src/queries` hooks never appear below organisms.
4. **Tokens, not hardcoded colours or pixels** (see `styling.md`).
5. **Wrap antd only to fix an awkward API or a variant used three or more
   times**; a passthrough is over-atomization.
6. **Prototype complex work on a throwaway page** before wiring it into a route.

## Component folders

Every component and page is a PascalCase folder with its tests and styles
beside it:

```text
src/components/organisms/BookCard/
├── BookCard.tsx          # named export, types included
├── BookCard.test.tsx
└── BookCard.module.css   # only when it has styles
```

Import the file, not the folder: `@/components/organisms/BookCard/BookCard`.
There are no barrel `index.ts` files. The `@/` alias is set in three places that
must agree: `paths` in `tsconfig.json` (no `baseUrl`, which errors as `TS5101`
in TypeScript 6, hence the leading `./src/*`), `resolve.alias` in
`config/webpack.config.js` and `moduleNameMapper` in `jest.config.mjs`.

## Conventions

- **Components are `const` arrow functions typed with `FC`**, imported as a
  named type, not `React.FC` (nothing imports the `React` namespace under the
  automatic runtime). Lint enforces the arrow and bans the `React` import;
  `FC` is checked in review.
  `FC` has no implicit `children`: declare `children: ReactNode` in `Props`.
  Helpers and hooks take whichever form reads best.
- **Named exports everywhere** (lint enforces it), except where a tool's
  contract needs a default: `src/test/styleMock.ts` (Jest's CSS mapping) and
  the `*.module.css` declaration in `src/types/css.d.ts`.
- **`ErrorBoundary` is the one class component**: React has no hook for
  `getDerivedStateFromError`. It defines nothing else, because React already
  logs an uncaught render error and the client has no logger.
- **Every call goes `component → src/queries → src/api → request()`.** A call
  that skips `request()` loses `credentials: 'include'` (every authenticated
  call becomes 401) and the CSRF header. Lint allows the global `fetch` only in
  `src/api/client`, and components and pages import `@/api` only as types,
  plus `ApiError`.
- **Types come from `shared`** through `Wire<T>`: dates cross the wire as ISO
  strings. `src/types/` adds only client-side labels, helpers and request
  payloads. Format a date through `src/format/date.ts` only (fixed `en` locale,
  the browser's time zone).
- **`noUncheckedIndexedAccess`**: component code handles a miss with `?.`/`??`
  or an early return; only tests (`*.test.ts(x)`, `src/test/`) may write `!`
  (`no-non-null-assertion`).
- **A fire-and-forget promise is marked `void`** with the reason beside it, as
  in `onFinish={(values) => void handleFinish(values)}`. The typed lint rules
  take no `eslint-disable`.
