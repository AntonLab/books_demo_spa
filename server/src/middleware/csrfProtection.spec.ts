import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createApp, type AppDeps } from '../app.ts';
import {
  createUnusedRepository,
  unlimitedAuthRateLimits,
} from '../routes/routeTestKit.testkit.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import {
  createCrossOriginProtection,
  requireXsrfToken,
  XSRF_COOKIE_NAME,
  XSRF_HEADER_NAME,
  xsrfTokenFor,
} from './csrfProtection.ts';
import { errorHandler } from './errorHandler.ts';

const TRUSTED_ORIGIN = 'http://localhost:3000';
const SESSION = 'a-session-token';

async function withServer(
  build: (app: express.Express) => void,
  fn: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  build(app);
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// A write and a read behind the protection under test, answering 200 when
// they are let through.
const guarded =
  (protection: express.RequestHandler) => (app: express.Express) => {
    app.use(cookieParser());
    app.use(protection);
    app.get('/thing', (_req, res) => void res.json({ ok: true }));
    app.post('/thing', (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler);
  };

describe('cross-origin protection', () => {
  const send = (
    base: string,
    headers: Record<string, string>,
    method = 'POST'
  ) => fetch(`${base}/thing`, { method, headers });

  test('a write from a foreign origin is refused, and so is one from an opaque origin', async () => {
    await withServer(
      guarded(createCrossOriginProtection(TRUSTED_ORIGIN)),
      async (base) => {
        const foreign = await send(base, { origin: 'https://evil.example' });
        assert.equal(foreign.status, 403);
        assert.equal(
          ((await foreign.json()) as { error: string }).error,
          'Cross-origin request refused'
        );
        assert.equal((await send(base, { origin: 'null' })).status, 403);
      }
    );
  });

  test('a browser that says the request is cross-site is refused unless it comes from the client origin', async () => {
    await withServer(
      guarded(createCrossOriginProtection(TRUSTED_ORIGIN)),
      async (base) => {
        for (const site of ['cross-site', 'same-site']) {
          assert.equal(
            (await send(base, { 'sec-fetch-site': site })).status,
            403,
            site
          );
        }
        assert.equal(
          (
            await send(base, {
              'sec-fetch-site': 'same-site',
              origin: TRUSTED_ORIGIN,
            })
          ).status,
          200
        );
      }
    );
  });

  test('same-origin, user-initiated, client-origin and non-browser writes pass', async () => {
    await withServer(
      guarded(createCrossOriginProtection(TRUSTED_ORIGIN)),
      async (base) => {
        const passing: Record<string, string>[] = [
          { 'sec-fetch-site': 'same-origin' },
          { 'sec-fetch-site': 'none' },
          { origin: TRUSTED_ORIGIN },
          // The API's own host, reached directly rather than through the
          // client's dev proxy.
          { origin: base },
          // No Origin and no Sec-Fetch-Site: not a browser, so not a forgery.
          {},
        ];
        for (const headers of passing) {
          assert.equal(
            (await send(base, headers)).status,
            200,
            JSON.stringify(headers)
          );
        }
      }
    );
  });

  test('a read is never refused, whatever its origin', async () => {
    await withServer(
      guarded(createCrossOriginProtection(TRUSTED_ORIGIN)),
      async (base) => {
        const response = await send(
          base,
          { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
          'GET'
        );
        assert.equal(response.status, 200);
      }
    );
  });
});

describe('the XSRF token', () => {
  const token = xsrfTokenFor(SESSION);
  const sessionCookie = `${SESSION_COOKIE_NAME}=${SESSION}`;

  test('is derived from the session, so one session cannot use another’s', () => {
    assert.equal(xsrfTokenFor(SESSION), token);
    assert.notEqual(xsrfTokenFor('another-session'), token);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  test('a write with a session and its token in both the cookie and the header passes', async () => {
    await withServer(guarded(requireXsrfToken), async (base) => {
      const response = await fetch(`${base}/thing`, {
        method: 'POST',
        headers: {
          cookie: `${sessionCookie}; ${XSRF_COOKIE_NAME}=${token}`,
          [XSRF_HEADER_NAME]: token,
        },
      });
      assert.equal(response.status, 200);
    });
  });

  test('a write with a session but no token, or a token that is not the session’s, is refused', async () => {
    await withServer(guarded(requireXsrfToken), async (base) => {
      const planted = xsrfTokenFor('attacker-session');
      for (const headers of [
        { cookie: sessionCookie },
        { cookie: `${sessionCookie}; ${XSRF_COOKIE_NAME}=${token}` },
        // A header without the cookie it must match.
        { cookie: sessionCookie, [XSRF_HEADER_NAME]: token },
        // Cookie and header agree, but name a different session.
        {
          cookie: `${sessionCookie}; ${XSRF_COOKIE_NAME}=${planted}`,
          [XSRF_HEADER_NAME]: planted,
        },
      ]) {
        const response = await fetch(`${base}/thing`, {
          method: 'POST',
          headers,
        });
        assert.equal(response.status, 403, JSON.stringify(headers));
        assert.equal(
          ((await response.json()) as { error: string }).error,
          'Missing or invalid CSRF token'
        );
      }
    });
  });

  test('a write without a session needs no token — there is no session to ride on', async () => {
    await withServer(guarded(requireXsrfToken), async (base) => {
      assert.equal(
        (await fetch(`${base}/thing`, { method: 'POST' })).status,
        200
      );
    });
  });

  test('a request with a session and a missing or stale token cookie is handed the right one', async () => {
    await withServer(guarded(requireXsrfToken), async (base) => {
      for (const cookie of [
        sessionCookie,
        `${sessionCookie}; ${XSRF_COOKIE_NAME}=stale`,
      ]) {
        const response = await fetch(`${base}/thing`, { headers: { cookie } });
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get('set-cookie') ?? '',
          new RegExp(`^${XSRF_COOKIE_NAME}=${token};`)
        );
      }
      const settled = await fetch(`${base}/thing`, {
        headers: { cookie: `${sessionCookie}; ${XSRF_COOKIE_NAME}=${token}` },
      });
      assert.equal(settled.headers.get('set-cookie'), null);
    });
  });
});

describe('the app', () => {
  const deps = (): AppDeps => ({
    userRepository: createUnusedRepository('user'),
    seriesRepository: createUnusedRepository('series'),
    bookRepository: createUnusedRepository('book'),
    chapterRepository: createUnusedRepository('chapter'),
    commentRepository: createUnusedRepository('comment'),
    likeRepository: createUnusedRepository('like'),
    notificationRepository: createUnusedRepository('notification'),
    sessionRepository: createUnusedRepository('session'),
    passwordResetRepository: createUnusedRepository('passwordReset'),
    resetDelivery: createUnusedRepository('resetDelivery'),
    trustedOrigin: TRUSTED_ORIGIN,
    trustProxy: 0,
    authRateLimits: unlimitedAuthRateLimits(),
  });

  // Refused before any route or repository is reached: every repository here
  // throws if it is touched.
  test('refuses a forged write before any route sees it', async () => {
    await withServer(
      (app) => void app.use(createApp(deps())),
      async (base) => {
        const foreign = await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { origin: 'https://evil.example' },
        });
        assert.equal(foreign.status, 403);

        const tokenless = await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${SESSION}` },
        });
        assert.equal(tokenless.status, 403);
      }
    );
  });
});
