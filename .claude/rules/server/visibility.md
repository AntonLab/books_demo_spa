---
paths:
  - 'server/src/repositories/visibility.ts'
  - 'server/src/repositories/notificationRepository.ts'
  - 'server/src/repositories/commentRepository.ts'
  - 'server/src/repositories/announcementRepository.ts'
  - 'server/src/controllers/notificationController.ts'
  - 'server/src/controllers/notificationStream.ts'
  - 'server/src/controllers/commentController.ts'
  - 'server/src/online/notificationPublisher.ts'
  - 'server/src/announcements/**'
  - 'server/src/models/Notification.ts'
  - 'server/src/models/Comment.ts'
---

# Who may read which row

`access.md` grades who may write a row; this file is who may read or hear
about one — Notifications, Draft books, comment tombstones.

## Notifications

- Written by `notify` inside the transaction of the change, so a failed change
  raises nothing. The actor is never a recipient. Each row is pushed to the
  recipient's open streams from `afterCommit` (`online/notificationPublisher.ts`,
  set by `index.ts`); with no publisher set, as in the seed and the repository
  specs, nothing is pushed. A push that throws is logged, never rethrown:
  Sequelize awaits `afterCommit` inside `commit()`.
- `new_chapter` and `new_book` are raised by the announcement pass
  (`announcements/`), never by `notify`: they carry no actor (`actorKind`
  null), a New chapter links its first unread Chapter (`chapterId`, `SET
NULL`) with a `chapterCount`, and a New book sets both `bookId` and its
  Series' `seriesId`. Their recipients are Favorite holders minus the Book's
  Co-authors.
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
- **Likes** exclude instead (`hiddenBookIds`); drafts are few, so lists stay short.
- **Listed is narrower than readable** (`listedBookWhere`): no book list shows
  a draft, a Moderator's included, except `?userId=` naming the caller ("My
  books").
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
- A thread cannot be tombstoned wholesale: each reply belongs to its Owner.
- **The promise ends where the book does**: deleting a book cascades and
  deliberately hard-deletes every comment on it, others' threads too (ADR-0004).
