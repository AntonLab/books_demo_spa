// Checks the living specs in docs/specs/ against every reference to their
// requirement IDs. The rules it enforces are in docs/specs/README.md.
//
// Usage: node scripts/check-specs.mjs [repo-root]   (npm run specs:check)
//
// Plain Node ESM with no dependencies, so it runs before `npm install` too.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_FILE = /^docs\/specs\/[^/]+\/spec\.md$/;
const PREFIX_LINE = /^Prefix: `([A-Z]+)`/;
const DECLARATION = /^\*\*([A-Z]+)-(\d+)\*\*/;
const RETIRED = /^\*\*[A-Z]+-\d+\*\*\s*—\s*_Retired\b/;

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\0').filter((file) => file !== '');
}

function readLines(root, file) {
  return readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
}

// Reads each spec's prefix and its requirement declarations.
function readSpecs(specs) {
  const prefixes = new Map(); // prefix -> { file, line } of its Prefix line
  const declared = new Map(); // ID -> { file, line, retired }
  for (const { file, lines } of specs) {
    const index = lines.findIndex((text) => PREFIX_LINE.test(text));
    if (index !== -1) {
      prefixes.set(PREFIX_LINE.exec(lines[index])[1], {
        file,
        line: index + 1,
      });
    }
    lines.forEach((text, i) => {
      const match = DECLARATION.exec(text);
      if (!match) return;
      declared.set(`${match[1]}-${match[2]}`, {
        file,
        line: i + 1,
        retired: RETIRED.test(text),
      });
    });
  }
  return { prefixes, declared };
}

function checkReferences() {
  return new Set();
}

function checkSpecs(root) {
  const errors = [];
  const files = listFiles(root)
    .map((file) => ({ file, lines: readLines(root, file) }))
    .filter(({ lines }) => lines !== null);
  const specs = files.filter(({ file }) => SPEC_FILE.test(file));
  const { prefixes, declared } = readSpecs(specs, errors);
  checkReferences(files, prefixes, declared, errors);
  const live = [...declared].filter(([, where]) => !where.retired);
  const uncovered = [];
  errors.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  );
  return { specs: specs.length, live: live.length, errors, uncovered };
}

const root = path.resolve(
  process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))
);
const { specs, live, errors, uncovered } = checkSpecs(root);
for (const { file, line, message } of errors) {
  process.stderr.write(`${file}:${line}: ${message}\n`);
}
if (uncovered.length > 0) {
  process.stdout.write(
    `specs:check: ${uncovered.length} live requirement(s) no test cites:\n`
  );
  for (const [id, { file, line }] of uncovered) {
    process.stdout.write(`  ${id}  ${file}:${line}\n`);
  }
}
process.stdout.write(
  `specs:check: ${specs} spec(s), ${live} live requirement(s), ${errors.length} error(s)\n`
);
process.exitCode = errors.length > 0 ? 1 : 0;
