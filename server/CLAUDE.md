# Server — books_demo_spa

Node.js + TypeScript API built on Express 5, with Sequelize 6 / MySQL available
for persistence.

## Status

The `User`, `Series`, `Book`, `Chapter`, `Comment` and `Like` models and their
CRUD APIs are implemented end to end, associated by `User.hasMany(Series)`,
`User.hasMany(Book)`, `Series.hasMany(Book)`, `Book.hasMany(Chapter)`, and
`hasMany(Like)` from each of `User`, `Book` and `Comment`.
Sequelize (via `mysql2`) connects to the `books_demo_spa` MySQL database;
`src/index.ts` ensures the schema exists, authenticates, and mounts the
Express app under `/api`. Routes, controllers, repositories, models, and
middleware are all wired for those six. `node:test` is the test runner
(`npm test`).

`books` and `series` each carry a `title` (`VARCHAR(255) NOT NULL`, trimmed)
alongside their `description`, which now unambiguously means the annotation.
The `?q=` filter on both matches either column.

`GET /api/books/:id` returns a `BookDetail` rather than a `PublicBook`: the
record plus an `author` (`AuthorSummary` — `PublicUser` minus the email, which
is the omission that makes it safe in a public response), the series `id` and
`title`, a `likeCount` and the caller's own `viewerLikeId`. The list endpoint
is untouched and stays cheap.

`Session` and `PasswordResetToken` back a full session-based auth API at
`/api/auth`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`,
`POST /password-reset/request` and `POST /password-reset/confirm`. Both models
hang off `User.hasMany(...)` with `ON DELETE CASCADE`. **Every write on the
five resources above — `POST`, `PATCH`, `DELETE` — and both reads on
`/api/users` now go through the role-permission matrix** (see **Roles and
permissions** below) rather than a blanket session check: a request with no
session is refused with 401, and a signed-in role with no grant for that
module/action is refused with 403. `/api/users` guards its reads too, because
`PublicUser` carries an email address and an open list would be a scrapeable
account directory. Every other `GET` stays public. See **Auth** and **Roles
and permissions** below.

`Comment` has a full CRUD API at `/api/comments`, built to the same
five-file pattern as the others. `User.hasMany(Comment)`,
`Book.hasMany(Comment)`, `Comment.hasMany(Like)` and the self-referential
`Comment.hasMany(Comment, { as: 'replies' })` are all wired. Like likes, its
author comes from the session rather than the body, and `PATCH`/`DELETE`
check ownership through the permission matrix's `own` scope — the same
mechanism that now also gates books, series and chapters (see **Auth**). Its
list endpoint returns a flat page — each row carrying `parentId`, an embedded
`author`, a `likeCount` and the caller's `viewerLikeId` — and leaves tree
assembly to the client, which keeps paging meaningful. Deletion is soft:
`DELETE /api/comments/:id` sets a `tombstone` (`'deleted'` or `'removed'`) on
that one row instead of removing it, so its replies keep a parent, and its
text and author are withheld on the way out; `POST /api/comments/:id/restore`
reverses a moderator's `removed` tombstone. See **Auth**.

## Development Commands

This package is an npm workspace. Install from the repo root, not here; the
scripts below still run from this directory, or from the root with `-w server`.

- `npm start` — run the server: `node ./src/index.ts` (native TS, Node >= 22.5)
- `npm run dev` — run under nodemon, which restarts on changes to
  `src/**/*.{ts,json}`. The script is bare `nodemon`: `nodemon.json` supplies
  both the watch settings and `exec: node ./src/index.ts`, so the entry point
  is named once rather than in both places
- `npm run build` — compile with `tsc -p tsconfig.build.json` to `dist/`; that
  config extends `tsconfig.json` (which in turn extends the repo-root
  `tsconfig.base.json`) but excludes `src/**/*.spec.ts`, so test files
  are never emitted
- `npm test` — `node --env-file-if-exists=.env.local --test "src/**/*.spec.ts"`
  (loads `.env.local` when present, then runs every `node:test` spec, including
  the MySQL-backed integration suite — omitting `--env-file-if-exists` would
  silently skip that suite instead of failing loudly)
- `npm run typecheck` — `tsc --noEmit` (type-check only)
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`,
  which calls `createConfig` in the repo-root `eslint.config.base.mjs`; the
  Node globals block is all that is local)

Prettier has no script here: it is root-only, because `.prettierrc.json` and
`.prettierignore` are repo-wide. Run `npm run format` from the repo root.

There is no `sequelize-cli` dependency yet — do not reference it until it is
added.

## Layout

- `src/index.ts` — process entry point: loads `.env.local`, ensures the schema,
  connects Sequelize, authenticates, and starts listening
- `src/app.ts` — builds the Express app (`createApp`), wiring routes and the
  error-handling middleware
- `src/logger.ts` — the sanctioned console boundary; every other module logs
  through this instead of calling `console.*` directly
- `src/password.ts` — argon2id password hashing and verification
- `src/tokens.ts` — `createToken()` (32 random bytes, base64url) and
  `hashToken()` (SHA-256) for session and reset tokens
- `src/sessionCookie.ts` — the `sid` cookie's name, TTL, and the shared
  set/clear helpers
- `src/delivery/resetDelivery.ts` — the `ResetDelivery` interface, `resetUrl()`,
  and the logger-backed implementation that is the only sink so far
