# Client — books_demo_spa

React 19 + TypeScript SPA bundled with webpack 5. Server state lives in
TanStack Query (`src/queries/`). Client state that outlives the component
showing it and never reaches the server (Unsaved text, Device preferences and
Recently viewed) lives in Redux Toolkit (`src/store/`, kept in
`localStorage`). All other UI state lives in the component that uses it
(ADR-0010).

## Topic rules

Read the rule before creating a file or changing a topic you have not read.
Rules live in `.claude/rules/client/`:

| Rule                   | Covers                                                   |
| ---------------------- | -------------------------------------------------------- |
| `api.md`               | `request()`, CSRF traps, the per-module request contract |
| `queries.md`           | retries, session shape, mutation wrapping, invalidation  |
| `store.md`             | the three slices, persistence, binding to the Account    |
| `components.md`        | menus, comments, cards, images, icons, sortable lists    |
| `chapter-editor.md`    | the Chapter editor modal: saving, conflicts              |
| `components-search.md` | search suggestions: `SearchBar`, `SearchForm`            |
| `pages.md`             | page-level rules                                         |
| `chapter-page.md`      | `ChapterPage`: reading preferences, Pages layout         |
| `routing.md`           | lazy loading, `Suspense`/`ErrorBoundary`, providers      |
| `styling.md`           | tokens and quarks, CSS Modules, the antd cascade layer   |
| `testing.md`           | Jest setup, jsdom polyfills, mocking, coverage           |
| `webpack.md`           | the typed webpack config parts, build traps              |

## Atomic Design

`src/components/` is grouped by level, not by feature; a level with nothing in
it has no directory. Levels: quarks (`src/theme/tokens.ts`), atoms (antd 6,
used directly; write one only where antd has no equivalent), molecules, organisms,
templates (`App`) and pages (`src/pages/`).

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
`config/webpack/buildResolve.ts` and `moduleNameMapper` in `jest.config.mjs`.

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
- **`ErrorBoundary` is the one class component** (root rule); it logs nothing
  because React already logs render errors.
- **Every call goes `component → src/queries → src/api → request()`.** A call
  that skips `request()` loses `credentials: 'include'` (every authenticated
  call becomes 401) and the CSRF header. Lint allows the global `fetch` only in
  `src/api/client`, and components and pages import `@/api` only as types,
  plus `ApiError`.
- **Types come from `shared`** through `Wire<T>`: dates cross the wire as ISO
  strings. Request payloads and field limits come from `shared` as they are;
  `src/types/` adds only client-side labels and helpers. Format a date through `src/format/date.ts` only (fixed `en` locale,
  the browser's time zone).
- **Index misses and fire-and-forget promises** (`noUncheckedIndexedAccess`,
  `void`): see `.claude/rules/repo/tooling.md`.
