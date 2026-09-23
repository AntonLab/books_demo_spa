# Server — books_demo_spa

Node.js + TypeScript API built on Express 5, with Sequelize 6 / MySQL available
for persistence.

## Domain and API

The `User`, `Series`, `Book`, `Chapter`, `Comment` and `Like` models and their
CRUD APIs are implemented end to end. Neither a book nor a series has an owner
column: their **Co-authors** are rows in `book_authors` (`BookAuthor`, hung off
`Book` and `User` as `credits` / `bookCredits`) and `series_authors`
(`SeriesAuthor`, as `credits` / `seriesCredits`), and every Co-author holds the
same rights over the work (ADR-0005). A series and the books in it keep
independent Co-author lists.

A book carries a **Book status** — `books.status`, an ENUM of `draft`,
`in_progress` and `complete` that defaults to `draft` (`BOOK_STATUSES` in
`types/book.ts`). `POST /api/books` takes no status, so every book starts as a
draft; `PATCH` moves it to any other. Only `draft` changes what anyone may do —
see **Draft books** under **Auth**.

A chapter carries a **Publication time** — `chapters.publishedAt`, a nullable
`DATETIME(3)`. `null` is a Draft chapter, a future moment a Scheduled one, a
past moment a Published one; nothing flips a flag when the moment passes,
because every read compares it with this process's clock. A save sends
`publishedAt` as `'now'` (the server stamps its own clock), an ISO instant
(refused with 400 if it is not in the future) or `null`; a create that leaves
it out is a draft. A Scheduled chapter may be rescheduled, published now or
returned to Draft; a Published one may only return to Draft — any other value
is a 400 — and its text is edited by leaving `publishedAt` out. Every
`PATCH /api/chapters/:id` also carries `expectedUpdatedAt`, the version the
save was based on: `chapterRepository.update` compares it under a row lock
and answers 409 without writing if the chapter changed since.
`chapters.updatedAt` is `DATETIME(3)` for exactly that reason — two
Co-authors saving within one second would otherwise read as one version.

A book's chapters follow its **Reading order** — `chapters.position`, an
`INTEGER UNSIGNED NOT NULL` that orders every chapter list, public or not
(`ORDER BY position, id`), and is never sent to a client. A new chapter is
appended: `chapterRepository.create` locks the book row and takes the last
position plus one, so two chapters added at once cannot share a place.
Positions are 1-based and gapped after a delete, which nothing notices, since
only their order matters. `PUT /api/books/:id/chapter-order` takes
`{ chapterIds }` — every chapter of the book, once each, first chapter first —
and answers 204 (`routes/chapterOrderRoutes.ts`, handled by
`chapterController.reorder`). Under the same book-row lock it compares the
ids with the book's current chapters and answers 409, changing nothing, if a
chapter was added or deleted since the list was drawn; otherwise one
`UPDATE … SET position = FIELD(id, …)` rewrites them all. That update is
`silent`, so no chapter's `updatedAt` moves and a Co-author with a chapter
open is not handed a 409 for text nobody touched. It rides on
`chapters × update`, and `own` means a Co-author of the book, exactly as for
adding a chapter.

