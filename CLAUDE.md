# Claude Code — books_demo_spa

Three npm workspaces under one root `package.json`: a webpack-bundled React
(TypeScript) frontend, an Express + Sequelize backend, and the API types both
of them read.

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
  `@eslint/js`, typescript-eslint, eslint-config-prettier, globals, prettier,
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

## Status

All three packages are past scaffold: the UI, the API and the shared types are
implemented end to end. What each package holds is its own CLAUDE.md's job —
this section carries only what neither the code nor the git history tells you.

- **A dev database older than the current schema must be dropped and rebuilt.**
  `sync()` creates a missing table but never alters an existing one, so every
  column added since yours was created is simply absent: `books.status`,
  `chapters.publishedAt`, `chapters.position`, `books.seriesPosition`,
  `books.genreId` and `series.genreId` are new, and `books.userId` and
  `series.userId` are gone. Genres add a second reason — `permissions.module`
  is a MySQL `ENUM` built from `MODULES`, so until the table is recreated the
  startup permission sync cannot insert the `genres` rows. CI and the test
  schemas are built fresh and are unaffected.
- `npm run seed -w server -- --force` loads the demo data, and **the flag is
  mandatory**: without it the script only reports what it found, and with it it
  first deletes every row in the ten content tables — every Cover and Avatar
  with them, through the `ON DELETE CASCADE` off `books` and `users`. See
  `server/CLAUDE.md` for the personas and the two safety guards.
- Prettier is root-only. Its config is repo-wide, so `format` and
  `format:check` live in the root `package.json` and no package defines them.
- There is no series page: a series' books are reached through `/search`.

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
  thirteen test schemas it created, through npm's `posttest`; a failed one leaves
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
- Do not turn a CLAUDE.md into a changelog. Write down what does not follow
  from the code — traps, rationale, conventions that differ from the tool's
  default — and leave what shipped when to git history. Keep each CLAUDE.md
  under ~400 lines; past that, cut something before you add.
- Do not write a comment that says _what_ the code does — rename the code until
  it says that itself. A comment earns its place by carrying what the code
  cannot: why it is this way, what breaks otherwise, which upstream bug it
  works around. Those are worth any length; the rest are worth none.
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
2. Name domain things the way `CONTEXT.md` names them. Read it before you
   introduce or rename a concept, and check `docs/adr/` before contradicting a
   decision it records.
3. Verify any command in these docs actually exists before relying on it.
4. Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
   `ci:`).
5. Branch from `dev` and open the PR against `dev`; `main` only receives `dev`.

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
