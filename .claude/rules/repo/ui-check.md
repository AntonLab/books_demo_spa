---
paths:
  - 'scripts/sdd-step.sh'
  - 'scripts/plan-check.mjs'
  - 'scripts/worktree.mjs'
  - 'docs/superpowers/**'
---

# `ui-checker` runs in the plan pipeline

A diff that touches `client/src` gets a `ui-checker` run after the
changed-files audit's fixes and before `finishing-a-development-branch`,
because it finds defects every review passed: a numbered checklist of at most
8 items from the spec's user-visible behavior, the worktree as working
directory. It serves the worktree on ports 3100/4100, never the user's server
on 3000. Its FAIL items are fixed like final-review findings: the fix brief
quotes the FAIL line with its measured values, and the implementer's report
says why the change moves them. Build each item from what the seeded data can
reach: roles are `user`, `author`, `admin` and `superadmin` (check `USER_ROLES`
in `shared/`). Fix all FAIL items first, then send one recheck run with only
those items. Skip it in a follow-up round that changes no rendered output (its
cost grows with every call: 32% of workers in PR #251). Save each run's
returned list with `Write` to `.superpowers/sdd/<topic>/ui-check.md` under a
`## <sha>` heading; `/swarm:ship` builds the test plan from it.
