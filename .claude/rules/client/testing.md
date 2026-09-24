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

`npm exec --node-options=--experimental-vm-modules -- jest`, and each part
is load-bearing:

- `react-router` 8 is ESM-only and its root re-exports code using
  `import.meta`, which Jest's CJS loader cannot parse; without the flag most
  suites fail. For the same reason `jest.config.mjs` carves it out of
  `transformIgnorePatterns`. `antd` still ships CJS and `shared` resolves
  outside `node_modules`, so neither needs a carve-out.
- `jest` by bare name: workspaces hoist it to the root, so no
  `client/node_modules/jest/bin` path exists.
- `--node-options`, npm's own way to set `NODE_OPTIONS`: npm runs scripts
  through `cmd.exe` on Windows, where a bare `NODE_OPTIONS=…` prefix is a
  syntax error, and this needs no `cross-env`.

## Setup

- `src/test/setup.ts` polyfills what jsdom lacks, each proven necessary:
  `matchMedia` and `ResizeObserver` (antd responsive helpers),
  `TextEncoder`/`TextDecoder` (react-router builds one at import),
  `MessageChannel` (every antd `Form.Item` mount) and `scrollIntoView`
  (`ChapterContents` once its drawer opens).
- `renderWithProviders` wraps the same providers as `App` around a
  `MemoryRouter` and returns `{ store, queryClient }`, so a test seeds a
  session with `queryClient.setQueryData(queryKeys.session, user)` and client
  state with `preloadedState`, or passes `store` to remount on the same state.
  Without `preloadedState` the store starts from `{}`, never from
  `localStorage`, which an earlier test may have written. Pass `path` beside
  `route` for a page that reads params, or `useParams()` is empty and the page
  queries `NaN`.
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
- **`navigator.clipboard` exists only after `userEvent.setup()`**, which
  installs user-event's stub; a direct `userEvent.click` installs none and
  jsdom has no clipboard. Read what was copied with
  `navigator.clipboard.readText()`.
- **`UnsavedTextNotice`'s textarea is a fixed `rows={6}`, not antd's
  `autoSize`**: `autoSize` logs a NaN-height `console.error` under jsdom.
- **Tests run without StrictMode, but the app runs with it** (`index.tsx`).
  Code whose effect cleanup flips a ref needs one test with
  `renderWithProviders(ui, { reactStrictMode: true })`. A `<StrictMode>`
  nested inside the providers does not double-run the effects.
- **A persistence test uses fake timers**: Unsaved text is written 500 ms
  after a change, so `await jest.advanceTimersByTimeAsync(500)` before reading
  `localStorage`.

## What a component test covers

Every component and page has a `*.test.tsx` beside it asserting: it renders
with required props; each variant that changes output (`disabled`, `loading`,
empty, error); user interaction through `userEvent`. Test props in, DOM and
callbacks out, never internal state.
