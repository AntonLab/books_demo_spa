import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordParams, verifyPassword } from './password.ts';

test('produces an argon2id hash, not the plaintext', async () => {
  const hashed = await hashPassword('correct horse battery', 'test');

  assert.notEqual(hashed, 'correct horse battery');
  assert.match(hashed, /^\$argon2id\$/);
});

test('salts each hash, so the same password hashes differently', async () => {
  const a = await hashPassword('same password', 'test');
  const b = await hashPassword('same password', 'test');

  assert.notEqual(a, b);
});

test('verifies the correct password', async () => {
  const hashed = await hashPassword('correct horse battery', 'test');

  assert.equal(await verifyPassword(hashed, 'correct horse battery'), true);
});

test('rejects a wrong password', async () => {
  const hashed = await hashPassword('correct horse battery', 'test');

  assert.equal(await verifyPassword(hashed, 'wrong horse battery'), false);
});

test('uses cheaper parameters under test than elsewhere', () => {
  assert.ok(
    passwordParams('test').memoryCost < passwordParams('production').memoryCost
  );
});
