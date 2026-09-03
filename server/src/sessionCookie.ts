import type { CookieOptions, Response } from 'express';

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

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...options(),
    maxAge: SESSION_TTL_MS,
  });
}

// The options must match those used to set it, or the browser keeps the
// original cookie alongside the cleared one.
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, options());
}