A series' books follow its **Series order** the same way — `books.seriesPosition`,
a nullable `INTEGER UNSIGNED`, null outside a series and never sent to a
client. `GET /api/books?seriesId=` is ordered by it (`ORDER BY seriesPosition,
id`; every other book list stays by id). `bookRepository` appends a book
whenever it is filed into a series — a create with a `seriesId`, or an update
that moves it to a different one — under a lock on the series row; saving a
book into the series it is already in keeps its place, and leaving
(`seriesId: null`, `DELETE /api/series/:id/books/:bookId`, or the series'
deletion) clears it. `routes/seriesBookRoutes.ts` adds the series editor's
two routes, handled by `bookController` because both read and write books,
and both riding on `series × update` plus a Co-author of the series (a
Moderator's `any` passes): `GET /api/series/:id/books` answers
`{ items: SeriesBookSummary[] }` — every book filed in the series, drafts
included, as `id`, `title`, `status` and `authors` only — and
`PUT /api/series/:id/book-order` takes `{ bookIds }` and answers 204, or 409
changing nothing when the ids are not exactly the series' books, exactly as
the chapter order does.

`books` and `series` each carry a `title` (`VARCHAR(255) NOT NULL`, trimmed)
alongside their `description`, which now unambiguously means the annotation.
The `?q=` filter on both matches either column.

Every `PublicBook` — list and detail alike — carries `authors`, the book's
Co-authors in credit order as `AuthorSummary` (`PublicUser` minus the email,
which is the omission that makes it safe in a public response). There is no
`userId` on a book any more, and `?userId=` matches a book through any of its
Co-authors. A page of books loads its credits in one extra query
(`loadAuthors` in `bookRepository.ts`) rather than an include, which would
make the `LIMIT` page over credit rows instead of books.

`GET /api/books/:id` returns a `BookDetail` rather than a `PublicBook`: the
record plus the series `id` and `title`, a `likeCount` and the caller's own
`viewerLikeId`.

Co-authors change through `POST /api/books/:id/co-authors` (`{ userId }`) and
`DELETE /api/books/:id/co-authors/:userId`, which covers both removing someone
else and leaving; both answer 200 with the updated `PublicBook`. Series have
the same pair at `/api/series/:id/co-authors`, answering with `PublicSeries`,
which likewise carries `authors` and no `userId`.
`DELETE /api/series/:id/books/:bookId` takes a book out of a series from the
series' side (204). See **Co-authors** under **Auth**.

`GET /api/authors?q=` is the Co-author picker's search
(`routes/authorRoutes.ts`, `userRepository.listAuthors`): accounts holding the
`author` Role that are not blocked, matched by login or name, answered as
`{ items: AuthorSummary[] }` with no email and no paging (`limit` 1-50). It
rides on `users × read`, so any signed-in caller may search and a guest is
refused with 401. It is a route of its own rather than a flag on
`/api/users`, which answers with `PublicUser`, email included.

`Session` and `PasswordResetToken` back a full session-based auth API at
`/api/auth`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`,
`POST /password-reset/request` and `POST /password-reset/confirm`. Both models
hang off `User.hasMany(...)` with `ON DELETE CASCADE`. Every write on the five
resources above, and both reads on `/api/users`, goes through the
role-permission matrix rather than a blanket session check; `/api/users` guards
its reads because `PublicUser` carries an email address and an open list would
be a scrapeable account directory. Every other `GET` stays public. See **Auth**
and **Roles and permissions** below for the rules themselves.

`Comment` has a full CRUD API at `/api/comments`, built to the same five-file
pattern as the others, with self-referential replies. Like likes, its
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

A **Notification** (`Notification`, table `notifications`) tells a Co-author
that someone else changed who is credited on a shared book or series, or
deleted it — the safeguard ADR-0005 leans on. `GET /api/notifications`
(`limit` 1-100, `offset`) lists the caller's own, newest first, as
`{ items, total, unread, limit, offset }`, and `POST /api/notifications/read`
(`{ ids }`) marks those that are the caller's and answers `{ unread }`. Both
sit behind `requireAuth`, not the matrix, and whose notifications they are
comes from the session only; there is no delete and no retention limit. See
**Notifications** under **Auth**.

A Book carries an optional **Cover** and an Account of any Role an optional
**Avatar** (CONTEXT.md, ADR-0007). Both are stored as bytes in a table of
their own — `book_covers` (`bookId` primary key, `FOREIGN KEY … ON DELETE
CASCADE`, `data` `MEDIUMBLOB`, `updatedAt` `DATETIME(3)`) and `user_avatars`
(the same shape, keyed by `userId`) — never as a column on `books` or
`users`, so no list or detail query can drag the bytes along.
`Book.hasOne(BookCover)` and `User.hasOne(UserAvatar)` — both
`onDelete: CASCADE` — mean deleting a Book or an Account removes its
picture with no application code, and that includes the Covers of the
books `userRepository.remove` deletes because the account was their last
Co-author. `src/images.ts` wraps every `sharp` call (`0.35.4`,
pinned exactly, as every dependency in `server/package.json` is):
`processCoverImage`/`processAvatarImage` decode the upload for real
(`metadata().format`, never the trusted `Content-Type` header), apply EXIF
orientation and drop it, centre-crop to fill a fixed 600×900 or 256×256
frame, and encode WebP with no metadata — the uploaded bytes themselves are
never stored, and an animated upload keeps only its first frame. Six
routes: `PUT`/`DELETE`/`GET /api/books/:id/cover` ride on `books × update`
(the `PATCH` Co-author check) and `books × read`; `PUT`/`DELETE`/`GET
/api/users/:id/avatar` ride on `users × update`
(`userController.assertMayTouch`) — except the `GET`, which is fully public
and carries **no** permission middleware at all, unlike every other read
here, because it does not ride on `users × read`, which a guest lacks.
Walking ids therefore collects every uploaded Avatar without a name
attached; that cost is accepted, since ids are already public in every
`AuthorSummary`. Both `PUT`s carry `express.raw()` mounted on that one
route only, right after `requirePermission` and `validate`: a request the
matrix refuses never has its 2 MiB body read at all, but one that clears it
is buffered before anything else runs — a 415 (`UnsupportedMediaTypeError`,
"Unsupported image type") when the `Content-Type` was not one
`express.raw()` accepted, so `req.body` never became a `Buffer`; then the
row's own 404/403 (`assertMayTouch`, the same Co-author/rank check `PATCH`
uses); only then `sharp`'s 400 ("Not a valid image") when the bytes will
not decode, including bytes over `sharp`'s input-pixel limit. A body over 2
MiB is a 413, mapped through the existing `errorHandler`, the same generic
path `express.json()`'s own limit takes. Both `GET`s answer
`Content-Type: image/webp`, `X-Content-Type-Options: nosniff` and
`Cache-Control: private, max-age=31536000, immutable` — safe because
`PublicBook.coverUrl` and `PublicUser`/`AuthorSummary.avatarUrl` are
versioned by the picture's own `updatedAt` (`?v=<ms>`), so a replace is
never served stale. No permission matrix row changes: a Cover is a field
of the Book under `books × update` and an Avatar a field of the Account
under `users × update`, both writes last-write-wins with no Notification
raised.

A Book and a Series each carry at most one **Genre** (CONTEXT.md, ADR-0008).
`genres` is a table of its own — `id`, `name` (`VARCHAR(50) NOT NULL`, trimmed,
1-50 characters, unique **regardless of case**, because the model pins
`utf8mb4_0900_ai_ci` on the table explicitly rather than relying on the
server's default), `createdAt`, `updatedAt` — and `books.genreId` /
`series.genreId` are nullable `INTEGER UNSIGNED` foreign keys to it with
`ON DELETE SET NULL`, each indexed for the filter below and typed to match
`genres.id` exactly, as `books.seriesId` matches `series.id`. Deleting a Genre
therefore leaves its books and series with
`genre: null` in the same statement, and raises no Notification: a Notification
covers who is credited on a work and its deletion, nothing else. A Series' Genre
is its own — nothing is inherited in either direction, so a Book never takes its
Genre from its Series.

Four routes (`routes/genreRoutes.ts`, `controllers/genreController.ts`,
`repositories/genreRepository.ts`), every one of them on the matrix's new
`genres` module: `GET /api/genres` answers `{ items: PublicGenre[] }` — every
Genre, sorted by name, no paging — and is open to Guests;
`POST /api/genres` (`{ name }`) answers 201 with the `PublicGenre`, 409 when the
name is taken case-insensitively, and 400 for a blank name or one over
`GENRE_NAME_MAX_LENGTH` (50) after trimming; `PATCH /api/genres/:id` renames
under the same rules, answers 404 for an unknown id, and allows a rename to
another casing of the same name; `DELETE /api/genres/:id` answers 204, or 404.
The in-memory fake compares lower-cased names, because the collation is not
there to do it.

`GET /api/books` and `GET /api/series` take `genreId`, ANDed with their other
filters; an id that names no Genre yields an empty list rather than an error,
exactly as an unknown `?tag=` does. `POST` and `PATCH` on both take
`genreId: number | null` — absent on a create means `null`, absent on a `PATCH`
leaves the Genre alone (the update schemas are spelled out rather than
derived, for the same reason `tags` already is), and an id that names no Genre
is a 400 whose body just names the missing Genre, with no `details` key —
unlike a zod validation failure, which always carries one. `PublicBook` and
`PublicSeries` carry `genre: PublicGenre | null`, so `BookDetail` does too;
`SeriesBookSummary` does not. `PublicGenre` and `GENRE_NAME_MAX_LENGTH` live in
`shared/src/genre.ts` (ADR-0006) and reach this package through
`types/genre.ts`.

## Development Commands

This package is an npm workspace. Install from the repo root, not here; the
scripts below still run from this directory, or from the root with `-w server`.

- `npm start` — run the server: `node ./src/index.ts` (native TS, Node >= 24)
- `npm run dev` — `node --watch ./src/index.ts`: Node's own watch mode
  restarts the process when the entry point or any module it imports
  changes. That includes `../shared/src`, the API types this package loads
  as source through the workspace link at their real path. Spec files are
  never imported, so editing one restarts nothing. Do not add
  `--watch-path`: it throws `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` on Linux
- `npm run build` — compile with `tsc -p tsconfig.build.json` to `dist/`; that
  config extends `tsconfig.json` (which in turn extends the repo-root
  `tsconfig.base.json`) but excludes `src/**/*.spec.ts`, so test files
  are never emitted. `shared` is not emitted either: `dist/` imports it as
  `.ts` at runtime, through the workspace link, so `node dist/index.js` needs
  that link and a type-stripping Node like `npm start` does (ADR-0006)
- `npm run seed` — `node --env-file-if-exists=.env.local ./src/db/seed/seed.ts`,
  which fills the database with the demo data (see **Demo seed** below).
  **It deletes every row in the ten content tables**, and every uploaded
  Cover and Avatar with them, so it does nothing without `--force`:
  `npm run seed -w server -- --force` from the repo root, or
  `npm run seed -- --force` from here. Without the flag it prints the row
  counts it found and exits
- `npm test` — `node --env-file-if-exists=.env.local --test "src/**/*.spec.ts"`
  (loads `.env.local` when present, then runs every `node:test` spec, including
  the MySQL-backed integration suite — omitting `--env-file-if-exists` would
  silently skip that suite instead of failing loudly). Each of those thirteen
  specs asks `skipWithoutMysql()` (`src/db/mysqlProbe.testkit.ts`) whether to
  run: with `DB_USER` unset or MySQL unreachable it skips the suite, and the
  run still exits 0. Set `REQUIRE_MYSQL=1` and the same two conditions throw
  instead, failing the spec file. CI sets it; locally it stays unset, so a
  machine with no database can still run the rest. A new MySQL-backed spec
  must take its `skip` from `skipWithoutMysql()` rather than probing on its
  own, or CI cannot tell it skipped
- `posttest` — `node --env-file-if-exists=.env.local ./src/db/dropTestDatabases.testkit.ts`,
  which drops every schema the MySQL-backed suites created. Never run it by
  hand: npm runs it automatically after `npm test`, and **only when `npm test`
  exited 0** — npm skips a `post*` script when the script it follows fails.
  That is the whole design. A green run leaves no schemas behind; a red one
  leaves its rows exactly where they are, so a failure can be inspected in the
  database that produced it. It is a no-op when `DB_USER` is unset or MySQL is
  unreachable, because those are the same conditions under which the suites
  skipped rather than passed — failing there would turn a green run red for
  nothing.
- `npm run typecheck` — `tsc --noEmit` (type-check only)
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`,
  which calls `createConfig` in the repo-root `eslint.config.base.mjs` with
  `tsconfigRootDir: import.meta.dirname`; the Node globals block is all that
  is local). TypeScript is linted with type information for three rules —
  `no-floating-promises`, `no-misused-promises`, `await-thenable` — and
  `node:test`'s `test`/`describe`/`it`/`suite` are exempt from the first,
  since the runner tracks the promises they return. Await a promise, or mark
  a deliberate fire-and-forget `void` with the reason beside it; never an
  `eslint-disable`

Prettier has no script here: it is root-only, because `.prettierrc.json` and
`.prettierignore` are repo-wide. Run `npm run format` from the repo root.

There is no `sequelize-cli` dependency yet — do not reference it until it is
added.

## Test layers

Each layer answers a question the others cannot:

- **Unit specs** exercise a module or middleware against doubles.
  `middleware/errorHandler.spec.ts` pins the redaction guarantees: a parse
  failure's raw body is never returned or logged, a 500 logs only
  name/message/stack, and a `UniqueConstraintError` answers a bare 409. A body
  over `express.json()`'s default limit (102,400 bytes) is 413 and an
  unsupported charset 415, both `{ error: 'Invalid request' }`. To capture log
  output, replace the `logger` singleton's methods with
  `t.mock.method(logger, level, …)`, which restores them after each test.
- **Repository specs** run the real repositories on MySQL. Every domain rule —
  Draft book visibility, the last Co-author, the Author role a credit needs,
  duplicate credits, Notifications, the reorder 409s, tombstones, the role
  hierarchy, a Cover's or Avatar's replace-in-place and cascade — is proven
  here and nowhere else, bar the one exception the **Contracts** bullet names.
- **Route specs** run `createApp` on in-memory fakes and assert the HTTP
  mapping and the permission checks. The fakes for book, series, chapter,
  comment, like, genre and user live in
  `repositories/<name>Repository.fake.testkit.ts`; each takes its seeds and the
  spies a route spec reads (`viewers`, `actors`, …) as one options object, and
  none may grow a domain rule. The users, auth and authors specs share the one
  user fake. The session, password-reset and notification fakes stay inline in
  their route specs.
