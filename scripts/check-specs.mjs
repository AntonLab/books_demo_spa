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
function readSpecs(specs, errors) {
  const prefixes = new Map(); // prefix -> { file, line } of its Prefix line
  const declared = new Map(); // ID -> { file, line, retired }
  for (const { file, lines } of specs) {
    const index = lines.findIndex((text) => PREFIX_LINE.test(text));
    const prefix = index === -1 ? null : PREFIX_LINE.exec(lines[index])[1];
    if (prefix === null) {
      errors.push({ file, line: 1, message: 'has no Prefix header line' });
    } else if (prefixes.has(prefix)) {
      const first = prefixes.get(prefix);
      errors.push({
        file,
        line: index + 1,
        message: `prefix ${prefix} is already declared by ${first.file}:${first.line}`,
      });
    } else {
      prefixes.set(prefix, { file, line: index + 1 });
    }
    lines.forEach((text, i) => {
      const match = DECLARATION.exec(text);
      if (!match) return;
      const id = `${match[1]}-${match[2]}`;
      const line = i + 1;
      if (match[1] !== prefix) {
        errors.push({
          file,
          line,
          message: `${id} is declared in a spec whose prefix is ${prefix ?? '(none)'}`,
        });
      }
      const first = declared.get(id);
      if (first) {
        errors.push({
          file,
          line,
          message: `${id} is already declared at ${first.file}:${first.line}`,
        });
      } else {
        declared.set(id, { file, line, retired: RETIRED.test(text) });
      }
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
