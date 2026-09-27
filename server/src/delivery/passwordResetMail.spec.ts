import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetMail, resetUrl } from './passwordResetMail.ts';

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

test('the reset mail goes to the account, carries the link once and no bare token', () => {
  const mail = passwordResetMail(
    'http://localhost:3000',
    'bob@example.com',
    'a+b'
  );

  assert.equal(mail.to, 'bob@example.com');
  assert.equal(mail.subject, 'Reset your password');
  assert.equal(
    mail.text.split('http://localhost:3000/reset-password?token=a%2Bb').length,
    2
  );
  assert.doesNotMatch(mail.text, /a\+b/);
  assert.match(mail.text, /one hour/);
});
