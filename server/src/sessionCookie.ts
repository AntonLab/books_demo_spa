import type { CookieOptions, Response } from 'express';
import { xsrfTokenFor } from './tokens.ts';

export const SESSION_COOKIE_NAME = 'sid';

// Seven days, matching the session row's expiresAt. The two are set from the
// same constant so a cookie can never outlive the row it names.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function options(): CookieOptions {
  return {
    httpOnly: true,
    // lax rather than strict: following the reset link from a mail client must
    // not arrive session-less.
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  };
}

// The session's XSRF token travels in a cookie a script can read — the client
// echoes it into the X-XSRF-Token header on every write — so it is not
// httpOnly, unlike the session it is derived from. It is worthless without
// that session. See middleware/csrfProtection.ts.
export const XSRF_COOKIE = 'xsrfToken';

function xsrfOptions(): CookieOptions {
  return { ...options(), httpOnly: false };
}

export function setXsrfCookie(res: Response, token: string): void {
  res.cookie(XSRF_COOKIE, token, { ...xsrfOptions(), maxAge: SESSION_TTL_MS });
}

// Opening a session hands the client the session's XSRF token at the same time,
// so its first write after signing in already carries it.
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...options(),
    maxAge: SESSION_TTL_MS,
  });
  setXsrfCookie(res, xsrfTokenFor(token));
}

// The options must match those used to set it, or the browser keeps the
// original cookie alongside the cleared one.
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, options());
  res.clearCookie(XSRF_COOKIE, xsrfOptions());
}
