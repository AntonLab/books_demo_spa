/**
 * Creates a task worktree under .claude/worktrees/ ready for agents, or
 * removes one once its branch has merged:
 *
 *   npm run worktree -- <name> <branch> [start-point]
 *   npm run worktree -- --remove <name>
 *
 * The start point defaults to a freshly fetched `origin/dev`, so a new branch
 * never starts stale. The script copies every git-ignored `.env.local` from
 * the main checkout: without `server/.env.local` the MySQL suites cannot run,
 * and an agent cannot copy it itself because `.env.local` is behind a deny
 * rule. Then it installs, and checks that `node_modules/shared` is a link
 * (Node strips types only outside `node_modules`).
 *
 * Removal refuses a worktree with uncommitted changes or a branch that
 * `origin/dev` does not contain yet. It also deletes the main checkout's
 * `.playwright-mcp` and the `docs/superpowers` notes whose topic is `<name>`.
 */
import { execFileSync, execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = (...args) =>
  execFileSync('git', args, { cwd: root, stdio: 'inherit' });
const gitOutput = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const worktreePath = (name) => join(root, '.claude', 'worktrees', name);

const remove = (name) => {
  const target = worktreePath(name);
  if (!existsSync(target)) {
    console.error(`worktree: ${target} does not exist`);
    process.exit(1);
  }

  const registered = gitOutput(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .some((line) => resolve(line.slice('worktree '.length)) === target);
  if (registered) {
    if (gitOutput(target, 'status', '--porcelain') !== '') {
      console.error(`worktree: ${name} has uncommitted changes; left in place`);
      process.exit(1);
    }
    const branch = gitOutput(target, 'branch', '--show-current');
    git('fetch', '--quiet', 'origin', 'dev');
    try {
      execFileSync(
        'git',
        ['merge-base', '--is-ancestor', branch, 'origin/dev'],
        {
          cwd: root,
        }
      );
    } catch {
      console.error(
        `worktree: origin/dev does not contain ${branch} yet; left in place`
      );
      process.exit(1);
    }
    git('worktree', 'remove', target);
    // `-D`: `-d` would judge the merge against the main checkout's HEAD,
    // which need not be dev; the ancestor check above is the real guard.
    git('branch', '-D', branch);
  }

  // On Windows `git worktree remove` leaves the npm workspace junctions under
  // node_modules/, so the directory itself survives. Their targets are gone by
  // now, and `rmSync` unlinks a junction instead of following it.
  rmSync(target, { recursive: true, force: true });
  git('worktree', 'prune');
  // Playwright MCP output lands in the main checkout's root whichever
  // worktree the check ran against.
  rmSync(join(root, '.playwright-mcp'), { recursive: true, force: true });
  // The task's spec, code map, follow-ups and plan are git-ignored working
  // notes that nothing reads once its branch has merged. Only files whose
  // topic equals `name` go, so a task still running keeps its own.
  for (const dir of ['specs', 'plans']) {
    const notes = join(root, 'docs', 'superpowers', dir);
    if (!existsSync(notes)) continue;
    for (const file of readdirSync(notes)) {
      const topic = file
        .slice('YYYY-MM-DD-'.length)
        .replace(/(-design|-codemap|-followups)?\.md$/, '');
      if (topic === name) rmSync(join(notes, file));
    }
  }
  console.log(`worktree: removed ${name}`);
};

const create = (name, branch, startPoint = 'origin/dev') => {
  const target = worktreePath(name);
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
};

const args = process.argv.slice(2);
if (args[0] === '--remove' && args[1]) {
  remove(args[1]);
} else if (args[0] && args[1] && !args[0].startsWith('-')) {
  create(...args);
} else {
  console.error(
    'usage: npm run worktree -- <name> <branch> [start-point]\n' +
      '       npm run worktree -- --remove <name>'
  );
  process.exit(2);
}