- `src/routes/` — Express route definitions (`authRoutes.ts`, `userRoutes.ts`,
  `userRoleRoutes.ts`, `seriesRoutes.ts`, `bookRoutes.ts`, `chapterRoutes.ts`,
  `commentRoutes.ts`, `likeRoutes.ts`, mounted under `/api`).
  `routeTestKit.testkit.ts` holds the harness the route specs share (`withApp`,
  `withAuthenticatedApp`, `AUTH_COOKIE`, `json`); `tsconfig.build.json`
  excludes `*.testkit.ts` alongside `*.spec.ts`, so neither is emitted to
  `dist/`.
- `src/controllers/` — request handlers / HTTP mapping (`authController.ts`,
  `userController.ts`, `seriesController.ts`, `bookController.ts`,
  `chapterController.ts`, `commentController.ts`, `likeController.ts`)
- `src/repositories/` — data-access layer (`userRepository.ts`,
  `seriesRepository.ts`, `bookRepository.ts`, `chapterRepository.ts`,
  `commentRepository.ts`, `likeRepository.ts`, `sessionRepository.ts`,
  `passwordResetRepository.ts`, Sequelize-backed; `likePattern.ts` holds the
  LIKE escaping they share). Note the collision: `likePattern.ts` is about the
  SQL `LIKE` operator and has nothing to do with `likeRepository.ts` — the two
  sit next to each other and mean different things by the same word.
- `src/models/` — Sequelize models & associations (`User.ts`, `Series.ts`,
  `Book.ts`, `Chapter.ts`, `Comment.ts`, `Like.ts`, `Session.ts`,
  `PasswordResetToken.ts`, `Permission.ts`, `index.ts`; `tagArray.ts`
  holds the JSON tag-column normalisation `Series` and `Book` share)
- `src/permissions/` — `matrix.ts` (the role/module/action → scope
  definition and `buildMatrixRows()`) and `permissionStore.ts` (the
  in-memory cache `scopeFor()` reads and `syncPermissions()` writes); see
  **Roles and permissions**.
- `src/db/` — database connection / config (`config.ts`, `ensureDatabase.ts`,
  `sequelize.ts`)
- `src/middleware/` — auth, permissions, validation, error handling
  (`requireAuth.ts`, `requirePermission.ts`, `optionalAuth.ts` (unmounted —
  see **Auth**), `sessionUser.ts` (the shared `resolveSessionUser` the other
  three build on), `errorHandler.ts`, `notFound.ts`, `validate.ts`)
- `src/types/` — shared TypeScript types (`user.ts`, `series.ts`, `book.ts`,
  `chapter.ts`, `comment.ts`, `like.ts`, `permission.ts` (`Role`, `Module`,
  `Action`, `PermissionScope` and the `as const` arrays behind them), `auth.ts`,
  `errors.ts`, `express.d.ts`)

## Environment

`.env.local` (git-ignored) supplies these; `src/db/config.ts` validates them
with zod and throws on anything malformed rather than starting with a broken
value.

| Variable                  | Default                 | Notes                                                                                                                                                            |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`           | `development` \| `test` \| `production`. Also picks the argon2 cost — `test` uses deliberately weak parameters — and gates the cookie's `secure` flag.           |
| `PORT`                    | `4000`                  | The API's own port.                                                                                                                                              |
| `DB_HOST` / `DB_PORT`     | `127.0.0.1` / `3306`    |                                                                                                                                                                  |
| `DB_NAME`                 | `books_demo_spa`        |                                                                                                                                                                  |
| `DB_USER` / `DB_PASSWORD` | _(none)_                | No default on purpose: a root/root fallback would silently start the server against an unintended database. An empty password is accepted, a missing one is not. |
| `APP_BASE_URL`            | `http://localhost:3000` | The client origin a password-reset link points at. Validated as a URL, so a malformed value fails at startup rather than in an email nobody can fix.             |

## Auth

- **The `sid` cookie** carries an opaque 32-byte base64url token: `httpOnly`,
  `sameSite: 'lax'`, `path: '/'`, `secure` only under
  `NODE_ENV=production`, seven-day `maxAge`. `lax` rather than `strict` so
  following a reset link from a mail client does not arrive session-less. Set
  and cleared through one shared options object in `sessionCookie.ts`, because
  a `clearCookie` whose options differ from the `cookie` that set it leaves the
  original in place.
- **Tokens are hashed with SHA-256, not argon2.** argon2 is slow by design to
  make low-entropy passwords expensive to guess; a 256-bit random token cannot
  be guessed at any speed, so that cost buys nothing — and a session token is
  verified on _every_ authenticated request, where argon2's ~19 MiB working set
  would be a self-inflicted denial of service. Hashing at rest still matters: a
  leaked dump must not hand over usable sessions. Only the hash is stored; the
  plaintext exists in the cookie and the reset link and nowhere else.
- **`requireAuth` guards only `GET /api/auth/me`** now; every write on the six
  resources below runs through `requirePermission` instead (see **Roles and
  permissions**). Both run before `validate` on the route they guard, so an
  unauthenticated or disallowed request is refused without its body being
  parsed or echoed back in a 400. The visible consequence: a request refused
  by either middleware with a malformed body or id still comes back 401 or
  403, never 400.