- **Contracts** keep those seven fakes honest.
  `<name>Repository.contract.testkit.ts` registers cases against a harness —
  the repository plus arrange helpers such as `anAuthor()` or
  `aSeries(coAuthorIds)` — and runs twice: from `<name>Repository.spec.ts` on
  MySQL, and from `<name>Repository.fake.spec.ts` without it. A contract
  asserts interface semantics only: `null` or `false` for a missing row, which
  error class is thrown and which resource a `NotFoundError` names, an order a
  controller depends on, an explicit `seriesId: null` unlinking a book. Never
  the domain rules above, with one exception: a Genre name's case-insensitive
  uniqueness sits in `genreRepository.contract.testkit.ts` rather than the MySQL
  spec alone, because MySQL gets it from the column's collation while the fake
  has to lower-case names by hand to agree, and a rule the fake must match is a
  rule the contract has to state (M1). A repository method a controller comes to
  rely on belongs in its contract, and a fake change must keep its fake spec
  green.
  `chapterRepository.findBookCoAuthorIds` has no `ORDER BY`, unlike the book
  and series lookups, so its contract compares ids as a set.
- **`src/app.spec.ts`** is the only suite that goes from HTTP through the real
  repositories to MySQL, on its own `_app` schema: sign-in with the real CSRF
  handshake, a Co-author's edit, filing a book into a series, chapter
  ownership, comment tombstones and restore, a role switch, a Cover upload
  read back as WebP, and a Guest refused a Draft book. `src/index.ts` cannot
  be imported — it runs `main()` — so the
  spec repeats its startup steps, and a change to startup (a new dependency, a
  new sync step) needs the same change there. Its admin account is made through
  `User.create`, because no API can create one.

## Layout

- `src/index.ts` — process entry point: loads `.env.local`, ensures the schema,
  connects Sequelize, authenticates, starts listening, and registers the
  graceful shutdown (`src/shutdown.ts`, see **Operations**)
- `src/app.ts` — builds the Express app (`createApp`), wiring routes and the
  error-handling middleware
- `src/logger.ts` — the sanctioned console boundary; every other module logs
  through this instead of calling `console.*` directly
- `src/shutdown.ts` — `createShutdown` and `registerShutdownSignals`: the
  graceful shutdown on `SIGTERM`/`SIGINT` (see **Operations**)
- `src/listen.ts` — `listen(app, port, deps)`: `app.listen` with Express 5's
  bind error reported instead of ignored (see **Operations**)
- `src/expiryPurge.ts` — `startExpiryPurge`: the hourly delete of expired
  sessions and old reset tokens (see **Operations**)
- `src/rateLimit.ts` — `createRateLimiter`: a fixed-window, in-memory
  limiter (`hit`/`peek`/`release`/`reset`/`size`/`stop`) with lazy expiry
  and an `unref()`ed sweep. `release` gives back one `hit` that turned out
  not to count, deleting the key once its count reaches 0 rather than
  leaving an empty window behind — see **Sign-in rate limiting** under
  Operations. `size` returns how many keys the map still holds, an ended
  window included until a touch or the sweep drops it — the number the sweep
  keeps bounded; only the specs read it, to check that nothing is left behind.
- `src/password.ts` — argon2id password hashing and verification; argon2id
  is the library default, not named (see Runtime notes)
- `src/tokens.ts` — `createToken()` (32 random bytes, base64url),
  `hashToken()` (SHA-256) for session and reset tokens, and `xsrfTokenFor()`,
  a session's XSRF token
- `src/sessionCookie.ts` — the `sid` cookie's name, TTL, and the shared
  set/clear helpers, which set and clear the `xsrfToken` cookie beside it
- `src/delivery/resetDelivery.ts` — the `ResetDelivery` interface,
  `resetUrl()` and `createLoggerResetDelivery()`, the only sink so far.
  `RESET_DELIVERY` accepts just `log`; a real mailer adds a second value
  there and the switch in `index.ts` it would then need
- `src/images.ts` — the one module every `sharp` call lives in:
  `processCoverImage`/`processAvatarImage`, each a decode-and-reencode
  pipeline for its own frame size (CONTEXT.md, ADR-0007)
- `src/routes/` — Express route definitions, one file per resource, mounted
  under `/api`.
  `routeTestKit.testkit.ts` holds the harness the route specs share (`withApp`,
  `withAuthenticatedApp`, `AUTH_COOKIE`, `json`, `defaultDeps`,
  `unlimitedAuthRateLimits`); `tsconfig.build.json`
  excludes `*.testkit.ts` alongside `*.spec.ts`, so neither is emitted to
  `dist/`. See **Test layers** for which fakes the route specs run on.
- `src/app.spec.ts` — the full-stack smoke suite; see **Test layers**
- `src/createApp.spec.ts` — `createApp`'s own settings, on the route test
  kit's unreachable repositories (`defaultDeps()`): `trust proxy` from
  `AppDeps.trustProxy`, and the security headers
- `src/controllers/` — request handlers / HTTP mapping, one file per resource
- `src/repositories/` — the Sequelize-backed data-access layer, one file per
  resource plus `sessionRepository.ts` and `passwordResetRepository.ts`.
  `notificationRepository.ts` carries the list and
  mark-read reads, plus `notify`, which the book, series and user
  repositories call inside their own transactions; `likePattern.ts` holds the
  LIKE escaping they share; `visibility.ts` holds the Draft book rule every
  read goes through — see **Draft books** under Auth; the
  `*.fake.testkit.ts`, `*.contract.testkit.ts` and `*.fake.spec.ts` files
  beside seven of them are described under **Test layers**). Note the collision: `likePattern.ts` is about the
  SQL `LIKE` operator and has nothing to do with `likeRepository.ts` — the two
  sit next to each other and mean different things by the same word.
- `src/models/` — Sequelize models and associations, one file per table, plus
  `index.ts`. `tagArray.ts` holds the JSON tag-column normalisation `Series`
  and `Book` share; `creditedBook.testkit.ts` is the suites' way to create a
  book or a series with its Co-authors
- `src/permissions/` — `matrix.ts` (the role/module/action → scope
  definition and `buildMatrixRows()`) and `permissionStore.ts` (the
  in-memory cache `scopeFor()` reads and `syncPermissions()` writes); see
  **Roles and permissions**.
- `src/db/` — database connection / config (`config.ts`, `ensureDatabase.ts`,
  `sequelize.ts`). `dropTestDatabases.testkit.ts` is the teardown counterpart
  of `ensureDatabase` — the `posttest` entry point, carrying the `.testkit.ts`
  suffix so `tsconfig.build.json` keeps it out of `dist/` like every other
  test-support file. It is a script, not a module: nothing imports it.
  `mysqlProbe.testkit.ts` is the other test-support file here, and a module:
  `skipWithoutMysql()`, the one place a MySQL-backed spec learns whether to
  skip, and where `REQUIRE_MYSQL=1` turns that skip into a failure.
- `src/db/seed/` — the demo seed (see **Demo seed**). `seed.ts` is the script
  nothing imports; `rng.ts`, `content.ts`, `personas.ts` and `plan.ts` are the
  planning phase it builds on, and none of them runs anything on import, which
  is what lets `plan.spec.ts` unit-test the plan with no database. Nothing here
  carries a `.testkit.ts` suffix, because that means _test support_ and this is
  neither, so `tsconfig.build.json` excludes the directory with one glob.
  `seedGuards.ts` (`assertSafeTarget`, `DEMO_DATABASE`) sits inside it: only
  the seed and its specs use it.
- `src/middleware/` — auth, permissions, validation, error handling
  (`csrfProtection.ts` (see **CSRF** under Auth), `requireAuth.ts`,
  `requirePermission.ts`, `optionalAuth.ts` (unmounted — see **Auth**),
  `sessionUser.ts` (the shared `resolveSessionUser` the other three build
  on), `securityHeaders.ts` (`noSniff`, see **Security headers** under
  Operations), `authRateLimit.ts` (the sign-in limits, see **Operations**),
  `errorHandler.ts`, `notFound.ts`, `validate.ts`)
- `src/types/` — the zod schemas, the input types inferred from them, and
  `express.d.ts`; `permission.ts` holds `Role`, `Module`, `Action`,
  `PermissionScope` and the `as const` arrays behind them. The response types
  (`Public*`, `BookDetail`, …) and the unions the client also uses
  (`BOOK_STATUSES`, `USER_ROLES`, `USER_STATUSES`, `REGISTRABLE_ROLES`, …) are
  re-exported from the `shared` workspace, so a change to what the API returns
  starts there. `image.ts` is the one file with nothing of its own — both
  `ACCEPTED_IMAGE_CONTENT_TYPES` and `IMAGE_MAX_BYTES` are the client's
  contract too, so they are re-exported from `shared` rather than declared
  here

## Environment

`.env.local` (git-ignored) supplies these; `src/db/config.ts` validates them
with zod and throws on anything malformed rather than starting with a broken
value.

