# Claude Code — books_demo_spa

Three npm workspaces under one root `package.json`: a webpack-bundled React
(TypeScript) frontend, an Express + Sequelize backend, and the API types both
of them read. Early scaffold — most feature directories exist but are empty.

## Layout

- `client/` — React 19 + TypeScript SPA bundled with webpack 5. See `client/CLAUDE.md`.
- `server/` — Express 5 + Sequelize/MySQL API. See `server/CLAUDE.md`.
- `shared/` — what the API returns and the string unions both packages use,
  as TypeScript source with no build step (ADR-0006). Response types are
  written in the server's shape (dates as `Date`); the client reads each
  through `Wire<T>`, which turns every `Date` into the string it arrives as.
  Each union is derived from an `as const` array (`BOOK_STATUSES`,
  `USER_ROLES`, …) that the server's zod schemas also build from. No zod
  schema lives here, so zod never reaches the client bundle.
  `client/src/types` and `server/src/types` stay the modules each package
  imports, re-exporting from it. Relative imports inside carry `.ts` and only
  erasable syntax is allowed, because Node loads it too. It defines
  `typecheck`, `lint` and `lint:fix` only; `wire.typetest.ts` pins `Wire<T>`
  with type-level assertions that `typecheck` checks.
- `tsconfig.base.json` — compiler options shared by every package; each
  `tsconfig.json` extends it with a relative path. It sets
  `noUncheckedIndexedAccess` for all three: an index read is `T | undefined`,
  application code handles the miss explicitly, and only test files assert
  it away with `!`. Keep `include`, `exclude` and `paths` out of it:
  TypeScript resolves those against the file that declares them, so they
  would point at the repo root instead of the package.
- `eslint.config.base.mjs` — the shared flat-config core, built with ESLint's
  `defineConfig` and exported as
  `createConfig({ ignores, tsconfigRootDir }, ...packageConfigs)`. Each
  package passes its own directory (`import.meta.dirname`) as
  `tsconfigRootDir`: the `**/*.{ts,tsx}` block turns on typed linting
  (`projectService`) against that package's tsconfig for three rules —
  `no-floating-promises` (node:test's `test`/`describe`/`it`/`suite`
  exempt), `no-misused-promises` and `await-thenable` — while JavaScript
  files stay untyped. ESLint does not search parent directories, so each
  package keeps its own `eslint.config.mjs` that calls this. It imports its
  own plugins: the root `package.json` declares them and npm hoists them into
  the root `node_modules`, so bare specifiers resolve.
- `package.json` — the workspace root. It declares `client`, `server` and
  `shared` as workspaces, owns the seven devDependencies every package needs (eslint,
  @eslint/js, typescript-eslint, eslint-config-prettier, globals, prettier,
  typescript) plus `concurrently` and `skills`, and holds `engines.node`.
  `skills` is the CLI behind `npm run skills` (see **Project skills**); it is
  pinned here rather than run through `npx` so a fresh clone rebuilds the
  same skill set.
- `scripts/link-skills.mjs` — the second half of `npm run skills`. Plain Node
  with no dependencies; Prettier checks it, but no package's ESLint config
  reaches it.

One `npm install` at the repo root installs every workspace into a single
hoisted `node_modules` with one lockfile. Package-specific dependencies stay
declared in the package that uses them — webpack and jest in `client`, `sharp`
in `server`, `shared` in both — so each `package.json` still says what that
package needs. `node_modules/shared` is a link to `shared/`, not a copy, and
that matters: Node strips types only from a file whose real path lies outside
`node_modules`.

## Stack

- Node.js >= 24, TypeScript. The floor is the LTS line `.nvmrc` pins and CI
  runs, and `@types/node` follows its major (`.github/dependabot.yml` holds
  it there), so the types never describe an API the runtime lacks. The
  server's own needs sit below it: running `.ts` files with no flag and
  loading `.env.local` through `--env-file-if-exists` both work unflagged in
  every 24.x. The floor holds for the built server too: `server/dist/` still
  imports `shared` as `.ts`, so a deployment needs the workspace link and a
  type-stripping Node (ADR-0006).
- Frontend: React 19
- Backend: Express 5, Sequelize 6 (MySQL via `mysql2`)

## Status / Known Gaps

The scaffold is incomplete — keep the docs honest as you fill it in:

- All three packages have TypeScript and ESLint (flat config) wired up, exposing
  `typecheck`, `lint` and `lint:fix`. Prettier is root-only — its config is
  repo-wide, so `format` and `format:check` live only in the root
  `package.json` and no package defines them. See each package's CLAUDE.md.
- The root `package.json` fans `typecheck`, `lint`, `lint:fix`, `test` and
  `build` out over every workspace — `test` and `build` with `--if-present`,
  since `shared` has neither to run — and `npm run dev` starts the client dev
  server and the API together under `concurrently`. It defines no per-package
  aliases: one workspace is targeted with npm's own `-w` flag
  (`npm run dev -w client`, `npm test -w server`), uniformly for every script.