- **Login gives one answer to two questions.** An unknown login and a wrong
  password both return 401 with an identical body, and the unknown-login path
  deliberately spends an argon2 verify against a cached dummy hash so the two
  cannot be told apart by response time either. That dummy hash is computed
  lazily and reused, and `authController.spec.ts` drives the `verify` seam
  directly to prove both properties — a wall-clock assertion would be flaky
  under load, and an ESM import binding cannot be spied on from outside.
- **A blocked account is checked after the password, not before**, or the 403
  would tell an attacker without the password that the account exists.
- **Blocking an account ends its sessions.** `userRepository.update` runs the
  status change and the session cleanup in one transaction, and only fires
  the cleanup on the transition into `blocked` from something else — moving
  an already-blocked account to `blocked` again, or unblocking it, deletes no
  sessions. See the accepted race below for the one window this leaves open.
- **Every successful password change through `PATCH /api/users/:id` ends
  every session on that account**, in the same transaction as the update —
  the session that made the change included. When the change is to the
  caller's own account, the response also clears the `sid` cookie, so the
  browser stops presenting a token that now names nothing
  (`userController.update`).
- **A known race is accepted rather than fixed.** A login reads the account's
  status, spends an argon2 verify, and only then opens its session; if a
  concurrent block's `Session.destroy` lands in that window, the new session
  survives the purge. `resolveSessionUser` treating a blocked account's
  session as no session at all closes the practical hole: that leftover
  session is useless for as long as the block lasts, and works again only if
  the account is later unblocked. Harmless, since only someone who already
  holds the password can end up with one.
- **`pending` restricts nothing today.** It is `users.status`'s default in
  `models/User.ts`, so `POST /api/users` with no `status` in the body creates
  one; it is reserved for a future email-verification step, and until that
  exists a `pending` account signs in exactly like an `active` one.
- **Login always opens a new session** rather than reusing an existing row,
  which is what rules out session fixation.
- **Reset requests always answer 202**, whether or not the address exists —
  branching would make the endpoint an account-enumeration oracle. A new
  request invalidates any outstanding token first, so two live links never
  coexist. Tokens last one hour, far less than a session's seven days, because
  a link sits in a mailbox.
- **Reset confirmation revokes every session** for that user, in the same
  transaction that stores the new password and stamps the token used — a
  partial apply would leave a redeemed token beside a live pre-reset session,
  the exact state the flow exists to prevent. Unknown, expired and
  already-used tokens all fail with one 400 and one message.
- **`optionalAuth` is not mounted on any route.** It still exists in
  `middleware/optionalAuth.ts` with its spec, built on the same
  `resolveSessionUser` in `middleware/sessionUser.ts` that `requireAuth` and
  `requirePermission` use — it reports "nobody" for all five failure modes
  (missing cookie, unknown token, expired session, deleted user, blocked
  account) and calls `next()` with `req.user` left unset rather than
  answering 401. It used to
  sit on `GET /api/books/:id` and `GET /api/comments` so those public reads
  could report `viewerLikeId` without a 401 for anonymous visitors, but
  `requirePermission` now resolves the session itself on every route,
  including public reads, so nothing wires `optionalAuth` in any more. Do not
  wire it back in on the assumption it is load-bearing; treat it as
  unreferenced until it is either reused or deleted.
- **Ownership is enforced on books, series, chapters, comments and likes.**
  `admin` and `superadmin` bypass it — the matrix grants them `any` rather
  than `own` on the module in question, so the check in the controller is
  skipped outright. For the roles that only get `own` (`user` and `author` on
  their own resources), only the row's owner may `PATCH` or `DELETE` it, and
  nobody may like their own book or their own comment; every refusal is 403.
  - The book, series, chapter, comment and like checks each live in their own
    controller (`assertMayTouch` / `assertOwned`), not a middleware, because
    they need the repository to load the row before an owner can be compared
    — `requirePermission` only knows the scope, not the row. Every one reports
    404 before 403, so a refusal cannot be used to probe which ids exist.
  - **Chapters resolve ownership through their book**, because `chapters` has
    no `userId` column: `chapterController.assertMayTouch` looks up the
    chapter's `bookId` and then the book's owner, and `assertMayAddTo` does
    the same for a `POST` that has no chapter yet to own — the target book
    answers instead.
  - **Creating into another resource checks that resource's owner too.**
    `bookController.assertMayAddToSeries` checks the caller may touch the
    target series before a book is filed into it, because filing a book into
    a series changes the series as well as the book — without the check an
    author could put a book into a stranger's series, and the series' owner
    could only undo it by deleting the series. `null` (unlinking) and an
    absent key (leaving the link alone) touch no series and need no check; a
    named series that does not exist is still a 404 that blames the series,
    ahead of the book's own 403.
  - **A comment resolves its tombstone before any owner comparison.** A
    tombstone's `userId` is `null`, so comparing it against `req.user.id`
    would refuse everyone, owner included. `commentController.update` and
    `.remove` therefore reject a tombstone outright — `PATCH` with 403,
    `DELETE` with 404, since there is nothing left to delete a second time —
    before `assertOwner` ever runs.
  - The self-like check lives in `likeRepository.create`, which loads the
    target to compare owners. It is the one check-then-write in that file, and
    it is safe where the uniqueness check would not be: a row's owner never
    changes, so the answer cannot go stale before the insert. Uniqueness stays
    with the indexes for exactly that reason. This is a domain invariant, not
    a matrix rule — no scope value spells out "not yourself," so do not go
    looking for it in the permission table.