| Variable                  | Default                   | Notes                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`             | `development` \| `test` \| `production`. Also picks the argon2 cost — `test` uses deliberately weak parameters — and gates the cookie's `secure` flag.                                                                                                                      |
| `PORT`                    | `4000`                    | The API's own port.                                                                                                                                                                                                                                                         |
| `DB_HOST` / `DB_PORT`     | `127.0.0.1` / `3306`      |                                                                                                                                                                                                                                                                             |
| `DB_NAME`                 | `books_demo_spa`          |                                                                                                                                                                                                                                                                             |
| `DB_USER` / `DB_PASSWORD` | _(none)_                  | No default on purpose: a root/root fallback would silently start the server against an unintended database. An empty password is accepted, a missing one is not.                                                                                                            |
| `APP_BASE_URL`            | `http://localhost:3000`   | The client origin a password-reset link points at. Validated as a URL, so a malformed value fails at startup rather than in an email nobody can fix.                                                                                                                        |
| `TRUST_PROXY`             | `0`                       | How many reverse-proxy hops in front of the API may name the client in `X-Forwarded-For` (Express's `trust proxy`). `0` trusts none, so `req.ip` is the socket's peer. A whole, non-negative count only. The sign-in rate limits key on `req.ip`, so set it behind a proxy. |
| `RESET_DELIVERY`          | `log`; none in production | Where a password-reset link goes. `log`, the only delivery so far, writes it to the server log. Production has no default and refuses to start without it, so nobody ships link-logging by accident.                                                                        |

Two more are read only by the test suite, never by `config.ts`: `TEST_DB_NAME`
(default `books_demo_spa_test`, the prefix of the thirteen test schemas) and
`REQUIRE_MYSQL`, which CI sets to `1` so the MySQL-backed suites fail rather
than skip without a database (see `npm test` above).

## Demo seed

`src/db/seed/seed.ts` fills the database with the data the demo version is shown
with: ten accounts, three authors' back catalogues, and the comment threads and
likes that make the reader-facing pages look lived-in. Run it with
`npm run seed -w server -- --force`.

**Accounts** — all ten `active`, all sharing the password `Password123!`, each
with `<login>@example.com`:

| Login           | Name                               | Role         |
| --------------- | ---------------------------------- | ------------ |
| `superadmin`    | Olga Ivanova                       | `superadmin` |
| `admin`         | Daniel Reeves                      | `admin`      |
| `mhale`         | Margaret Hale — Gothic             | `author`     |
| `ipetrov`       | Ivan Petrov — Hard SF              | `author`     |
| `nquinn`        | Nora Quinn — Urban Fantasy         | `author`     |
| `user1`…`user5` | Sofia, Emeka, Hannah, Léa, Grigory | `user`       |

Logins are functional but the names are real ones, because the name is what the
UI shows: an `AuthorSummary` beside every book and every live comment. A thread
where "User Two" answers "User Four" reads as a test run, not a demo.

**Content** — each author gets 1-2 series of 4-5 books plus 1-3 standalone
books, every book 20-24 chapters of ~2 KB, every book 3-15 comments. Titles,
tags and prose come from a per-author **content bank** (`ContentBank` in
`seed.ts` — `GOTHIC`, `HARD_SF`, `URBAN_FANTASY`; it was called `Genre` until
that word came to mean a row in `genres`), with `mystery` and `slow-burn`
deliberately shared across two authors each, so `?tag=` returns more than one
author's work.
Two standalone books are co-authored (`shareBooks`, `SHARED_BOOK_COUNT`): each
of the first two authors' last standalone book also credits the next author in
`AUTHORS`, so `mhale` and `ipetrov` share one and `ipetrov` and `nquinn` another.
One series is co-authored too (`shareSeries`): the last author's first series
also credits the first author, so `nquinn` and `mhale` share it while its books
stay credited to `nquinn` alone. Book likes are drawn only from accounts not
credited on the book, and comment likes from accounts other than the comment's
author, because the API refuses both. Nobody comments or likes before their
account's `createdAt`: a comment picks from the accounts that existed by then,
and a like is dated after its account was created.
Each author's newest book is a Draft, with no comments or likes; the one before
it, and every book of the series that draft belongs to, is In progress; every
older book is Complete (`statusOf` in `planAuthor`). A Draft book's last two
chapters are Draft chapters; every In progress book's next chapter is Scheduled
over the coming days, and the author's newest In progress book has its next two
scheduled (`publicationOf`); every other chapter was published when it was
written. Each book's chapters take positions 1…N in the order the plan wrote
them, so the Reading order starts out as the order of writing, and each
series' books take positions 1…N in the order the plan files them
(`seriesPositionOf`). Each author also starts with two unread notifications
drawn from those credits, so none contradicts a byline
(`writeNotifications`): a Co-author credited on a shared work beyond its
first is told the first added them, and each author is told the next author
in `AUTHORS` left one of their unshared books.

**Genres** — five rows, written by `writeGenres` from `GENRE_NAMES` before any
content: Gothic, Hard SF and Urban Fantasy, one per content bank, so each
author's books and series are filed under their bank's Genre (a co-authored work
keeps the Genre of the author it was planned under, the only author whose bank
it came from); plus Horror and Romance, which nothing is filed under, so the
demo has an empty Genre to show in the header's submenu and on
`/search?genre=`. A bank's `genreName` is typed as the union of `GENRE_NAMES`,
so it cannot name a Genre the seed never creates, and `writeContent` turns it
into a `genreId` through the name → id map `writeGenres` returns — the rows do
not exist while the plan is being built. The `genreId` goes through
`createBookSchema` / `createSeriesSchema` with the rest of the fields, not
attached afterwards like the status and the Co-authors.

Three things about it are worth knowing before changing it:

- **It writes through the models, not the API.** `POST /api/auth/register` can
  only mint a `user`, so the admin and superadmin would need a back door
  anyway. The payloads are still parsed by the same zod schemas the routes use
  (`createUserSchema`, `createBookSchema`, …), so nothing lands that the API
  would refuse; only the fields those schemas deliberately withhold — the
  work's Co-authors, and the role — are attached afterwards.
- **Accounts go through `create()`, everything else through `bulkCreate()`.**
  `bulkCreate` defaults to `individualHooks: false`, which would skip
  `User.beforeSave` and store the password in clear text. The reverse also
  matters: comments are inserted one thread level at a time, because a reply
  needs its parent's id, and on MySQL `bulkCreate` back-fills ids from the
  insert's first id plus the row count. `writeThreads` throws if an id comes
  back missing rather than silently linking replies to nothing.
- **Dates are anchored to the run, not to a constant**, so the newest chapter
  is always 2-5 days old. The cadence is derived from `PUBLICATION_WINDOW_DAYS`
  rather than fixed: ~180 chapters per author cannot be spaced a week apart
  inside 14 months, so the window wins and the gaps scale to fit. `createdAt`
  is passed explicitly and `{ silent: true }` is what stops `save()` from
  overwriting the backdated `updatedAt`.

It deletes `notifications` → `likes` → `comments` → `chapters` → `book_authors` → `books` →
`series_authors` → `series` → `genres` → `users` by explicit enumeration rather than leaning on the cascades, which would work
today and start leaving rows behind the day an `onDelete` changes. `genres`
comes after `books` and `series` because both point at it: its
`ON DELETE SET NULL` is not this script's to lean on either.
`book_covers` and `user_avatars` are not in that list — nothing seeds a
Cover or an Avatar — but they are not spared either: both cascade from
`books`/`users` (`ON DELETE CASCADE`, S1/S3), so deleting those two rows
removes every uploaded Cover and Avatar along with them.
`permissions` is untouched: it is reference data `syncPermissions()` derives
from code. The delete and every insert share one transaction, so a failure
leaves the previous demo intact.

Two guards: `NODE_ENV=production` is refused whatever the flags, and a
`DB_NAME` other than `books_demo_spa` is warned about loudly before the delete.
Both live in `seedGuards.ts`, pinned by `seedGuards.spec.ts`. `seed.spec.ts`
runs the script itself as a child process — it cannot be imported, since it
calls `main()` at the top level — three times: a production run, pointed at
a closed port, asserting it is refused before any connection is attempted; a
dry run without `--force` against a `_seed` test schema, asserting every
content table's row count is unchanged; and then a `--force` run into that
same schema, which queries what landed for rows the API would have refused
(a like on one's own book or comment, on a tombstone or on a Draft book),
comments and likes dated before their account, malformed chapter titles, and
the five Genres — every book and series filed under one, exactly three of them
in use, and Horror and Romance under nothing. The dry run additionally asserts
that `genres` is among the row counts it reports, which is what would catch the
seed's own `CONTENT_MODELS` losing the tenth table.
The child inherits the runner's V8 coverage, so a coverage report lists
`seed.ts` at the fraction the forced run reaches.

## Auth

- **The `sid` cookie** carries an opaque 32-byte base64url token: `httpOnly`,
  `sameSite: 'lax'`, `path: '/'`, `secure` only under
  `NODE_ENV=production`, seven-day `maxAge`. `lax` rather than `strict` so
  following a reset link from a mail client does not arrive session-less. Set
  and cleared through one shared options object in `sessionCookie.ts`, because
  a `clearCookie` whose options differ from the `cookie` that set it leaves the
  original in place.
- **Tokens are hashed with SHA-256, not argon2** (ADR-0001). Only the hash is
  stored; the plaintext exists in the cookie and the reset link and nowhere
  else.
- **`requireAuth` guards only `GET /api/auth/me`** now; every write on the
  seven resources below runs through `requirePermission` instead (see
  **Roles and permissions**). Both run before `validate` on the route they
  guard, so an unauthenticated or disallowed request is refused without its
  body being parsed or echoed back in a 400. The visible consequence: a
  request refused by either middleware with a malformed body or id still
  comes back 401 or 403, never 400.
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
  sessions. A login still verifying when the block lands cannot slip a
  session past the cleanup; see below.
- **Blocking an account does not touch its content.** No query anywhere
  filters books, series, chapters, comments or likes by their author's
  `status`, so a blocked account's published work stays exactly as visible to
  every reader as before the block — only sign-in and existing sessions are
  cut off. Hiding or removing a blocked author's content is a deliberate,
  separate moderator action (`admin`/`superadmin` already hold `any` on
  `update`/`delete` for books, series and chapters), not an automatic
  consequence of the block.
- **Every successful password change through `PATCH /api/users/:id` ends
  every session on that account**, in the same transaction as the update —
  the session that made the change included. When the change is to the
  caller's own account, the response also clears the `sid` cookie, so the
  browser stops presenting a token that now names nothing
  (`userController.update`).
- **A login in flight cannot outlive a block or a password change.** argon2
  is slow enough for either to commit, and purge the account's sessions,
  while a login is still verifying. So `createIfCredentialCurrent` in
  `repositories/sessionRepository.ts` re-reads the account under a shared
  lock (`SELECT … FOR SHARE`, which Sequelize sends as
  `LOCK IN SHARE MODE`) in the same transaction as the session insert, and
  inserts nothing unless the hash is still the one just verified and the
  account is not blocked — 401 `Invalid credentials` or 403
  `Account is blocked` otherwise, with no cookie. The lock either makes the
  re-read wait for a change in flight and see it, or makes the change wait
  for the insert and then purge that session with the rest, so the two rules
  above hold against concurrent logins too. `register` opens its session
  without the re-check: a brand-new account has nothing in flight.
- **A blocked account's session is no session at all.** `resolveSessionUser`
  (`middleware/sessionUser.ts`) reports nobody for it, so a guarded route
  answers 401 and a public route serves the caller as a guest. Behind the
  re-check above it is a second layer, and the only one for a block written
  straight into the table, which purges no sessions.
- **`pending` restricts nothing today.** It is `users.status`'s default in
  `models/User.ts`, so `POST /api/users` with no `status` in the body creates
  one; it is reserved for a future email-verification step, and until that
  exists a `pending` account signs in exactly like an `active` one.
- **Login always opens a new session** rather than reusing an existing row,
  which is what rules out session fixation.
- **Reset requests always answer 202**, whether or not the address exists —
  branching would make the endpoint an account-enumeration oracle. (Past the
  address's hourly limit it is refused with 429 before anything is looked
  up — see **Sign-in rate limiting** under Operations — which says nothing
  about any account either.) A new request invalidates any outstanding token
  first, so two live links never coexist. Tokens last one hour, far less than
  a session's seven days, because a link sits in a mailbox.
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
  their own resources), only the row's owner may `PATCH` or `DELETE` it — for a
  book, a series or a chapter, any of the work's Co-authors — and nobody may
  like their own book (any book they co-author) or their own comment; every
  refusal is 403.
  - The book, series, chapter, comment and like checks each live in their own
    controller (`assertMayTouch` / `assertOwned`), not a middleware, because
    they need the repository to load the row before an owner can be compared
    — `requirePermission` only knows the scope, not the row. Every one reports
    404 before 403, so a refusal cannot be used to probe which ids exist.
  - **A book's or series' `own` means "one of its Co-authors."** Neither table
    has an owner column; `bookController.assertCoAuthor` and
    `seriesController.assertCoAuthor` ask their repository's
    `findCoAuthorIds` and refuse anyone not on the list.
  - **Chapters resolve ownership through their book**, because `chapters` has
    no `userId` column: `chapterController.assertMayTouch` looks up the
    chapter's `bookId` and then the book's Co-authors
    (`chapterRepository.findCoAuthorIds`), and `assertMayChangeChaptersOf`
    does the same for a `POST` that has no chapter yet to own and for a
    reorder, which changes the book's chapters as a whole — the book answers
    instead (`findBookCoAuthorIds`).
  - **Filing a book into a series takes a Co-author of both.**
    `bookController.assertMayAddToSeries` checks the caller co-authors the
    target series (`bookRepository.findSeriesCoAuthorIds`) before a book is
    filed into it, because filing a book into a series changes the series as
    well as the book — without the check an author could put a book into a
    stranger's series. The two Co-author lists are independent, so a book
    credited to A and B may sit in a series credited to A and C. `null`
    (unlinking) and an absent key (leaving the link alone) touch no series and
    need no check; a named series that does not exist is still a 404 that
    blames the series, ahead of the book's own 403. A Moderator's `any` skips
    it.
  - **Either side may take a book out of a series.** A Co-author of the book
    sends `PATCH /api/books/:id` with `seriesId: null`; a Co-author of the
    series (or a Moderator) sends `DELETE /api/series/:id/books/:bookId`,
    which rides on `series × update` and answers 404 when the book is not in
    that series, so it cannot unlink a book filed elsewhere. Either way the
    book loses its place in the Series order; filing it again appends it.
  - **A comment resolves its tombstone before any owner comparison.** A
    tombstone's `userId` is `null`, so comparing it against `req.user.id`
    would refuse everyone, owner included. `commentController.update` and
    `.remove` therefore reject a tombstone outright — `PATCH` with 403,
    `DELETE` with 404, since there is nothing left to delete a second time —
    before `assertOwner` ever runs.
  - The self-like check lives in `likeRepository.create`, which loads the
    target to compare owners — for a book, whether the actor is credited on
    it at all. It is the one check-then-write in that file, and it is safe
    where the uniqueness check would not be: a comment's owner never changes,
    and a Co-author credited between the check and the insert leaves at worst
    one like that predates the credit. Uniqueness stays with the indexes for
    exactly that reason. This is a domain invariant, not a matrix rule — no
    scope value spells out "not yourself," so do not go looking for it in the
    permission table.
- **Co-authors** (ADR-0005). `POST /api/books/:id/co-authors` and
  `DELETE /api/books/:id/co-authors/:userId` change who is credited on a book,
  and the same pair under `/api/series/:id` does it for a series. Every rule
  below holds for both, each implemented in its own controller and repository
  (`series` × `update` in place of `books` × `update`).
  - **Adding** rides on `books × update` and then requires the caller to be one
    of the book's Co-authors, which a Moderator never is: `admin` and
    `superadmin` may edit or delete any book but never change its byline.
    `bookRepository.addCoAuthor` refuses an account not holding the `author`
    Role (400), a missing account (404) and one already credited (409, from the
    `(bookId, userId)` unique index rather than a lookup first).
  - **Removing** is mounted behind `requireAuth`, not `requirePermission`,
    because leaving must not depend on a books grant: a Co-author who switched
    Role to `user` holds `none` on books and would otherwise be stuck on the
    byline. So anyone signed in reaches the controller, which lets a caller
    remove themselves at any Role and lets them remove someone else only when
    `scopeFor(role, 'books', 'update')` is exactly `own` and they are credited —
    `none` (no longer an author) and `any` (a Moderator) are both 403.
  - **A book always keeps one Co-author.** `bookRepository.removeCoAuthor`
    answers 404 for an account that is not credited — checked first, so a
    stranger on a solo book is not told its real Co-author cannot leave — and
    409 for the last one, who must delete the book instead. The count and the
    delete run under `SELECT … FOR UPDATE` on the book row, or two Co-authors
    of a two-author book leaving at once would each count two and leave it
    credited to nobody.
  - **Deleting an account deletes only the works it was the last Co-author
    of.** `userRepository.remove` locks the account's credited series and
    books with the same row lock, deletes those with a single credit, and lets
    the `series_authors.userId` / `book_authors.userId` cascades drop its
    credit from the rest. A deleted series only unlinks its books; ADR-0004's
    hard-deleted comments follow only the books that actually go.
  - **Switching Role from `author` to `user` keeps every credit.** Nothing
    strips it; the matrix alone takes away the write access.
- **Notifications** (CONTEXT.md). Every change to who is credited on a shared
  work, and every deletion of one, writes a notification per recipient in the
  same transaction as the change (`notify` in
  `repositories/notificationRepository.ts`), so a change that fails raises
  nothing. The actor is never a recipient. Books and series behave alike:
  - **Added** tells the account added, naming the Co-author who added it;
    **removed** tells the account removed; **leaving** — `removeCoAuthor`
    naming the actor's own id — tells every Co-author who remains.
  - **Deleting the work** tells every other Co-author. A deleter credited on
    the work is named; anyone else is a Moderator and is not (`deleterOf`).
  - **Deleting an account** tells the remaining Co-authors of every work it
    shared, as a `deleted_account` with no name. The works it alone was
    credited on go with it and tell nobody.
  - Text, status, series filing, order and chapter changes raise nothing.
  - **A snapshot, not a view.** The row copies the work's title and the
    actor's display name as they were, so it reads the same after a rename,
    the work's deletion or the actor's own. Only the link is live:
    `bookId` / `seriesId` are nullable foreign keys with `ON DELETE SET NULL`,
    and `toPublicNotification` answers `work.id: null` once the work is gone.
    The recipient's `userId` cascades.
  - The three repository writes that raise one — `remove`, `addCoAuthor`,
    `removeCoAuthor` on books and on series — take an `Actor` (`{ id, role }`),
    which each controller builds with `actorOf` in `repositories/visibility.ts`.
- **Draft books** (CONTEXT.md). A Draft book is readable by its Co-authors
  and Moderators and by nobody else, and that rule lives in one module,
  `repositories/visibility.ts`, not in the controllers. Every repository read
  that can reach a book takes a `Viewer` (`{ id, role } | null`), which each
  controller builds from `req.user` with `viewerOf` — `requirePermission`
  resolves the session on public reads too, so an unset `req.user` really is a
  Guest.
  - **Readable** (`readableBookWhere`, `readableBookInclude`): every non-draft
    book, the drafts the viewer co-authors, or everything for `admin` and
    `superadmin`. `GET /api/books/:id`, and the list and detail reads of
    chapters and comments, join through it; a hidden row is the same 404 (or
    absence from a list) as a missing one, so a refusal never confirms a draft
    exists.
  - **Chapters** add their Publication time (`readableChapterScope`): a
    reader sees a chapter only when its book is readable and its
    `publishedAt` has passed. A Co-author of the book sees every chapter in
    it, drafts and scheduled ones included, and a Moderator sees every chapter
    of every book.
  - **Likes** point at a book or at a comment on one, so they exclude instead
    (`hiddenBookIds`): the likes on a hidden draft and on the comments under it
    drop out. Drafts are few, so the exclusion lists stay short.
  - **Listed** is narrower than readable: no book list shows a draft — a
    Moderator's included, since a Moderator reaches a draft by direct link
    only — except `GET /api/books?userId=` naming the caller's own id, which
    returns their drafts beside their published books. That is the list a
    "My books" page reads.
  - **Series** have no status. A series is visible when it holds at least one
    non-draft book, or the viewer co-authors it, or is a Moderator
    (`visibleSeriesWhere`). The published side is a fixed subquery with no
    caller-supplied value, because an id list would grow with the catalogue.
  - **A series' Co-authors see the drafts filed in it, by name only.** A
    series and its books keep independent Co-author lists, so a Co-author of
    the series need not co-author a Draft book filed there — yet reordering
    needs the whole list. `GET /api/series/:id/books` therefore names every
    book in the series, drafts included, to the series' Co-authors and
    Moderators, as a `SeriesBookSummary` with no description, tags or
    chapters. The draft itself stays unreadable to them: its detail,
    chapters and comments still go through `readableBookWhere`, and a draft
    only enters a series through someone who co-authors both.
  - **Nobody writes to a draft's conversation.** `commentRepository.create`
    refuses a comment on a Draft book, and `likeRepository.create` a like on
    one or on a comment under one — 403 for everyone, Co-authors and
    Moderators included. Returning a book to Draft keeps its comments and
    likes; they are hidden with it and come back when it is published again.
  - **`findById` is viewer-aware too**, so `PATCH` and `DELETE` on a comment or
    a like hanging off a hidden draft answer 404 before any owner check.
- **Deleting a comment leaves a tombstone, not a hole** (ADR-0003).
  `DELETE /api/comments/:id` sets `tombstone` on that one row and touches
  nothing else; the replies stay, so the thread reads around the gap rather
  than losing everything under a withdrawn remark. There are two kinds
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
    (`You cannot like a deleted comment` /
    `You cannot change a like on a deleted comment`, `likeRepository`) — but
    removing your own existing like from a tombstone is still allowed.
    Replies that already exist under a tombstone behave normally.
  - **A thread cannot be tombstoned wholesale.** Each reply belongs to its
    own author, and only they, a moderator, or their own account's deletion
    can turn it into a tombstone. That is the deliberate cost of keeping
    replies alive.
  - **The tombstone promise ends where the book does** (ADR-0004). It covers a
    withdrawn comment, not a vanished book: `Book.hasMany(Comment)` cascades,
    so deleting a book — including the cascade from deleting its author's
    account — hard-deletes every comment on it, other people's threads
    included, with no tombstone behind them. Deliberate, not an oversight;
    marking those rows first would change nothing, since the cascade destroys
    them either way.
- **CSRF** is refused twice, ahead of every route in `app.ts`
  (`middleware/csrfProtection.ts`), and neither layer leans on the `sid`
  cookie's SameSite=Lax, which already keeps it off cross-site writes in
  current browsers. Reads (`GET`, `HEAD`, `OPTIONS`) pass both.
  - **`createCrossOriginProtection`** refuses a write the browser says came
    from elsewhere, as Go 1.25's `http.CrossOriginProtection` does: an
    `Origin` equal to `trustedOrigin` (`APP_BASE_URL`, the client — which
    reaches the API through its dev proxy, so with another Host) passes;
    otherwise `Sec-Fetch-Site` decides, where only `same-origin` and `none`
    pass; with no `Sec-Fetch-Site` an `Origin` must name the request's own
    host; and a request with neither header is not a browser and passes. A
    refusal is 403 `Cross-origin request refused`.
  - **`requireXsrfToken`** is a double-submit token bound to the session.
    `setSessionCookie` sets an `xsrfToken` cookie beside `sid` — not
    httpOnly, so the client can read it — holding
    `HMAC-SHA256(key: the session token, "xsrf")`. A write carrying a `sid`
    cookie must send that value in `X-XSRF-Token`, equal to the cookie; one
    without is 403 `Missing or invalid CSRF token`. A token planted by a
    sibling subdomain names another session and fails. A request with no
    session has no ambient authority and needs no token (login and
    registration rely on the first layer), and any request whose token cookie
    is missing or stale is handed the right one.
  - The route specs do not repeat either: `routeTestKit.testkit.ts` adds the
    session's token to every request that carries a session cookie, the way
    the client does, and `csrfProtection.spec.ts` covers the refusals — the
    layers on their own, and `createApp` refusing before any route runs.
    `app.spec.ts` is the one suite that performs the handshake for real,
    reading the token from the cookie the server issued.
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
  `users.role`, from `shared`) omits it, and `ROLES` is built as
  `['guest', ...USER_ROLES]`, so a new role gets its matrix row — it is what `requirePermission` assumes when a
  request carries no session, so a public read is described by a row in the
  matrix rather than by the absence of a guard. Each role after `user`
  layers more grants on top of the last, with one deliberate exception:
  `admin` and `superadmin` both get no `create` on `books`, `series` or
  `chapters`. Admins moderate; they do not author, and that stays true even
  for the role that is `any` on literally everything else.
