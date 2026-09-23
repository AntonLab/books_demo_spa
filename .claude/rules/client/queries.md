---
paths:
  - 'client/src/queries/**'
---

# `src/queries/`

The TanStack Query layer and the only caller of `src/api/`. Flat files, outside
the Atomic Design levels. Every cache key lives in `keys.ts`.

- **A query retries only what may pass on its own**: at most twice, and only a
  failure that is not an `ApiError` (network) or is a 5xx
  (`shouldRetryQuery`). A 401 from `/auth/me` is the normal answer for a Guest.
  `staleTime` is 30 s. **Mutations never retry**: a write that landed would
  land twice.
- **The session is `PublicUser | null`, never `undefined`.** `useSession` maps
  the 401 to `null` inside the `queryFn`; TanStack rejects an `undefined`
  return, which keeps "asked, nobody" apart from "not asked".
- **A disabled query reports `isPending: true` forever** (with
  `fetchStatus: 'idle'`). `useSearchBooks` is disabled on a blank term, which is
  why `SearchPage` returns `<Empty>` before rendering `BookList`.
- **Wrap every `mutationFn`; never pass an `src/api/` function straight
  through.** TanStack passes a second context argument, which arrives as a
  stray parameter and fails `toHaveBeenCalledWith` naming
  `{ client, meta, mutationKey }`.
- **Invalidate every prefix a write can change.** A book write can move a book
  in or out of any list, so it invalidates the whole `books` prefix; filing a
  book also changes a series; a Genre rename changes the `genre` embedded in
  every book and series; an Avatar change touches every embedded `PublicUser`
  or `AuthorSummary`.
- `useToggleLike` handles both directions from the `viewerLikeId` the caller
  holds (`null` likes, a number deletes that row) and takes the key to
  invalidate, since a book like and a comment like refresh different things.
- `useOptimisticReorder` (`reorder.ts`) is the one save-on-drop for both
  orders: it rewrites the cache before the request, restores it on failure
  and refetches either way, so a 409 brings in the row a Co-author changed.
- `useNotifications` is the only polling query: every 60 s and on window focus.
- `@tanstack/react-query-devtools` is pinned to the same version as
  `@tanstack/react-query`: bump both together, since the devtools read the
  core's internals.
- `useSeriesBooks` stays disabled until the page knows the viewer may edit the
  series.
