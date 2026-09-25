/**
 * PostToolUse hook: runs Prettier over the file Claude just edited, so the
 * pre-commit hook finds nothing left to rewrite.
 *
 * Prettier runs from the nearest directory holding `.prettierrc.json`, not
 * from the session's root: Prettier reads `.gitignore` and `.prettierignore`
 * only from its working directory, and from the main checkout `/.claude/*`
 * would hide every file in a worktree under `.claude/worktrees/`.
 * A file outside any checkout, or one Prettier cannot parse, is left alone;
 * the hook never fails the edit.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const file = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path;

let dir = file ? dirname(resolve(file)) : null;
while (dir && !existsSync(join(dir, '.prettierrc.json'))) {
  dir = dirname(dir) === dir ? null : dirname(dir);
}

if (dir) {
  try {
    const bin = createRequire(join(dir, 'package.json')).resolve(
      'prettier/bin/prettier.cjs'
    );
    spawnSync(
      process.execPath,
      [bin, '--write', '--ignore-unknown', '--log-level=silent', file],
      { cwd: dir }
    );
  } catch {
    // No installed Prettier in that checkout: nothing to format with.
  }
}
