/**
 * Runs `findMisses` and `findUnusedAllowlist` (from `doc-refs.mjs`) over the
 * steering docs. Known false positives go in `scripts/doc-refs-allowlist.txt`,
 * one token per line, each group under a `#` comment that gives the reason.
 *
 *   node scripts/check-doc-refs.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findMisses, findUnusedAllowlist } from './doc-refs.mjs';
import { CLAUDE_DOCS, ruleDocs } from './steering-docs.mjs';

const root = resolve(import.meta.dirname, '..');

const docs = [...CLAUDE_DOCS, ...ruleDocs(root)];

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
const unused = findUnusedAllowlist({ root, docs, allowlist });
for (const entry of unused)
  console.error(`check-doc-refs: unused allowlist entry: ${entry}`);
process.exitCode = misses.length || unused.length ? 1 : 0;
