import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
} from './notification.ts';

test('the list query defaults to the newest twenty', () => {
  assert.deepEqual(listNotificationsQuerySchema.parse({}), {
    limit: 20,
    offset: 0,
  });
  assert.equal(
    listNotificationsQuerySchema.safeParse({ limit: 101 }).success,
    false
  );
});

test('marking read names at least one notification id', () => {
  assert.deepEqual(
    markNotificationsReadSchema.parse({ ids: [3, 1] }).ids,
    [3, 1]
  );
  for (const ids of [[], [0], ['x'], undefined]) {
    assert.equal(
      markNotificationsReadSchema.safeParse({ ids }).success,
      false,
      JSON.stringify(ids)
    );
  }
});
