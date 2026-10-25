---
paths:
  - 'scripts/sdd-step.sh'
  - 'scripts/plan-check.mjs'
  - 'scripts/worktree.mjs'
  - 'docs/superpowers/**'
---

# Plan pipeline agents

The pipeline agents carry the superpowers role rules, so a dispatch sends only
per-call values.

- **Before `plan-writer`, save the spec** to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (git-ignored) and
  dispatch with that path; it refuses to run without one. Grill in the main
  session first (`/grill-with-docs`, which also updates `CONTEXT.md` and the
  ADRs). The spec names the test seam agreed while grilling: the highest
  existing one the behaviour can be tested through, ideally one. plan-writer
  asks only about decisions the spec left open, as one `NEEDS_CONTEXT` round —
  put it to the user verbatim and resume the agent with the answers through
  `SendMessage`. A plan over 6 tasks or two workspaces comes back as part 1
  with the other parts listed;
  **resume the same plan-writer through `SendMessage` for each next part**,
  since it already holds the code it read. Dispatch a fresh one only when the
  resume fails.
- **Dispatch `code-mapper` once per spec, first** (light mode skips it), and pass its
  `…-codemap.md` to every plan-writer part. Do not run `Explore` or
  `cavecrew-investigator` before it: they map the same code twice. Plans carry
  contracts and tests, not implementation bodies; `node scripts/plan-check.mjs
<plan>` enforces it, and fails a task over 180 lines.
- **Every plan goes through plan-writer.** The main session never writes one.
- **A `DONE_WITH_CONCERNS` from any agent:** take a recommendation that stays
  inside the spec, add `accepted without user: <concern> -> <choice>` to the
  follow-ups file, and go on; the user reviews those lines with the other
  follow-ups. Put a concern with no recommendation, or one that changes what
  the spec asks for, to the user verbatim and wait. An audit finding is not a
  concern: fix it as the audit bullet below says. Re-read an accepted fix from
  the diff, not the report: a report line can say done for a change not made.
- **The main session edits no source file while a plan runs**, and it fixes
  nothing through `cavecrew-builder` or another ad-hoc agent. Exception: a
  rebase conflict that touches only imports or comments the main session
  resolves itself; any logic goes to `sdd-implementer` through a brief.
  Otherwise every change goes through an `sdd-implementer` brief, so it gets a
  ledger line and a review.
- **Every plan runs `superpowers:subagent-driven-development`**, and every
  task, a two-line fix brief included, gets an `sdd-task-reviewer`: a task
  review costs about 0.08M tokens, and skipping it let defects through. Do not run
  `superpowers:executing-plans` inline.
- **Light mode** is for a spec that touches no `client/src` and names at most
  three files to change. Skip `code-mapper`; plan-writer reads those files
  itself. When the plan has one task, skip `sdd-final-reviewer`: the task
  review already covered the whole diff. The changed-files audit and
  `gate-runner` still run, audit first, so the gates run once. A plan that
  comes back with more than two tasks leaves light mode for the final review.
- **Prefer one spec per main session.** After the PR for a spec is opened,
  suggest `/clear` before the next spec: a long context compacts repeatedly and
  costs more. Continuing is fine when the next spec is small and related. A
  PostToolUse hook prints a reminder after `gh pr create`.
- **One PR per spec** (or per two or three small related specs, or per
  `/swarm:queue` run of up to 5 issues with one commit group per issue): a
  giant PR is unreviewable. `dev` is the default branch, so a `Fixes #<n>`
  line in the PR body closes that issue on merge.
- **`dev` and `main` change only through a PR**, a main→dev sync included,
  though the ruleset lets an admin through; `guard-shell` refuses a direct
  push. A blocked push or `gh pr create`: stop and ask the user.
- **Run the gates through `gate-runner` before the final review**, in every
  mode, and quote its last line in the dispatch (`gates green at <sha>`, with
  the subset if it ran one). Before the final `gate-runner` the controller
  runs `git fetch` and `npm run branch:check`; if the branch is behind, rebase
  first, then run the gates. Never write that line yourself: a past run
  claimed typecheck and lint that never ran. `guard-shell` refuses an
  unbounded package-wide gate in the main session; one piped through
  `| tail` passes, but it is not a `gates green` line.
- **A PR body reports only checks that have finished**, with their result.
  Write a pending check as pending, never as its expected result; update the
  body once it finishes.
