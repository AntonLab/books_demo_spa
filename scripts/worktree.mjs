/**
 * Creates a task worktree under .claude/worktrees/ ready for agents, or
 * removes one once its branch has merged. Usage: see `usage` below.
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
 * `.playwright-mcp` and the `docs/superpowers` notes whose topic is `<name>`;
 * for `queue-<date>[-<letter>]` also that run's files in `docs/superpowers/queue`.
 */
import { execFileSync, execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { queueFilesFor } from './queue-files.mjs';
import { removeDir } from './remove-dir.mjs';

const root = resolve(import.meta.dirname, '..');
const git = (...args) =>
  execFileSync('git', args, { cwd: root, stdio: 'inherit' });
const gitOutput = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const worktreePath = (name) => join(root, '.claude', 'worktrees', name);
const usage =
  'usage: npm run worktree -- <name> <branch> [start-point]\n' +
  '       npm run worktree -- --remove <name>';
// An empty name never gets here: the argument dispatch below sends it to usage.
// `\` is no separator to POSIX basename, so it is refused by hand.
const validName = (name) =>
  name === basename(name) && !name.includes('\\') && !name.startsWith('.');
const rejectName = (name) => {
  if (validName(name)) return;
  console.error(usage);
  process.exit(2);
};

const remove = (name) => {
  rejectName(name);
  const target = worktreePath(name);
  if (!existsSync(target)) {
    console.error(`worktree: ${target} does not exist`);
    process.exit(1);
  }

  const registered = gitOutput(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .some((line) => resolve(line.slice('worktree '.length)) === target);
  // Present but unregistered: leftover of an earlier `--remove` (`git
  // worktree remove` succeeded, npm workspace junctions kept the
  // directory). `name` is validated, so the target is a direct child of
  // .claude/worktrees/.
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
  const held = removeDir(target);
  if (held) {
    console.error(held);
    process.exit(1);
  }
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
  // A queue run's checkpoint, log, map and briefs, once its PR has merged.
  const queueDir = join(root, 'docs', 'superpowers', 'queue');
  if (existsSync(queueDir)) {
    for (const file of queueFilesFor(name, readdirSync(queueDir))) {
      rmSync(join(queueDir, file));
    }
  }
  console.log(`worktree: removed ${name}`);
};

const create = (name, branch, startPoint = 'origin/dev') => {
  rejectName(name);
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
  console.error(usage);
  process.exit(2);
}
