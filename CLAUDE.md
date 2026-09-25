# Claude Code — books_demo_spa

Three npm workspaces under one root `package.json`: a webpack-bundled React
(TypeScript) frontend, an Express + Sequelize backend, and the API types both
of them read.

## Layout

- `client/` — React 19 SPA. See `client/CLAUDE.md`.
- `server/` — Express 5 + Sequelize/MySQL API. See `server/CLAUDE.md`.
- `shared/` — what the API returns and the string unions both packages use,
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
  mandatory**, and with it the script first deletes every row in the ten
  content tables, Covers and Avatars with them.

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

## Agent skills

- **Issues**: GitHub issues on `AntonLab/books_demo_spa` through `gh`. See
  `docs/agents/issue-tracker.md`.
- **Triage labels**: five canonical roles, label equal to name. See
  `docs/agents/triage-labels.md`.
- **Domain docs**: one `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
- **Project skills**: `npm run skills` restores them after a fresh clone or a
  lock change. See `.claude/rules/repo/skills.md`.

### Context-saving agents

- **`repo-auditor`** (Sonnet, read-only) takes any "check / audit / find all"
  request, `/ponytail-audit` included, and returns numbered findings. Grilling
  and the question of which findings to fix stay in the main session. The
  picked findings go into a brief file for `sdd-implementer`.
- **`gate-runner`** (Haiku) runs the quality gates or reads a CI run and
  returns only the failures. Dispatch it instead of running the gates inline.

### Plan pipeline agents

`.claude/agents/` holds five subagents carrying the superpowers plan pipeline's
role rules, so a dispatch sends only per-call values. They need the
`superpowers` and `mattpocock-skills` Claude Code plugins. Their bodies are
copied from superpowers 6.3.0 templates (named in a comment under each
frontmatter); re-sync them when those templates change.

- **Before `plan-writer`, save the spec** to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (git-ignored) and
  dispatch with that path; it refuses to run without one.
- **In `superpowers:subagent-driven-development`, dispatch the named agents**:
  implementer → `sdd-implementer`, task reviewer → `sdd-task-reviewer`, scoped
  re-review → `sdd-re-reviewer`, final review → `sdd-final-reviewer`. Send only
  the template's placeholder values (brief, report and diff paths, SHAs, global
  constraints, findings, context), never the template text. Pass `model`
  explicitly on every dispatch. Resume an implementer for fix rounds with
  `SendMessage`.
- The reviewers get `Read`, `Grep`, `Glob` and `Bash`; staying read-only is a
  prompt rule. The implementer and `plan-writer` get every tool but `Agent`.
- `grilling`, `domain-modeling` and `finishing-a-development-branch` stay in
  the main session, since a subagent cannot ask the user anything. The
  controller creates the worktree itself before Task 1; no agent sets
  `isolation: worktree`, which would hide each implementer's commits from the
  reviewer and the next task.
