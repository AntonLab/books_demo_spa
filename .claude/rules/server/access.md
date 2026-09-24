---
paths:
  - 'server/src/controllers/**'
  - 'server/src/repositories/**'
  - 'server/src/models/Comment.ts'
  - 'server/src/models/Like.ts'
  - 'server/src/models/Notification.ts'
---

# Who may touch which row

The matrix (`permissions.md`) grades the module; this file is the row-level
half. Nothing here lives in the permission table.

## Ownership

- Checked on books, series, chapters, comments and likes, in each controller
  (`assertMayTouch` / `assertOwned` / `assertCoAuthor`), not in a middleware:
  the row must be loaded before an owner can be compared. A scope of `any`
  (Moderators) skips the check outright. Every check answers 404 before 403.
- A book's or series' `own` means one of its Co-authors (`findCoAuthorIds`).
  Chapters have no owner column and resolve through their book;
  `assertMayChangeChaptersOf` covers a create and a reorder, where there is no
  chapter to own.
- **Filing a book into a series takes a Co-author of both**
  (`assertMayAddToSeries`), or an author could file into a stranger's series. A
  missing series is a 404 blaming the series, ahead of the book's 403. `null`
  or an absent key touches no series and needs no check.
- **Either side may take a book out of a series**: the book's Co-author through
  `PATCH seriesId: null`, the series' Co-author through
  `DELETE /api/series/:id/books/:bookId` (404 if the book is not in that series).
- **The self-like ban** lives in `likeRepository.create`, the one
  check-then-write there. Safe because a comment's owner never changes, and a
  credit landing between check and insert leaves at worst one early like.
  Uniqueness stays with the indexes.

## Co-authors (ADR-0005)

Every rule holds for books and for series. Each has its own controller; the
repository rules are written once in `repositories/coAuthors.ts`, which each
repository hands an adapter over its own credit table.

- **Adding** rides on `× update` and then requires the caller to be credited,
  which a Moderator never is: Moderators edit or delete any work but never
  change its byline. Refused: an account without the `author` Role (400), a
  missing account (404), one already credited (409, from the unique index, not
  a lookup).
- **Removing** sits behind `requireAuth`, not `requirePermission`, so a
  Co-author who switched to `user` (`none` on books) can still leave. Anyone
  may remove themselves; removing someone else needs a scope of exactly `own`
  and a credit, so `none` and `any` are both 403.
- **A work always keeps one Co-author.** An uncredited account is 404 (checked
  first, so a stranger learns nothing), the last one is 409. The count and the
  delete run under `SELECT … FOR UPDATE` on the work row, or two Co-authors
  leaving at once would each count two.
- **Deleting an account deletes only the works it was the last Co-author of**
  (`userRepository.remove`, under the same row locks). A deleted series only
  unlinks its books.
- Switching Role from `author` to `user` keeps every credit; the matrix alone
  removes write access.

## Notifications

- Written by `notify` inside the transaction of the change, so a failed change
  raises nothing. The actor is never a recipient.
- Added tells the account added; removed tells the account removed; leaving
  tells every remaining Co-author; deleting a work tells every other Co-author
  (the deleter is named only if credited — otherwise a Moderator, unnamed);
  deleting an account tells the remaining Co-authors of each shared work, as
  `deleted_account`. Text, status, filing, order and chapter changes raise
  nothing.
- **A snapshot, not a view**: the row copies the title and the actor's name.
  Only `bookId`/`seriesId` stay live (`SET NULL`), so `work.id` becomes `null`.
- The writes that raise one take an `Actor`, built with `actorOf` in
  `repositories/visibility.ts`.

## Draft books

A Draft book is readable by its Co-authors and Moderators only. The rule lives
in `repositories/visibility.ts`; every read that can reach a book takes a
`Viewer` built with `viewerOf`. An unset `req.user` really is a Guest, because
`requirePermission` resolves the session on public reads too.

- **Readable** (`readableBookWhere`, `readableBookInclude`): a hidden row is the
  same 404, or the same absence from a list, as a missing one.
- **Chapters** add `readableChapterScope`: a reader sees a chapter once its book
  is readable and `publishedAt` has passed. Co-authors and Moderators see all.
- **Likes** exclude instead (`hiddenBookIds`); drafts are few, so the lists stay
  short.
- **Listed is narrower than readable**: no book list shows a draft, a
  Moderator's included, except `?userId=` naming the caller ("My books").
- **Series** have no status: visible with at least one non-draft book, or to its
  Co-authors and Moderators (`visibleSeriesWhere`). The published side is a
  fixed subquery, because an id list would grow with the catalogue.
- A series' Co-authors see its drafts **by name only** (`SeriesBookSummary`),
  because reordering needs the whole list. The draft's detail, chapters and
  comments still go through `readableBookWhere`.
- **Nobody writes to a draft's conversation**: comments and likes on it are 403
  for everyone. Returning a book to Draft hides them; publishing again brings
  them back.
- `findById` is viewer-aware too, so a write on a comment or like under a
  hidden draft is 404 before any owner check.

## Comment tombstones (ADR-0003, ADR-0004)

- `DELETE /api/comments/:id` sets `tombstone` on that row and nothing else, so
  replies keep their parent. `deleted`: the owner deleted it (an admin's own
  comment included) or the owner's account went. `removed`: a Moderator deleted
  someone else's.
- `POST /api/comments/:id/restore` reverses `removed` only. It needs
  `comments × delete` to be `any` (403 before any lookup) and answers 404 for a
  missing id, a live comment and a `deleted` one alike.
- Both kinds come back with `text: ''`, `author: null`, `userId: null`, blanked
  in one place (`toPublicComment` / `toCommentWithAuthor`) so no future
  endpoint serves the text by omission. `?userId=` never returns a tombstone,
  or the filter would out the person it hides.
- A tombstone's `userId` is `null`, so the controller rejects a tombstone before
  any owner comparison: `PATCH` 403, a second `DELETE` 404, for everyone.
- A tombstone takes no reply and no new or flipped like (403); removing your
  own existing like from one is allowed. Existing replies behave normally.
- A thread cannot be tombstoned wholesale: each reply belongs to its author.
- **The promise ends where the book does**: deleting a book cascades and
  hard-deletes every comment on it, other people's threads included.
  Deliberate (ADR-0004).