- **The matrix is a `role × module × action → scope` table**
  (`permissions/matrix.ts`, `models/Permission.ts`): eight modules (`users`,
  `series`, `books`, `chapters`, `comments`, `likes`, `genres`, `reports` —
  `reports`
  is reserved for a moderation feature that has no model, controller or
  route yet, so today it grants access to nothing), four actions (`create`,
  `read`, `update`, `delete`), and a scope of `none` / `own` / `any` rather
  than a boolean. A boolean could not tell "an `author` may update the books
  they wrote" from "an `admin` may update anyone's book" — that distinction
  would fall back into every controller instead of living in one table. On
  `create` specifically, `own` and `any` mean the same thing: a created row
  is the caller's by construction (its owner column, or a new book's first
  Co-author, is always the session's user id), so `own` is simply the spelling
  a role that may create uses — but the create path is not scope-only.
  Creating a book into a series checks that the caller may touch that series
  (`assertMayAddToSeries` in `controllers/bookController.ts`), and creating a
  chapter checks that the caller co-authors its book
  (`assertMayChangeChaptersOf` in `controllers/chapterController.ts`); both
  run after the matrix has already let the request through.
  `PERMISSION_DEFINITION` in `matrix.ts` only spells out what is granted;
  everything else expands to `none` when `buildMatrixRows()` produces one
  row per role/module/action for the table, so a missing row can never be
  mistaken for an accidental grant.
