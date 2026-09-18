import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
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
