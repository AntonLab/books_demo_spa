import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const scripts = join(import.meta.dirname, '..');

const sandbox = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['worktree.mjs', 'remove-dir.mjs']) {
    copyFileSync(join(scripts, file), join(root, 'scripts', file));
  }
  mkdirSync(join(root, '.claude', 'worktrees'), { recursive: true });
  return root;
};

const run = (root, ...args) =>
  spawnSync('node', [join(root, 'scripts', 'worktree.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });

const rejected = [
  ['--remove', '..'],
  ['--remove', '.'],
  ['--remove', 'a/b'],
  ['--remove', 'a\\b'],
  ['--remove', '.foo'],
  ['--remove', ''],
  ['x/y', 'main'],
  ['..', 'main'],
  ['.foo', 'main'],
];

for (const args of rejected) {
  test(`worktree rejects ${JSON.stringify(args)} with usage, exit 2`, (t) => {
    const root = sandbox(t);
    const result = run(root, ...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: npm run worktree/);
    assert.equal(existsSync(join(root, '.claude', 'worktrees')), true);
  });
}

test('worktree lets a plain name through the guard', (t) => {
  const result = run(sandbox(t), '--remove', 'queue-2026-10-18');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not exist/);
});
