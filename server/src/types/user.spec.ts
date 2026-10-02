import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHOR_SEARCH_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_STATUSES,
} from 'shared';
import {
  createUserSchema,
  listAuthorsQuerySchema,
  listUsersQuerySchema,
  updateUserSchema,
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

test('update rejects a body carrying only currentPassword — proof is not a change', () => {
  assert.equal(
    updateUserSchema.safeParse({ currentPassword: 'hunter2hunter2' }).success,
    false
  );
});

test('update accepts currentPassword alongside a change', () => {
  const parsed = updateUserSchema.parse({
    password: 'brand-new-pass',
    currentPassword: 'hunter2hunter2',
  });

  assert.equal(parsed.currentPassword, 'hunter2hunter2');
});

test('list query applies defaults and coerces strings', () => {
  assert.deepEqual(listUsersQuerySchema.parse({}), { limit: 20, offset: 0 });
  assert.equal(listUsersQuerySchema.parse({ limit: '50' }).limit, 50);
  assert.throws(() => listUsersQuerySchema.parse({ limit: '101' }));
  assert.throws(() => listUsersQuerySchema.parse({ offset: '-1' }));
});

// The client's Co-author picker stops typing at the same shared constant, so a
// term it sends is never one this refuses.
test('author search accepts a term up to the shared limit and no longer', () => {
  const longest = 'a'.repeat(AUTHOR_SEARCH_MAX_LENGTH);

  assert.equal(listAuthorsQuerySchema.parse({ q: longest }).q, longest);
  assert.throws(() => listAuthorsQuerySchema.parse({ q: `${longest}a` }));
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

test('a role in a create body is dropped — it is never caller-supplied', () => {
  const parsed = createUserSchema.parse({
    login: 'someone',
    email: 'someone@example.com',
    password: 'hunter2hunter2',
    firstName: 'Some',
    lastName: 'One',
    role: 'admin',
  });

  assert.equal('role' in parsed, false);
});

test('a role in an update body is dropped too', () => {
  // updateUserSchema is createUserSchema.partial(), so this follows from the
  // test above — asserted separately because that derivation is exactly what
  // would silently reintroduce the field.
  const parsed = updateUserSchema.parse({ role: 'superadmin', login: 'x123' });

  assert.equal('role' in parsed, false);
});

test('accepts the shared field limits exactly and refuses one past them', () => {
  const atMin = {
    login: 'a'.repeat(LOGIN_MIN_LENGTH),
    email: 'a@example.com',
    password: 'p'.repeat(PASSWORD_MIN_LENGTH),
    firstName: 'F',
    lastName: 'L',
  };

  assert.ok(createUserSchema.safeParse(atMin).success);
  assert.ok(
    createUserSchema.safeParse({
      ...atMin,
      login: 'a'.repeat(LOGIN_MAX_LENGTH),
      firstName: 'f'.repeat(NAME_MAX_LENGTH),
      password: 'p'.repeat(PASSWORD_MAX_LENGTH),
    }).success
  );
  for (const bad of [
    { login: 'a'.repeat(LOGIN_MIN_LENGTH - 1) },
    { login: 'a'.repeat(LOGIN_MAX_LENGTH + 1) },
    { lastName: 'l'.repeat(NAME_MAX_LENGTH + 1) },
    { password: 'p'.repeat(PASSWORD_MIN_LENGTH - 1) },
    { password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1) },
    { email: `${'e'.repeat(EMAIL_MAX_LENGTH)}@example.com` },
  ]) {
    assert.equal(
      createUserSchema.safeParse({ ...atMin, ...bad }).success,
      false
    );
  }
});
