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
   `lazy(() => import('@/pages/MainPage').then((m) => ({ default: m.MainPage })))`.
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
- `SearchPage` takes one filter per visit, by precedence `series`, then
  `genre`, then `q`, then `sort`. An id that is not a positive integer, or
  names nothing, gets "This series no longer exists." / "This genre no longer
  exists." and requests nothing more; an unknown `sort` is no search at all.
  Its results show as tiles or a list, by the `resultsLayout` Device
  preference; one switch covers every list on the page. `MainPage`'s sections
  are always tiles (`TILE_COLUMNS`) and ignore it; other pages' `CardList`s
  keep their default columns.
- `MainPage` is one section per `BOOK_SORTS` entry, six books each. "Show
  more" (`/search?sort=`) shows only once the section has loaded more than six.
- Pages that gate on Role (`MyBooksPage`, `AdminGenresPage`) read the session
  with no `isPending` branch, so the "not for you" `Alert` shows briefly until
  the session resolves, even for someone allowed in.
- A Moderator gets a work's form but a read-only byline, and no "Add chapter".
- `EditChapterPage` saves against the Unsaved text's `baseUpdatedAt`, the
  version the typing started from, and against the loaded `updatedAt` only
  when nothing was typed; otherwise a reload would refetch a Co-author's save
  and overwrite it with no 409. After a save, the version comes from its
  response, since `chapter.data` lags until the refetch; a landed save
  dispatches `saved`, which keeps text typed during it. A loaded version newer
  than the base (compared as ISO strings), or a 409, shows the conflict: "Use
  their version" discards the entry and refetches; "Keep mine" refetches and
  rebases the entry, so the next Save is a deliberate overwrite. The form is
  keyed by `updatedAt` plus a reset counter and seeds from the entry. Each
  edit passes the newest known version as `saved`, so text changed back to it
  leaves no entry. It
  dispatches `saved` from `mutateAsync(...).then(...)`, not a per-call
  `mutate` callback, since TanStack skips that callback once the page has
  unmounted, which would otherwise leave a stale entry and show a false
  conflict on the Account's own save.
- A page that finds its place gone (a 404 on the Chapter or Book, or an
  Account no longer a Co-author) shows the Unsaved text in
  `UnsavedTextNotice`; only Discard removes it.
- `BookPage` hides the like button from every Co-author and from everyone on a
  Draft book; the public chapter list and the reader's previous/next show only
  published chapters (`publishedChapters`), even to a Co-author.
- `/reset-password` renders `MainPage`; `AuthModals` reads `?token=` from the URL
  and opens the confirm modal over it. The path and key are a contract with
  `resetUrl()` on the server. Dismissing navigates to `/`, which closes it.
