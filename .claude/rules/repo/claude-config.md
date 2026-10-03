---
paths:
  - '.claude/settings.json'
  - '.claude/hooks/**'
  - '.claude/skills/db-reset/**'
  - '.mcp.json'
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
- **`format-edited.mjs`** (PostToolUse on Edit/Write) runs Prettier from the
  nearest directory holding `.prettierrc.json`, because Prettier reads ignore
  files only from its working directory: from the main checkout, `/.claude/*`
  would hide every worktree file. ESLint is left to the pre-commit hook; typed
  linting per edit is too slow.
- **`guard-shell.mjs`** (PreToolUse on Bash and PowerShell) refuses `sed -i`,
  shell redirects, `tee`, `cp` and `mv` (not `git mv`) into anything but a
  temp or scratchpad path,
  scripts calling `writeFileSync`/`open(…, 'w')`, `find` over a drive root,
  and, outside a subagent (`agent_type` absent), a package-wide
  `npm run typecheck|lint|format:check` or `npm test`; a focused
  `npm test -w client -- <path>` passes. Prose rules alone failed: one
  session broke each of them. A redirect to `$VAR/file` is refused too,
  since the hook cannot resolve the variable; write the path literally.
  Quoted text is skipped (a commit message may name `sed -i`), except a
  quoted redirect target and a `node`/`python` script body.
- **`after-pr.mjs`** (PostToolUse on Bash and PowerShell) adds one reminder
  after the main session's `gh pr create`. The reminder says to `/clear`
  before the next spec, and to close the PR's issues by hand after the merge,
  because a PR into `dev` ignores closing keywords. It is silent on every
  other command and inside a subagent.
- **SessionStart runs `branch-check.mjs --warn`** on `startup` only: it
  fetches `origin/dev` and prints one line when the branch is behind, nothing
  otherwise, so a fresh branch costs no context. A failed fetch exits 0.
- **`.env.local` is behind `Edit(**/.env.local)`**, which also stops an agent's
  `cp` into a worktree. `npm run worktree` copies it instead; keep the deny.
- **`.claude/skills/`** is ignored except `db-reset/`: the rest are junctions
  `scripts/link-skills.mjs` makes, and that script leaves a real directory
  alone.
- **`.claude/agents/`** is ignored and was removed from history with
  `git filter-repo`: subagent definitions are per clone. Do not `git add -f`
  them back.
- **`.mcp.json`** starts Playwright through `node -e` spawning `npx` with
  `shell: true`: Claude Code spawns without a shell, so a bare `npx` fails on
  native Windows (it is `npx.cmd`) and `cmd /c npx` fails everywhere else.
  The command is one string because an args array with `shell: true` trips
  Node's DEP0190 warning. Stdio is inherited, so the server exits on stdin EOF
  with no orphan.
- **Plugins are project dependencies.** `enabledPlugins` and
  `extraKnownMarketplaces` in `settings.json` make Claude Code offer to install
  them once the folder is trusted. The agents preload `caveman`, `tdd`,
  `ponytail` and `domain-modeling`, and a missing skill preloads nothing,
  silently, so `/plugin` must list all five after a fresh clone. `caveman` is
  mandatory: project settings beat user settings, so turning it off takes
  `settings.local.json`.
- **Plugin versions are not pinned.** A marketplace `ref` takes only a branch
  or tag, ponytail has no tag for the version in use, and a project entry
  sharing a name with a contributor's user-level marketplace would shadow it.
  Last verified together: superpowers 6.4.1, mattpocock-skills 1.2.3,
  caveman 2.7.0, ponytail 4.10.0. When `/plugin` shows a newer superpowers,
  re-sync `.claude/agents/` from its templates.
