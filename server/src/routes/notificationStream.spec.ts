import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicNotification } from 'shared';
import {
  notificationEvent,
  type OnlineConnection,
  type OnlineRegistry,
} from '../online/onlineRegistry.ts';
import { hashToken } from '../tokens.ts';
import {
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const NEW_BOOK: PublicNotification = {
  id: 12,
  kind: 'new_book',
  work: { type: 'book', id: 9, title: 'The Nightbus Returns' },
  series: { id: 4, title: 'The Nightbus Files' },
  isRead: false,
  createdAt: new Date('2026-09-26T10:00:00.000Z'),
};

// The token behind a persona's cookie, which is what the registry is handed
// (hashed) to re-check later.
const authorToken = ROLE_COOKIES.author.slice(
  ROLE_COOKIES.author.indexOf('=') + 1
);

// Records what the route registers and removes; the registry's own rules are
// covered in online/onlineRegistry.spec.ts.
function createFakeRegistry() {
  const added: OnlineConnection[] = [];
  const removed: OnlineConnection[] = [];
  let onRemove = (): void => {};
  const unused = (): never => {
    throw new Error('the stream route only adds and removes connections');
  };
  const registry: OnlineRegistry = {
    add: (connection) => {
      added.push(connection);
    },
    remove: (connection) => {
      removed.push(connection);
      onRemove();
    },
    isOnline: unused,
    push: unused,
    revalidate: unused,
    start: unused,
    stop: unused,
  };
  const untilRemoved = () =>
    new Promise<void>((resolve) => {
      if (removed.length > 0) resolve();
      else onRemove = resolve;
    });
  return { registry, added, removed, untilRemoved };
}

// Reads the stream until `text` has arrived: chunk boundaries are the
// network's, not the server's writes.
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: string
): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes(text)) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`stream ended before "${text}": ${received}`);
    received += decoder.decode(value, { stream: true });
  }
  return received;
}

test('a signed-in account opens an event stream registered under its session', async () => {
  const { registry, added, removed, untilRemoved } = createFakeRegistry();
  await withAuthenticatedApp({ onlineRegistry: registry }, async (base) => {
    const abort = new AbortController();
    const response = await fetch(`${base}/api/notifications/stream`, {
      headers: { cookie: ROLE_COOKIES.author },
      signal: abort.signal,
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const reader = response.body!.getReader();
    assert.equal(await readUntil(reader, '\n\n'), ': connected\n\n');

    assert.equal(added.length, 1);
    assert.equal(added[0]!.userId, USER_IDS.author);
    assert.equal(added[0]!.tokenHash, hashToken(authorToken));

    added[0]!.write(notificationEvent(NEW_BOOK));
    assert.equal(await readUntil(reader, '\n\n'), notificationEvent(NEW_BOOK));

    abort.abort();
    await untilRemoved();
    assert.deepEqual(removed, [added[0]]);
  });
});

test('closing the connection from the registry ends the stream', async () => {
  const { registry, added, untilRemoved } = createFakeRegistry();
  await withAuthenticatedApp({ onlineRegistry: registry }, async (base) => {
    const response = await fetch(`${base}/api/notifications/stream`, {
      headers: { cookie: ROLE_COOKIES.user },
    });
    const reader = response.body!.getReader();
    await readUntil(reader, ': connected\n\n');

    added[0]!.close();

    const rest = await reader.read();
    assert.equal(rest.done, true);
    await untilRemoved();
  });
});

test('the stream without a session is a 401 and registers nothing', async () => {
  const { registry, added } = createFakeRegistry();
  await withApp({ onlineRegistry: registry }, async (base) => {
    const response = await fetch(`${base}/api/notifications/stream`);

    assert.equal(response.status, 401);
    assert.deepEqual(added, []);
  });
});