- `client` is bundled with webpack 5 (swc-loader + fork-ts-checker), exposing
  `npm run dev` (dev server on port 3000, Fast Refresh, `/api` proxied to :4000)
  and `npm run build` (hashed output into `client/build/`). It also has a
  Jest test runner (`npm test`, jsdom + `@swc/jest`; see `client/CLAUDE.md`
  for why the script is not plain `jest`). See `client/CLAUDE.md`.
- `client` now has a working UI on top of that toolchain: a `MainPage`
  listing books, a header with nav, search, auth state and a notification
  bell, four auth modals
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
  comment on or like it. Every change to who is credited on a shared book or
  series, and every deletion of one, writes a **Notification** to the other
  Co-authors in the same transaction — a snapshot of the work's title and the
  actor's name, listed and marked read through `/api/notifications`. A chapter has a Publication time — `null` (Draft),
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
- A Book carries an optional **Cover** and an Account of any Role an
  optional **Avatar** (CONTEXT.md, ADR-0007), re-encoded to a fixed WebP
  shape by `server`'s `sharp`-based `src/images.ts` and stored in two new
  MySQL tables, `book_covers` and `user_avatars` — no rebuild needed, since
  `sync()` creates a missing table. Six routes (`PUT`/`DELETE`/`GET` on
  each) serve and manage them under `/api/books/:id/cover` and
  `/api/users/:id/avatar`; see `server/CLAUDE.md` for the guards, the raw
  body parser and the cache headers. `PublicBook` and
  `PublicUser`/`AuthorSummary` carry the versioned `coverUrl`/`avatarUrl`.
  `client` shows both through three new molecules — `BookCover` and
  `AccountAvatar` display them, `ImageUploadButton` is the shared upload
  picker behind both — and `ProfilePage` is no longer a stub.
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
  it deletes every row in the nine content tables first** — `book_covers` and
  `user_avatars` are not among them, but every Cover and Avatar goes too,
  through the `ON DELETE CASCADE` off the `books` and `users` rows it
  deletes — and without it the script only reports what it found. Counts
  come from a fixed PRNG seed, so the shape is reproducible; the dates are
  anchored to the run, so the newest chapter is always a few days old. See
  `server/CLAUDE.md` for the personas, the two safety guards, and why it
  writes through the models rather than the API.

## Quality Gates

Run these from the repo root before commit; each fans out over every workspace.
Target one with npm's `-w` flag (`npm test -w client`):

- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format:check` — Prettier, root-only (`.prettierrc.json` and
  `.prettierignore` at the repo root are the only copies)
- `npm test` — applies to **both** packages now. `server` uses `node:test`,
  including a MySQL-backed integration suite (see `server/CLAUDE.md` for the
  exact script); `client` uses Jest against jsdom (see `client/CLAUDE.md` for
  why its script is not plain `jest`). A **green** server run then drops the
  twelve test schemas it created, through npm's `posttest`; a failed one leaves
  them for inspection. See `server/CLAUDE.md`.

`npm run lint:fix` and `npm run format` apply fixes.

### Pre-commit hook

`.githooks/pre-commit` runs ESLint (`--fix`) and Prettier (`--write`) over the
staged files only, re-stages whatever they rewrote, and blocks the commit if an
ESLint **error** survives the autofix. Warnings (`no-console`) print but pass.
ESLint runs once per package, from inside it, because flat config does not
cascade — which is also what points typed linting at that package's tsconfig.
A staged path is routed by its `client/`, `server/` or `shared/` prefix.
Prettier runs once from the repo root over every staged file, including the
root-level configs and markdown no package's ESLint config reaches. Both
binaries come from the single hoisted `node_modules/.bin`; if it is missing
the hook warns and lets the commit through rather than failing it.

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

### GitHub Actions

`dev` is the integration branch every feature PR targets, `main` the release
branch `dev` is merged into, and `dev` is the repository's default branch. Both
run the same automation from `.github/`:

- `workflows/ci.yml` — on every PR into and push to `dev` or `main`, plus a
  manual `workflow_dispatch`, five parallel jobs on `ubuntu-latest` with the
  Node version from `.nvmrc`: `lint` (`npm run lint` and
  `npm run format:check`), `typecheck`, `test-client`, `test-server` and
  `build`. `test-server` runs against a `mysql:8.4` service container and sets
  `REQUIRE_MYSQL=1`, which makes a missing or unreachable database fail the
  MySQL-backed suites instead of skipping them — without it a broken container
  would leave the job green having run none of them (see `server/CLAUDE.md`).
- `workflows/codeql.yml` — CodeQL with the `security-extended` queries over
  `javascript-typescript` and `actions`, on the same triggers plus a weekly
  schedule, as the jobs `Analyze (javascript-typescript)` and
  `Analyze (actions)`. Test code (`*.spec.ts`, `*.test.ts(x)`, `*.testkit.ts`,
  `client/src/test/`) is left out of the analysis: it is never deployed, and
  its one-middleware Express apps would otherwise be held to the rules of the
  real one. Its results also report as a check named `CodeQL`, which the
  ruleset does not require.
- `dependabot.yml` — weekly npm and GitHub Actions updates, minor and patch
  grouped into one PR per ecosystem, majors one PR each, no labels (the repo's
  labels are the triage roles). It ignores the majors the toolchain cannot take yet —
  TypeScript 7 (a native compiler without the JavaScript API typescript-eslint
  and fork-ts-checker-webpack-plugin load) and ESLint and `@eslint/js` 10 (past
  what eslint-plugin-react and eslint-plugin-jsx-a11y support). Drop an entry
  once those packages catch up, then take the major by hand.

Every action is pinned to a full commit SHA with its version in a trailing
comment; Dependabot moves both. Keep that form when adding a step — a tag can
be re-pointed, a SHA cannot.

One repository ruleset, `Protect dev and main` (Settings → Rules), covers both
branches: it requires a PR to merge (no approvals, since the repo has one
maintainer), blocks force-pushes and deletion, and requires all seven checks
above to pass; the admin role may bypass it. The branch need not be up to date
with its base before merging. The required checks are matched **by name**:
renaming a job, or the CodeQL matrix, leaves the ruleset waiting on a check
that never reports, so update the ruleset in the same change.

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
- Every write is guarded against CSRF on the server — an Origin /
  `Sec-Fetch-Site` check and a session-bound `X-XSRF-Token` — and the client's
  `request()` sends the token. Route new writes through `request()`. See
  **CSRF** in `server/CLAUDE.md`.

## Workflow

1. Work within the relevant package (`client/` or `server/`) and read its
   CLAUDE.md. A change to what the API returns starts in `shared/`.
2. Verify any command in these docs actually exists before relying on it.
3. Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
   `ci:`).
4. Branch from `dev` and open the PR against `dev`; `main` only receives `dev`.

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

### Project skills

`skills-lock.json` pins the repo's own skills — eight, kept for fit with this
stack — and `npm run skills` restores them in two steps. The `skills` CLI
writes them into `.agents/skills/`; `scripts/link-skills.mjs` then links each
into `.claude/skills/`, because the restore installs only for the CLI's
"universal" agents and Claude Code, which reads `.claude/skills/`, is not one
of them. Both directories are git-ignored and per-clone, so run it after a
fresh clone and after any change to the lock. A new skill goes in with
`npx skills add <source>` (project-level, no `-g`), which writes the lock.

A skill a Claude Code plugin already ships stays out of the lock. That covers
every mattpocock/skills skill — `tdd`, `grilling`, `domain-modeling`,
`triage` and the rest come from the `mattpocock-skills` plugin, which the
sections above and the plan pipeline below rely on.

### Plan pipeline agents

`.claude/agents/` holds five subagents that carry the role rules of the
superpowers plan pipeline, so a dispatch sends only the values that change per
call. They need two Claude Code plugins — plugins, not npm dependencies:
`superpowers`, whose `writing-plans` and `subagent-driven-development` skills
drive them, and `mattpocock-skills`, whose `tdd` the implementer preloads.
Their bodies are copied from superpowers 6.3.0 templates, each
named in a comment under the frontmatter, and must be re-synced when the
plugin's templates change.

- **Before `plan-writer`, write the spec to a file.** A subagent does not see
  the conversation. Save the agreed design to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (git-ignored, like the
  plans) and dispatch `plan-writer` with that path; it refuses to run without
  one.
- **In `superpowers:subagent-driven-development`, dispatch the named agents
  instead of `general-purpose`:** implementer → `sdd-implementer` (preloads
  `mattpocock-skills:tdd`; a name that resolves to nothing preloads nothing,
  with no error), task reviewer → `sdd-task-reviewer`, scoped re-review →
  `sdd-re-reviewer`, final whole-branch review → `sdd-final-reviewer`. Do not
  paste the template text into the prompt; send only its placeholder values
  (brief, report and diff file paths, SHAs, global constraints, findings,
  context). Pass `model` explicitly on every dispatch — it overrides the
  agent's default.
- The three reviewers get `Read`, `Grep`, `Glob` and `Bash` only; staying
  read-only is a prompt rule, since `Bash` could still write. The implementer
  and `plan-writer` get every tool except `Agent`.
- Interactive skills stay in the main session, because a subagent cannot ask
  the user anything: `grilling`, `domain-modeling` and
  `finishing-a-development-branch`. The controller also creates the worktree
  itself before Task 1; none of these agents sets `isolation: worktree`, which
  would give every dispatch its own checkout and hide each implementer's
  commits from the reviewer and the next task.
