---
paths:
  - 'client/src/pages/**'
---

# Routing and pages

See `.claude/rules/client/routing.md` for the App shell: lazy loading,
`Suspense`/`ErrorBoundary` and provider order.

## Page rules

- `SeriesPage` (`/series/:id`) shows the `SeriesCard`, then the series' books
  in Series order: one page at `PAGE_SIZE_MAX`, no pagination, drafts left
  out by the server. The books are asked for only once the series loads, so a
  404, like an id that is not a positive integer, shows "This series no
  longer exists." and nothing else is requested. "Edit series" opens the
  Series edit modal and shows for its Co-authors and Moderators. A bare `/series` is `NotFoundPage`; every series
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
  `searchFormExpanded` Device preference, open by default. The Sort order
  is not a Search filter, so it is not in the form: `SortOrderSwitch` sits
  at the toolbar's left, in view while the form is shut, once results are
  `ready`. A pick submits the form's current values under the new sort
  (`SearchForm`'s `ref` handle, `searchWith`), unsubmitted edits included,
  from page 1; the form keeps `sort` as a hidden field so Search keeps it.
  If the form fails its rules, nothing is applied, the switch keeps its
  value (it is controlled by the URL) and the form is expanded and scrolled
  to its first broken field (expanded synchronously first, or a hidden field
  has nowhere to scroll to). The result count is in the title, which keeps the
  last count while the next search runs ("Searching…" only before any). Results show as tiles or a list by `resultsLayout`
  (`ResultsLayoutSwitch`, also on `SeriesPage`). `MainPage`'s sections are
  always tiles (`TILE_COLUMNS`) and ignore it; other pages' `CardList`s keep
  their default columns.
- `MainPage` is one section per `BOOK_SORTS` entry, six books each. "Show
  more" (`searchPath({ sort })`, a bare `/search` for Popular) shows only once
  the section has loaded more than six.
- `AdminGenresPage` is a two-level `Tree` of the counts list, with a search box,
  a usage filter and per-row Add subgenre / Edit / Delete (`GenreFormModal`;
  there is no rename in place). A top-level row shows its own works plus its
  Subgenres'; the totals and the Delete lock (a Genre with Subgenres cannot be
  deleted) read the unfiltered tree, so a filter never changes them. A typed
  query expands every shown parent. Rows are draggable (`dropParentOf`, fed the
  unfiltered tree): a drop that keeps the parent, targets a Subgenre, or
  demotes a Genre that has Subgenres is refused and sends nothing; no
  optimistic move, a 409 lands in the page Alert.
- Pages that gate on Role (`AdminGenresPage`) read the session
  with no `isPending` branch, so the "not for you" `Alert` shows briefly until
  the session resolves, even for someone allowed in.
- What the viewer may do with a work comes from `bookCapabilities` /
  `seriesCapabilities` (`types/capabilities.ts`), never from `authors` and the
  Role combined in the page. A Moderator gets a work's form but a read-only
  byline, and no "Add chapter". `BookPage`'s "Edit" button and `SeriesPage`'s
  "Edit series" read `mayEdit`, so a Moderator opens the edit modals too;
  "Add chapter" and the co-author picker stay co-author only. After a delete a
  co-author lands on My works, a Moderator on `/`.
- A modal that finds its place gone (a 404 on the Chapter or Book, or an
  Account no longer a Co-author) shows the Unsaved text in
  `UnsavedTextNotice`; only Discard removes it.
