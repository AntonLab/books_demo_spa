---
paths:
  - 'docs/superpowers/specs/**'
  - 'docs/superpowers/queue/**'
  - 'docs/agents/**'
---

# Claims before they ship

A claim written from memory, a compaction summary or a retro reads as fact and
costs a round when it is wrong. In the 2026-10-18 hardening queue three brief
claims and two retro claims were wrong; each became work or an issue.

Give every checkable claim one command and record its output beside it.
**Checkable** means a statement a command can settle: "advisory X has a fix",
"`put` is duplicated in N specs", "the test fails if Y", "`/swarm:ship` re-runs
the gates", "every result arrives twice".

- **Before a brief goes to `sdd-implementer`:** run the command for each claim
  (`npm audit --json` for `first_patched_version`, `git grep -c` for a
  duplicate count, a failing test for "fails if") and write the output into the
  brief's item. An item whose command contradicts the claim is rewritten or
  dropped before dispatch.
- **Before `gh issue create` from a retro, audit or summary:** check each factual
  line against the primary source: the transcript (`npm run tokens -- <id>`
  tallies one session; `Grep` the `.jsonl` for the event), the skill text, the
  CI run. Quote the `path:line` in the issue body. A retro written after a
  compaction is a summary of a summary: treat it as a lead, not a source.
- **Done when** every checkable claim in the brief or issue has a command and an
  output, and none contradicts it.
