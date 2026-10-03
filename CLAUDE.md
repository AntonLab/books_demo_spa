# Claude Code — books_demo_spa

Three npm workspaces under one root `package.json`: a webpack-bundled React
(TypeScript) frontend, an Express + Sequelize backend, and the API types both
of them read.

## Layout

- `client/` — React 19 SPA. See `client/CLAUDE.md`.
- `server/` — Express 5 + Sequelize/MySQL API. See `server/CLAUDE.md`.
- `shared/` — what the API returns, the request bodies the client sends, the
  field limits both sides check, and the string unions both packages use,
  as TypeScript source with no build step (ADR-0006). Response types are in the
  server's shape (dates as `Date`); the client reads each through `Wire<T>`,
  which turns every `Date` into a string. Each union derives from an
  `as const` array (`BOOK_STATUSES`, `USER_ROLES`, …) that the server's zod
  schemas or Sequelize `ENUM`s also build from. No zod schema lives here, so zod never reaches the
  client bundle. Node loads it too, so relative imports carry `.ts` and only
  erasable syntax is allowed.
- `.claude/rules/` — topic rules for Claude Code, split by `server/`,
  `client/` and `repo/`. Each loads only when Claude Reads a file its `paths:`
  frontmatter names (a Write or Edit does not trigger it; subagents get them
  too); each package's CLAUDE.md indexes its own.
- `tsconfig.base.json`, `eslint.config.base.mjs` — the shared compiler options
  and flat-config core every package extends (see `.claude/rules/repo/tooling.md`).

One `npm install` at the root installs every workspace into one hoisted
`node_modules`. Dependencies stay declared in the package that uses them.
`node_modules/shared` is a link, not a copy, and must stay one: Node strips
types only from a file whose real path lies outside `node_modules`.

## Stack

- Node.js >= 24 (`.nvmrc`, CI and `engines.node` agree; `@types/node` follows
  its major). The built server still imports `shared` as `.ts`, so a deployment
  needs the workspace link and a type-stripping Node (ADR-0006).
- Frontend: React 19. Backend: Express 5, Sequelize 6 (MySQL via `mysql2`).

## Status

- **A dev database older than the current schema must be dropped and rebuilt.**
  `sync()` creates a missing table but never alters an existing one, and
  `permissions.module` is an `ENUM` built from `MODULES`. CI and the test
  schemas are built fresh. `/db-reset` drops it and reseeds.
- `npm run seed -w server -- --force` loads the demo data. **The flag is
  mandatory and destructive** — see `server/CLAUDE.md`.

## Quality Gates

Run from the repo root before commit; each fans out over every workspace
(`-w client` targets one):

- `npm run typecheck`
- `npm run lint` (`npm run lint:fix` applies fixes)
- `npm run format:check` (`npm run format`) — Prettier is root-only; no package
  defines a format script.
- `npm test` — both packages. A green server run drops its test schemas through
  `posttest`; a red one leaves them for inspection.

The pre-commit hook (`.githooks/pre-commit`, enabled by `prepare`) runs ESLint
and Prettier over staged files only. It refuses a partially staged file, and it
never runs `typecheck` or tests. `.githooks/commit-msg` rejects a subject that
is not a conventional commit. `git commit --no-verify` bypasses both.

CI (`.github/workflows/`) gates every PR into `dev` or `main`; see
`.claude/rules/repo/ci.md` before renaming or adding a job.

## Anti-Patterns

- Absolute local paths in checked-in governance files. Use relative paths.
- Documenting a command, script or dependency that `package.json` lacks.
- **Growing a CLAUDE.md.** Keep each under ~200 lines and each rule under ~150.
  A new trap goes into the `.claude/rules/` file for its area, or a new one
  with `paths:` naming the files it concerns, and gets a row in that package's
  index. Write down what does not follow from the code — traps, rationale,
  conventions that differ from the default — and leave inventories to the
  directory tree and history to git.
- A comment that says _what_ the code does; rename the code instead. A comment
  earns its place with why, what breaks otherwise, or which upstream bug it
  works around.
- `console.log` in production code; synchronous filesystem APIs in request
  handlers.
- Class components. The one exception is the client's `ErrorBoundary` (React has
  no hook for `getDerivedStateFromError`); do not add a dependency to dodge it.
- The `setup-pre-commit` skill, Husky or lint-staged: they install a competing
  hook.
- Direct state mutation; `any` (use `unknown` or a real type); `@ts-ignore`
  (use `@ts-expect-error` with a reason); `enum` (use `as const`).

