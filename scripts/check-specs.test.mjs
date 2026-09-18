// Tests for check-specs.mjs, each run against a throwaway git repository.
//
// The real `npm run specs:check` scans this file too, so every fixture ID uses
// FOO or BAR: prefixes no spec in docs/specs/ declares, which the check
// therefore never matches here.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-specs.mjs', import.meta.url));

// An empty file for GIT_CONFIG_GLOBAL below: it must exist and parse as a
// (empty) config, which the platform null device does not reliably do.
const EMPTY_GIT_CONFIG = path.join(
  mkdtempSync(path.join(tmpdir(), 'check-specs-gitconfig-')),
  'empty.gitconfig'
);
writeFileSync(EMPTY_GIT_CONFIG, '');

// This process may itself be running under git — from a hook, with GIT_DIR,
// GIT_INDEX_FILE and friends already set — or simply have a populated
// global/system gitconfig. None of that may leak into the throwaway repos
// below, or a `git add` in one could write into the caller's own index. Used
// for every git call and for the CLI subprocess, which makes its own.
function gitEnv() {
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
  ]) {
    delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = EMPTY_GIT_CONFIG;
  return env;
}

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
  execFileSync('git', ['init', '--quiet'], {
    cwd: root,
    stdio: 'ignore',
    env: gitEnv(),
  });
  execFileSync('git', ['add', '--all'], {
    cwd: root,
    stdio: 'ignore',
    env: gitEnv(),
  });
  return root;
}

// Runs the script against root the way `npm run specs:check` does.
function check(root) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [SCRIPT, root],
    { encoding: 'utf8', env: gitEnv() }
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

test("the test repo's git calls ignore an inherited GIT_INDEX_FILE", (t) => {
  const outside = mkdtempSync(path.join(tmpdir(), 'check-specs-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const leaked = path.join(outside, 'index');

  const had = Object.hasOwn(process.env, 'GIT_INDEX_FILE');
  const previous = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = leaked;
  t.after(() => {
    if (had) process.env.GIT_INDEX_FILE = previous;
    else delete process.env.GIT_INDEX_FILE;
  });

  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
  });
  const result = check(root);

  assert.equal(result.status, 0);
  assert.equal(existsSync(leaked), false);
});

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

test('fails on a near-miss Retired line: en dash instead of em dash', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** – _Retired 2026-10-01: replaced by FOO-2._',
      '**FOO-2** — The rule now.'
    ),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:7: FOO-1 looks Retired but does not match "\*\*FOO-1\*\* — _Retired …_"$/m
  );
});

test('fails on a near-miss Retired line: missing italics', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** — Retired 2026-10-01: replaced by FOO-2.',
      '**FOO-2** — The rule now.'
    ),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:7: FOO-1 looks Retired but does not match "\*\*FOO-1\*\* — _Retired …_"$/m
  );
});

test('fails on a spec file misplaced under docs/specs/', (t) => {
  const root = repo(t, {
    'docs/specs/README.md': '# Living specs\n',
    'docs/specs/books.md': '# Books\n',
    'docs/specs/books/api/spec.md': spec('FOO', '**FOO-1** — A rule.'),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/books\.md:1: is not a spec: specs live at docs\/specs\/<capability>\/spec\.md$/m
  );
  assert.match(
    result.stderr,
    /^docs\/specs\/books\/api\/spec\.md:1: is not a spec: specs live at docs\/specs\/<capability>\/spec\.md$/m
  );
  assert.doesNotMatch(result.stderr, /docs\/specs\/README\.md/);
});

test('fails on a declaration number with a leading zero', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-01** — A rule.'),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:7: FOO-01 has a leading zero$/m
  );
});

test('fails on a spec declaring the reserved EX prefix', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('EX', '**EX-1** — A rule.'),
  });

  const result = check(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^docs\/specs\/foo\/spec\.md:3: prefix EX is reserved for examples$/m
  );
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

test('skips a tracked path that is a directory in the working tree', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec('FOO', '**FOO-1** — A rule.'),
    'dir.md': 'FOO-9\n',
  });
  rmSync(path.join(root, 'dir.md'));
  mkdirSync(path.join(root, 'dir.md'));

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('lists, without failing, every live requirement no test file cites', (t) => {
  const root = repo(t, {
    'docs/specs/foo/spec.md': spec(
      'FOO',
      '**FOO-1** — Cited by a .spec.ts file.',
      '**FOO-2** — Cited by a .test.ts file.',
      '**FOO-3** — Cited by a .test.tsx file.',
      '**FOO-4** — Cited by a .testkit.ts file.',
      '**FOO-5** — Cited by production code only.',
      '**FOO-6** — _Retired 2026-10-01: replaced by FOO-5._'
    ),
    'server/a.spec.ts': "test('FOO-1: a rule', () => {});\n",
    'server/b.test.ts': "test('FOO-2: a rule', () => {});\n",
    'client/c.test.tsx': "it('FOO-3: a rule', () => {});\n",
    'server/d.testkit.ts': '// FOO-4: a helper that pins it.\n',
    'server/e.ts': '// FOO-5: the gist of the rule.\n',
  });

  const result = check(root);

  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      'specs:check: 1 live requirement(s) no test cites:',
      '  FOO-5  docs/specs/foo/spec.md:11',
      'specs:check: 1 spec(s), 5 live requirement(s), 0 error(s)',
      '',
    ].join('\n')
  );
});
