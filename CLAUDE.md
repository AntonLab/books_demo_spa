# Claude Code — books_demo_spa

Two-package repo: a webpack-bundled React (TypeScript) frontend and an Express +
Sequelize backend. Early scaffold — most feature directories exist but are empty.

## Layout

- `client/` — React 19 + TypeScript SPA bundled with webpack 5. See `client/CLAUDE.md`.
- `server/` — Express 5 + Sequelize/MySQL API. See `server/CLAUDE.md`.

There is no root `package.json`; install and run each package from its own directory.

## Stack

- Node.js >= 22.5, TypeScript
- Frontend: React 19
- Backend: Express 5, Sequelize 6 (MySQL via `mysql2`)

## Status / Known Gaps

The scaffold is incomplete — keep the docs honest as you fill it in:

- Both packages now have TypeScript, ESLint (flat config), and Prettier wired up,
  exposing `typecheck`, `lint`, `lint:fix`, `format`, and `format:check` scripts.
  See each package's CLAUDE.md.
- `client` is bundled with webpack 5 (swc-loader + fork-ts-checker), exposing
  `npm run dev` (dev server on port 3000, Fast Refresh, `/api` proxied to :4000)
  and `npm run build` (hashed output into `client/build/`). There is still no
  `test` script. See `client/CLAUDE.md`.
- `server` is wired to MySQL: Sequelize (via `mysql2`) connects to
  `books_demo_spa`, and `User` and `Series` models — associated by
  `User.hasMany(Series)` — each have a full CRUD API.
  `npm run build` (`tsc -p tsconfig.build.json`) emits to `dist/`.
- `server` has a test suite using `node:test` (`npm test`). `client` still has
  no test script.

## Quality Gates

Run these from within the relevant package (`client/` or `server/`) before commit:

- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format:check` — Prettier (shared `.prettierrc.json` at the repo root)
- `npm test` (server only) — `node:test`, including a MySQL-backed integration
  suite; see `server/CLAUDE.md` for the exact script

`npm run lint:fix` and `npm run format` apply fixes. `client` has no test runner
configured yet; document one here and in `client/CLAUDE.md` when it is added.

## Anti-Patterns

Do not:
- Do not write absolute local paths in governance files (e.g. `D:/project/src/`) —
  use relative paths only (e.g. `src/`). These files are checked in and must stay
  portable across machines.
- Do not document commands, scripts, or dependencies that do not exist in
  `package.json` — verify before writing them down.
- Do not leave `console.log` in production code — use a proper logger.
- Do not use synchronous filesystem APIs in request handlers.
- Do not use class components — use functional components with hooks.
- Do not mutate state directly — use setter functions or immutable updates.
- Do not use the `any` type — use `unknown` or a proper type instead.
- Do not use `@ts-ignore` — fix the type error or use `@ts-expect-error` with a reason.
- Prefer `as const` over `enum` for string unions.

## Security

- No hardcoded secrets — grep for `sk_live`, `AKIA`, `password=` before commit.
- Keep DB credentials in environment variables (`.env.local` is git-ignored).

## Workflow

1. Work within the relevant package (`client/` or `server/`) and read its CLAUDE.md.
2. Verify any command in these docs actually exists before relying on it.
3. Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
