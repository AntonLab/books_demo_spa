# Claude Code — books_demo_spa

Two-package repo: a Create React App (TypeScript) frontend and an Express +
Sequelize backend. Early scaffold — most feature directories exist but are empty.

## Layout

- `client/` — React 19 + TypeScript SPA (Create React App layout). See `client/CLAUDE.md`.
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
- `client` has no bundler, dev server, or build yet (the CRA `react-scripts` setup
  and `public/` were removed); `typecheck`/`lint`/`format` run, but there is no
  `dev`/`build`/`test`.
- `server` has `sequelize` and `mysql2` installed but not wired; `src/index.ts`
  only starts Express on port 4000. `npm run build` (`tsc`) emits to `dist/`.
- No test tooling is configured in either package.

## Quality Gates

Run these from within the relevant package (`client/` or `server/`) before commit:

- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format:check` — Prettier (shared `.prettierrc.json` at the repo root)

`npm run lint:fix` and `npm run format` apply fixes. No test runner is configured
yet; document one here and in the package CLAUDE.md when it is added.

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
