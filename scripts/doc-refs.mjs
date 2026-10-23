/**
 * Fails when a steering doc names a code identifier or file that no longer
 * exists. A backticked camelCase identifier or `.ts/.tsx/.mjs/.md/.json` name
 * must appear in a tracked file outside the checked docs; a token with `/`
 * must be an existing path. A renamed symbol otherwise leaves the docs
 * pointing at nothing, and every session that loads them trusts the dead name.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPAN = /(?<!`)`([^`\n]+)`(?!`)/g;
const FORBIDDEN = /[\s*?[\]{}()]/;
const CAMEL_CASE = /[a-z][A-Z]/;
const FILE_NAME = /\.(ts|tsx|mjs|md|json)$/;

const isToken = (span) =>
  !FORBIDDEN.test(span) && (CAMEL_CASE.test(span) || FILE_NAME.test(span));

export const extractTokens = (text) => {
  const found = [];
  let fence = ''; // the marker that opened the current fence
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    const marker = /^\s*(```|~~~)/.exec(line)?.[1];
    if (marker && (!fence || marker === fence)) {
      fence = fence ? '' : marker;
      return;
    }
    if (fence) return;
    for (const [, span] of line.matchAll(SPAN))
      if (isToken(span)) found.push({ line: index + 1, token: span });
  });
  return found;
};

export const findMisses = ({ root, docs, allowlist = new Set() }) => {
  const paths = docs.map((doc) => doc.replace(/\\/g, '/'));
  // The allowlist and the doc-refs tests name stale tokens on purpose.
  const excludes = [
    ...paths,
    'scripts/doc-refs-allowlist.txt',
    'scripts/test/*doc-refs*',
  ].map((path) => `:(exclude)${path}`);
  const cache = new Map();

  const exists = (token) => {
    if (token.includes('/')) return existsSync(join(root, token));
    const { status, stderr } = spawnSync(
      'git',
      ['grep', '-F', '-q', '-e', token, '--', '.', ...excludes],
      { cwd: root }
    );
    if (status === 0) return true;
    if (status === 1) return false;
    throw new Error(`git grep failed for ${token}: ${stderr}`);
  };

  const misses = [];
  for (const path of paths) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const { line, token } of extractTokens(text)) {
      if (allowlist.has(token)) continue;
      if (!cache.has(token)) cache.set(token, exists(token));
      if (!cache.get(token)) misses.push({ path, line, token });
    }
  }
  return misses;
};
