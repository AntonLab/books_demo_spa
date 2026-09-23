---
paths:
  - 'client/src/**/*.test.ts'
  - 'client/src/**/*.test.tsx'
  - 'client/src/test/**'
  - 'client/jest.config.mjs'
---

# Client tests

Jest on jsdom through `@swc/jest`, the same `@swc/core` webpack uses; there is
no Babel config.

## The test script

`cross-env NODE_OPTIONS=--experimental-vm-modules jest`, and each part is
load-bearing:

- `react-router` 8 is ESM-only and its root re-exports code using
  `import.meta`, which Jest's CJS loader cannot parse; without the flag most
  suites fail. For the same reason `jest.config.mjs` carves it out of
  `transformIgnorePatterns`. `antd` still ships CJS and `shared` resolves
  outside `node_modules`, so neither needs a carve-out.
- `jest` by bare name: workspaces hoist it to the root, so no
  `client/node_modules/jest/bin` path exists.
- `cross-env`: npm runs scripts through `cmd.exe` on Windows, where a bare
  `NODE_OPTIONS=…` prefix is a syntax error.

## Setup

- `src/test/setup.ts` polyfills what jsdom lacks, each proven necessary:
  `matchMedia` and `ResizeObserver` (antd responsive helpers),
  `TextEncoder`/`TextDecoder` (react-router builds one at import) and
  `MessageChannel` (every antd `Form.Item` mount).
- `renderWithProviders` wraps the same providers as `App` around a
  `MemoryRouter` and returns `{ store, queryClient }`, so a test seeds a session
  with `queryClient.setQueryData(queryKeys.session, user)` or a UI action with
  `store.dispatch(…)`. Pass `path` beside `route` for a page that reads params,
  or `useParams()` is empty and the page queries `NaN`.
- Its query client is **fresh per render** (a shared one leaks cache between
  tests), with `retry: false` and `staleTime`/`gcTime: Infinity` so seeded data
  is never refetched and no timer outlives the test.
- **No antd runtime styles**: `zeroRuntime: true` on `ConfigProvider`, and every
  `.css` maps to `styleMock.ts`, so classes come back `undefined`. With the
  styles, `getComputedStyle` in every `*ByRole({ name })` made single tests hit
  the 5 s timeout. The price: an element hidden only by antd's stylesheet is not
  hidden to a role query. Waiting on cheap text, then one `getByRole`, beats a
  `findByRole` polling through a loading phase.

## Mocking

The API is mocked per test, not the network: `jest.mock('@/api/books')` and
drive the mock. Only `src/api/*.test.ts` stubs `fetch` (see `api.md`). There is
no MSW.

## Traps

- **Drag and drop is tested from the keyboard over a faked layout.** jsdom lays
  nothing out, so `layOutSortableRows()` (`src/test/sortable.ts`) stacks the
  `data-sortable-row` elements (call its return to restore), and
  `moveWithKeyboard` does focus, Space, arrows, Space. Pointer drags share the
  same `onDragEnd` and are not tested. Each page that saves an order tests the
  save, the rollback and the 409.
- **Query an Avatar or Cover `<img>` by exact `src`**
  (`container.querySelector('img[src="…"]')`), never by role: both are hidden or
  `alt=""`, antd icon spans also answer to `role="img"`, and only the `src`
  tells a Cover from several Avatars.
- **An antd `Menu` item cannot be activated by keyboard in a test**: its handler
  checks `event.which === 13`, which user-event never sets. Click it instead.
- A route test awaits `findByRole`, which also waits out the lazy chunk.

## What a component test covers

Every component and page has a `*.test.tsx` beside it asserting: it renders
with required props; each variant that changes output (`disabled`, `loading`,
empty, error); user interaction through `userEvent`. Test props in, DOM and
callbacks out, never internal state.