- **Deleting a comment leaves a tombstone, not a hole.** `DELETE
/api/comments/:id` sets `tombstone` on that one row and touches nothing
  else; the replies stay, so the thread reads around the gap rather than
  losing everything under a withdrawn remark. There are two kinds
  (`Tombstone` in `types/comment.ts`):
  - **`deleted`** — the comment's own owner deleted it (an admin deleting
    their own comment is still an owner deletion, not moderation), or the
    owner's account was deleted (see **Sequelize & MySQL conventions**
    below). Nobody restores a `deleted` comment.
  - **`removed`** — a moderator (`admin` or `superadmin`, acting under `any`)
    deleted someone else's comment. `POST /api/comments/:id/restore` reverses
    this: it requires the caller's `comments × delete` scope to resolve to
    `any` — whoever removed it, not necessarily the same moderator — refuses
    anyone else with 403 before any lookup, and answers 404 for a missing id,
    a live comment, and a `deleted` comment alike, since none of them has
    anything a moderator could restore. Success is 200 with the comment.
  - **Both kinds are anonymous the same way.** `text` comes back `''`,
    `author` comes back `null`, and `userId` comes back `null`
    (`toPublicComment` / `toCommentWithAuthor` in `models/Comment.ts`); the
    text itself stays on the row, and blanking in one place rather than at
    each call site is what stops a future endpoint serving it by omission.
    `GET /api/comments?userId=` never returns a tombstone of either kind — an
    owner filter naming a tombstoned row would out exactly the person it
    hides (`buildWhere` in `commentRepository.ts`).
  - **A tombstone is immutable.** `PATCH` on one is 403 for everyone, since
    editing it would put text back under a heading saying the author
    withdrew it. A second `DELETE` is a 404 for everyone: there is nothing
    left to delete.
  - **A tombstone takes no new activity.** Replying to one is 403
    (`You cannot reply to a deleted comment`, `commentRepository.create`);
    liking one, or flipping an existing like on one, is 403
    (`You cannot like a deleted comment` / `You cannot change a like on a
deleted comment`, `likeRepository`) — but removing your own existing
    like from a tombstone is still allowed. Replies that already exist under
    a tombstone behave normally.
  - **A thread cannot be tombstoned wholesale.** Each reply belongs to its
    own author, and only they, a moderator, or their own account's deletion
    can turn it into a tombstone. That is the deliberate cost of keeping
    replies alive.
- **Identity comes from the session, never the body.** Neither
  `createCommentSchema` nor `createLikeSchema` accepts a `userId`; both
  controllers read `req.user.id`. This is load-bearing rather than tidy: if the
  body could name a user, "you may only edit your own comment" and "you may not
  like your own book" would both be defeated in one line, and the likes' unique
  indexes would be enforcing one like per _claimed_ user. `createLikeSchema`
  used to take one — that is a breaking change to `POST /api/likes`.

## Roles and permissions

- **Five roles, and one place they stop accumulating.** `ROLES` in
  `types/permission.ts` is `guest`, `user`, `author`, `admin`, `superadmin`.
  `guest` is not a storable value — `USER_ROLES` (what actually sits in
  `users.role`) omits it — it is what `requirePermission` assumes when a
  request carries no session, so a public read is described by a row in the
  matrix rather than by the absence of a guard. Each role after `user`
  layers more grants on top of the last, with one deliberate exception:
  `admin` and `superadmin` both get no `create` on `books`, `series` or
  `chapters`. Admins moderate; they do not author, and that stays true even
  for the role that is `any` on literally everything else.
- **The matrix is a `role × module × action → scope` table**
  (`permissions/matrix.ts`, `models/Permission.ts`): seven modules (`users`,
  `series`, `books`, `chapters`, `comments`, `likes`, `reports` — `reports`
  is reserved for a moderation feature that has no model, controller or
  route yet, so today it grants access to nothing), four actions (`create`,
  `read`, `update`, `delete`), and a scope of `none` / `own` / `any` rather
  than a boolean. A boolean could not tell "an `author` may update the books
  they wrote" from "an `admin` may update anyone's book" — that distinction
  would fall back into every controller instead of living in one table. On
  `create` specifically, `own` and `any` mean the same thing: a created row
  is the caller's by construction (its owner column is always the session's
  user id), so `own` is simply the spelling a role that may create uses — but
  the create path is not scope-only. Creating a book into a series checks
  that the caller may touch that series (`assertMayAddToSeries` in
  `controllers/bookController.ts`), and creating a chapter checks the owner
  of its book (`assertMayAddTo` in `controllers/chapterController.ts`); both
  run after the matrix has already let the request through.
  `PERMISSION_DEFINITION` in `matrix.ts` only spells out what is granted;
  everything else expands to `none` when `buildMatrixRows()` produces one
  row per role/module/action for the table, so a missing row can never be
  mistaken for an accidental grant.
- **Seeded wholesale at startup, read into memory once.** `permissionStore.ts`
  keeps an in-process `Map` that answers `scopeFor(role, module, action)`.
  The module seeds that map from `buildMatrixRows()` at import time — before
  any database call — so `scopeFor` answers correctly in any process,
  including a test that never touches MySQL; an empty-until-synced cache
  would make that misconfiguration look identical to a deliberate 403.
  `syncPermissions()` then replaces the `permissions` table wholesale inside
  a transaction (destroy-then-`bulkCreate`, never an upsert — a partial
  upsert would leave orphan rows for a module the code no longer has) and
  reloads the map from what was actually written. `src/index.ts` calls
  `syncPermissions()` unconditionally on every boot, including production,
  while `sequelize.sync()` itself is gated to non-production. **A production
  boot therefore needs the `permissions` table to already exist** — nothing
  here creates it outside `sequelize.sync()` — or `syncPermissions()` throws
  and the process never starts listening. That is deliberate, but not
  because the server would otherwise refuse everything — the code seed above
  means it would answer correctly without the table. A missing `permissions`
  table means the schema was never provisioned, and failing loudly at boot
  beats discovering it later. It does mean a production deploy must
  provision that table (and the rest of the schema) before the first boot.
