import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
} from './auth.ts';

const validRegistration = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

test('registerSchema accepts a complete registration', () => {
  assert.equal(registerSchema.safeParse(validRegistration).success, true);
});

test('registerSchema rejects a login under 3 characters', () => {
  assert.equal(
    registerSchema.safeParse({ ...validRegistration, login: 'ab' }).success,
    false
  );
});

test('registerSchema rejects a password under 8 characters', () => {
  assert.equal(
    registerSchema.safeParse({ ...validRegistration, password: 'short' })
      .success,
    false
  );
});

test('registerSchema rejects a malformed email', () => {
  assert.equal(
    registerSchema.safeParse({ ...validRegistration, email: 'nope' }).success,
    false
  );
});

test('registerSchema strips status: the endpoint decides it, not the caller', () => {
  const parsed = registerSchema.parse({
    ...validRegistration,
    status: 'active',
  });
  assert.equal('status' in parsed, false);
});

test('loginSchema requires both a login and a password', () => {
  assert.equal(loginSchema.safeParse({ login: 'Bob' }).success, false);
  assert.equal(
    loginSchema.safeParse({ password: 'hunter2hunter2' }).success,
    false
  );
});

test('loginSchema does not bound the password: an old short one must still authenticate', () => {
  assert.equal(
    loginSchema.safeParse({ login: 'Bob', password: 'x' }).success,
    true
  );
});

test('resetRequestSchema requires a well-formed email', () => {
  assert.equal(
    resetRequestSchema.safeParse({ email: 'bob@example.com' }).success,
    true
  );
  assert.equal(resetRequestSchema.safeParse({ email: 'nope' }).success, false);
});

test('resetConfirmSchema requires a token and a password of full strength', () => {
  assert.equal(
    resetConfirmSchema.safeParse({ token: 'abc', password: 'hunter2hunter2' })
      .success,
    true
  );
  assert.equal(
    resetConfirmSchema.safeParse({ token: 'abc', password: 'short' }).success,
    false
  );
  assert.equal(
    resetConfirmSchema.safeParse({ password: 'hunter2hunter2' }).success,
    false
  );
});

test('registration defaults the role to user', () => {
  assert.equal(registerSchema.parse(validRegistration).role, 'user');
});

test('registration accepts author — the "I am author" checkbox', () => {
  const parsed = registerSchema.parse({ ...validRegistration, role: 'author' });

  assert.equal(parsed.role, 'author');
});

test('registration refuses admin and superadmin outright', () => {
  // Unreachable by construction rather than by a check downstream.
  assert.equal(
    registerSchema.safeParse({ ...validRegistration, role: 'admin' }).success,
    false
  );
  assert.equal(
    registerSchema.safeParse({ ...validRegistration, role: 'superadmin' })
      .success,
    false
  );
});
