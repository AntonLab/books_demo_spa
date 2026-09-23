---
paths:
  - 'client/src/components/**'
---

# Component traps

What each component renders is in its file and its test. These are the parts
that read like mistakes and are not.

## antd menus (`AppHeader`)

- The nav `Menu` carries `disabledOverflow`: rc-menu keeps every child past the
  first `overflowDisabled` until `ResizeObserver` measures a width, which jsdom
  never does, so without it the Genres `SubMenu` is dead in tests. The price:
  the nav no longer collapses into "…" at phone width.
- `triggerSubMenuAction="click"`: a touch device cannot hover, and a test could
  only drive hover through rc-menu's open delay.
- The signed-out "Log in" menu carries `disabledOverflow` for its own reason: a
  menu sized by its single item collapses into "…" in any environment.
- Genre items are keyed by their target path (`/search?genre=<id>`) so a click
  navigates to its key like every other item, and `selectedKeys` compares
  `pathname + search`. The submenu is left out while Genres load, on error and
  when there are none.
- There is no Register item: the login modal's "Create an account" is the way
  in.

## Comments (`CommentSection`, `Comment`)

- The server returns a flat page; `CommentSection` builds the two-level tree,
  so there is no recursive component and a reply has no Reply button.
- **It drops a tombstone with no live replies.** A tombstone earns its place
  only by keeping live replies in their thread, so a tombstoned root survives
  with at least one live direct reply, and a tombstoned reply never does.
- A surviving tombstone renders as `TOMBSTONE_LABELS` text with no author, no
  avatar and no controls, for anyone. There are no moderation buttons in the
  client: remove and restore stay API-only until a moderation screen exists.
- Edit, delete and like render only when the server would allow them; the
  server refuses each with 403 regardless. `closed` (a Draft book) makes the
  section read-only.
- Replying and editing are mutually exclusive state, so one composer at most is
  on screen. The heading renders in every state so the section keeps its place.
- The molecule may be called `Comment` because antd removed its own in v5.

## Images (`BookCover`, `AccountAvatar`, `ImageUploadButton`)

- `BookCover`'s image is `alt=""` (the title always sits beside it). A failed
  load falls back to the title placeholder, and a new `?v=` URL gets a fresh
  try rather than staying stuck on an old failure.
- `AccountAvatar` is decorative end to end (`aria-hidden`, `alt=""`) because a
  name sits beside it everywhere but `ProfilePage`, under the "Profile" heading.
- `ImageUploadButton` prechecks type and size against `shared`'s limits and
  makes no query call; each caller wires its own mutation.

## Forms and pickers

- `BookForm` / `SeriesForm`: "No series" and "No genre" travel as `0` inside the
  form and leave as `null`. Creating omits the status radios: every new book is
  a draft.
- `CoAuthorManager`'s picker draws avatars through `optionRender`; the option's
  `label` stays a plain string so antd's tooltip and rc-select's filter still
  work. The last Co-author is never offered Leave.
- Chapter publishing: "Publish" sends `'now'` or the picked moment as a UTC
  instant, "Save draft" sends `null`; a Published chapter gets "Save" (no
  `publishedAt`) and "Return to draft". `dayjs` is a direct dependency because
  the antd pickers take its objects.
- `AuthModals` mounts only the `activeModal`. `RegisterModal`'s "I'm author"
  maps to `role: 'author' | 'user'`, the two `REGISTRABLE_ROLES`.
- `LikeButton` takes the viewer's like id, not a boolean, so a second click
  deletes the right row. It uses a text glyph: `@ant-design/icons` is not a
  dependency.
- `NotificationBell` marks unread items read when opened but keeps them
  highlighted until it closes.

## Sortable lists (`SortableList`)

- `@dnd-kit` through a drag handle named "Reorder {label}": `PointerSensor` for
  the mouse, `KeyboardSensor` for Space, arrows, Space.
- `onReorder` fires with the whole new order, only when a drop moved something.
- An `<ol>` with markers hidden: order is shown by place, never by number.
  Announcements name items by label, not id.
