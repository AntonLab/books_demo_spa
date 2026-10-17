---
paths:
  - '.claude/settings.json'
  - '.claude/skills/db-reset/**'
  - '.gitignore'
---

# Claude Code configuration

- **Two settings files.** `.claude/settings.json` is checked in: only rules
  every contributor wants, with no absolute paths. Personal allows (git
  writes, `gh`, plugin cache paths) go in `settings.local.json`, which stays
  git-ignored. Deny and ask rules win over any allow at any level, so the
  `npm *seed*` ask holds even beside a broad `Bash(npm run *)`.
- **Ask rules list both shells.** On Windows Claude runs commands through
  `PowerShell` as well as `Bash`; a `Bash(...)` rule alone misses the other.
- **Tool hooks come from the `swarm` plugin**, whose README lists what each
  one does: `guard-shell` refuses shell writes into repo files, `sed -i`,
  pushes to `dev` or `main`, and package-wide gates in the main session. A
  workspace gate (`npm run lint -w client`) counts as package-wide, and so
  do `npx tsc`, and `npx jest`/`eslint` or `node --test` with no path; only
  a run naming a path passes (`npm test -w client -- <path>`); `format-edited` runs
  Prettier from the nearest folder holding `.prettierrc.json`; `after-pr`
  reminds the main session to offer `/mattpocock-skills:retro`, then `/clear`,
  after `gh pr create`. Change them in
  `AntonLab/custom-agents-swarm`, not here. ESLint is left to the pre-commit
  hook; typed linting per edit is too slow. A redirect to `$VAR/file` is
  refused, since the guard cannot resolve the variable; write the path
  literally.
- **SessionStart runs `branch-check.mjs --warn`** on `startup` only: it
  fetches `origin/dev` and prints one line when the branch is behind, nothing
  otherwise, so a fresh branch costs no context. A failed fetch exits 0.
  It also runs `preflight.mjs`: one line per gap (Node major other than
  `.nvmrc`, no `server/.env.local`, MySQL not answering, no Playwright MCP
  from the swarm plugin or a second `playwright` server beside it), nothing
  when ready, always exit 0. An MCP fix reaches a session only after a
  restart: `/clear` keeps the old servers.
- **`.env.local` is behind `Edit(**/.env.local)`**, which also stops an agent's
  `cp` into a worktree. `npm run worktree` copies it instead; keep the deny.
- **`.claude/skills/`** is ignored except `db-reset/`: the rest are junctions
  `scripts/link-skills.mjs` makes, and that script leaves a real directory
  alone.
- **`.claude/agents/`** stays ignored and empty: the pipeline agents come
  from the `swarm` plugin as `swarm:<name>`. Copies left there from before
  the plugin are stale; delete them.
- **No `.mcp.json`.** The `swarm` plugin (1.2.0+) starts the Playwright MCP
  server that `ui-checker` drives; a project `playwright` server beside it
  makes the session run two browsers. The plugin's server writes to
  `.playwright-mcp/`, which stays git-ignored.
- **Plugins are project dependencies.** `enabledPlugins` and
  `extraKnownMarketplaces` in `settings.json` make Claude Code offer to install
  them once the folder is trusted. The agents preload `caveman`, `tdd`,
  `ponytail` and `domain-modeling`, and a missing skill preloads nothing,
  silently, so `/plugin` must list all six after a fresh clone. `caveman` is
  mandatory: project settings beat user settings, so turning it off takes
  `settings.local.json`.
- **Plugin versions are not pinned.** A marketplace `ref` takes only a branch
  or tag, ponytail has no tag for the version in use, and a project entry
  sharing a name with a contributor's user-level marketplace would shadow it.
- **`swarm` comes from `AntonLab/custom-agents-swarm`**, a private
  marketplace, so installing it needs git credentials for that repo. It ships
  the pipeline agents (`swarm:code-mapper` and the rest), `/swarm:ship`,
  `/swarm:queue` and the tool hooks. Run `/plugin marketplace update` after
  a change there lands.
