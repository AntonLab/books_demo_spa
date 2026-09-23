# Server — books_demo_spa

Express 5 + Sequelize 6 / MySQL API, run as native TypeScript on Node >= 24.

## Topic rules

The detail lives in `.claude/rules/server/`, one topic per file. Each loads on
its own when you Read a file its `paths:` names — writing or editing one does
not. Before creating a file, or changing a topic whose files you have not
read, read the rule first:

| Rule             | Covers                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `api.md`         | Book status, Publication time, Reading and Series order, credits, Genres, zod traps |
| `access.md`      | ownership, Co-authors, Notifications, Draft books, comment tombstones               |
| `permissions.md` | Roles, the permission matrix, account rank rules                                    |
| `auth.md`        | sessions, login, password reset, CSRF, sign-in rate limiting                        |
| `images.md`      | Covers and Avatars: storage, `sharp`, the six routes                                |
| `sequelize.md`   | model typing, MySQL column and foreign-key choices, schema changes                  |
| `testing.md`     | test layers, fakes and contracts, the MySQL-backed suites and their schemas         |
| `seed.md`        | the demo seed                                                                       |
| `operations.md`  | security headers, graceful shutdown, bind errors, expiry purge                      |

## Invariants

Every change holds these; the rules above say why.

- **Identity comes from the session, never the body.** No create schema takes a
  `userId`; controllers read `req.user.id`.
- **`requirePermission` / `requireAuth` run before `validate`**, so a refused
  request answers 401/403, never 400.
- **Ownership checks answer 404 before 403**, so a refusal never confirms an id.
  A book's or series' owner is any of its Co-authors (no owner column exists).
- **Every read that can reach a book takes a `Viewer`** and joins through
  `repositories/visibility.ts`; a Draft book is hidden there, not in a controller.
- **`role` is in neither `createUserSchema` nor `updateUserSchema`**: the update
  schema derives from the create one, so a `role` there would let anyone
  promote themselves.
- **Every write is CSRF-guarded** ahead of every route (`csrfProtection.ts`).
- **Multi-step writes run in one managed transaction**, `{ transaction: t }` on
  every query in it. No string interpolation into `sequelize.query()`; no
  query inside a loop.
- **Throw typed errors** (`types/errors.ts`); `errorHandler`, mounted last, maps
  them to HTTP.
- **Log through `src/logger.ts`**, the one module allowed `console.*`.

## Commands

Install from the repo root. Scripts run here or from the root with `-w server`.

- `npm start` / `npm run dev` — `node ./src/index.ts`, `dev` adding `--watch`,
  which also restarts on `../shared/src` changes. Do not add `--watch-path`: it
  throws `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` on Linux.
- `npm run build` — `tsc -p tsconfig.build.json` to `dist/`, leaving out
  `*.spec.ts`, `*.testkit.ts` and `src/db/seed/`. `dist/` still imports `shared`
  as `.ts`, so running it needs the workspace link and a type-stripping Node
  (ADR-0006).
- `npm run seed -- --force` — **deletes every row in the ten content tables**,
  Covers and Avatars with them; without `--force` it only reports row counts.
- `npm test` — `node --env-file-if-exists=.env.local --test "src/**/*.spec.ts"`.
  Keep `--env-file-if-exists`: without it the MySQL suites skip silently.
  `posttest` drops the test schemas, and npm runs it only after a green run —
  never run it by hand. See `testing.md`.
- `npm run typecheck`, `npm run lint`, `npm run lint:fix`. Prettier is root-only.

`sequelize-cli` is not installed; reference it only once it is.

## Environment

`.env.local` (git-ignored) supplies these; `src/db/config.ts` validates them
with zod and refuses to start on a malformed value.

| Variable                  | Default                   | Notes                                                                                                    |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`             | Also picks the argon2 cost (`test` is deliberately weak) and gates the cookie's `secure` flag.           |
| `PORT`                    | `4000`                    |                                                                                                          |
| `DB_HOST` / `DB_PORT`     | `127.0.0.1` / `3306`      |                                                                                                          |
| `DB_NAME`                 | `books_demo_spa`          |                                                                                                          |
| `DB_USER` / `DB_PASSWORD` | _(none)_                  | No default, so the server never starts against an unintended database. An empty password is accepted.    |
| `APP_BASE_URL`            | `http://localhost:3000`   | The client origin: reset links and the CSRF trusted origin.                                              |
| `TRUST_PROXY`             | `0`                       | Proxy hops trusted for `X-Forwarded-For`. The sign-in limits key on `req.ip`: set it behind a proxy.     |
| `RESET_DELIVERY`          | `log`; none in production | `log` is the only sink. Production refuses to start without it, so link-logging never ships by accident. |

The test suite alone reads `TEST_DB_NAME` (default `books_demo_spa_test`) and
`REQUIRE_MYSQL` (see `testing.md`).

## Runtime

- ESM, and every relative import carries `.ts`: Node resolves imports exactly
  as written, and `rewriteRelativeImportExtensions` turns them into `.js` for
  `dist/`.
- `erasableSyntaxOnly` and `verbatimModuleSyntax`: no enum, namespace or
  parameter property, and type-only imports say `type`. An ambient `const enum`
  from a dependency is refused too, which is why `password.ts` names no argon2
  `algorithm` and relies on the argon2id default (`password.spec.ts` pins the
  PHC prefix).
- `target`/`lib` are `ES2024`; the client and `shared` stay on ES2020.
- `noUncheckedIndexedAccess`: application code handles a miss with an early
  return, a throw naming what was missing (`itemAt` in `seed/rng.ts`) or
  `?.`/`??`. Only `*.spec.ts` and `*.testkit.ts` may write `!`.
- Await a promise, or mark a deliberate fire-and-forget `void` with the reason
  beside it. The typed lint rules take no `eslint-disable`.

## Express 5

Most tutorials and generated snippets are still Express 4:

- **Async errors forward themselves.** A rejected promise from a handler
  reaches `next(err)`; catch only to add context, then rethrow.
- **Handler arity is significant.** An error handler takes exactly four
  parameters. Keep the unused `next` rather than deleting it for a lint rule.
- **`req.query` is a getter with no setter.** Put validated values on your own
  request property, and read it once into a local in a hot path.
- **`app.listen` hands its callback the bind error** (`EADDRINUSE`), which
  Express 4 never did; `src/listen.ts` reports it.

## Layout traps

The directories are what their names say; these are what they do not:

- `src/index.ts` runs `main()` on import, so nothing imports it; `app.spec.ts`
  repeats its startup steps, and a change to startup needs the same change there.
- `repositories/likePattern.ts` is SQL `LIKE` escaping and has nothing to do
  with `likeRepository.ts`.
- `middleware/optionalAuth.ts` is mounted nowhere: `requirePermission` resolves
  the session on public reads too. It is not load-bearing; reuse or delete it.
- `*.testkit.ts` means test support and is never emitted. `src/db/seed/` is not
  test support and carries no such suffix; `tsconfig.build.json` excludes the
  directory instead.
- `types/` re-exports the response types and shared unions from `shared`, so a
  change to what the API returns starts in `shared/src/`.
