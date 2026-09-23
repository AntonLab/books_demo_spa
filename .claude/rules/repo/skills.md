---
paths:
  - 'skills-lock.json'
  - 'scripts/link-skills.mjs'
  - '.agents/**'
---

# Project skills

`skills-lock.json` pins the repo's own skills, kept for fit with this stack.
`npm run skills` restores them in two steps: the `skills` CLI (pinned in the
root `package.json` rather than run through `npx`, so a fresh clone rebuilds
the same set) writes them into `.agents/skills/`, then
`scripts/link-skills.mjs` links each into `.claude/skills/`, because the
restore installs only for the CLI's "universal" agents and Claude Code is not
one. Both directories are git-ignored and per-clone.

Add a skill with `npx skills add <source>` (project-level, no `-g`), which
writes the lock. A skill a Claude Code plugin already ships stays out of the
lock; that covers every mattpocock/skills skill, which the `mattpocock-skills`
plugin provides.