- **Two-level enforcement.** `requirePermission(module, action)` — mounted
  before `validate`, like `requireAuth` — resolves the session, looks up
  `scopeFor(role, module, action)`, and refuses outright on `none`: **401
  when there is no session at all** (the caller is refused a chance to
  prove who they are), **403 when a resolved role has no grant** (the
  caller is known and still not allowed). On `own` or `any` it lets the
  request through and stamps `req.permissionScope`, because it cannot judge
  `own` itself — the row is not loaded at that point. The controller's
  `assertMayTouch`/`assertOwned` is the second level: `any` returns
  immediately, `own` loads the row and compares its owner against
  `req.user.id`, 404 before 403 as above.
- **`role` appears in neither `createUserSchema` nor `updateUserSchema`.**
  This is load-bearing, not incidental: `updateUserSchema` is
  `createUserSchema.partial()`, so a `role` field added to the create schema
  would appear on the update schema for free, and `PATCH /api/users/:id`
  would let any signed-in caller promote themselves. Role changes travel
  through their own schema (`updateRoleSchema`) and their own route instead.
- **`POST /api/users` — the administrative create — is reachable only by
  `superadmin`** now, because `ADMIN_GRANTS` gives `admin` no `create` on
  `users`: an admin moderates existing accounts, it does not mint new ones.
  Before this branch any signed-in user could call it. `POST /api/auth/register`
  is the unaffected, separate public door every real signup uses — it reaches
  only `user`/`author`, via `REGISTRABLE_ROLES`, not the matrix.
- **`PATCH /api/users/:id/role` is the one door for role changes**
  (`routes/userRoleRoutes.ts`, mounted ahead of the plain `/users` routes for
  readability only — `/:id` matches exactly one path segment, so it can never
  match `/:id/role`, and the two paths do not collide in either order). Getting
  through the door only requires `users × update` from the matrix — `own`
  for `user`/`author`, `any` for `admin`/`superadmin` — because the matrix
  grades the resource, not the value being written; a second check inside
  the handler decides which role a given caller may set. A `superadmin` may
  set any role on any user. Anyone else may set a role only on their own
  row, and only to `user` or `author` (`REGISTRABLE_ROLES` — the same pair
  registration itself can reach): that includes `admin`, so an admin may
  step themselves down to `user` or `author` but may not touch anyone
  else's role, promote themselves to `admin`/`superadmin`, or promote
  someone else at all. Switching between `user` and `author` is a
  statement of intent, not a privilege grant — the real protection on an
  author's account is that they may still only touch their own rows.
- **The first `superadmin` is a manual SQL statement**, because nothing in
  the API can grant that role — registration reaches only `user`/`author`,
  and the role route requires an existing `superadmin` to create another:

  ```sql
  UPDATE users SET role = 'superadmin' WHERE login = '<your login>';
  ```

- **Matrix-governed access is not the same thing as a domain invariant.**
  The self-like ban (`likeRepository.create` refuses a like whose target it
  owns) and identity-from-session (see above) both live in code, not in a
  scope value — there is no `PermissionScope` that spells out "not
  yourself," so do not go looking for either rule in the permission table.
  A comment's tombstone rules are the same kind of thing: nothing in the
  matrix says a tombstone refuses new activity — `commentRepository.create`
  refuses a reply to one, `likeRepository.create`/`.update` refuse a like or
  a like flip on one (removing your own existing like is still allowed), and
  a tombstone is immutable — `commentController.update` answers 403 for
  everyone and `.remove` answers 404 for everyone, since there is nothing
  left on the row to delete a second time. See **Deleting a comment leaves a
  tombstone, not a hole** above.
- **`admin`'s reach over accounts is settled: `user` and `author` only, plus
  itself.** `userController.assertMayTouch` layers the rank rule on top of
  the matrix's `update: any` / `delete: any` for `admin` on `users`: an admin
  may `PATCH` their own row, and may `PATCH` or `DELETE` only accounts whose
  role is `user` or `author` (`ADMIN_MANAGEABLE_ROLES`) — targeting another
  admin or any superadmin is a 403, and a missing id is still a 404 first,
  ahead of the rank check. A `superadmin` reaches every account with no such
  narrowing, but may not delete their own account (`userController.remove`)
  or change their own role through `PATCH /api/users/:id/role`
  (`userRoleRoutes.ts`); another superadmin may do both. A `user`/`author`
  still reaches only their own row, refused without a database lookup.
  Nobody, at any role, changes their own `status` through
  `PATCH /api/users/:id` — a `status` key in the body of a request against
  your own row is a 403 even when the value would not change anything.
  Changing your own `password` or `email` additionally requires
  `currentPassword` in the same body (missing → 400, wrong → 403); it is
  never stored and never counts as a change on its own. The rank rule
  protects **accounts** only — moderating content ignores it, so an admin
  may remove a superadmin's comment. `admin` and `superadmin` also carry
  `update: own` on `comments` and `likes` (see **Comments** above): a
  moderator removes, and for comments restores, but never rewrites, someone
  else's reaction or remark. Superadmin's blanket `any` therefore has two
  carve-outs, not one: no `create` on `books`/`series`/`chapters`, and
  `update: own` rather than `any` on `comments` and `likes`.

