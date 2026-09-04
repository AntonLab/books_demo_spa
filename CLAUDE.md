# Claude Code — books_demo_spa

Two npm workspaces under one root `package.json`: a webpack-bundled React
(TypeScript) frontend and an Express + Sequelize backend. Early scaffold — most
feature directories exist but are empty.

## Layout

- `client/` — React 19 + TypeScript SPA bundled with webpack 5. See `client/CLAUDE.md`.
- `server/` — Express 5 + Sequelize/MySQL API. See `server/CLAUDE.md`.
- `tsconfig.base.json` — compiler options shared by both packages; each
  `tsconfig.json` extends it with a relative path. Keep `include`, `exclude` and
  `paths` out of it: TypeScript resolves those against the file that declares
  them, so they would point at the repo root instead of the package.
- `eslint.config.base.mjs` — the shared flat-config core, exported as
  `createConfig(ignores, ...packageConfigs)`. ESLint does not search parent
  directories, so each package keeps its own `eslint.config.mjs` that calls
  this. It imports its own plugins: the root `package.json` declares them and
  npm hoists them into the root `node_modules`, so bare specifiers resolve.
- `package.json` — the workspace root. It declares `client` and `server` as
  workspaces, owns the seven devDependencies both packages need (eslint,
  @eslint/js, typescript-eslint, eslint-config-prettier, globals, prettier,
  typescript) plus `concurrently`, and holds `engines.node`.

One `npm install` at the repo root installs both workspaces into a single
hoisted `node_modules` with one lockfile. Package-specific dependencies stay
declared in the package that uses them — webpack and jest in `client`, nodemon
in `server` — so each `package.json` still says what that package needs.

## Stack

- Node.js >= 22.5, TypeScript
- Frontend: React 19
- Backend: Express 5, Sequelize 6 (MySQL via `mysql2`)

## Status / Known Gaps

The scaffold is incomplete — keep the docs honest as you fill it in:

- Both packages now have TypeScript and ESLint (flat config) wired up, exposing
  `typecheck`, `lint` and `lint:fix`. Prettier is root-only — its config is
  repo-wide, so `format` and `format:check` live only in the root
  `package.json` and no package defines them. See each package's CLAUDE.md.
- The root `package.json` fans `typecheck`, `lint`, `lint:fix`, `test` and
  `build` out over both workspaces, and `npm run dev` starts the client dev
  server and the API together under `concurrently`. It defines no per-package
  aliases: one workspace is targeted with npm's own `-w` flag
  (`npm run dev -w client`, `npm test -w server`), uniformly for every script.
- `client` is bundled with webpack 5 (swc-loader + fork-ts-checker), exposing
  `npm run dev` (dev server on port 3000, Fast Refresh, `/api` proxied to :4000)
  and `npm run build` (hashed output into `client/build/`). It also has a
  Jest test runner (`npm test`, jsdom + `@swc/jest`; see `client/CLAUDE.md`
  for why the script is not plain `jest`). See `client/CLAUDE.md`.
- `client` now has a working UI on top of that toolchain: a `MainPage`
  listing books, a header with nav, search and auth state, four auth modals
  against `/api/auth` (login, register, forgot/reset password), and a
  `/search` page — built on antd 6, react-router, TanStack Query and Redux
  Toolkit. The split between the last two is deliberate: **TanStack Query
  owns everything fetched** (the session, the book list, each search term,
  and the five auth mutations, all in `src/queries/`), while **Redux holds
  UI state only** — `authSlice` is down to `activeModal` and `resetToken`.
  See `client/CLAUDE.md`.
- `server` is wired to MySQL: Sequelize (via `mysql2`) connects to
  `books_demo_spa`, and `User`, `Series`, `Book`, `Chapter` and `Like` models
  — associated by `User.hasMany(Series)`, `User.hasMany(Book)`,
  `Series.hasMany(Book)`, `Book.hasMany(Chapter)` and `hasMany(Like)` from
  each of `User`, `Book` and `Comment` — have a full CRUD API, though every
  write on them now requires a session (see the auth bullet below). A like
  points at exactly one of a book or a comment; that XOR is enforced in zod
  and in a model validator, never by the database (see `server/CLAUDE.md`).
  `Comment` (owned by a user and a book, with self-referential replies) is so
  far a model only, with no CRUD API. `npm run build`
  (`tsc -p tsconfig.build.json`) emits to `dist/`.
- `server` has session-based auth at `/api/auth` — register, login, logout,
  me, and a two-step password reset — backed by `Session` and
  `PasswordResetToken` models and an opaque token in an httpOnly `sid` cookie.
  A `requireAuth` middleware guards every `POST`/`PATCH`/`DELETE` on the five
  resources above, plus both reads on `/api/users`; all other `GET`s stay
  public. Ownership is deliberately not checked — a signed-in user may write
  another user's rows, which is out of scope by design. See `server/CLAUDE.md`
  for the cookie flags, the SHA-256-not-argon2 choice for tokens, and the
  login timing defence.
- `server` has a test suite using `node:test` (`npm test`). `client` has a
  Jest test suite (`npm test`); see `client/CLAUDE.md` for the exact script.

## Quality Gates

Run these from the repo root before commit; each fans out over both workspaces.
Target one with npm's `-w` flag (`npm test -w client`):

- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format:check` — Prettier, root-only (`.prettierrc.json` and
  `.prettierignore` at the repo root are the only copies)
- `npm test` — applies to **both** packages now. `server` uses `node:test`,
  including a MySQL-backed integration suite (see `server/CLAUDE.md` for the
  exact script); `client` uses Jest against jsdom (see `client/CLAUDE.md` for
  why its script is not plain `jest`).

`npm run lint:fix` and `npm run format` apply fixes.

### Pre-commit hook

`.githooks/pre-commit` runs ESLint (`--fix`) and Prettier (`--write`) over the
staged files only, re-stages whatever they rewrote, and blocks the commit if an
ESLint **error** survives the autofix. Warnings (`no-console`) print but pass.
ESLint runs once per package, from inside it, because flat config does not
cascade — a staged path is routed by its `client/` or `server/` prefix. Prettier
runs once from the repo root over every staged file, including the root-level
configs and markdown no package's ESLint config reaches. Both binaries come from
the single hoisted `node_modules/.bin`; if it is missing the hook warns and lets
the commit through rather than failing it.

`core.hooksPath` lives in `.git/config` and is therefore per-clone. The root
`package.json`'s `prepare` script sets it, so `npm install` enables the hook;
by hand it is
`git config core.hooksPath .githooks`. Bypass one commit with
`git commit --no-verify`.

The hook refuses to run on a partially staged file — one that is staged _and_
dirty in the working tree. It rewrites the working-tree copy, so re-staging
would pull the unstaged hunks into the commit as well.

It is not a substitute for the gates above: it never runs `typecheck` or the
test suites.

## Anti-Patterns

Do not:

- Do not write absolute local paths in governance files (e.g. `D:/project/src/`) —
  use relative paths only (e.g. `src/`). These files are checked in and must stay
  portable across machines.
- Do not document commands, scripts, or dependencies that do not exist in
  `package.json` — verify before writing them down.
- Do not leave `console.log` in production code — use a proper logger.
- Do not use synchronous filesystem APIs in request handlers.
- Do not use class components — use functional components with hooks. One
  exception exists: the client's `ErrorBoundary`, because React exposes no
  hook for `getDerivedStateFromError`. Do not add a second without the same
  justification, and do not add a dependency to dodge it. See
  `client/CLAUDE.md`.
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

## Agent skills

### Issue tracker

Issues live as GitHub issues on `AntonLab/books_demo_spa`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
