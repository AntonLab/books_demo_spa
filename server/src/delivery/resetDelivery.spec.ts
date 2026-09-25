import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoggerResetDelivery, resetUrl } from './resetDelivery.ts';
import { recordLogs } from '../logger.testkit.ts';

test('the reset URL matches the client route the companion spec defines', () => {
  assert.equal(
    resetUrl('http://localhost:3000', 'abc'),
    'http://localhost:3000/reset-password?token=abc'
  );
});

test('the reset URL percent-encodes the token', () => {
  assert.match(
    resetUrl('http://localhost:3000', 'a+b/c='),
    /token=a%2Bb%2Fc%3D/
  );
});

test('a trailing slash on the base URL does not double up', () => {
  assert.equal(
    resetUrl('http://localhost:3000/', 'abc'),
    'http://localhost:3000/reset-password?token=abc'
  );
});

test('the logger delivery emits the address and the link', async (t) => {
  const lines = recordLogs(t);
  await createLoggerResetDelivery('http://localhost:3000').send(
    'bob@example.com',
    'abc'
  );

  assert.equal(lines.length, 1);
  assert.match(
    lines[0]?.message ?? '',
    /^Password reset for bob@example\.com: .*reset-password\?token=abc$/
  );
});
