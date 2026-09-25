---
paths:
  - 'client/src/pages/**'
  - 'client/src/components/templates/**'
---

# Routing and pages

## Loading and errors (`App.tsx`)

1. **Lazy-load every page, and only pages.** `AppHeader` and the `AuthModals`
   it holds render on every route and stay static.
2. **Remap the named export**:
   `lazy(() => import('@/pages/MainPage/MainPage').then((m) => ({ default: m.MainPage })))`.
   Pages keep named exports; do not add a default to shorten this.
3. **One `<Suspense>` and one `<ErrorBoundary>` around `<Routes>`**, inside
   `Layout.Content`, so the header and modals stay mounted while a chunk loads
   or a page throws. Add a per-route boundary only when a page needs its own
   recovery UI.
4. **Key the boundary by route** (`key={useLocation().pathname}`), or a caught
   error persists across every later navigation.
5. `QueryClientProvider` is the outermost provider, then the Redux
   `Provider`, then `StyleProvider` and `ThemedConfigProvider` (antd's
   algorithm from Device preferences). `AppShell` is exported apart from `App`
   because `App` mounts `BrowserRouter`, which a route test cannot point at an
   arbitrary path.

## Page rules

- `SeriesPage` (`/series/:id`) shows the `SeriesCard`, then the series' books
  in Series order: one page at `PAGE_SIZE_MAX`, no pagination, drafts left
  out by the server. The books are asked for only once the series loads, so a
  404, like an id that is not a positive integer, shows "This series no
  longer exists." and nothing else is requested. "Edit series" shows for its
  Co-authors and Moderators. A bare `/series` is `NotFoundPage`; every series
  link points here, and old `/search?series=` links are not redirected.
- `SearchPage` is one form (`SearchForm`) whose fields combine by AND, over
  paginated book results. The URL is its only state, read and written through
  `useSearchPage` (beside the page) and `types/bookSearch.ts`; every link into
  it is built by `searchPath`. Days stay `YYYY-MM-DD` in the URL and become
  instants only in the request; the default sort and page 1 are never written;
  `?series=` and an unknown `status` / `sort` / day are ignored. Picking an
  Author or Series suggestion adds its id beside the text
  (`authorId` / `seriesId`); the server is then asked by id (`userId` /
  `seriesId`), typing in the field drops the id, and an id without its text
  is ignored. Picking a Text suggestion opens that book instead. The form is
  keyed by the URL plus the resolved Genre, because antd reads
  `initialValues` once. A `genre` the non-empty Genre list does not hold
  shows "This genre no longer exists." and asks for no books; `useSearchPage`
  then reports a status that carries no `books`, because the disabled query is
  keyed like the same search without a genre and may hold its cached page.
  When the server serves a lower `current` than asked, the hook `replace`s the
  URL. A 400's zod issues land on their fields. The page renders by
  `results.status` and holds no search logic of its own. The form is
  shown or hidden (never unmounted, so field errors still land) by the
  `SearchFiltersToggle` button beside the layout switch, through the
  `searchFormExpanded` Device preference, open by default. Results show as tiles or a list by `resultsLayout`
  (`ResultsLayoutSwitch`, also on `SeriesPage`). `MainPage`'s sections are
  always tiles (`TILE_COLUMNS`) and ignore it; other pages' `CardList`s keep
  their default columns.
- `MainPage` is one section per `BOOK_SORTS` entry, six books each. "Show
  more" (`searchPath({ sort })`, a bare `/search` for Popular) shows only once
  the section has loaded more than six.
- Pages that gate on Role (`MyBooksPage`, `AdminGenresPage`) read the session
  with no `isPending` branch, so the "not for you" `Alert` shows briefly until
  the session resolves, even for someone allowed in.
- What the viewer may do with a work comes from `bookCapabilities` /
  `seriesCapabilities` (`types/capabilities.ts`), never from `authors` and the
  Role combined in the page. A Moderator gets a work's form but a read-only
  byline, and no "Add chapter". `BookPage`'s "Edit" link reads `isCoAuthor`,
  not `mayEdit`, on purpose.
- `EditChapterPage` is layout and button wiring; its rules live in
  `useChapterEdit` beside it and are tested there. It saves against the
  Unsaved text's `baseUpdatedAt`, the version the typing started from, and
  against the loaded `updatedAt` only when nothing was typed; otherwise a
  reload would refetch a Co-author's save and overwrite it with no 409. After
  a save, the version comes from its response, since `chapter.data` lags until
  the refetch; a landed save dispatches `saved`, which keeps text typed during
  it. A loaded version newer than the base (compared as ISO strings), or a
  409, is the conflict: `takeTheirs` discards the entry and refetches;
  `keepMine` refetches and rebases the entry, so the next Save is a deliberate
  overwrite. `formKey` is `updatedAt` plus a reset counter, and the form seeds
  from the entry. Each edit passes the newest known version as `saved`, so
  text changed back to it leaves no entry. `save` and `remove` go through
  `mutateAsync(...).then(...)`, not a per-call `mutate` callback, since
  TanStack skips that callback once the page has unmounted. Navigation after
  a delete, and its `mountedRef` guard, stay in the page.
- A page that finds its place gone (a 404 on the Chapter or Book, or an
  Account no longer a Co-author) shows the Unsaved text in
  `UnsavedTextNotice`; only Discard removes it.
- `BookPage` hides the like button from every Co-author and from everyone on a
  Draft book; the public chapter list and the reader's previous/next show only
  published chapters (`publishedChapters`), even to a Co-author.
- `ChapterPage` applies the reading Device preferences: background and font
  through a nested `ConfigProvider` (a class overriding `--ant-*` never
  reaches antd's components, which redeclare them), size and line height
  inline on the text column, whose `ch` width is measured at that size. Its
  arrows are antd `Button`s with `href`, routed in-app on a plain click, and
  stay disabled rather than vanish at either end.
- `/reset-password` renders `MainPage`; `AuthModals` reads `?token=` from the URL
  and opens the confirm modal over it. The path and key are a contract with
  `resetUrl()` on the server. Dismissing navigates to `/`, which closes it.