## Security

- No hardcoded secrets — grep for `sk_live`, `AKIA`, `password=` before commit.
  DB credentials live in `.env.local` (git-ignored).
- Every write is CSRF-guarded on the server (Origin / `Sec-Fetch-Site` plus a
  session-bound `X-XSRF-Token`), and the client's `request()` sends the token.
  Route new writes through `request()`.

## Workflow

1. Work within one package and read its CLAUDE.md. A change to what the API
   returns starts in `shared/`.
2. Name domain things the way `CONTEXT.md` does; check `docs/adr/` before
   contradicting a recorded decision.
3. Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`,
   `test:`, `ci:`).
4. Branch from `dev` and open the PR against `dev`; `main` only receives `dev`.
   Run `npm run branch:check` before starting work and before opening a PR:
   it fails when the branch is behind `origin/dev` and prints the fix. A
   SessionStart hook runs it in warn mode and stays silent while fresh.

## Agent skills

- **Issues**: GitHub issues on `AntonLab/books_demo_spa` through `gh`. See
  `docs/agents/issue-tracker.md`.
- **Triage labels**: five canonical roles, label equal to name. See
  `docs/agents/triage-labels.md`.
- **Domain docs**: one `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
- **Project skills**: `npm run skills` restores them after a fresh clone or a
  lock change. See `.claude/rules/repo/skills.md`.
- **Plugins**: `.claude/settings.json` enables superpowers, mattpocock-skills,
  code-review, ponytail and caveman (mandatory). Accept the install prompt on a
  fresh clone. See `.claude/rules/repo/claude-config.md`.

### Context-saving agents

- **`repo-auditor`** (Sonnet, read-only) takes any "check / audit / find all"
  request, `/ponytail-audit` included, and returns numbered findings. Grilling
  and the question of which findings to fix stay in the main session. The
  picked findings go into a brief file for `sdd-implementer`.
- **`gate-runner`** (Haiku) runs the quality gates or reads a CI run and
  returns only the failures. Dispatch it instead of running the gates inline.
- **`ui-checker`** (Sonnet, no edits) checks pages and flows in the browser
  through the Playwright MCP and returns pass/fail per item. Dispatch it after
  a UI change and for a PR test plan's manual items; the main session starts
  no dev server, takes no snapshot and never Reads a screenshot.
- **Search goes to `Explore` or `caveman:cavecrew-investigator`**, never
  `general-purpose`: the latter ran on Sonnet and loaded the full context.
  While a plan pipeline runs, `code-mapper` does the mapping and
  `sdd-implementer` makes the changes. Neither a search agent nor
  `cavecrew-builder` stands in for them.
- `.claude/agents/` is git-ignored: each clone keeps its own copy, and a fresh
  clone has none, so every agent named here and in `pipeline.md` exists only
  where someone put the files by hand. A dispatch to a missing one fails.
- Every agent in `.claude/agents/` preloads `caveman`: its final message is
  caveman, while the files it writes stay normal prose. Needs the `caveman`
  plugin; a missing skill preloads nothing, silently.
- To find out why a pipeline session went wrong, use
  `superpowers:diagnosing-superpowers` rather than reading transcripts by hand.

### Shell on Windows

Every session, the main one included, runs Git Bash on Windows, so commands are
POSIX: `cd "D:/path" && …` with forward slashes (a backslash path loses its
separators; `cd /d` is cmd.exe), `head`/`tail` in Bash only. Create and change
files only with `Write`/`Edit`: a heredoc breaks on the first unmatched quote,
and `sed -i`, `cp`, `>` or a `node -e` rewrite skip the Prettier hook. List a directory with
`Glob`, since `Read` on one fails with EISDIR; when `Grep` fails with
`EPERM ... uv_spawn 'rg'`, fall back to `git grep`.

### Plan pipeline agents

Save the spec before dispatching `plan-writer`; it refuses to run without one.
Every plan goes through plan-writer and runs full subagent-driven development
with a task reviewer per task. Run one spec per main session: `/clear` after
its PR. Pass `model` on every dispatch — opus only when the user asks, since
it burned the weekly limit mid-plan. Full detail (the six agents, controller
scripts, dispatch order, fix rounds) lives in
`.claude/rules/repo/pipeline.md`; **Read it before running the pipeline** — it
will not load itself the way a topic rule does until Claude Reads a file under
`.claude/agents/`.
