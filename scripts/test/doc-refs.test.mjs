import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { extractTokens, findMisses } from '../doc-refs.mjs';

// A git repo whose tracked files are `files` (path -> content).
const repo = (t, files) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-refs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '-A'], { cwd: root });
  return root;
};
const DOC = '.claude/rules/a.md';
const tokens = (text) => extractTokens(text).map((entry) => entry.token);

test('hit: identifier and file name found in tracked code', (t) => {
  const root = repo(t, {
    [DOC]: 'x\nSee `fooBar` and `app.json`.\n',
    'src/code.ts': 'export const fooBar = 1; // app.json',
  });
  assert.deepEqual(findMisses({ root, docs: [DOC] }), []);
});

test('miss: reports path, line and token', (t) => {
  const root = repo(t, {
    [DOC]: 'x\nUse `hiddenBookIds` here.\n',
    'src/code.ts': 'export const hiddenBooksSubquery = 1;',
  });
  assert.deepEqual(findMisses({ root, docs: [DOC] }), [
    { path: DOC, line: 2, token: 'hiddenBookIds' },
  ]);
});

test('a token found only in a checked doc is a miss', (t) => {
  const root = repo(t, {
    [DOC]: '`onlyHere`\n',
    'CLAUDE.md': 'also `onlyHere`\n',
    'src/code.ts': '',
  });
  const docs = [DOC, 'CLAUDE.md'];
  assert.equal(findMisses({ root, docs }).length, 2);
});

test('the allowlist and the doc-refs tests do not vouch for a token', (t) => {
  const root = repo(t, {
    [DOC]: '`staleName`\n',
    'scripts/doc-refs-allowlist.txt': 'staleName reason\n',
    'scripts/test/doc-refs.test.mjs': "'staleName'\n",
    'src/code.ts': '',
  });
  assert.deepEqual(findMisses({ root, docs: [DOC] }), [
    { path: DOC, line: 1, token: 'staleName' },
  ]);
});

test('allowlisted token is not reported', (t) => {
  const root = repo(t, { [DOC]: '`ghostName`\n', 'src/code.ts': '' });
  const allowlist = new Set(['ghostName']);
  assert.deepEqual(findMisses({ root, docs: [DOC], allowlist }), []);
});

test('doc paths with / and \\ give the same result, reported with /', (t) => {
  const root = repo(t, { [DOC]: '`ghostName`\n', 'src/code.ts': '' });
  const expected = [{ path: DOC, line: 1, token: 'ghostName' }];
  for (const doc of [DOC, '.claude\\rules\\a.md'])
    assert.deepEqual(findMisses({ root, docs: [doc] }), expected);
});

test('token with / is checked as an existing path', (t) => {
  const root = repo(t, {
    [DOC]: '`server/src/real.ts` `server/src/gone.ts`\n',
    'server/src/real.ts': '',
  });
  assert.deepEqual(
    findMisses({ root, docs: [DOC] }).map((m) => m.token),
    ['server/src/gone.ts']
  );
});

test('CRLF doc, repeated token, dash and dot tokens', (t) => {
  const root = repo(t, {
    [DOC]: '`-badName` `-badName`\r\n`a.bC`\r\n`a.bC`\r\n',
    'src/code.ts': 'axbC',
  });
  const misses = findMisses({ root, docs: [DOC] });
  assert.deepEqual(
    misses.map((m) => [m.line, m.token]),
    [
      [1, '-badName'],
      [1, '-badName'],
      [2, 'a.bC'],
      [3, 'a.bC'],
    ]
  );
});

test('extractTokens skips non-identifiers, fences and double backticks', () => {
  const text = [
    '`two words` `foo()` `src/**/*.ts` `lower` `UPPER` `Title` `README`',
    '``dblQuote``',
    '```',
    '`fencedName`',
    '```',
    '`keepMe`',
  ].join('\n');
  assert.deepEqual(extractTokens(text), [{ line: 6, token: 'keepMe' }]);
});

test('token boundary table', () => {
  const yes = ['aB', 'xAy', 'x.ts', 'x.tsx', 'x.mjs', 'x.md', 'x.json'];
  const no = ['ab', 'AB', 'Ab', 'a', 'x.js', 'x.txt', 'x.TS', ''];
  for (const token of yes) assert.deepEqual(tokens(`\`${token}\``), [token]);
  for (const token of no) assert.deepEqual(tokens(`\`${token}\``), []);
});
