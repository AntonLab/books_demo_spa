import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, hashToken } from './tokens.ts';

test('createToken returns a base64url string with no padding', () => {
  assert.match(createToken(), /^[A-Za-z0-9_-]+$/);
});

test('createToken carries 32 bytes of entropy', () => {
  // 32 bytes base64url-encode to 43 characters.
  assert.equal(createToken().length, 43);
});

test('createToken does not repeat', () => {
  const seen = new Set(Array.from({ length: 1000 }, () => createToken()));
  assert.equal(seen.size, 1000);
});

test('hashToken returns 64 hex characters', () => {
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
});

test('hashToken is deterministic', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
});

test('hashToken separates different tokens', () => {
  assert.notEqual(hashToken('abc'), hashToken('abd'));
});
