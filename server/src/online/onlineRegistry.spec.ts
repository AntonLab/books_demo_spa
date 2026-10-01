import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicNotification } from 'shared';
import { recordLogs } from '../logger.testkit.ts';
import {
  ONLINE_REVALIDATE_INTERVAL_MS,
  createOnlineRegistry,
  notificationEvent,
  type OnlineConnection,
} from './onlineRegistry.ts';

const NEW_CHAPTER: PublicNotification = {
  id: 11,
  kind: 'new_chapter',
  work: { type: 'book', id: 7, title: 'The Glass Harbour' },
  chapter: { id: 70, title: 'The Tide Bell' },
  chapterCount: 1,
  readAt: null,
  createdAt: new Date('2026-09-26T10:00:00.000Z'),
};

// A stream as the registry sees it: what was written to it, and whether the
// registry closed it.
function connection(userId: number, tokenHash: string) {
  const written: string[] = [];
  const state = { closed: false };
  const stream: OnlineConnection = {
    userId,
    tokenHash,
    write: (chunk) => {
      written.push(chunk);
    },
    close: () => {
      state.closed = true;
    },
  };
  return { stream, written, state };
}

// The session repository answers from a map the test edits, as sessions end;
// `asked` records every lookup, `failure` makes the next ones throw.
function sessions(live: Map<string, number>) {
  const asked: string[][] = [];
  const control: { failure?: Error } = {};
  return {
    asked,
    control,
    deps: {
      sessionRepository: {
        async findLiveSessions(tokenHashes: readonly string[]) {
          asked.push([...tokenHashes]);
          if (control.failure) throw control.failure;
          return new Map(
            [...live].filter(([hash]) => tokenHashes.includes(hash))
          );
        },
      },
    },
  };
}

// Lets the promise a timer callback started run to its end.
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('notificationEvent frames a notification as one SSE event', () => {
  assert.equal(
    notificationEvent(NEW_CHAPTER),
    `event: notification\ndata: ${JSON.stringify(NEW_CHAPTER)}\n\n`
  );
});

test('an account is Online while it holds at least one stream', () => {
  const registry = createOnlineRegistry(sessions(new Map()).deps);
  const phone = connection(2, 'hash-phone');
  const laptop = connection(2, 'hash-laptop');

  assert.equal(registry.isOnline(2), false);
  registry.add(phone.stream);
  registry.add(laptop.stream);
  registry.remove(phone.stream);
  assert.equal(registry.isOnline(2), true);
  registry.remove(laptop.stream);
  assert.equal(registry.isOnline(2), false);
});

test('push writes to every stream of that account and to nobody else', () => {
  const registry = createOnlineRegistry(sessions(new Map()).deps);
  const phone = connection(2, 'hash-phone');
  const laptop = connection(2, 'hash-laptop');
  const stranger = connection(3, 'hash-stranger');
  registry.add(phone.stream);
  registry.add(laptop.stream);
  registry.add(stranger.stream);

  registry.push(2, NEW_CHAPTER);

  assert.deepEqual(phone.written, [notificationEvent(NEW_CHAPTER)]);
  assert.deepEqual(laptop.written, [notificationEvent(NEW_CHAPTER)]);
  assert.deepEqual(stranger.written, []);
});

test('revalidation pings a stream whose session stands', async () => {
  const { deps, asked } = sessions(new Map([['hash-live', 2]]));
  const registry = createOnlineRegistry(deps);
  const live = connection(2, 'hash-live');
  registry.add(live.stream);

  await registry.revalidate();

  assert.deepEqual(asked, [['hash-live']]);
  assert.deepEqual(live.written, [': ping\n\n']);
  assert.equal(live.state.closed, false);
  assert.equal(registry.isOnline(2), true);
});

test('a stream whose session has ended is closed at the next revalidation and never pushed to again', async () => {
  const liveSessions = new Map([
    ['hash-phone', 2],
    ['hash-laptop', 2],
  ]);
  const { deps } = sessions(liveSessions);
  const registry = createOnlineRegistry(deps);
  const phone = connection(2, 'hash-phone');
  const laptop = connection(2, 'hash-laptop');
  registry.add(phone.stream);
  registry.add(laptop.stream);

  // Signed out on the phone: its session row is gone.
  liveSessions.delete('hash-phone');
  await registry.revalidate();
  registry.push(2, NEW_CHAPTER);

  assert.equal(phone.state.closed, true);
  assert.deepEqual(phone.written, []);
  assert.equal(laptop.state.closed, false);
  assert.deepEqual(laptop.written, [
    ': ping\n\n',
    notificationEvent(NEW_CHAPTER),
  ]);
});

test('a stream whose token now opens another account is closed too', async () => {
  const { deps } = sessions(new Map([['hash-reused', 9]]));
  const registry = createOnlineRegistry(deps);
  const stale = connection(2, 'hash-reused');
  registry.add(stale.stream);

  await registry.revalidate();

  assert.equal(stale.state.closed, true);
  assert.equal(registry.isOnline(2), false);
});

test('with no stream open, revalidation asks the database nothing', async () => {
  const { deps, asked } = sessions(new Map());
  await createOnlineRegistry(deps).revalidate();
  assert.deepEqual(asked, []);
});

test('a failed revalidation is logged, keeps every stream and does not reject', async (t: TestContext) => {
  const lines = recordLogs(t);
  const { deps, control } = sessions(new Map([['hash-live', 2]]));
  control.failure = new Error('connection lost');
  const registry = createOnlineRegistry(deps);
  const live = connection(2, 'hash-live');
  registry.add(live.stream);

  await registry.revalidate();

  assert.deepEqual(lines, [
    {
      level: 'error',
      message: 'Online revalidation failed',
      meta: 'connection lost',
    },
  ]);
  assert.equal(live.state.closed, false);
  assert.equal(registry.isOnline(2), true);
});

test('start revalidates every 30 s; stop ends the timer and closes every stream', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { deps, asked } = sessions(new Map([['hash-live', 2]]));
  const registry = createOnlineRegistry(deps);
  const live = connection(2, 'hash-live');
  registry.add(live.stream);

  registry.start();
  t.mock.timers.tick(ONLINE_REVALIDATE_INTERVAL_MS - 1);
  await settle();
  assert.equal(asked.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(ONLINE_REVALIDATE_INTERVAL_MS, 30_000);

  registry.stop();
  assert.equal(live.state.closed, true);
  assert.equal(registry.isOnline(2), false);
  t.mock.timers.tick(5 * ONLINE_REVALIDATE_INTERVAL_MS);
  await settle();
  assert.equal(asked.length, 1);
});
