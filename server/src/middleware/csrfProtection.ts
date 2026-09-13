import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { SESSION_COOKIE_NAME, setXsrfCookie } from '../sessionCookie.ts';
import { xsrfTokenFor } from '../tokens.ts';
import { ForbiddenError } from '../types/errors.ts';

export { xsrfTokenFor };

// Cross-site request forgery is defended twice, because the one ambient
// credential here — the httpOnly `sid` cookie — is sent by the browser on
// requests another site can start. The cookie's SameSite=Lax already keeps it
// off cross-site writes in current browsers; these two layers do not rely on
// that.
//
//   1. createCrossOriginProtection refuses a write whose browser says it came
//      from another origin (Sec-Fetch-Site, else Origin) — the check Go 1.25's
//      http.CrossOriginProtection makes.
//   2. requireXsrfToken refuses a write that carries a session but not that
//      session's token, echoed from a script-readable cookie into a header a
//      foreign page can neither read nor set.

export { XSRF_COOKIE as XSRF_COOKIE_NAME } from '../sessionCookie.ts';
export const XSRF_HEADER_NAME = 'x-xsrf-token';

// Reads change nothing, so neither layer looks at them.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensEqual(sent: unknown, expected: string): boolean {
  if (typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// `trustedOrigin` is the client's origin (APP_BASE_URL), which a write through
// the client's dev proxy — or from the client on another subdomain — names in
// its Origin header while its Host is the API's.
export function createCrossOriginProtection(
  trustedOrigin: string
): RequestHandler {
  const trusted = new URL(trustedOrigin).origin;
  const refuse = () => new ForbiddenError('Cross-origin request refused');

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin === trusted) return next();

    // Every current browser sends this, and it cannot be set by a page.
    // `none` is a request the user started themselves, such as a bookmark.
    const site = req.get('sec-fetch-site');
    if (site !== undefined) {
      return site === 'same-origin' || site === 'none'
        ? next()
        : next(refuse());
    }

    // Neither header: not a browser — curl, a test, another server — and a
    // forgery needs a browser holding the victim's cookie.
    if (origin === undefined) return next();

    // An older browser: the Origin must name this host. `null` (an opaque
    // origin) fails to parse and is refused with the rest.
    try {
      return new URL(origin).host === req.get('host') ? next() : next(refuse());
    } catch {
      return next(refuse());
    }
  };
}

// A double-submit token bound to the session. A request without a session
// cookie has no authority to forge and passes; one with a session must send
// the session's token in the X-XSRF-Token header, matching the xsrfToken
// cookie. Any request with a session whose cookie is missing or stale is handed
// the right one, so a client recovers after the cookie was cleared.
export const requireXsrfToken: RequestHandler = (req, res, next) => {
  const session: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof session !== 'string' || session === '') return next();

  const expected = xsrfTokenFor(session);
  const cookieToken: unknown = req.cookies.xsrfToken;
  if (!tokensEqual(cookieToken, expected)) setXsrfCookie(res, expected);

  if (SAFE_METHODS.has(req.method)) return next();

  const sent = req.get(XSRF_HEADER_NAME);
  if (
    sent === undefined ||
    sent !== cookieToken ||
    !tokensEqual(sent, expected)
  ) {
    return next(new ForbiddenError('Missing or invalid CSRF token'));
  }
  return next();
};