- **`genres` is the one routed module with no `own` anywhere.** A Genre has
  no Owner, so the scope is the whole grant: `guest`, `user` and `author`
  hold `read: any` and nothing else; `admin` holds all four actions as
  `any`; and `superadmin` reaches it through its blanket `any`, since the
  no-`create` carve-out names `books`, `series` and `chapters` only. Keeping
  the catalogue's categories is moderation, not authoring (ADR-0008).
  Setting `genreId` on a Book or a Series needs no grant here at all: it
  rides on that work's own `create`/`update` grant and ownership check, and
  any existing Genre may be chosen.
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
  may `PATCH` **or `DELETE`** their own row — an admin may delete its own
  account, unlike a superadmin — and may `PATCH` or `DELETE` only other
  accounts whose role is `user` or `author` (`ADMIN_MANAGEABLE_ROLES`) —
  targeting another admin or any superadmin is a 403, and a missing id is
  still a 404 first, ahead of the rank check. A `superadmin` reaches every
  account with no such narrowing, but may not delete their own account
  (`userController.remove`) or change their own role through
  `PATCH /api/users/:id/role` (`userRoleRoutes.ts`); another superadmin may
  do both. A `user`/`author` still reaches only their own row, refused
  without a database lookup.
  Nobody, at any role, changes their own `status` through
  `PATCH /api/users/:id` — a `status` key in the body of a request against
  your own row is a 403 even when the value would not change anything.
  Changing your own `password` or `email` additionally requires
  `currentPassword` in the same body (missing → 400, wrong → 403); it is
  never stored and never counts as a change on its own. The rank rule
  protects **accounts** only — moderating content ignores it, so an admin
  may remove a superadmin's comment. `admin` and `superadmin` also carry
  `update: own` on `comments` and `likes` (see **Deleting a comment leaves a
  tombstone, not a hole** under **Auth** above): a moderator removes, and
  for comments restores, but never rewrites, someone else's reaction or
  remark. Superadmin's blanket `any` therefore has two carve-outs, not one:
  no `create` on `books`/`series`/`chapters`, and `update: own` rather than
  `any` on `comments` and `likes`.

