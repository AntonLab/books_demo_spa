import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  AUTH_RATE_LIMITS,
  createAuthRateLimits,
  limitEveryRequest,
  limitFailedLogins,
} from './authRateLimit.ts';
import { errorHandler } from './errorHandler.ts';

const CLIENT = '203.0.113.10';
const OTHER_CLIENT = '203.0.113.20';
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

interface Clock {
  now: number;
}

interface Client {
  // POST /login; the stand-in handler answers with `status`.
  login(login: string, status: number, from?: string): Promise<Response>;
  register(from?: string): Promise<Response>;
  // How many requests got past the limits to a handler.
  handled(): number;
}

// A stand-in for the auth routes: /login answers whatever status the body
// asks for, so a test decides which attempts fail; /register answers 201.
// One trusted proxy hop, so a test picks the client address through
// X-Forwarded-For. The limits run on a clock the test moves by hand.
async function withLimitedApp(
  fn: (client: Client, clock: Clock) => Promise<void>
): Promise<void> {
  const clock: Clock = { now: 0 };
  const limits = createAuthRateLimits(() => clock.now);
  let handled = 0;

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', limitFailedLogins(limits), (req, res) => {
    handled += 1;
    const { status } = req.body as { status: number };
    res.status(status).end();
  });
  app.post('/register', limitEveryRequest(limits.register), (_req, res) => {
    handled += 1;
    res.status(201).end();
  });
  app.use(errorHandler);

  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const client: Client = {
    login: (login, status, from = CLIENT) =>
      fetch(`${base}/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': from,
        },
        body: JSON.stringify({ login, password: 'irrelevant', status }),
      }),
    register: (from = CLIENT) =>
      fetch(`${base}/register`, {
        method: 'POST',
        headers: { 'x-forwarded-for': from },
      }),
    handled: () => handled,
  };

  try {
    await fn(client, clock);
  } finally {
    limits.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function failTimes(
  client: Client,
  login: string,
  times: number,
  from?: string
): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) {
    assert.equal((await client.login(login, 401, from)).status, 401);
  }
}

// The message is pluralised: "1 minute." at exactly one minute, "N minutes."
// otherwise. N itself is passed in, so a caller states which form it expects.
async function assertRefused(
  response: Response,
  retryAfter: string,
  minutes: number
): Promise<void> {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), retryAfter);
  assert.deepEqual(await response.json(), {
    error: `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  });
}

test('the budgets are 10 and 50 failed logins per 15 minutes, 5 registrations and 5 reset requests per hour', () => {
  assert.deepEqual(AUTH_RATE_LIMITS, {
    loginByIpAndLogin: { limit: 10, windowMs: FIFTEEN_MINUTES_MS },
    loginByIp: { limit: 50, windowMs: FIFTEEN_MINUTES_MS },
    register: { limit: 5, windowMs: ONE_HOUR_MS },
    resetRequest: { limit: 5, windowMs: ONE_HOUR_MS },
  });
});

test('the 11th failed login for one name from one address is refused before the handler runs', async () => {
  await withLimitedApp(async (client) => {
    await failTimes(client, 'bob', 10);

    const refused = await client.login('bob', 200);

    assert.equal(refused.status, 429);
    assert.equal(client.handled(), 10);
  });
});

test('only a 401 spends the login budget', async () => {
  await withLimitedApp(async (client) => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      assert.equal((await client.login('bob', 400)).status, 400);
      assert.equal((await client.login('bob', 403)).status, 403);
    }

    await failTimes(client, 'bob', 10);
    assert.equal((await client.login('bob', 401)).status, 429);
  });
});

test('a successful login clears that name’s budget', async () => {
  await withLimitedApp(async (client) => {
    await failTimes(client, 'bob', 9);
    assert.equal((await client.login('bob', 200)).status, 200);

    await failTimes(client, 'bob', 10);
    assert.equal((await client.login('bob', 401)).status, 429);
  });
});

test('the 51st failure from one address is refused whatever the name, and a success does not clear it', async () => {
  await withLimitedApp(async (client) => {
    for (const name of ['a', 'b', 'c', 'd']) {
      await failTimes(client, name, 10);
    }
    await failTimes(client, 'e', 9);
    // Clears e's own budget only: 49 failures still stand against the address.
    assert.equal((await client.login('e', 200)).status, 200);
    await failTimes(client, 'f', 1);

    assert.equal((await client.login('g', 401)).status, 429);
    assert.equal((await client.login('g', 401, OTHER_CLIENT)).status, 401);
  });
});

test('names are compared trimmed and lower-cased', async () => {
  await withLimitedApp(async (client) => {
    await failTimes(client, 'Bob', 10);

    assert.equal((await client.login('  bob ', 401)).status, 429);
  });
});

test('each address keeps its own budget', async () => {
  await withLimitedApp(async (client) => {
    await failTimes(client, 'bob', 10);

    assert.equal((await client.login('bob', 401, OTHER_CLIENT)).status, 401);
  });
});

test('a refusal says how long to wait: Retry-After in whole seconds, rounded up, the message in minutes', async () => {
  await withLimitedApp(async (client, clock) => {
    await failTimes(client, 'bob', 10);

    // 599,999 ms of the window are left.
    clock.now = 300_001;
    await assertRefused(await client.login('bob', 401), '600', 10);
  });
});

test('the message never promises less than a minute, and one minute is singular', async () => {
  await withLimitedApp(async (client, clock) => {
    await failTimes(client, 'bob', 10);

    // One second of the window is left.
    clock.now = FIFTEEN_MINUTES_MS - 1_000;
    await assertRefused(await client.login('bob', 401), '1', 1);
  });
});

test('the budget returns when the window ends', async () => {
  await withLimitedApp(async (client, clock) => {
    await failTimes(client, 'bob', 10);

    clock.now = FIFTEEN_MINUTES_MS - 1;
    assert.equal((await client.login('bob', 401)).status, 429);
    clock.now = FIFTEEN_MINUTES_MS;
    assert.equal((await client.login('bob', 401)).status, 401);
  });
});

test('every registration counts, and the sixth in an hour is refused', async () => {
  await withLimitedApp(async (client, clock) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await client.register()).status, 201);
    }

    await assertRefused(await client.register(), '3600', 60);
    assert.equal(client.handled(), 5);
    assert.equal((await client.register(OTHER_CLIENT)).status, 201);

    clock.now = ONE_HOUR_MS;
    assert.equal((await client.register()).status, 201);
  });
});
