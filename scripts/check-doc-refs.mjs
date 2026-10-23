/**
 * Fails when a backtick identifier in a CLAUDE.md or a `.claude/rules/` doc
 * matches no tracked file content, or a file name or path matches no tracked
 * path. Known false positives go in `scripts/doc-refs-allowlist.txt`, one
 * token per line, each group under a `#` comment that gives the reason.
 *
 *   node scripts/check-doc-refs.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findMisses } from './doc-refs.mjs';

const root = resolve(import.meta.dirname, '..');

const docs = [
  'CLAUDE.md',
  'client/CLAUDE.md',
  'server/CLAUDE.md',
  ...readdirSync(join(root, '.claude', 'rules'), { recursive: true })
    .filter((file) => file.endsWith('.md'))
    .map((file) => join('.claude', 'rules', file)),
];

const allowlistFile = join(root, 'scripts', 'doc-refs-allowlist.txt');
const allowlist = new Set(
  (existsSync(allowlistFile) ? readFileSync(allowlistFile, 'utf8') : '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
);

const misses = findMisses({ root, docs, allowlist });
for (const { path, line, token } of misses)
  console.error(`check-doc-refs: ${path}:${line} ${token}`);
process.exitCode = misses.length ? 1 : 0;