## Operations

### Security headers

`createApp` turns off Express's `X-Powered-By` and, as its first middleware
(`middleware/securityHeaders.ts`), sets `X-Content-Type-Options: nosniff` on
every response — a success, an error, a `notFound` 404 and a body
`express.json()` refuses to parse alike. The Cover and Avatar `GET`s still
set `nosniff` themselves beside their `Content-Type`; the two agree.
`createApp.spec.ts` checks this on `createApp`'s own app: Express 5 sets
`X-Powered-By` in `app.handle`, so a wrapping `express()`, like the route
test kit's `withApp`, would add it back.

### Graceful shutdown

`index.ts` registers `src/shutdown.ts` for `SIGTERM` and `SIGINT`
(`process.once`). On either it logs, stops every interval the process hands
it (`stoppables`), closes the HTTP server and its idle connections, waits
for the server to finish, then awaits `sequelize.close()`. It leaves
`process.exitCode` alone, so a clean shutdown ends with 0 once nothing holds
the event loop. The other signal, arriving mid-shutdown, joins the one already
under way rather than starting another. The same signal a second time does
not: `process.once` removed its listener before the first ran, so Node's
default action is back and the process ends at once — a second Ctrl+C is a
hard kill, and a second `SIGTERM` skips whatever is left of the shutdown, the
pool close included. A 10-second deadline (`SHUTDOWN_TIMEOUT_MS`, on an
`unref()`ed timer) forces the rest: it drops every open connection, logs, and
exits 1; so does a pool that fails to close. `node --watch` (`npm run dev`)
restarts with `SIGTERM`, so every dev restart takes this path.
`shutdown.spec.ts` drives it with fakes for the server, the pool and the timer
rather than real signals.

### A port that cannot be bound

Express 5 hands `app.listen`'s callback the error when binding fails —
`EADDRINUSE`, say — which Express 4 never did. `src/listen.ts` checks it: on
an error it logs `Could not start the HTTP server` with the message and
never "listening"; `index.ts` then sets `process.exitCode = 1` and runs the
graceful shutdown, so the database pool closes and the process exits. Only a
bound server logs `server listening on …`.

### Expiry purge

`src/expiryPurge.ts` deletes the rows nothing will read again: sessions
whose `expiresAt` has passed (`sessionRepository.deleteExpired`, the same
rows `findValidByTokenHash` already refuses) and password-reset tokens more
than 30 days past their own expiry, used or not
(`passwordResetRepository.deleteExpiredBefore`, `RESET_TOKEN_RETENTION_MS`)
— the month keeps the evidence that a reset was requested. `index.ts` starts
it after `syncPermissions()`: one pass at boot, then one an hour on an
`unref()`ed interval, which the graceful shutdown stops. A pass logs its
counts at `info` only when it deleted something, and a failure at `error`;
it never rejects, so a database hiccup costs one pass, not the process.

### Sign-in rate limiting

Three auth routes carry an in-memory, fixed-window limit
(`middleware/authRateLimit.ts`, built on `src/rateLimit.ts`), mounted ahead
of `validate` so a refused request costs no parsing, no lookup and no argon2:

| Route                                   | Key        | Limit         | What counts                |
| --------------------------------------- | ---------- | ------------- | -------------------------- |
| `POST /api/auth/login`                  | IP + login | 10 per 15 min | failed or aborted attempts |
| `POST /api/auth/login`                  | IP         | 50 per 15 min | failed or aborted attempts |
| `POST /api/auth/register`               | IP         | 5 per hour    | every request              |
| `POST /api/auth/password-reset/request` | IP         | 5 per hour    | every request              |

- **Login counts against both budgets the moment it arrives, and settles the
  claims when it answers or the connection closes.** A check that ran first
  and recorded only later would let unlimited parallel attempts each read
  the same unspent count while they all wait on the lookup and argon2, so
  both budgets are `hit` up front instead. A request either budget refuses
  is turned away before the handler ever runs, and **both** claims are
  released regardless of which budget did the refusing — `hit` always
  increments even on the budget that refuses, so leaving that one
  un-released would let a burst of refused attempts keep inflating the very
  count that refused them, locking the address or the name out for longer
  than its own limit ever earned. A refusal this way leaves nothing behind
  on either budget. Once the request runs, a 401 keeps both claims, and so
  does an abort — the connection closing before any answer goes out. The
  handler still runs the lookup and argon2 after the client has gone, so
  giving an abort's claims back would let a client abort and repeat for
  unlimited argon2 work per address without ever being refused. Any other
  answer — a 400, a 403 (a blocked account) or a 2xx — releases both claims:
  each `release` gives back that one claim, and a count that reaches 0 drops
  its key outright rather than leaving an empty window behind (see
  `src/rateLimit.ts` under **Layout**). A 2xx also clears the rest of the
  IP + login budget's own history, which an abort never does. The per-IP
  budget survives a success on its own, or signing in to one real account
  would buy fresh guesses at every other.
- **The login is trimmed, lower-cased and hashed** (SHA-256, hex) before it
  becomes the name half of the IP + login key, so a change of case or stray
  whitespace buys no fresh budget, and the key stays a fixed size whatever
  the body carries — `loginSchema` puts no cap on `login`, this middleware
  runs ahead of `validate`, and `express.json()` alone allows up to 100 KB;
  without hashing, an unbounded login would leave an unbounded key sitting in
  the limiter's map until the sweep drops it. `login` itself is
  case-sensitive (`utf8mb4_0900_as_cs`), so two accounts that differ only in
  case share one budget per address — the limit errs toward refusing.
- **Register and the reset request count every request**, up front, so
  malformed spam spends the budget too. A body that is not JSON at all never
  reaches the route: `express.json()` refuses it first.
- **A refusal is 429**, with `Retry-After` in whole seconds, rounded up, and
  `{ "error": "Too many attempts. Try again in N minutes." }` — singular,
  `"...in 1 minute."`, when N is exactly 1 — N rounded up and at least 1
  (`TooManyRequestsError`, rendered by `errorHandler`). The client's auth
  modals already show `error.message`.
- **Keyed on `req.ip`**, which `TRUST_PROXY` governs: behind a proxy, set it,
  or every client shares the proxy's budget.
- **Memory, not the database.** Nothing is written, and a limited Account is
  not Blocked — the two are unrelated. Expired windows are dropped when their
  key is next touched and swept once a window by an `unref()`ed interval,
  which the graceful shutdown stops. Each process keeps its own counts, and a
  restart forgets them.
- `createApp` requires the set (`AppDeps.authRateLimits`); `index.ts` builds
  the real one with `createAuthRateLimits()`. Every test harness passes
  `unlimitedAuthRateLimits()` from `routes/routeTestKit.testkit.ts` instead,
  since the suites sign in far more often than the limits allow;
  `middleware/authRateLimit.spec.ts` and the rate-limit cases in
  `routes/authRoutes.spec.ts` pass the real one.

## Runtime notes

- ESM package (`"type": "module"`), Node >= 24 — the repo's `engines` floor.
  Every 24.x strips types without `--experimental-strip-types`, so nothing
  here needs a flag. `tsconfig.json` uses
  `module`/`moduleResolution: NodeNext` to match, and emits ESM to `dist/`.
- Both `start` and `dev` run the `.ts` entry directly via Node (native TS
  type-stripping); `dev` only adds `--watch` on top.
- Every relative import must carry the `.ts` extension (e.g. `from './app.ts'`),
  because Node's native TS mode resolves modules exactly as written — it does
  no extension rewriting itself. `tsconfig.json` sets
  `rewriteRelativeImportExtensions: true`, so `npm run build` rewrites those
  same imports to `.js` when compiling to `dist/`, and the same source runs
  unmodified in both modes.
- `tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`, as
  `shared/tsconfig.json` does: Node strips types rather than compiling them,
  so no enum, namespace or parameter property may appear, and a type-only
  import must say `type`. An ambient `const enum` from a dependency is
  refused as well — which is why `password.ts` names no argon2 `algorithm`
  and relies on `@node-rs/argon2`'s argon2id default, pinned by
  `password.spec.ts` through the hash's PHC prefix
  (`$argon2id$v=19$m=19456,t=2,p=1$` outside tests).
