import type { Request, RequestHandler, Response } from 'express';
import { createRateLimiter, type RateLimiter } from '../rateLimit.ts';
import { TooManyRequestsError } from '../types/errors.ts';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// The four sign-in budgets. A limit is not an Account state: nothing is
// written anywhere, and a limited Account is not Blocked.
export const AUTH_RATE_LIMITS = {
  // Failed logins for one login name from one address.
  loginByIpAndLogin: { limit: 10, windowMs: FIFTEEN_MINUTES_MS },
  // Failed logins from one address, whatever the name.
  loginByIp: { limit: 50, windowMs: FIFTEEN_MINUTES_MS },
  // Every registration request from one address.
  register: { limit: 5, windowMs: ONE_HOUR_MS },
  // Every password-reset request from one address.
  resetRequest: { limit: 5, windowMs: ONE_HOUR_MS },
} as const;

export interface AuthRateLimits {
  readonly loginByIpAndLogin: RateLimiter;
  readonly loginByIp: RateLimiter;
  readonly register: RateLimiter;
  readonly resetRequest: RateLimiter;
  // Stops every limiter's sweep; the graceful shutdown calls it.
  stop(): void;
}

// `now` is injectable so a spec moves time by hand.
export function createAuthRateLimits(now?: () => number): AuthRateLimits {
  const loginByIpAndLogin = createRateLimiter({
    ...AUTH_RATE_LIMITS.loginByIpAndLogin,
    now,
  });
  const loginByIp = createRateLimiter({ ...AUTH_RATE_LIMITS.loginByIp, now });
  const register = createRateLimiter({ ...AUTH_RATE_LIMITS.register, now });
  const resetRequest = createRateLimiter({
    ...AUTH_RATE_LIMITS.resetRequest,
    now,
  });

  return {
    loginByIpAndLogin,
    loginByIp,
    register,
    resetRequest,
    stop() {
      for (const limiter of [
        loginByIpAndLogin,
        loginByIp,
        register,
        resetRequest,
      ]) {
        limiter.stop();
      }
    },
  };
}

// The address a budget is kept against. req.ip follows TRUST_PROXY, so behind
// a trusted proxy it is the client the proxy names, not the proxy itself.
const addressOf = (req: Request): string => req.ip ?? 'unknown';

// The login a failed attempt counts against, trimmed and lower-cased so that
// a change of case or stray whitespace buys no fresh budget. The login column
// itself is case-sensitive (utf8mb4_0900_as_cs), so two accounts that differ
// only in case share one budget per address — the limit errs toward refusing.
// Read before validate runs, so anything but a string is the empty name.
function normalisedLogin(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'login' in body &&
    typeof body.login === 'string'
  ) {
    return body.login.trim().toLowerCase();
  }
  return '';
}

function refusal(res: Response, retryAfterMs: number): TooManyRequestsError {
  // Whole seconds, rounded up, so a client that waits exactly this long is
  // not refused again by the same window.
  res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
  return new TooManyRequestsError(retryAfterMs);
}

// Register and the reset request: every request counts, before validate, so
// malformed spam spends the budget too.
export function limitEveryRequest(limiter: RateLimiter): RequestHandler {
  return (req, res, next) => {
    const { allowed, retryAfterMs } = limiter.hit(addressOf(req));
    if (!allowed) {
      next(refusal(res, retryAfterMs));
      return;
    }
    next();
  };
}

// Login: only a failure counts, so the answer decides what is recorded. The
// budgets are peeked first — a request either one refuses never reaches
// validate, the lookup or argon2 — and written when the response finishes:
// a 401 against both, a 2xx by clearing this name's. The per-address budget
// survives a success, or signing in to one real account would buy fresh
// guesses at every other.
export function limitFailedLogins(
  limits: Pick<AuthRateLimits, 'loginByIpAndLogin' | 'loginByIp'>
): RequestHandler {
  return (req, res, next) => {
    const address = addressOf(req);
    const nameKey = JSON.stringify([address, normalisedLogin(req.body)]);
    const refused = [
      limits.loginByIpAndLogin.peek(nameKey),
      limits.loginByIp.peek(address),
    ].filter((state) => !state.allowed);

    if (refused.length > 0) {
      next(
        refusal(res, Math.max(...refused.map((state) => state.retryAfterMs)))
      );
      return;
    }

    res.on('finish', () => {
      if (res.statusCode === 401) {
        limits.loginByIpAndLogin.hit(nameKey);
        limits.loginByIp.hit(address);
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        limits.loginByIpAndLogin.reset(nameKey);
      }
    });
    next();
  };
}
