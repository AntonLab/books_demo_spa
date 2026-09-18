import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Request } from 'express';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { defaultDeps } from './routes/routeTestKit.testkit.ts';

// req.ip is Express's getter on the app's own request prototype, and it reads
// that app's 'trust proxy' setting. A request object built on the prototype of
// the app createApp returns therefore answers exactly as a live request to it
// would — and the API has no route that echoes an address back.
function ipSeenBy(trustProxy: number): string | undefined {
  const app = createApp({ ...defaultDeps(), trustProxy });
  const req: Request = Object.create(app.request, {
    headers: { value: { 'x-forwarded-for': '203.0.113.7' } },
    socket: { value: { remoteAddress: '127.0.0.1' } },
  });
  return req.ip;
}

test('with TRUST_PROXY at 0, req.ip is the socket peer and X-Forwarded-For is ignored', () => {
  assert.equal(ipSeenBy(0), '127.0.0.1');
});

test('with one trusted hop, req.ip is the client X-Forwarded-For names', () => {
  assert.equal(ipSeenBy(1), '203.0.113.7');
});

// Listens on createApp's own app, not wrapped in another: Express 5 sets
// X-Powered-By in app.handle, so a wrapping express() — like withApp's —
// would add the header itself and hide whether createApp turned it off.
async function withBareApp(fn: (base: string) => Promise<void>): Promise<void> {
  const server = createApp(defaultDeps()).listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function assertHardened(response: Response): void {
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('a success names no framework and forbids sniffing', async () => {
  await withBareApp(async (base) => {
    // No session cookie, so logout touches no repository and answers 204.
    const response = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
    });

    assert.equal(response.status, 204);
    assertHardened(response);
  });
});

test('a 404 from notFound carries the same headers', async () => {
  await withBareApp(async (base) => {
    const response = await fetch(`${base}/api/no-such-route`);

    assert.equal(response.status, 404);
    assertHardened(response);
  });
});

test('an error response carries the same headers', async () => {
  await withBareApp(async (base) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    assert.equal(response.status, 400);
    assertHardened(response);
  });
});