## Runtime notes

- ESM package (`"type": "module"`), Node >= 22.5. `tsconfig.json` uses
  `module`/`moduleResolution: NodeNext` to match, and emits ESM to `dist/`.
- Both `start` and `dev` run the `.ts` entry directly via Node (native TS
  type-stripping); nodemon only adds watch/restart on top.
- Every relative import must carry the `.ts` extension (e.g. `from './app.ts'`),
  because Node's native TS mode resolves modules exactly as written — it does
  no extension rewriting itself. `tsconfig.json` sets
  `rewriteRelativeImportExtensions: true`, so `npm run build` rewrites those
  same imports to `.js` when compiling to `dist/`, and the same source runs
  unmodified in both modes.

## Express 5 notes

Express 5 differs from Express 4 in ways most tutorials — and most generated
snippets — still get wrong. Verified against the 5.x router and request sources:

- **Async errors forward themselves.** The router inspects a handler's return
  value and calls `next(err)` when the returned promise rejects, so an `async`
  handler needs no `try/catch` whose only job is to funnel the error into
  `next`. Catch only to add context, then rethrow.
- **Handler arity is significant.** An error handler must take exactly four
  params `(err, req, res, next)`; with three it is treated as ordinary
  middleware, with five it is skipped by both the normal and the error path.
  Keep the unused `next` rather than deleting it to satisfy a lint rule.
- **`req.query` is a getter with no setter.** Assigning to it fails silently
  (or throws in strict mode) — put validated or coerced values on your own
  request property instead. Every read re-parses the query string, so read it
  once into a local in hot paths.

## Code Guidelines (apply as the API is built out)

- **Strict types**: strict mode is on. Avoid `any`; type models with
  `InferAttributes` / `InferCreationAttributes` and handlers with `RequestHandler`.
- **Transactions**: wrap multi-step writes in a managed transaction
  (`sequelize.transaction(async (t) => { ... })`) and pass `{ transaction: t }`
  to every query in the block.
- **Query security**: never interpolate strings into `sequelize.query()` — use
  bind parameters or replacements to prevent SQL injection.
- **N+1 avoidance**: don't run queries inside a loop; use `Op.in` or eager loading
  (`include: [...]`).
- **Error handling**: throw typed errors and let a single error-handling middleware
  (mounted last) map them to HTTP responses.
- No synchronous filesystem calls in request handlers; no `console.log` for logging
  in production code — use a logger. ESLint flags `console` (`no-console`) and
  `any` (`@typescript-eslint/no-explicit-any`).

## Sequelize & MySQL conventions

- **Model typing**: derive attributes from `InferAttributes`, mark
  server-generated columns `CreationOptional`, and prefix every field with
  `declare` so they stay type-only and never emit class properties that shadow
  Sequelize's accessors:

  ```ts
  class Book extends Model<
    InferAttributes<Book>,
    InferCreationAttributes<Book>
  > {
    declare id: CreationOptional<number>;
    declare title: string;
    declare authorId: number;
    declare createdAt: CreationOptional<Date>;
  }
  ```

- **Case-sensitive login**: `login` overrides the table's default collation
  with an explicit `utf8mb4_0900_as_cs` column type (Sequelize 6 has no
  per-column collation option, so it is given as a raw type string), which is
  what lets `Bob` and `bob` coexist as distinct users. `email` carries no
  column collation and inherits the case-insensitive table default instead.
  Because of that split, any query that searches or filters `login` alongside
  case-insensitive fields needs an explicit `COLLATE` clause (see `buildWhere`
  in `userRepository.ts`) or the comparison silently stays case-sensitive.
- **The dialect is `mysql`** (through `mysql2`), not Postgres. `DataTypes.JSONB`
  and `DataTypes.ARRAY` are Postgres-only and will not work here.
- **Charset**: create schemas and tables as `utf8mb4` / `utf8mb4_0900_ai_ci` —
  MySQL's `utf8` is 3-byte `utf8mb3` and drops emoji and much CJK. Under utf8mb4
  a `VARCHAR(255)` index entry reaches 1020 bytes, which fits InnoDB's 3072-byte
  key limit on the default DYNAMIC row format but overflows the 767-byte limit of
  REDUNDANT/COMPACT — use a prefix index for longer strings.
- **Uniqueness belongs in the schema**: enforce it with a unique index, never a
  custom validator that runs `findOne` first — that is a check-then-write race
  and an extra query on every save.
- **Hooks**: pass `options.transaction` to every query a hook issues, or the
  hook's writes land outside the caller's transaction. Keep external side effects
  (email, queue publishes) out of hooks entirely — `afterCreate` fires before the
  surrounding transaction commits, and a rollback cannot unsend them.
- **Fail fast on startup**: let a failed `sequelize.authenticate()` reject and
  stop the process; never log-and-continue into a server with no database.