- **A diff that touches `client/src` gets a `ui-checker` run** after the
  changed-files audit's fixes and before `finishing-a-development-branch`, because it finds
  defects every review passed: a numbered checklist of at most 8 items from
  the spec's user-visible behavior, the worktree as working directory. It
  serves the worktree on ports 3100/4100, never the user's server on 3000. Its
  FAIL items are fixed like final-review findings: the fix brief quotes the
  FAIL line with its measured values, and the implementer's report says why
  the change moves them. Build each item from what the seeded data can reach:
  roles are `user`, `author`, `admin` and `superadmin` (check `USER_ROLES` in
  `shared/`). Fix all FAIL items first, then send one recheck run with only
  those items. Skip it in a follow-up round that changes no rendered output
  (its cost grows with every call: 32% of workers in PR #251). Save each
  run's returned list with `Write` to `.superpowers/sdd/<topic>/ui-check.md`
  under a `## <sha>` heading; `/swarm:ship` builds the test plan from it.
- **Follow-ups live in a file, not in the chat.** Each deferred finding,
  out-of-scope observation or unresolved item goes, the moment it appears, into
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-followups.md` with `Edit`, since
  a compaction summary can drop it. Before the PR, list the open lines to the
  user and ask what to do with each: fix now, file as an issue, or drop. Then
  mark each line with the answer. **Never run `gh issue create` for a
  follow-up the user did not pick for an issue**, in any mode, subagents
  included.
- **In `superpowers:subagent-driven-development`, dispatch the named agents**:
  implementer → `sdd-implementer`, task reviewer → `sdd-task-reviewer`, scoped
  re-review → `sdd-re-reviewer`, final review → `sdd-final-reviewer`. Send only
  the template's placeholder values (brief, report and diff paths, SHAs, global
  constraints, findings, context, and the worktree path as the working
  directory), never the template text. Resume an implementer for fix rounds
  with `SendMessage`.
- **Run controller steps as `bash scripts/sdd-step.sh review|next …`** from the
  worktree (usage in its header): one call packages a review, or appends the
  ledger line and writes the next brief, and it refuses `dev` and `main`.
- **Final-review fixes: one fresh `sdd-implementer` per group of up to five
  related findings**, then one scoped re-review. This overrides the skill's
  single fix dispatch, which runs too many turns in one context.
- **After the final scoped re-review, audit the changed files** with one
  `repo-auditor` (sonnet): yardstick "comments and duplication", scope the
  output of `git diff --name-only origin/dev...HEAD`. Reviews judge
  correctness, so wordy comments and copied logic pass them. Fix every
  finding the same way as final-review findings (`sdd-implementer` groups,
  one scoped re-review), then rerun `gate-runner` if code changed. A `dup`
  whose owner copy lies outside the diff is fixed only inside the diff; any
  other out-of-diff finding goes to the follow-ups file.
- **Pass `model` on every dispatch:** `sdd-implementer` haiku when the brief
  holds the exact code for a mechanical change (a move, a rename), sonnet
  otherwise; `sdd-task-reviewer` the implementer's model (haiku or sonnet,
  never opus); `gate-runner` haiku; `code-mapper`, `sdd-re-reviewer`,
  `plan-writer` and `sdd-final-reviewer` sonnet, because haiku took 2–3 times
  the turns and tokens of sonnet on those roles. Opus only when the user asks:
  it burned the weekly limit mid-plan.
- **Token check:** `npm run tokens -- <session-id> [from-ISO] [to-ISO]` prints
  totals per subagent role and the main session's compactions for a session
  window. Give its numbers to `superpowers:diagnosing-superpowers`.
- **Never pause between tasks.** Stop only on `BLOCKED`, `NEEDS_CONTEXT`, a
  concern the `DONE_WITH_CONCERNS` rule sends to the user, or the end of the
  plan. After `/compact`, re-read the plan's ledger under `.superpowers/sdd/`
  and resume at its first unfinished task without asking.
- **The ledger holds only `sdd-step.sh next` lines.** Notes go to the
  follow-ups file through `Edit`; `guard-shell` refuses an `echo >>` into
  `progress.md`.
- Grilling, `finishing-a-development-branch` and picking findings to fix stay
  in the main session: a subagent cannot ask the user anything.
- **`/db-reset` is the user's command** (`disable-model-invocation`): when the
  database needs a rebuild, ask the user to type it; the Skill call is refused.
- **The controller creates the worktree before Task 1 with
  `npm run worktree -- <name> <branch>`**: fresh `origin/dev`, the
  `.env.local` files an agent may not copy, and an install. Name the worktree
  after the spec's `<topic>`. Once the PR merges,
  `npm run worktree -- --remove <name>` deletes it with its branch,
  `.playwright-mcp`, the `docs/superpowers` spec, code map, follow-ups and
  plan whose topic is `<name>`, and a `queue-<date>[-b]` run's queue files;
  bare `git worktree remove` leaves the directory. No agent sets
  `isolation: worktree`: it hides implementer commits from the reviewer.
