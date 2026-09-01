# Server — books_demo_spa

Node.js + TypeScript API built on Express 5, with Sequelize 6 / MySQL available
for persistence.

## Status

Early scaffold. `src/index.ts` only creates an Express app and calls
`app.listen(4000)` — no routes, middleware, or database connection are wired yet.
`sequelize` and `mysql2` are installed but unused so far. The feature directories
below exist but are empty.

## Development Commands

- `npm start` — run the server: `node ./src/index.ts` (native TS, Node >= 22.5)
- `npm run start:dev` — run under nodemon (see `nodemon.json`), which execs
  `node ./src/index.ts` and restarts on changes to `src/**/*.{ts,json}`
- `npm run build` — compile with `tsc` to `dist/`
- `npm run typecheck` — `tsc --noEmit` (type-check only)
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format` / `npm run format:check` — Prettier (root `.prettierrc.json`)

There is no `test` script or `sequelize-cli` dependency yet — do not reference
them until they are added.

## Layout

- `src/index.ts` — Express entry point (listens on port 4000)
- `src/routes/` — Express route definitions _(empty — to be created)_
- `src/controllers/` — request handlers / HTTP mapping _(empty)_
- `src/repositories/` — data-access layer _(empty)_
- `src/models/` — Sequelize models & associations _(empty)_
- `src/db/` — database connection / config _(empty)_
- `src/middleware/` — auth, validation, error handling _(empty)_
- `src/types/` — shared TypeScript types _(empty)_

## Runtime notes

- ESM package (`"type": "module"`), Node >= 22.5. `tsconfig.json` uses
  `module`/`moduleResolution: NodeNext` to match, and emits ESM to `dist/`.
- Both `start` and `start:dev` run the `.ts` entry directly via Node (native TS
  type-stripping); nodemon only adds watch/restart on top.

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
- **Migrations**: `sequelize-cli` is not installed. When it is added, remember
  this is an ESM package — `.js` migrations are parsed as ESM, so the CLI's
  `module.exports` template will throw. Name them `.cjs` or author them as ESM.