- **Lists in MySQL**: `series.tags` and `books.tags` are `JSON` columns,
  because MySQL has no array type. Two consequences worth remembering. A JSON
  column cannot carry a literal `DEFAULT`, so the empty-array default lives in
  `createSeriesSchema` / `createBookSchema` rather than the DDL. And membership
  needs `JSON_CONTAINS`, not `LIKE` — a substring match would let `?tag=epic`
  also return rows tagged `epic-fantasy`. Pass the tag as an argument to `fn()`
  so Sequelize escapes it instead of concatenating it into the SQL.
- **Foreign key column types must match exactly**: `series.userId` and
  `books.userId` / `books.seriesId` are `INTEGER UNSIGNED` because `users.id`
  and `series.id` are; a plain `INTEGER` makes MySQL reject the constraint with
  errno 3780.
- **`books.seriesId` is optional, and that drives its `ON DELETE`**: a book can
  stand alone, so the column is nullable and `Series.hasMany(Book)` uses
  `ON DELETE SET NULL` — dropping a series unlinks its books instead of
  deleting records nobody asked to delete. MySQL rejects `SET NULL` on a
  `NOT NULL` column, so the association passes `allowNull: true` in its
  `foreignKey` object rather than letting Sequelize infer NOT NULL.
  `books.userId` stays `CASCADE`, like `series.userId`.
- **`chapters.bookId` is the mirror image**: required, so it is `NOT NULL` and
  `Book.hasMany(Chapter)` cascades. A chapter outside a book is not a state
  worth representing, and `SET NULL` would be illegal on the column anyway.
  Between them the two associations cover both shapes — consult which one an
  optional link deserves before copying either.
- **`comments.parentId` is a third shape, and InnoDB's cascade depth is what
  chooses it**: the column is a self-reference (a reply points at the comment
  it answers), nullable because a top-level comment answers nothing. It looks
  like a candidate for `ON DELETE CASCADE` — delete a comment, lose its
  subtree — but a self-referential cascade recurses, and InnoDB caps a cascade
  chain at 15. Measured on MySQL 8.0.46: with `CASCADE`, deleting a thread
  nested deeper than 15 fails with `ER_FK_DEPTH_EXCEEDED` (errno 3008), and so
  does deleting the _book_ that owns it, because `books` → `comments` then
  recurses through the replies; a bulk `DELETE FROM comments` fails the same
  way, which would take the test teardown with it. `RESTRICT` fares no better
  — that book delete then fails with errno 1451. `SET NULL` leaves every one
  of those working, at the cost of promoting a deleted comment's direct replies
  to top level, so that is what `Comment.hasMany(Comment)` declares. Comment
  deletion is soft now (see **Deleting a comment leaves a tombstone, not a
  hole** under Auth), so `DELETE /api/comments/:id` never reaches this
  column at all; the association's `SET NULL` only ever fires when a book
  cascades away its comments wholesale, not from removing one comment.
- **A self-referential `ON UPDATE CASCADE` is a lie**: MySQL will not recurse
  an update through the table it is already updating, so it silently behaves
  like `RESTRICT` (verified — the update fails with errno 1451). The replies
  association therefore declares `onUpdate: 'RESTRICT'`, unlike every other
  association here, which says what actually happens. Nothing is lost: `id` is
  a surrogate key that is never rewritten.
- **`chapters.text` is `MEDIUMTEXT`, not `TEXT`**: `TEXT` holds 65,535
  _bytes_, which under utf8mb4 is as few as ~16k characters — a chapter of a
  novel passes that easily, and MySQL then truncates (or, in strict mode,
  rejects the write). `DataTypes.TEXT('medium')` is how Sequelize spells it.
  `CHAPTER_TEXT_MAX_LENGTH` caps input at 1,000,000 characters, which stays
  inside the 16 MB column even at 4 bytes per character. The descriptions on
  `series` and `books` are short by nature and stay `TEXT`.
- **A large column belongs out of the list SELECT**: `chapterRepository.list`
  passes an explicit `attributes` array that omits `text`, and returns
  `ChapterSummary` (`Omit<PublicChapter, 'text'>`) rather than the full record,
  so `GET /api/chapters` cannot drag twenty MEDIUMTEXT bodies off disk to
  serve a table of contents. The body is reachable through `GET /:id`. Keeping
  the omission in the _type_ is what stops a future call site from quietly
  putting it back.
- **Two foreign keys need two error messages**: `bookRepository` cannot map
  every `ForeignKeyConstraintError` to one resource the way `seriesRepository`
  does — blaming the user for a bad `seriesId` sends the caller hunting for a
  user that exists. The columns are only distinguishable through MySQL's
  constraint text, so `asMissingReference` matches the column name in it and
  falls back to `userId`, which is the only candidate when no `seriesId` was
  supplied. Both branches are covered by the MySQL-backed suite.
- **`likes` is the one table with an invariant the database cannot hold**: a
  like points at exactly one of a book or a comment, so `bookId` and
  `commentId` are both nullable and exactly one is filled. MySQL 8 would
  express that as a `CHECK` constraint, but Sequelize 6 cannot declare one in
  `Model.init` and there is no migration tool here to add it out of band — so
  the XOR is enforced twice in application code instead: a `.refine()` on
  `createLikeSchema` (400 at the API edge) and a model-level `validate` in
  `Like.init` (the last line for callers reaching Sequelize directly). A raw
  SQL write can still break it. Add the `CHECK` when migrations arrive.
