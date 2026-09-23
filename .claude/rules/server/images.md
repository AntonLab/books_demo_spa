---
paths:
  - 'server/src/images.ts'
  - 'server/src/models/BookCover.ts'
  - 'server/src/models/UserAvatar.ts'
  - 'server/src/routes/bookRoutes.ts'
  - 'server/src/routes/userRoutes.ts'
  - 'server/src/types/image.ts'
---

# Covers and Avatars (ADR-0007)

- Stored as bytes in `book_covers` / `user_avatars`, keyed by the owner's id,
  never as a column on `books`/`users`, so no list query can drag them along.
  Both cascade from their owner, so a deleted Book or Account takes its picture
  with it, with no application code.
- Every `sharp` call lives in `src/images.ts`. It decodes the upload for real
  (`metadata().format`, never the `Content-Type` header), applies and drops
  EXIF orientation, centre-crops to 600×900 or 256×256 and re-encodes WebP with
  no metadata. The upload's own bytes are never stored; an animation keeps its
  first frame.
- `PUT`/`DELETE`/`GET /api/books/:id/cover` ride on `books × update` / `read`;
  the avatar `PUT`/`DELETE` on `users × update`. **`GET /api/users/:id/avatar`
  has no permission middleware**, since a Guest lacks `users × read`. Walking
  ids therefore collects every Avatar, unnamed; accepted, since ids are public
  in every `AuthorSummary`.
- `express.raw()` is mounted on the two `PUT`s only, after `requirePermission`
  and `validate`, so a refused request never has its 2 MiB body read. Then, in
  order: 415 when `Content-Type` was not accepted (`req.body` is no `Buffer`),
  the row's 404/403, and `sharp`'s 400 ("Not a valid image"), which also covers
  bytes over its pixel limit. Over 2 MiB is 413 through `errorHandler`.
- Both `GET`s send `Cache-Control: private, max-age=31536000, immutable`. Safe
  because `coverUrl` / `avatarUrl` carry `?v=<updatedAt ms>`, so a replace is
  never served stale.
- A Cover is a field of the Book and an Avatar a field of the Account: no matrix
  row of its own, last write wins, no Notification.
- `ACCEPTED_IMAGE_CONTENT_TYPES` and `IMAGE_MAX_BYTES` come from `shared`,
  because the client prechecks against the same limits.
