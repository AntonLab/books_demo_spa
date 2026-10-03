---
paths:
  - '.claude/agents/**'
  - 'scripts/sdd-step.sh'
  - 'scripts/plan-check.mjs'
  - 'scripts/worktree.mjs'
  - 'docs/superpowers/**'
---

# Plan pipeline agents

Six subagents carry the superpowers pipeline's role rules, so a dispatch sends
only per-call values. Bodies come from superpowers 6.4.1 templates (named under
each frontmatter); re-sync them when those change. `.claude/agents/` is
git-ignored, so the files live only in the clone that has them; without them,
fall back to the skill's own templates.

- **Before `plan-writer`, save the spec** to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (git-ignored) and
  dispatch with that path; it refuses to run without one. Grill in the main
  session first (`/grill-with-docs`); plan-writer asks only about decisions the
  spec left open, as one `NEEDS_CONTEXT` round — put it to the user verbatim
  and resume the agent with the answers through `SendMessage`. A plan over 6
  tasks or two workspaces comes back as part 1 with the other parts listed;
  **resume the same plan-writer through `SendMessage` for each next part**. It
  already holds the code it read, and the cache re-reads it cheaply. On the
  backlog run (PR #163), a fresh plan-writer per part re-read the source each
  time, and plan-writer cost 101M against 136M for all implementers. Dispatch a
  fresh one only when the resume fails.
- **Dispatch `code-mapper` once per spec, first**, and pass its
  `…-codemap.md` to every plan-writer part. Do not run `Explore` or
  `cavecrew-investigator` before it: on the backlog run three of them mapped
  the same code that the code-mapper then mapped again. Plans carry contracts
  and tests, not implementation bodies;
  `node scripts/plan-check.mjs <plan>` enforces it.
- **Every plan goes through plan-writer.** The main session never writes one:
  in app-polish a main-written plan cost 4.54M Opus tokens, while a
  plan-writer cost 0.74M for a plan of the same size (backlog spec G). If
  plan-writer returns
  `DONE_WITH_CONCERNS`, put its decisions and concerns to the user verbatim and
  wait for the answers before Task 1; the work-modals run skipped them.
- **The main session edits no source file while a plan runs**, and it fixes
  nothing through `cavecrew-builder` or another ad-hoc agent. Every change
  goes through an `sdd-implementer` brief, so it gets a ledger line and a
  review.
- **Every plan runs the full `superpowers:subagent-driven-development`.**
  Every task gets an `sdd-task-reviewer`, whatever the task count; there is
  no light mode. The cost argument does not hold: 36 task reviews on the
  backlog run cost 2.8M together (0.08M each). Under the old limit of 5
  tasks, rulings ran light mode on parts of 6 and 8 tasks, and plans were cut
  to 5 tasks to stay under it. Specs of 12–15 tasks shipped without a
  per-task review. Do not run
  `superpowers:executing-plans` inline: on the work-modals branch its two
  parts cost the Opus session 10.8M tokens, close to all 11 implementers'
  13.1M, and drove two of its three compactions.
- **One spec, one main session.** After the PR for a spec is opened (or its
  part of a shared branch is finished), have the user run `/clear` before the
  next spec. The spec, code map, plan, ledger and follow-ups files carry the
  state. On the backlog run, 13 specs in one context cost 107M Opus tokens over
  15 compactions, each at about 167k. A PostToolUse hook prints this reminder
  after `gh pr create`.
- **One PR per spec** (or per two or three small related specs). PR #163
  carried 13 specs in 443 files and 36.7k lines. A PR into `dev` does not run
  its closing keywords, so after the merge, close each issue it fixes with
  `gh issue close <n> --comment "Fixed in #<pr>"`.
- **Run the gates through `gate-runner` before the final review**, in every
  mode, and quote its last line in the dispatch (`gates green at <sha>`, with
  the subset if it ran one). Never write that line yourself: the work-modals
  run claimed typecheck and lint that never ran. The `guard-shell` hook
  refuses a package-wide gate in the main session.
- **A diff that touches `client/src` gets a `ui-checker` run** after the final
  review's fixes and before `finishing-a-development-branch`: a numbered
  checklist from the spec's user-visible behavior, the worktree as working
  directory. It serves the worktree on ports 3100/4100 and never touches the
  user's server on 3000. Its FAIL items are fixed like final-review findings.
  On the work-modals branch it ran only on request, after finishing, and found
  four defects every review had passed. Build each checklist item from what
  the seeded data can reach: roles are `user`, `author`, `admin` and
  `superadmin` (check `USER_ROLES` in `shared/`), so an item that needs another
  role cannot be verified. Fix all FAIL items first, then send one recheck run
  with only those items. Do not run one recheck per fix: spec B made four runs
  (19.2M).
- **Follow-ups live in a file, not in the chat.** Each deferred finding,
  out-of-scope observation or unresolved item goes, the moment it appears, into
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-followups.md` with `Edit`.
  Before the PR, each line is fixed or filed as an issue (`gh issue create`)
  and marked so. A compaction summary dropped one such item on work-modals.
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
  single fix dispatch, which ran 100 turns in one context.
- **Pass `model` on every dispatch:** `sdd-implementer` haiku when the brief
  holds the exact code for a mechanical change (a move, a rename), sonnet
  otherwise; `sdd-task-reviewer` the implementer's model (haiku or sonnet,
  never opus); `gate-runner` haiku; `code-mapper`, `sdd-re-reviewer`,
  `plan-writer` and `sdd-final-reviewer` sonnet. On the backlog run, haiku
  took 2–3 times the turns and tokens of sonnet:
  - code-mapper: 1.9–3.0M per run on haiku, 0.6–1.3M on sonnet;
  - re-review: 0.43M per run on haiku, against 0.08M for a sonnet task review.

  Opus only when the user asks: it burned the weekly limit mid-plan.

- **Token check:** `npm run tokens -- <session-id> [from-ISO] [to-ISO]` prints
  totals per subagent role and the main session's compactions for a session
  window. Give its numbers to `superpowers:diagnosing-superpowers` instead of
  rebuilding the tally.
- **Never pause between tasks.** Stop only on `BLOCKED`, `NEEDS_CONTEXT` or the
  end of the plan. After `/compact`, re-read the plan's ledger under
  `.superpowers/sdd/` and resume at its first unfinished task without asking.
- Tools and preloads live in each frontmatter; reviewers stay read-only by
  prompt. Grilling, `finishing-a-development-branch` and picking findings to
  fix stay in the main session: a subagent cannot ask the user anything.
- **`/db-reset` is the user's command** (`disable-model-invocation`): when the
  database needs a rebuild, ask the user to type it; the Skill call is refused.
- **Each agent body carries a `<!-- Revised: YYYY-MM-DD … -->` line.** Bump it
  with every change: the bodies are not in git, and a session diagnosis can
  tell which version ran only from that line and the file's mtime.
- **The controller creates the worktree before Task 1 with
  `npm run worktree -- <name> <branch>`**: fresh `origin/dev`, the
  `.env.local` files an agent may not copy, and an install. Name the worktree
  after the spec's `<topic>`. Once the PR merges,
  `npm run worktree -- --remove <name>` deletes it with its branch,
  `.playwright-mcp` and the `docs/superpowers` spec, code map, follow-ups and
  plan whose topic is `<name>`; bare `git worktree remove` leaves the directory. No agent
  sets `isolation: worktree`: it hides implementer commits from the reviewer.
