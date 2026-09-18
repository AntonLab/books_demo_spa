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

test('fails on a prefix declared by two specs', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO'),
    'docs/specs/other/spec.md': spec('FOO'),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/other\/spec\.md:3: prefix FOO is already declared by docs\/specs\/foo\/spec\.md:3$/m
  );
});

test('fails on a requirement ID declared twice', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** — A rule.',
      '**FOO-1** — The same number again.'
    ),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:8: FOO-1 is already declared at docs\/specs\/foo\/spec\.md:7$/m
  );
});

test("fails on a requirement declared under another spec's prefix", (t) => {
  const root = repo(t, {
    'docs/specs/bar/spec.md': spec('BAR'),
    'docs/specs/foo/spec.md': spec('FOO', '**BAR-1** — Filed in FOO.'),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:7: BAR-1 is declared in a spec whose prefix is FOO$/m
  );
});

test('fails on a spec with no Prefix line', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': '# Foo\n\n**FOO-1** — A rule.\n',
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:1: has no Prefix header line$/m
  );
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:3: FOO-1 is declared in a spec whose prefix is \(none\)$/m
  );
});

test('fails on a reference to an undeclared ID, naming its file and line', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
    'src/a.ts': 'const a = 1;\n// FOO-2 and FOO-12: neither exists.\n',
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^src\/a\.ts:2: FOO-2 is not declared in any spec$/m
  );
  assert.match(
    result.stderr,
    /^src\/a\.ts:2: FOO-12 is not declared in any spec$/m
  );
});

test('matches whole IDs under a declared prefix only', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
    'src/a.ts': '// XFOO-7 FOO-7a FOO_7 foo-7 BAR-7 FOO-1\n',
  });

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('a declaration line declares its own ID and references any other', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — Relies on FOO-3.'),
    'docs/specs/foo/notes.md': '**FOO-2** — Only spec.md declares.\n',
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:7: FOO-3 is not declared in any spec$/m
  );
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/notes\.md:1: FOO-2 is not declared in any spec$/m
  );
  assert.doesNotMatch(result.stderr, /FOO-1/);
});

test('a Retired ID may be cited inside docs/specs/ but nowhere else', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** — _Retired 2026-10-01: replaced by FOO-2._',
      '**FOO-2** — The rule now.'
    ),
    'docs/specs/README.md': 'FOO-1 was retired.\n',
    'src/a.ts': '// FOO-1: the old rule.\n',
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^src\/a\.ts:1: FOO-1 is retired \(docs\/specs\/foo\/spec\.md:7\)$/m
  );
  assert.doesNotMatch(result.stderr, /README/);
  assert.match(result.stdout, /1 live requirement\(s\), 1 error\(s\)/);
});

test('skips ignored files, the two lockfiles and binary files, but reads untracked ones', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
    '.gitignore': 'ignored.md\n',
    'ignored.md': 'FOO-9\n',
    'package-lock.json': '{ "note": "FOO-9" }\n',
    'skills-lock.json': '{ "note": "FOO-9" }\n',
    'image.bin': Buffer.from('FOO-9\0'),
  });
  write(root, 'new.md', 'FOO-9\n');

  const result = check(root);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'new.md:1: FOO-9 is not declared in any spec\n');
});

test('skips a tracked file deleted from the working tree', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
    'gone.md': 'FOO-9\n',
  });
  rmSync(path.join(root, 'gone.md'));

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});
