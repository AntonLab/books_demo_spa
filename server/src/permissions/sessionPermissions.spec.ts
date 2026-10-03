import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor } from './permissionStore.ts';

test('permissionsFor is dense: every module has every action', () => {
  const permissions = permissionsFor('user');
  assert.equal(permissions.users.read, 'any');
  assert.equal(permissions.reports.create, 'none');
  assert.equal(Object.keys(permissions.books).length, 4);
});

test('users.update is own for a user, any for an admin and a superadmin, none for a guest', () => {
  assert.equal(permissionsFor('user').users.update, 'own');
  assert.equal(permissionsFor('admin').users.update, 'any');
  assert.equal(permissionsFor('superadmin').users.update, 'any');
  assert.equal(permissionsFor('guest').users.update, 'none');
});
