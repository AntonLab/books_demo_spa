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
5. `QueryClientProvider` is the outermost provider. `AppShell` is exported
   apart from `App` because `App` mounts `BrowserRouter`, which a route test
   cannot point at an arbitrary path.

## Page rules

- **There is no series page.** A series' books are `/search?series=<id>`;
  `/series` is `NotFoundPage`.
- `SearchPage` takes one filter per visit, by precedence `series`, then
  `genre`, then `q`. An id that is not a positive integer, or names nothing,
  gets "This series no longer exists." / "This genre no longer exists." and
  requests nothing more.
- Pages that gate on Role (`MyBooksPage`, `AdminGenresPage`) read the session
  with no `isPending` branch, so the "not for you" `Alert` shows briefly until
  the session resolves, even for someone allowed in.
- A Moderator gets a work's form but a read-only byline, and no "Add chapter".
- `EditChapterPage` saves against the loaded `updatedAt`; a 409 keeps the typed
  text and offers Reload.
- `BookPage` hides the like button from every Co-author and from everyone on a
  Draft book; the public chapter list and the reader's previous/next show only
  published chapters (`publishedChapters`), even to a Co-author.
- `/reset-password` renders `MainPage`; `AuthModals` reads `?token=` from the URL
  and opens the confirm modal over it. The path and key are a contract with
  `resetUrl()` on the server. Dismissing navigates to `/`, which closes it.
