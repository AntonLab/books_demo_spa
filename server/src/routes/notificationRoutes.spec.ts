import test from 'node:test';
import assert from 'node:assert/strict';
import type { NotificationRepository } from '../repositories/notificationRepository.ts';
import type {
  ListNotificationsQuery,
  PublicNotification,
} from '../types/notification.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const NOTIFICATION: PublicNotification = {
  id: 1,
  kind: 'co_author_added',
  work: { type: 'book', id: 7, title: 'The Glass Harbour' },
  actor: { kind: 'co_author', name: 'Margaret Hale' },
  isRead: false,
  createdAt: new Date('2026-09-13T10:00:00.000Z'),
};

// Whose notifications are read and marked is the whole contract here: the
// repository scopes every query to the account it is handed, covered against
// MySQL. `calls` records what the routes handed it.
function createFakeRepository(calls: unknown[] = []): NotificationRepository {
  return {
    async list(userId: number, query: ListNotificationsQuery) {
      calls.push({ list: userId, query });
      return { items: [NOTIFICATION], total: 1, unread: 1 };
    },
    async markRead(userId: number, ids: number[]) {
      calls.push({ markRead: userId, ids });
      return 0;
    },
  };
}

test('an account lists its own notifications, with the paging envelope and its unread count', async () => {
  const calls: unknown[] = [];
  await withAuthenticatedApp(
    { notificationRepository: createFakeRepository(calls) },
    async (base) => {
      const response = await fetch(`${base}/api/notifications?limit=5`, {
        headers: { cookie: ROLE_COOKIES.otherAuthor },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await json(response), {
        items: [{ ...NOTIFICATION, createdAt: '2026-09-13T10:00:00.000Z' }],
        total: 1,
        unread: 1,
        limit: 5,
        offset: 0,
      });
      assert.deepEqual(calls, [
        { list: USER_IDS.otherAuthor, query: { limit: 5, offset: 0 } },
      ]);
    }
  );
});

test('any signed-in role has notifications — they are not a matrix resource', async () => {
  await withAuthenticatedApp(
    { notificationRepository: createFakeRepository() },
    async (base) => {
      for (const cookie of [ROLE_COOKIES.user, ROLE_COOKIES.admin]) {
        const response = await fetch(`${base}/api/notifications`, {
          headers: { cookie },
        });
        assert.equal(response.status, 200);
      }
    }
  );
});

test('marking read is made as the caller and answers with what is left unread', async () => {
  const calls: unknown[] = [];
  await withAuthenticatedApp(
    { notificationRepository: createFakeRepository(calls) },
    async (base) => {
      const response = await fetch(`${base}/api/notifications/read`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ROLE_COOKIES.author,
        },
        body: JSON.stringify({ ids: [1, 2] }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await json(response), { unread: 0 });
      assert.deepEqual(calls, [{ markRead: USER_IDS.author, ids: [1, 2] }]);
    }
  );
});

test('marking read without naming a notification is a 400', async () => {
  await withAuthenticatedApp(
    { notificationRepository: createFakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/notifications/read`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ROLE_COOKIES.author,
        },
        body: JSON.stringify({ ids: [] }),
      });
      assert.equal(response.status, 400);
    }
  );
});

test('notifications without a session are a 401', async () => {
  await withApp(
    { notificationRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await fetch(`${base}/api/notifications`)).status, 401);
      assert.equal(
        (
          await fetch(`${base}/api/notifications/read`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: [1] }),
          })
        ).status,
        401
      );
    }
  );
});