- `BookPage` hides the like button from every Co-author and from everyone on a
  Draft book; the Favorites star shows to Co-authors too, but not on a Draft.
  Below the Cover row sit three tabs, Description, Chapters and
  Statistics, on every book, a Draft included; the open tab is antd's own
  state (ADR-0010), never the URL, so a reload opens Description. The panel
  has a fixed height (`appBookTabsHeight`, sized to Statistics at desktop
  width) and scrolls, so switching tabs never moves the comments; it is
  styled through Tabs' `classNames.body`, never a `:global` selector that
  would reach a Tabs nested inside a panel. The public
  chapter list, its Statistics and the reader's previous/next show only
  published chapters (`publishedChapters`), even to a Co-author. A row's
  number is its place in that list, derived on the client and shown nowhere
  else (not on `ChapterPage`, not in the editor's `SortableList`). Statistics
  takes Chapters, Release time and Last update from that same list (earliest
  and latest Publication time, not first and last in Reading order) and
  follows its pending and error states; Words, Likes, Favorites and Comments
  come from `BookDetail`.
- `usePageClamp` redirects a page past the end, with `replace`, to the last
  page of the true `total`. A books page past the end is served as the last
  non-empty page and a series page comes back empty, both with the true
  `total`, so the clamp reads `total`. It waits while the list is pending or
  blocked on a Genre.
- `ProfilePage`'s outer tabs are paths (`/profile`, `/profile/favorites`,
  `/profile/my-books`, the last labelled "My works"), since the account menu
  and the book and series editors open a given tab; the outer `Tabs` has
  `destroyOnHidden`. The inner Books/Series tabs of both panels live in
  `?tab=series` (Books is never written), superseding ADR-0010's "inner tabs
  are antd state" for these two panels only. My works hides the Author field
  and ignores a typed `author`. A non-author on My works is redirected only
  after the session resolves, so an author reloading it stays.
- `ChapterPage` applies the reading Device preferences: background and font
  through a nested `ConfigProvider` (a class overriding `--ant-*` never
  reaches antd's components, which redeclare them), size and line height
  inline on the text column, whose `ch` width is measured at that size. In
  Scroll its arrows are antd `Button`s with `href`, routed in-app on a plain
  click, and stay disabled rather than vanish at either end.
- The Pages Reading layout lives beside the page: rules in `pagination.ts`,
  every layout read in `measurePages.ts` (mocked in Jest; jsdom lays nothing
  out, so check pages, spreads and the slide in a browser), state in
  `usePages.ts`. The strip is CSS multi-column with a fixed height, so its
  overflow columns are the pages. A relayout re-measures, then shows the page
  where the paragraph that was on top begins. That paragraph is recorded only
  on an open or a turn, never after a relayout (it would then be the one
  carried over from the page before, and every resize would step back a
  page), and a resize that changes no page size keeps the old geometry. The
  page stays mounted
  between chapters, so `usePages` resets its view during render when the
  chapter id changes. "Open on the last page" is `location.state`, replaced
  with `null` once read, or a reload would reopen there. In Pages the arrows
  are plain buttons whose label changes, so focus stays on one as it turns
  pages; a hand-off to a chapter not yet cached shows the skeleton, which
  drops focus. `ReadingPreferences` reports closed on unmount, or the page's
  keys stay off after that skeleton. The window clips with `overflow: clip`: a `hidden` box can be
  scrolled by find-in-page. Destructure `usePages`'s result: `react-hooks/refs`
  reads any property of an object holding refs as a ref read during render.
- `/reset-password` renders `MainPage`; `AuthModals` reads `?token=` from the URL
  and opens the confirm modal over it. The path and key are a contract with
  `resetUrl()` on the server. Dismissing navigates to `/`, which closes it.
- There are no Manage pages. Edit happens in `BookEditDetailsModal` (tabs
  Details | Chapters, the Chapter editor over it) and `SeriesEditDetailsModal`
  (Details | Books), opened from `BookPage`, `SeriesPage` and My works.
  `/books/:id/edit` and `/series/:id/edit` fall to `NotFoundPage`; the Chapter
  routes (`/books/:id/chapters/new` and `/books/:id/chapters/:chapterId/edit`)
  redirect with `replace` to the Book page. `/books/new` and `/series/new` keep
  the "no longer exists" messages through `BookPage` / `SeriesPage`: neither
  asks the server, `BookPage` shows "This book no longer exists." and
  `SeriesPage` "This series no longer exists.".
