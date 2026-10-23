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

// A git repo holding the CLI, three token-free CLAUDE.md files and one nested rule doc.
const sandbox = (t, { rule, code, allowlist }) => {
  const root = mkdtempSync(join(tmpdir(), 'check-doc-refs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'client'));
  mkdirSync(join(repo, 'server'));
  mkdirSync(join(repo, 'src'));
  mkdirSync(join(repo, '.claude', 'rules', 'server'), { recursive: true });
  for (const file of [
    'check-doc-refs.mjs',
    'doc-refs.mjs',
    'steering-docs.mjs',
  ])
    copyFileSync(join(scripts, file), join(repo, 'scripts', file));
  for (const file of ['CLAUDE.md', 'client/CLAUDE.md', 'server/CLAUDE.md'])
    writeFileSync(join(repo, file), 'plain text\n');
  writeFileSync(join(repo, '.claude', 'rules', 'server', 'x.md'), rule);
  if (code) writeFileSync(join(repo, 'src', 'code.ts'), code);
  if (allowlist)
    writeFileSync(join(repo, 'scripts', 'doc-refs-allowlist.txt'), allowlist);
  spawnSync('git', ['init', '-q'], { cwd: repo });
  spawnSync('git', ['add', '-A'], { cwd: repo });
  return repo;
};

const runCli = (repo) =>
  spawnSync(process.execPath, ['scripts/check-doc-refs.mjs'], {
    cwd: repo,
    encoding: 'utf8',
  });

test('stale token in a nested rule fails with path:line token', (t) => {
  const repo = sandbox(t, { rule: 'a\n`staleName`\n' });
  const run = runCli(repo);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /\.claude\/rules\/server\/x\.md:2 staleName/);
});

test('clean docs pass with no allowlist file', (t) => {
  const repo = sandbox(t, { rule: '`liveName`\n', code: 'liveName' });
  assert.equal(runCli(repo).status, 0);
});

test('an allowlist entry no doc uses fails with its name', (t) => {
  const repo = sandbox(t, {
    rule: '`liveName`\n',
    code: 'liveName',
    allowlist: 'deadName\n',
  });
  const run = runCli(repo);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /unused allowlist entry: deadName/);
});

test('allowlist skips comments and blank lines, silences its tokens', (t) => {
  const allowlist = '# why: generated at runtime\n\nstaleName\n';
  const repo = sandbox(t, { rule: '`staleName`\n', allowlist });
  assert.equal(runCli(repo).status, 0);
});
