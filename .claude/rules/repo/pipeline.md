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
  dispatch a fresh plan-writer per part.
- **Dispatch `code-mapper` once per spec, first**, and pass its
  `…-codemap.md` to every plan-writer part. Plans carry contracts and tests,
  not implementation bodies; `node scripts/plan-check.mjs <plan>` enforces it.
- **A small feature skips plan-writer**: when the map names one workspace and
  up to about 10 files, the main session writes the plan itself (contracts,
  plan-check green). Otherwise plan-writer. If plan-writer returns
  `DONE_WITH_CONCERNS`, put its decisions and concerns to the user verbatim and
  wait for the answers before Task 1; the work-modals run skipped them.
- **The main session edits no source file while a plan runs.** Up to 5 tasks
  run light: `bash scripts/sdd-step.sh next` writes each brief, one fresh
  `sdd-implementer` per task, no task reviewer, then gate-runner and one
  `sdd-final-reviewer`. Over 5 tasks, full
  `superpowers:subagent-driven-development`. Do not run
  `superpowers:executing-plans` inline: on the work-modals branch its two
  parts cost the Opus session 10.8M tokens, close to all 11 implementers'
  13.1M, and drove two of its three compactions.
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
  four defects every review had passed.
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
  never opus); `sdd-re-reviewer` and `code-mapper` haiku; `plan-writer` and
  `sdd-final-reviewer` sonnet. Opus only when the user asks: it burned the
  weekly limit mid-plan.
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
