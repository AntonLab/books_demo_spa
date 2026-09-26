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
- **`.claude/skills/`** is ignored except `db-reset/`: the rest are junctions
  `scripts/link-skills.mjs` makes, and that script leaves a real directory
  alone.
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
