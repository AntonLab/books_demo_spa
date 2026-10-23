/**
 * The always-loaded steering docs, as root-relative `/` paths: the three
 * CLAUDE.md files and every `.claude/rules/**.md`. `doc-limits.mjs` and
 * `check-doc-refs.mjs` both read this list.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CLAUDE_DOCS = [
  'CLAUDE.md',
  'client/CLAUDE.md',
  'server/CLAUDE.md',
];

export const ruleDocs = (root) =>
  readdirSync(join(root, '.claude', 'rules'), { recursive: true })
    .filter((file) => file.endsWith('.md'))
    .map((file) => `.claude/rules/${file.replace(/\\/g, '/')}`);
