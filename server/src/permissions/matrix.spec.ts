import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrixRows } from './matrix.ts';
import { ACTIONS, MODULES, ROLES } from '../types/permission.ts';

const rows = buildMatrixRows();

const scope = (role: string, module: string, action: string) =>
  rows.find(
    (row) => row.role === role && row.module === module && row.action === action
  )?.scope;

test('the matrix covers every role, module and action exactly once', () => {
  assert.equal(rows.length, ROLES.length * MODULES.length * ACTIONS.length);

  const seen = new Set(
    rows.map((row) => `${row.role}/${row.module}/${row.action}`)
  );
  assert.equal(seen.size, rows.length);
});

// The invariant that stops a bad seed from locking everyone out. Cheaper than
// carving an exception for superadmin into the enforcement path, and it fails
// exactly when the seed is wrong.
test('superadmin has any on everything except creating content', () => {
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      const expected =
        action === 'create' &&
        (module === 'books' || module === 'series' || module === 'chapters')
          ? 'none'
          : 'any';

      assert.equal(
        scope('superadmin', module, action),
        expected,
        `superadmin/${module}/${action}`
      );
    }
  }
});

test('guest reads the public catalogue and nothing else', () => {
  assert.equal(scope('guest', 'books', 'read'), 'any');
  assert.equal(scope('guest', 'series', 'read'), 'any');
  assert.equal(scope('guest', 'chapters', 'read'), 'any');
  assert.equal(scope('guest', 'comments', 'read'), 'any');
  assert.equal(scope('guest', 'likes', 'read'), 'any');
  // PublicUser carries an email; an open list would be a scrapeable directory.
  assert.equal(scope('guest', 'users', 'read'), 'none');
  assert.equal(scope('guest', 'books', 'create'), 'none');
});

test('a plain user may comment but not author', () => {
  assert.equal(scope('user', 'comments', 'create'), 'own');
  assert.equal(scope('user', 'comments', 'update'), 'own');
  assert.equal(scope('user', 'books', 'create'), 'none');
});

test('an author writes only their own content', () => {
  assert.equal(scope('author', 'books', 'create'), 'own');
  assert.equal(scope('author', 'books', 'update'), 'own');
  assert.equal(scope('author', 'books', 'delete'), 'own');
  assert.equal(scope('author', 'chapters', 'update'), 'own');
});

test('an admin moderates but does not author', () => {
  assert.equal(scope('admin', 'books', 'update'), 'any');
  assert.equal(scope('admin', 'books', 'delete'), 'any');
  assert.equal(scope('admin', 'comments', 'delete'), 'any');
  // Without this, admin would inherit USER_GRANTS.likes verbatim — `own` on
  // update/delete — and could not act on a reported like any more than a
  // plain user could.
  assert.equal(scope('admin', 'likes', 'update'), 'any');
  assert.equal(scope('admin', 'likes', 'delete'), 'any');
  assert.equal(scope('admin', 'reports', 'update'), 'any');
  // The one deliberate break in the accumulation: admins moderate, they do not
  // write books.
  assert.equal(scope('admin', 'books', 'create'), 'none');
  assert.equal(scope('admin', 'series', 'create'), 'none');
  assert.equal(scope('admin', 'chapters', 'create'), 'none');
});

test('a user may flip their own like, which the API exposes as PATCH /likes/:id', () => {
  // likeRoutes has always had a PATCH — it is how a like becomes a dislike.
  // Without this grant the route is reachable by superadmin alone, which is a
  // gap rather than a policy: nobody can change their own reaction.
  assert.equal(scope('user', 'likes', 'update'), 'own');
  assert.equal(scope('author', 'likes', 'update'), 'own');
});
