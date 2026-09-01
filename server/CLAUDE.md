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
