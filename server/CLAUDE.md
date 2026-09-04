# Server — books_demo_spa

Node.js + TypeScript API built on Express 5, with Sequelize 6 / MySQL available
for persistence.

## Status

The `User`, `Series`, `Book`, `Chapter` and `Like` models and their CRUD APIs
are implemented end to end, associated by `User.hasMany(Series)`,
`User.hasMany(Book)`, `Series.hasMany(Book)`, `Book.hasMany(Chapter)`, and
`hasMany(Like)` from each of `User`, `Book` and `Comment`.
Sequelize (via `mysql2`) connects to the `books_demo_spa` MySQL database;
`src/index.ts` ensures the schema exists, authenticates, and mounts the
Express app under `/api`. Routes, controllers, repositories, models, and
middleware are all wired for those five. `node:test` is the test runner
(`npm test`).

`Session` and `PasswordResetToken` back a full session-based auth API at
`/api/auth`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`,
`POST /password-reset/request` and `POST /password-reset/confirm`. Both models
hang off `User.hasMany(...)` with `ON DELETE CASCADE`. **Every write on the
five resources above — `POST`, `PATCH`, `DELETE` — now requires a session**,
and so do both reads on `/api/users`, because `PublicUser` carries an email
address and an open list would be a scrapeable account directory. Every other
`GET` stays public. See **Auth** below.

`Comment` is the one model without an API. `User.hasMany(Comment)`,
`Book.hasMany(Comment)`, `Comment.hasMany(Like)` and the self-referential
`Comment.hasMany(Comment, { as: 'replies' })` are wired and covered by
`models/Comment.spec.ts`, but it has no repository, controller or route yet,
and `types/comment.ts` holds only `PublicComment` — no zod schemas. Likes on
comments are reachable through `/api/likes` regardless, since a like
references a comment by id.

## Development Commands

- `npm start` — run the server: `node ./src/index.ts` (native TS, Node >= 22.5)
- `npm run start:dev` — run under nodemon (see `nodemon.json`), which execs
  `node ./src/index.ts` and restarts on changes to `src/**/*.{ts,json}`
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
  which passes its plugins to `createConfig` in the repo-root
  `eslint.config.base.mjs`; the Node globals block is all that is local)
- `npm run format` / `npm run format:check` — Prettier (root `.prettierrc.json`)

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
  `seriesRoutes.ts`, `bookRoutes.ts`, `chapterRoutes.ts`, `likeRoutes.ts`,
  mounted under `/api`). `routeTestKit.testkit.ts` holds the harness the six
  route specs share (`withApp`, `withAuthenticatedApp`, `AUTH_COOKIE`,
  `json`); `tsconfig.build.json` excludes `*.testkit.ts` alongside `*.spec.ts`,
  so neither is emitted to `dist/`.
- `src/controllers/` — request handlers / HTTP mapping (`authController.ts`,
  `userController.ts`, `seriesController.ts`, `bookController.ts`,
  `chapterController.ts`, `likeController.ts`)
- `src/repositories/` — data-access layer (`userRepository.ts`,
  `seriesRepository.ts`, `bookRepository.ts`, `chapterRepository.ts`,
  `likeRepository.ts`, `sessionRepository.ts`, `passwordResetRepository.ts`,
  Sequelize-backed; `likePattern.ts` holds the LIKE
  escaping they share). Note the collision: `likePattern.ts` is about the SQL
  `LIKE` operator and has nothing to do with `likeRepository.ts` — the two
  sit next to each other and mean different things by the same word.
- `src/models/` — Sequelize models & associations (`User.ts`, `Series.ts`,
  `Book.ts`, `Chapter.ts`, `Comment.ts`, `Like.ts`, `Session.ts`,
  `PasswordResetToken.ts`, `index.ts`; `tagArray.ts`
  holds the JSON tag-column normalisation `Series` and `Book` share)
- `src/db/` — database connection / config (`config.ts`, `ensureDatabase.ts`,
  `sequelize.ts`)
- `src/middleware/` — auth, validation, error handling (`requireAuth.ts`,
  `errorHandler.ts`, `notFound.ts`, `validate.ts`)
- `src/types/` — shared TypeScript types (`user.ts`, `series.ts`, `book.ts`,
  `chapter.ts`, `comment.ts`, `like.ts`, `auth.ts`, `errors.ts`,
  `express.d.ts`)

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
- **`requireAuth` runs before `validate`** on every guarded route, so an
  unauthenticated request is refused without its body being parsed or echoed
  back in a 400. The visible consequence: an unauthenticated request with a
  malformed body or id is a 401, not a 400.
- **Login gives one answer to two questions.** An unknown login and a wrong
  password both return 401 with an identical body, and the unknown-login path
  deliberately spends an argon2 verify against a cached dummy hash so the two
  cannot be told apart by response time either. That dummy hash is computed
  lazily and reused, and `authController.spec.ts` drives the `verify` seam
  directly to prove both properties — a wall-clock assertion would be flaky
  under load, and an ESM import binding cannot be spied on from outside.
- **A blocked account is checked after the password, not before**, or the 403
  would tell an attacker without the password that the account exists.
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
- **Ownership is deliberately not checked.** A signed-in user may write another
  user's rows; that is out of scope by design and needs its own spec.

## Runtime notes

- ESM package (`"type": "module"`), Node >= 22.5. `tsconfig.json` uses
  `module`/`moduleResolution: NodeNext` to match, and emits ESM to `dist/`.
- Both `start` and `start:dev` run the `.ts` entry directly via Node (native TS
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
  to top level, so that is what `Comment.hasMany(Comment)` declares. Deleting a
  whole subtree belongs in application code: walk it, then delete in one
  statement inside a transaction.
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
  table referenced by a foreign key, so the suites clear users with
  `destroy({ where: {} })` and let `ON DELETE CASCADE` take the children.
  Each MySQL-backed suite also syncs its own schema
  (`books_demo_spa_test`, `books_demo_spa_test_series`,
  `books_demo_spa_test_books`, `books_demo_spa_test_chapters`,
  `books_demo_spa_test_likes`) — `node:test`
  runs spec files in parallel processes, and two suites calling
  `sync({ force: true })` on one database drop each other's tables mid-run.
  Clear children before parents:
  `Like` → `Comment` → `Chapter` → `Book` → `Series` → `User`; `Like` is the
  leaf of every chain, and `Comment` must precede `Book`.
  A suite that syncs must call `initModels`, not a single `init*Model`, or
  `sync` cannot work out the drop order.
- **Migrations**: `sequelize-cli` is not installed. When it is added, remember
  this is an ESM package — `.js` migrations are parsed as ESM, so the CLI's
  `module.exports` template will throw. Name them `.cjs` or author them as ESM.
