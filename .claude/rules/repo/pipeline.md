---
paths:
  - '.claude/agents/**'
  - 'scripts/sdd-step.sh'
  - 'scripts/plan-check.mjs'
  - 'scripts/worktree.mjs'
  - 'docs/superpowers/**'
---

# Plan pipeline agents

Six pipeline subagents (`code-mapper`, `plan-writer`, `sdd-implementer`,
`sdd-task-reviewer`, `sdd-re-reviewer`, `sdd-final-reviewer`; `gate-runner`,
`ui-checker` and `repo-auditor` sit outside the pipeline) carry the
superpowers pipeline's role rules, so a dispatch sends only per-call values.
Bodies come from superpowers 6.4.1 templates (named under each frontmatter);
re-sync them when those change. `claude-config.md` covers why the files are
git-ignored.

- **Before `plan-writer`, save the spec** to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (git-ignored) and
  dispatch with that path; it refuses to run without one. Grill in the main
  session first (`/grill-with-docs`); plan-writer asks only about decisions the
  spec left open, as one `NEEDS_CONTEXT` round — put it to the user verbatim
  and resume the agent with the answers through `SendMessage`. A plan over 6
  tasks or two workspaces comes back as part 1 with the other parts listed;
  **resume the same plan-writer through `SendMessage` for each next part**,
  since it already holds the code it read. Dispatch a fresh one only when the
  resume fails.
- **Dispatch `code-mapper` once per spec, first**, and pass its
  `…-codemap.md` to every plan-writer part. Do not run `Explore` or
  `cavecrew-investigator` before it: they map the same code twice. Plans carry
  contracts and tests, not implementation bodies;
  `node scripts/plan-check.mjs <plan>` enforces it.
- **Every plan goes through plan-writer.** The main session never writes one:
  it costs several times the plan-writer's tokens for a plan of the same size.
  If plan-writer returns `DONE_WITH_CONCERNS`, put its decisions and concerns
  to the user verbatim and wait for the answers before Task 1.
- **The main session edits no source file while a plan runs**, and it fixes
  nothing through `cavecrew-builder` or another ad-hoc agent. Every change
  goes through an `sdd-implementer` brief, so it gets a ledger line and a
  review.
- **Every plan runs the full `superpowers:subagent-driven-development`.**
  Every task gets an `sdd-task-reviewer`, whatever the task count; there is
  no light mode: a task review costs about 0.08M tokens, and skipping it let
  defects through. Do not run `superpowers:executing-plans` inline: the Opus
  session pays about as much as all the implementers together and compacts
  more often.
- **One spec, one main session.** After the PR for a spec is opened (or its
  part of a shared branch is finished), have the user run `/clear` before the
  next spec: a long context compacts repeatedly and costs far more. The spec,
  code map, plan, ledger and follow-ups files carry the state. A PostToolUse
  hook prints this reminder after `gh pr create`.
- **One PR per spec** (or per two or three small related specs): a giant PR is
  unreviewable. A PR into `dev` does not run its closing keywords, so after
  the merge, close each issue it fixes with
  `gh issue close <n> --comment "Fixed in #<pr>"`.
- **Run the gates through `gate-runner` before the final review**, in every
  mode, and quote its last line in the dispatch (`gates green at <sha>`, with
  the subset if it ran one). Never write that line yourself: a past run
  claimed typecheck and lint that never ran. The `guard-shell` hook refuses a
  package-wide gate in the main session.
- **A diff that touches `client/src` gets a `ui-checker` run** after the final
  review's fixes and before `finishing-a-development-branch`, because it finds
  defects every review passed: a numbered checklist from the spec's
  user-visible behavior, the worktree as working directory. It serves the
  worktree on ports 3100/4100 and never touches the user's server on 3000. Its
  FAIL items are fixed like final-review findings. Build each checklist item
  from what the seeded data can reach: roles are `user`, `author`, `admin` and
  `superadmin` (check `USER_ROLES` in `shared/`), so an item that needs another
  role cannot be verified. Fix all FAIL items first, then send one recheck run
  with only those items; one recheck per fix multiplies the cost.
- **Follow-ups live in a file, not in the chat.** Each deferred finding,
  out-of-scope observation or unresolved item goes, the moment it appears, into
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-followups.md` with `Edit`, since
  a compaction summary can drop it. Before the PR, each line is fixed or filed
  as an issue (`gh issue create`) and marked so.
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
- **Pass `model` on every dispatch:** `sdd-implementer` haiku when the brief
  holds the exact code for a mechanical change (a move, a rename), sonnet
  otherwise; `sdd-task-reviewer` the implementer's model (haiku or sonnet,
  never opus); `gate-runner` haiku; `code-mapper`, `sdd-re-reviewer`,
  `plan-writer` and `sdd-final-reviewer` sonnet, because haiku took 2–3 times
  the turns and tokens of sonnet on those roles. Opus only when the user asks:
  it burned the weekly limit mid-plan.
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
  plan whose topic is `<name>`; bare `git worktree remove` leaves the
  directory. No agent sets `isolation: worktree`: it hides implementer commits
  from the reviewer.
