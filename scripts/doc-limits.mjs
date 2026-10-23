/**
 * Fails when an always-loaded steering file outgrows its budget: a CLAUDE.md
 * over 200 lines or a `.claude/rules/` file over 150. Each line costs every
 * session that loads it, and a file at its limit grows only by shedding
 * history, never by appending.
 *
 *   node scripts/doc-limits.mjs
 *
 * Runs in `npm run lint` and in the pre-commit hook.
 */
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CLAUDE_DOCS, ruleDocs } from './steering-docs.mjs';

const root = resolve(import.meta.dirname, '..');
const lineCount = (path) =>
  readFileSync(path, 'utf8').replace(/\n$/, '').split('\n').length;

const limits = [
  ...CLAUDE_DOCS.map((file) => [join(root, file), 200]),
  ...ruleDocs(root).map((file) => [join(root, file), 150]),
];

const over = limits
  .map(([path, limit]) => ({ path, limit, lines: lineCount(path) }))
  .filter(({ lines, limit }) => lines > limit);
for (const { path, lines, limit } of over)
  console.error(
    `doc-limits: ${relative(root, path).replace(/\\/g, '/')} has ${lines} lines, limit ${limit}. Move a trap to its own rule file or drop history.`
  );
process.exitCode = over.length ? 1 : 0;