- **Both of a like's targets cascade, unlike every other optional FK here**:
  `books.seriesId` and `comments.parentId` are nullable and `SET NULL`, but a
  like whose target was nulled out would have neither column set — precisely
  the state the XOR forbids — so deleting a book or a comment deletes its
  likes. There is no cascade-depth problem: the longest chain is
  `books` → `comments` → `likes`, and nothing recurses. `users` reaches
  `likes` by two paths (directly, and via its books and comments), which MySQL
  permits.
- **NULLs are what make one unique index into two**: `likes` carries unique
  indexes on `(userId, bookId)` and `(userId, commentId)` to give a user one
  vote per target. MySQL treats NULLs in a unique index as distinct, so every
  like on a comment (`bookId IS NULL`) sits outside the first and every like
  on a book sits outside the second — the two constraints do not interfere.
  A duplicate surfaces as a `ConflictError` (409); flipping a like to a
  dislike is a `PATCH`, not a second `POST`. Both indexes also cover `userId`,
  which is why there is no separate `(userId, id)`: `?userId=` takes a
  filesort over one user's own rows, and `likes` is the most write-heavy table
  here, where a fifth index is paid on every insert.
- **`z.coerce.boolean()` is a trap for a boolean query filter**: coercion runs
  `Boolean("false")`, which is `true`, so `?isLike=false` would silently
  return likes. `listLikesQuerySchema` uses `z.stringbool()` instead. The same
  care is not needed in a JSON body, where `z.boolean()` sees a real boolean.
- **Zod `.partial()` does not undo `.default()`**: a PATCH schema built from
  a create schema that defaults `tags` to `[]` will parse a body with no
  `tags` key as `tags: []` and silently wipe the stored value. `update*`
  schemas are therefore spelled out rather than derived (see `types/series.ts`
  and `types/book.ts`). `createBookSchema` defaults `seriesId` to `null` for
  the same reason, which makes this sharper still: a derived PATCH schema would
  unlink a book from its series on every body that omitted the key. Note the
  split in what is editable — `userId` is absent from both `update*` schemas
  (re-parenting is not a field edit), but `seriesId` is present in
  `updateBookSchema`, where an explicit `null` is how a book leaves a series.
- **Foreign keys constrain the test teardown**: MySQL refuses to `TRUNCATE` a
  table referenced by a foreign key, so the suites clear rows with
  `destroy({ where: {} })` and let `ON DELETE CASCADE` take most of the
  children — except comments, which no longer go with their owner now that
  `comments.userId` is `SET NULL` rather than `CASCADE` (see below): a suite
  that destroyed `User` first would leave orphaned `Comment` rows behind
  instead of clearing them, so every suite that touches comments clears
  `Comment` explicitly, before `User`. Each MySQL-backed suite also syncs its
  own schema
  (`books_demo_spa_test`, `books_demo_spa_test_series`,
  `books_demo_spa_test_books`, `books_demo_spa_test_chapters`,
  `books_demo_spa_test_likes`) — `node:test`
  runs spec files in parallel processes, and two suites calling
  `sync({ force: true })` on one database drop each other's tables mid-run.
  Clear children before parents:
  `Like` → `Comment` → `Chapter` → `Book` → `Series` → `User`; `Like` is the
  leaf of every chain, and `Comment` must precede both `Book` (its
  still-cascading foreign key) and `User` (its no-longer-cascading one).
  A suite that syncs must call `initModels`, not a single `init*Model`, or
  `sync` cannot work out the drop order.
- **Migrations**: `sequelize-cli` is not installed. When it is added, remember
  this is an ESM package — `.js` migrations are parsed as ESM, so the CLI's
  `module.exports` template will throw. Name them `.cjs` or author them as ESM.
- **Until then, changing a table's shape means recreating the dev database.**
  `src/index.ts` calls `sequelize.sync()` with no `alter`, and `sync()` only
  creates missing tables — it never touches an existing one. A new `NOT NULL`
  column therefore never reaches a database created before it, and every write
  then fails on the missing column. Drop it
  (`DROP DATABASE books_demo_spa`) and let `ensureDatabase` rebuild it on the
  next boot. The `title` columns on `books` and `series` landed this way, and
  so did this branch's `comments` table: `tombstone` is a new column and
  `userId` changed from `NOT NULL` to nullable, so a database created before
  this branch needs the same drop-and-rebuild.
- **`comments.userId` is nullable with `ON DELETE SET NULL` — the one owner
  reference in this schema that is not `CASCADE`.** A comment outlives its
  owner's account, as a tombstone: `userRepository.remove` marks every one of
  the account's comments `deleted` in the same transaction as the account
  delete, so by the time the foreign key nulls their `userId` the row is
  already a tombstone, and an owner-less comment is therefore never live.
  Comments on the account's own books are the exception —
  `Book.hasMany(Comment)` still cascades, so those go with the books, same as
  before.
- **`DELETE /api/comments/:id` no longer deletes anything.**
  `commentRepository.remove` sets `tombstone` and stops there — see
  **Deleting a comment leaves a tombstone, not a hole** under Auth.
  `comments.parentId` stays `ON DELETE SET NULL` regardless, because deleting
  a _book_ still hard-cascades into its comments: `ON DELETE CASCADE` on the
  self-reference fails with `ER_FK_DEPTH_EXCEEDED` (errno 3008) past 15
  levels and takes the book's delete down with it. The measurement is
  recorded in `models/index.ts`, and `commentRepository.spec.ts` covers a
  20-deep thread.
