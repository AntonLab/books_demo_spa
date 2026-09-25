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
- **`.mcp.json`** wraps `npx` in `cmd /c`, which native Windows needs to spawn
  it; on macOS or Linux drop the wrapper in a local override.
