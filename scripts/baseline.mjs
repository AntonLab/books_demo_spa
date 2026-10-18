/**
 * Runs one client test file on HEAD and on a clean `origin/dev` worktree and
 * prints, for each, the exit code and how many output lines contain a text.
 * It answers "does this warning or failure also appear on dev?" in one command.
 *
 *   npm run baseline -- <client test path> [text]
 *
 * The dev side is a real task worktree (`scripts/worktree.mjs`), so it has its
 * own install and its own `node_modules/shared` link; a bare `git worktree add`
 * would resolve `shared` to the checkout it came from. Run it from the task
 * worktree whose HEAD is under test. The temporary worktree is always removed.
 */
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const name = 'baseline-tmp';
const [testPath, text = ''] = process.argv.slice(2);
if (!testPath || testPath.startsWith('-')) {
  console.error('usage: npm run baseline -- <client test path> [text]');
  process.exit(2);
}

// `shell: true` for npm.cmd on Windows; one string avoids DEP0190.
const run = (command, cwd) =>
  spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
const worktree = (...args) =>
  spawnSync(
    process.execPath,
    [join(root, 'scripts', 'worktree.mjs'), ...args],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );

const report = (label, cwd) => {
  const { status, stdout, stderr } = run(
    `npm test -w client -- ${JSON.stringify(testPath)}`,
    cwd
  );
  const lines = `${stdout}\n${stderr}`.split('\n');
  const hits = text ? lines.filter((line) => line.includes(text)).length : 0;
  console.log(
    `${label}: exit ${status}${text ? `, ${hits} line(s) with "${text}"` : ''}`
  );
};

const created = worktree(name, 'baseline/tmp', 'origin/dev');
if (created.status !== 0) {
  console.error('baseline: could not create the dev worktree');
  process.exit(1);
}
try {
  report('HEAD', process.cwd());
  report('origin/dev', join(root, '.claude', 'worktrees', name));
} finally {
  worktree('--remove', name);
}
