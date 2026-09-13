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
  typescript) plus `concurrently` and `skills`, and holds `engines.node`.
  `skills` is the CLI that materializes `skills-lock.json` into `.agents/`;
  it is pinned here rather than run through `npx` so a fresh clone rebuilds
  the same skill set. Run it with `npm run skills`.

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
  against `/api/auth` (login, register, forgot/reset password), a `/search`
  page, a `/books/:id` book page (title, author, series, annotation, chapters,
  comments) and a `/books/:bookId/chapters/:chapterId` reader, plus the
  first authoring pages — `/my-books`, `/books/new`, `/books/:id/edit`
  (fields, status, chapters in a drag-and-drop Reading order, Co-authors,
  delete), `/series/new` and `/series/:id/edit` (fields, books in a
  drag-and-drop Series order, Co-authors, delete) and a chapter editor at
  `/books/:bookId/chapters/new` and `.../:chapterId/edit` (publish now,
  schedule, or save a draft) — built on antd
  6, react-router, TanStack Query and Redux
  Toolkit. The split between the last two is deliberate: **TanStack Query
  owns everything fetched** (the session, the book list, each search term,
  each book's detail, its chapters, its comment thread, and the auth, comment
  and like mutations, all in `src/queries/`), while **Redux holds
  UI state only** — `authSlice` is down to `activeModal` and `resetToken`.
  See `client/CLAUDE.md`.
- `server` is wired to MySQL: Sequelize (via `mysql2`) connects to
  `books_demo_spa`, and `User`, `Series`, `Book`, `Chapter` and `Like` models
  — associated by `Series.hasMany(Book)`, `Book.hasMany(Chapter)` and
  `hasMany(Like)` from each of `User`, `Book` and `Comment`, with the
  **Co-authors** of a book or a series kept in `book_authors` /
  `series_authors` rather than an owner column (ADR-0005) — have a full CRUD
  API, though every
  write on them now goes through the role-permission matrix (see the auth
  bullet below). A like points at exactly one of a book or a comment; that
  XOR is enforced in zod and in a model validator, never by the database (see
  `server/CLAUDE.md`). `Comment` (owned by a user and a book, with
  self-referential replies) now has a full CRUD API too, at `/api/comments`.
  Books and series carry a `title` column alongside their description, and
  every book and series response embeds its Co-authors as `authors`, in credit
  order; `GET /api/books/:id` returns a `BookDetail` adding the series name
  and the like state. Co-authors are added and removed (or leave) through
  `/api/books/:id/co-authors` and `/api/series/:id/co-authors`, and a
  series' Co-author can take a book out of it through
  `DELETE /api/series/:id/books/:bookId`. `npm run build`
  (`tsc -p tsconfig.build.json`) emits to `dist/`.
- `server` has session-based auth at `/api/auth` — register, login, logout,
  me, and a two-step password reset — backed by `Session` and
  `PasswordResetToken` models and an opaque token in an httpOnly `sid`
  cookie. `requireAuth` now guards only `GET /api/auth/me`; every write on
  the six resources above, plus both reads on `/api/users`, instead runs
  through `requirePermission` and a role-permission matrix — five roles
  (`guest`, `user`, `author`, `admin`, `superadmin`), each granted `none`,
  `own` or `any` on every resource × action — so a request with no session
  gets 401 and a signed-in role with no grant for that action gets 403.
  `optionalAuth` is no longer mounted anywhere: `requirePermission` resolves
  the session itself on every route, public reads included, so a like button
  still renders its state for an anonymous visitor without it. Ownership is
  enforced on **books, series, chapters, comments and likes** — five
  resources, not four — with `admin` and `superadmin` bypassing it wherever
  the matrix grants them `any` rather than `own`. On a book or a series `own`
  means any of its Co-authors, filing a book into a series takes a Co-author
  of both, and chapters resolve ownership through their book, since
  `chapters` carries no `userId`. A Moderator never changes who is credited on
  a work, a work always keeps at least one Co-author, and deleting an account
  deletes only the works it was the last Co-author of. A book has a status —
  `draft` (every new book), `in_progress` or `complete` — and a **Draft book**
  is readable only by its Co-authors and Moderators: every read of it or its
  chapters, comments and likes is filtered through `repositories/visibility.ts`,
  no list shows it except its own Co-author's `?userId=`, and nobody may
  comment on or like it. A chapter has a Publication time — `null` (Draft),
  future (Scheduled) or past (Published) — and a reader sees only chapters whose
  time has passed; a save carries the `updatedAt` it was based on and gets a
  409 if a co-author saved first. A book's chapters follow an explicit
  Reading order (`chapters.position`), rewritten whole through
  `PUT /api/books/:id/chapter-order`, which answers 409 if a chapter was added
  or deleted since the list was loaded. A series' books follow a Series
  order (`books.seriesPosition`) the same way, through
  `PUT /api/series/:id/book-order`, and its Co-authors see every book filed
  in it — drafts by title and status only — through
  `GET /api/series/:id/books`. Deleting a
  comment leaves a **tombstone** — `deleted` by its own owner (or when that
  owner's account is deleted) or `removed` by a moderator — rather than
  removing the row, so its replies stay and its text and author are withheld
  in every response; a moderator can undo a `removed` tombstone through
  `POST /api/comments/:id/restore`. Blocking an account, and any successful
  password change, both end every session that account holds, in the same
  transaction as the update. Identity for a comment or a like still comes
  from the session, never the request body; without that the ownership rules
  would be trivially defeated. Role changes go through their own door,
  `PATCH /api/users/:id/role`: a row's owner may switch between `user` and
  `author`, and only `superadmin` may set any other role on any account. An
  `admin` may manage only `user` and `author` accounts besides its own —
  another admin or any superadmin is a 403 — while a `superadmin` reaches
  every account but may not delete its own or change its own role. See
  `server/CLAUDE.md` for the full matrix, the cookie flags, the
  SHA-256-not-argon2 choice for tokens, and the login timing defence.
- `server` has a test suite using `node:test` (`npm test`). `client` has a
  Jest test suite (`npm test`); see `client/CLAUDE.md` for the exact script.
- A dev database created before the Co-authors change must be dropped and
  rebuilt: `books.userId` and `series.userId` are gone, `books.status`,
  `chapters.publishedAt`, `chapters.position` and `books.seriesPosition` are
  new, and `sync()` never
  alters an existing table.
  See `server/CLAUDE.md`.
- `server/src/db/seed.ts` fills the database with the demo data — ten accounts
  (one superadmin, one admin, three authors, five readers, all sharing the
  password `Password123!`), each author's 1-2 series of 4-5 books plus 1-3
  standalone ones, 20-24 chapters per book, 3-15 threaded comments per book
  with a scattering of tombstones, and likes on both books and comments. Run
  it with `npm run seed -w server -- --force`; **the flag is required because
  it deletes every row in the eight content tables first**, and without it the
  script only reports what it found. Counts come from a fixed PRNG seed, so
  the shape is reproducible; the dates are anchored to the run, so the newest
  chapter is always a few days old. See `server/CLAUDE.md` for the personas,
  the two safety guards, and why it writes through the models rather than the
  API.

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
  why its script is not plain `jest`). A **green** server run then drops the
  nine test schemas it created, through npm's `posttest`; a failed one leaves
  them for inspection. See `server/CLAUDE.md`.

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
- Do not run the `setup-pre-commit` skill or install Husky/lint-staged. This
  repo's hook is `.githooks/pre-commit`, enabled via `core.hooksPath` by the
  root `prepare` script. The skill would install a competing hook.
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
