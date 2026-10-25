import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const scripts = join(import.meta.dirname, '..');

// A git repo holding the CLI, one source file and one brief.
const sandbox = (t, brief) => {
  const repo = mkdtempSync(join(tmpdir(), 'brief-check-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'scripts'));
  mkdirSync(join(repo, 'src'));
  for (const file of ['brief-check.mjs', 'brief-refs.mjs', 'doc-refs.mjs'])
    copyFileSync(join(scripts, file), join(repo, 'scripts', file));
  writeFileSync(
    join(repo, 'src', 'code.ts'),
    'export const liveName = 1;\nliveName;\n'
  );
  writeFileSync(join(repo, 'brief.md'), brief);
  spawnSync('git', ['init', '-q'], { cwd: repo });
  spawnSync('git', ['add', 'scripts', 'src'], { cwd: repo });
  return repo;
};

const run = (repo) =>
  spawnSync(process.execPath, ['scripts/brief-check.mjs', 'brief.md'], {
    cwd: repo,
    encoding: 'utf8',
  });

test('a name in the code prints its line count and passes', (t) => {
  const result = run(sandbox(t, '`liveName` exists\n'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /brief\.md:1 liveName hits=2/);
});

test('a missing name and a missing path exit 1 with hits=0', (t) => {
  const result = run(sandbox(t, '`goneName`\n`src/gone.ts`\n'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /goneName hits=0/);
  assert.match(result.stdout, /src\/gone\.ts hits=0/);
});

test('a path of a tracked file counts as one hit', (t) => {
  const result = run(sandbox(t, '`src/code.ts`\n'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /src\/code\.ts hits=1/);
});

test('no argument exits 2 with usage', (t) => {
  const repo = sandbox(t, '');
  const result = spawnSync(process.execPath, ['scripts/brief-check.mjs'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});
