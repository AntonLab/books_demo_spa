import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.ts';

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

// The variant and the cost are pinned through the PHC string's prefix,
// because hashPassword names no algorithm: argon2id is @node-rs/argon2's
// default. A changed default then fails here instead of silently weakening
// every new hash.
test('hashes with argon2id at the OWASP baseline outside tests', async () => {
  const hashed = await hashPassword('correct horse battery', 'development');

  assert.ok(hashed.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'), hashed);
});

test('hashes with argon2id at the weak test parameters under test', async () => {
  const hashed = await hashPassword('correct horse battery', 'test');

  assert.ok(hashed.startsWith('$argon2id$v=19$m=512,t=1,p=1$'), hashed);
});
