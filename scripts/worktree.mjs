/**
 * Creates a task worktree under .claude/worktrees/ ready for agents:
 *
 *   npm run worktree -- <name> <branch> [start-point]
 *
 * The start point defaults to a freshly fetched `origin/dev`, so a new branch
 * never starts stale. The script copies every git-ignored `.env.local` from
 * the main checkout: without `server/.env.local` the MySQL suites cannot run,
 * and an agent cannot copy it itself because `.env.local` is behind a deny
 * rule. Then it installs, and checks that `node_modules/shared` is a link
 * (Node strips types only outside `node_modules`).
 */
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [name, branch, startPoint = 'origin/dev'] = process.argv.slice(2);
if (!name || !branch) {
  console.error('usage: npm run worktree -- <name> <branch> [start-point]');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const target = join(root, '.claude', 'worktrees', name);
const git = (...args) =>
  execFileSync('git', args, { cwd: root, stdio: 'inherit' });

if (existsSync(target)) {
  console.error(`worktree: ${target} already exists`);
  process.exit(1);
}

git('fetch', '--quiet', 'origin', 'dev');
git('worktree', 'add', '-q', '-b', branch, target, startPoint);

for (const envFile of [
  'server/.env.local',
  'client/.env.local',
  '.env.local',
]) {
  if (existsSync(join(root, envFile))) {
    copyFileSync(join(root, envFile), join(target, envFile));
    console.log(`worktree: copied ${envFile}`);
  }
}

// One string: npm is npm.cmd on Windows, which needs a shell, and an args
// array beside `shell: true` trips Node's DEP0190 warning.
execSync('npm install --silent --no-audit --no-fund', {
  cwd: target,
  stdio: 'inherit',
});

if (!lstatSync(join(target, 'node_modules', 'shared')).isSymbolicLink()) {
  console.error(
    'worktree: node_modules/shared is not a link; the server cannot load shared/*.ts'
  );
  process.exit(1);
}
console.log(`worktree: ready at ${target} on ${branch} from ${startPoint}`);
