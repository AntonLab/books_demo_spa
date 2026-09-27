#!/usr/bin/env bash
# One call per controller step of superpowers:subagent-driven-development, run
# from the task worktree. It wraps the plugin's scripts, so the controller's
# context never carries their cache path, and it adds the guards whose absence
# cost fix-up turns before: a package built on the wrong branch, and tasks run
# without server/.env.local, which silently skips every MySQL suite.
#
#   bash scripts/sdd-step.sh review PLAN BASE [HEAD]  review package for BASE..HEAD
#   bash scripts/sdd-step.sh next PLAN N [LEDGER_LINE]  append the ledger line, write task N's brief
set -euo pipefail

usage() {
  echo "usage: sdd-step.sh review PLAN BASE [HEAD] | next PLAN N [LEDGER_LINE]" >&2
  exit 2
}
[ $# -ge 3 ] || usage

scripts=$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/subagent-driven-development/scripts 2>/dev/null | sort -V | tail -1)
[ -n "$scripts" ] || { echo "superpowers plugin scripts not found" >&2; exit 2; }

branch=$(git branch --show-current)
case "$branch" in
  dev | main | '') echo "on '${branch:-detached HEAD}': run from the task worktree" >&2; exit 3 ;;
esac
[ -f server/.env.local ] || echo "WARNING: server/.env.local missing; MySQL suites will not run (npm run worktree copies it)" >&2

step=$1
plan=$2
case "$step" in
  review)
    bash "$scripts/review-package" "$plan" "$3" "${4:-HEAD}"
    ;;
  next)
    if [ $# -ge 4 ]; then
      printf '%s\n' "$4" >> "$(bash "$scripts/sdd-workspace" "$plan")/progress.md"
    fi
    bash "$scripts/task-brief" "$plan" "$3"
    ;;
  *) usage ;;
esac
