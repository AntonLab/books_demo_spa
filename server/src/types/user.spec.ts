import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateUserSchema,
  USER_STATUSES,
} from './user.ts';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from './errors.ts';

const valid = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

test('accepts a well-formed user and defaults status to absent', () => {
  const parsed = createUserSchema.parse(valid);

  assert.equal(parsed.login, 'Bob');
  assert.equal(parsed.status, undefined);
});

test('rejects a malformed email', () => {
  assert.throws(() =>
    createUserSchema.parse({ ...valid, email: 'not-an-email' })
  );
});

test('rejects a short login and a short password', () => {
  assert.throws(() => createUserSchema.parse({ ...valid, login: 'ab' }));
  assert.throws(() => createUserSchema.parse({ ...valid, password: 'short' }));
});

test('accepts every declared status and rejects others', () => {
  for (const status of USER_STATUSES) {
    assert.equal(createUserSchema.parse({ ...valid, status }).status, status);
  }
  assert.throws(() => createUserSchema.parse({ ...valid, status: 'deleted' }));
});

test('update accepts a single field but rejects an empty body', () => {
  assert.equal(
    updateUserSchema.parse({ firstName: 'Robert' }).firstName,
    'Robert'
  );
  assert.throws(() => updateUserSchema.parse({}));
});

test('list query applies defaults and coerces strings', () => {
  assert.deepEqual(listUsersQuerySchema.parse({}), { limit: 20, offset: 0 });
  assert.equal(listUsersQuerySchema.parse({ limit: '50' }).limit, 50);
  assert.throws(() => listUsersQuerySchema.parse({ limit: '101' }));
  assert.throws(() => listUsersQuerySchema.parse({ offset: '-1' }));
});

test('id param coerces a numeric string and rejects anything else', () => {
  assert.equal(idParamSchema.parse({ id: '7' }).id, 7);
  assert.throws(() => idParamSchema.parse({ id: 'abc' }));
  assert.throws(() => idParamSchema.parse({ id: '0' }));
});

test('errors carry the right status codes', () => {
  assert.equal(new NotFoundError('User', 3).statusCode, 404);
  assert.equal(new ConflictError('login').statusCode, 409);
  assert.equal(new ValidationError([]).statusCode, 400);
  assert.ok(new ConflictError('login') instanceof AppError);
});

test('conflict error names the offending field in its details', () => {
  assert.deepEqual(new ConflictError('email').details, { field: 'email' });
});