- `target` and `lib` are `ES2024`, which Node 24 runs in full. The client and
  `shared` stay on ES2020.

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
- **Index reads are checked**: `noUncheckedIndexedAccess` (root
  `tsconfig.base.json`) types `items[i]` as `T | undefined`. Application
  code — `seed.ts` included — handles the miss with an early return, a throw
  that names what was missing (`itemAt` in `seed/rng.ts`), or `?.`/`??` where
  absence is legitimate. Only test files (`*.spec.ts`, `*.testkit.ts`) may
  assert it away with `!`.

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
- **Foreign key column types must match exactly**: `books.seriesId` and the
  `bookId` / `seriesId` / `userId` columns of `book_authors` and
  `series_authors` are `INTEGER UNSIGNED` because `users.id`, `series.id` and
  `books.id` are; a plain `INTEGER` makes MySQL reject the constraint with
  errno 3780. `book_covers.bookId` and `user_avatars.userId` follow the same
  rule — each is both the table's primary key and its foreign key.
- **`book_authors` and `series_authors` replace `books.userId` and
  `series.userId`**: one row per Co-author credit, unique on
  `(bookId, userId)` / `(seriesId, userId)`, both foreign keys `CASCADE`. Two
  tables rather than one polymorphic `credits` table, so every credit keeps a
  real foreign key to the work it names. The byline is ordered by the row's
  surrogate `id`, not `createdAt` — `DATETIME` stores whole seconds, so two
  Co-authors added in the same second would tie. Deleting a user row drops
  only its credits; whether a work goes too is `userRepository.remove`'s
  decision (see **Co-authors** under Auth). The MySQL-backed suites create
  works through `createCreditedBook` / `createCreditedSeries` in
  `models/creditedBook.testkit.ts`, the one place that knows a work needs its
  credits written beside it. `createCreditedBook` makes an `in_progress` book
  unless the fixture names a status, because a draft would hide the very rows
  a suite that is not about drafts reads back.
- **`books.seriesId` is optional, and that drives its `ON DELETE`**: a book can
  stand alone, so the column is nullable and `Series.hasMany(Book)` uses
  `ON DELETE SET NULL` — dropping a series unlinks its books instead of
  deleting records nobody asked to delete. MySQL rejects `SET NULL` on a
  `NOT NULL` column, so the association passes `allowNull: true` in its
  `foreignKey` object rather than letting Sequelize infer NOT NULL.
- **`chapters.bookId` is the mirror image**: required, so it is `NOT NULL` and
  `Book.hasMany(Chapter)` cascades. A chapter outside a book is not a state
  worth representing, and `SET NULL` would be illegal on the column anyway.
  Between them the two associations cover both shapes — consult which one an
  optional link deserves before copying either.
- **`comments.parentId` is a third shape**: the column is a self-reference (a
  reply points at the comment it answers), nullable because a top-level
  comment answers nothing, and declared `SET NULL` rather than `CASCADE` or
  `RESTRICT` (ADR-0002) — a bulk `DELETE FROM comments` or a cascading book
  delete would otherwise fail past 15 levels of nesting, which would take the
  test teardown down with it. Comment deletion is soft now (see **Deleting a
  comment leaves a tombstone, not a hole** under Auth), so
  `DELETE /api/comments/:id` never reaches this column at all; the
  association's `SET NULL` only ever fires when a book cascades away its
  comments wholesale, not from removing one comment.
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
- **`book_covers` and `user_avatars` are the only tables that keep
  `updatedAt` but drop `createdAt`**: a replace overwrites the one row in
  place, so only the current version's moment matters — the reverse of
  `book_authors`/`series_authors`, which keep `createdAt` and drop
  `updatedAt` because a credit is only ever added or removed, never
  edited. Neither carries a content-type column: every stored picture is
  WebP, re-encoded by `src/images.ts` on the way in (ADR-0007).
- **A large column belongs out of the list SELECT**: `chapterRepository.list`
  passes an explicit `attributes` array that omits `text`, and returns
  `ChapterSummary` (`Omit<PublicChapter, 'text'>`) rather than the full record,
  so `GET /api/chapters` cannot drag twenty MEDIUMTEXT bodies off disk to
  serve a table of contents. The body is reachable through `GET /:id`. Keeping
  the omission in the _type_ is what stops a future call site from quietly
  putting it back.
- **Only one of a book's foreign keys can fail**: `bookRepository` maps a
  `ForeignKeyConstraintError` on create to `NotFoundError('User')` through
  `asMissingUser`, because the first credit's `book_authors.userId` is the
  only reference a book write can have rejected. `books.seriesId` never is: a
  write that files a book into a new series calls `nextSeriesPosition` first,
  which answers a missing series with `NotFoundError('Series')` and holds its
  row under a lock until commit, and a write that keeps the series holds a
  lock on a book row pointing at it, which the series' `SET NULL` delete would
  have to wait for. So `update` maps no foreign-key error at all. An earlier
  version matched the column name in MySQL's constraint text to tell the two
  apart; that `seriesId` branch could not be reached.
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
  own schema — thirteen of them, `books_demo_spa_test` plus
  `books_demo_spa_test_` and the suite's name (`series`, `books`, `genres`,
  `chapters`, `likes`, `comments`, `notifications`, `sessions`, `password_resets`,
  `permissions`, `app`, `seed`) —
  because `node:test`
  runs spec files in parallel processes, and two suites calling
  `sync({ force: true })` on one database drop each other's tables mid-run.
  Clear children before parents:
  `Like` → `Comment` → `Chapter` → `Book` → `Series` → `User` (`BookAuthor` and
  `SeriesAuthor` go with either of their parents by cascade); `Like` is the
  leaf of every chain, and `Comment` must precede both `Book` (its
  still-cascading foreign key) and `User` (its no-longer-cascading one).
  `Notification` goes with `User` by cascade but only unlinks from `Book` and
  `Series`, so a suite that counts notifications clears them first.
  A suite that syncs must call `initModels`, not a single `init*Model`, or
  `sync` cannot work out the drop order.
  That per-suite naming is also what the `posttest` cleanup keys on: those
  thirteen names are `TEST_DB_NAME ?? 'books_demo_spa_test'` plus a suffix, so
  `dropTestDatabases.testkit.ts` drops whatever `SHOW DATABASES` reports under
  that prefix rather than a list it would have to be told to update. Name a
  new suite's schema the same way and it is cleaned up for free; name it
  anything else and it is left on disk forever.
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
  this branch needs the same drop-and-rebuild. Co-authors did it again:
  `books.userId` and `series.userId` are gone and `book_authors` and
  `series_authors` are new, and a surviving `NOT NULL` owner column makes every
  book or series insert fail, so a database created before them needs the drop
  too. So does `books.status`: a database without the column fails every read
  that filters on it. And `chapters.publishedAt` is new while
  `chapters.updatedAt` gained millisecond precision, neither of which
  `sync()` applies to an existing table. Nor does it add
  `chapters.position`, a `NOT NULL` column every chapter insert and list
  needs, or swap the `(bookId, id)` index for `(bookId, position)` — nor
  add `books.seriesPosition` or swap `(seriesId, id)` for
  `(seriesId, seriesPosition)`. The `notifications` table is the exception:
  a table that does not exist yet is exactly what `sync()` does create.
  `book_covers` and `user_avatars` join it: both are new tables too, so
  `sync()` creates them on the next boot, with no drop needed for either.
  Genres land differently: `books.genreId` and `series.genreId` are new
  nullable `INTEGER UNSIGNED` foreign keys with `ON DELETE SET NULL`, plus
  the indexes that serve `?genreId=`, and `sync()` adds none of that to an
  existing `books` or `series` table. `permissions.module` is a MySQL
  `ENUM` built from `MODULES`, now widened to hold `genres`, so until
  `permissions` itself is recreated the startup permission sync cannot
  insert the new rows. `genres` itself is the exception again — a table
  that does not exist yet, so `sync()` does create it — but the two foreign
  keys and the widened `ENUM` mean this branch needs the drop-and-rebuild
  after all.
- **`comments.userId` is nullable with `ON DELETE SET NULL` — the one owner
  reference in this schema that is not `CASCADE`.** A comment outlives its
  owner's account, as a tombstone: `userRepository.remove` marks every one of
  the account's comments `deleted` in the same transaction as the account
  delete, so by the time the foreign key nulls their `userId` the row is
  already a tombstone, and an owner-less comment is therefore never live.
  Comments on the books this account was the last Co-author of are the
  exception — `Book.hasMany(Comment)` still cascades, so those go with the
  books, other
  people's threads included; see **The tombstone promise ends where the book
  does** under Auth, and ADR-0004, for why that is deliberate.
- **`DELETE /api/comments/:id` no longer deletes anything.**
  `commentRepository.remove` sets `tombstone` and stops there — see
  **Deleting a comment leaves a tombstone, not a hole** under Auth.
  `comments.parentId` stays `ON DELETE SET NULL` regardless, because deleting
  a _book_ still hard-cascades into its comments: `ON DELETE CASCADE` on the
  self-reference fails with `ER_FK_DEPTH_EXCEEDED` (errno 3008) past 15
  levels and takes the book's delete down with it. The measurement is
  recorded in `models/index.ts`, and `commentRepository.spec.ts` covers a
  20-deep thread.
