import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { removeDir } from '../remove-dir.mjs';

const failing = (code) => () => {
  throw Object.assign(new Error(code), { code });
};

test('removeDir deletes the directory and returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remove-dir-'));
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'nested', 'file.txt'), 'x');
  assert.equal(removeDir(dir), null);
  assert.equal(existsSync(dir), false);
});

test('removeDir passes a missing directory', () => {
  assert.equal(removeDir(join(tmpdir(), 'remove-dir-missing-0')), null);
});

for (const code of ['EPERM', 'EBUSY']) {
  test(`removeDir explains ${code} as a held directory`, () => {
    const message = removeDir('/x/wt', failing(code));
    assert.match(
      message,
      new RegExp(`\\(${code}\\): a process still holds it`)
    );
    assert.match(message, /3100\/4100/);
  });
}

test('removeDir rethrows any other failure', () => {
  assert.throws(() => removeDir('/x/wt', failing('EACCES')), {
    code: 'EACCES',
  });
});

test('removeDir asks rmSync to retry a held directory', () => {
  let options;
  removeDir('/x/wt', (_target, given) => {
    options = given;
  });
  assert.equal(options.maxRetries > 0, true);
  assert.equal(options.recursive && options.force, true);
});
