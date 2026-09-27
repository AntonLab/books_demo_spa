/**
 * Tells whether the current branch has fallen behind `origin/dev`, the branch
 * every feature starts from and every PR targets. Work on a stale base passes
 * locally and then conflicts, or fails CI on the merge ref.
 *
 *   npm run branch:check              exit 1 when behind, with the fix
 *   node scripts/branch-check.mjs --warn   print only when behind, always exit 0
 *
 * `--warn` is the SessionStart hook: silence costs no context, and a failed
 * fetch (offline, no remote) must never block a session.
 */
import { execFileSync } from 'node:child_process';

const warnOnly = process.argv.includes('--warn');
const base = 'origin/dev';

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15000,
  }).trim();

function report(message) {
  console.log(message);
  process.exit(warnOnly ? 0 : 1);
}

try {
  git('fetch', '--quiet', 'origin', 'dev');
} catch {
  if (warnOnly) process.exit(0);
  report(`branch-check: cannot fetch ${base}; the result below may be stale.`);
}

let branch;
let behind;
try {
  branch = git('branch', '--show-current') || '(detached HEAD)';
  behind = Number(git('rev-list', '--count', `HEAD..${base}`));
} catch {
  if (warnOnly) process.exit(0);
  report(`branch-check: ${base} not found.`);
}

if (behind === 0) {
  if (!warnOnly)
    console.log(`branch-check: ${branch} is up to date with ${base}.`);
  process.exit(0);
}

const fix =
  branch === 'dev'
    ? 'git pull --ff-only'
    : `git rebase ${base} (or git merge ${base} once pushed)`;
report(
  `branch-check: ${branch} is ${behind} commit(s) behind ${base}. Update before new work or a PR: ${fix}`
);
