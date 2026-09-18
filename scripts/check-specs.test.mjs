// Tests for check-specs.mjs, each run against a throwaway git repository.
//
// The real `npm run specs:check` scans this file too, so every fixture ID uses
// FOO or BAR: prefixes no spec in docs/specs/ declares, which the check
// therefore never matches here.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-specs.mjs', import.meta.url));

// Writes one file under root, creating its directories.
function write(root, file, content) {
  const full = path.join(root, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

// A git repository holding `files` (path -> content), all of them staged, and
// removed again when the test ends.
function repo(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'check-specs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    write(root, file, content);
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '--all'], { cwd: root, stdio: 'ignore' });
  return root;
}

// Runs the script against root the way `npm run specs:check` does.
function check(root) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [SCRIPT, root],
    { encoding: 'utf8' }
  );
  return { status, stdout, stderr };
}

// A spec for prefix; its requirement lines start on line 7.
function spec(prefix, ...requirements) {
  return [
    `# ${prefix}`,
    '',
    `Prefix: \`${prefix}\` · Glossary: none · ADRs: none`,
    '',
    '## Requirements',
    '',
    ...requirements,
    '',
  ].join('\n');
}

test('passes a repository with no specs, whatever IDs its files mention', (t) => {
  const root = repo(t, { 'README.md': 'See FOO-1 and BAR-2.\n' });

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    'specs:check: 0 spec(s), 0 live requirement(s), 0 error(s)\n'
  );
});

test('passes when every reference names a declared requirement', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** — A rule.',
      '**FOO-2** — Another rule, which relies on FOO-1.'
    ),
    'src/a.ts': '// FOO-2: the gist of the rule.\n',
  });

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /specs:check: 1 spec\(s\), 2 live requirement\(s\), 0 error\(s\)/
  );
});
