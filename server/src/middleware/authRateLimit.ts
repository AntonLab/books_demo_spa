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

// Login: only a failure counts, but both budgets are counted the moment the
// request arrives, before validate, the lookup or argon2 run — never on a
// later check-then-record path. A request is counted, provisionally, against
// both the instant it is seen; the reservation is given back unless the
// answer turns out to be a 401. Counting up front is what closes the race a
// peek-then-record design leaves open: with the count written only when the
// response finishes, every request still waiting on argon2 reads the same
// unspent budget, so C requests fired at once cost only about one slot
// between them instead of C. Hitting first means each arrival claims its own
// slot as it is seen — Node runs one request's synchronous middleware to
// completion before starting the next's, so there is no window for two
// arrivals to read the same count.
export function limitFailedLogins(
  limits: Pick<AuthRateLimits, 'loginByIpAndLogin' | 'loginByIp'>
): RequestHandler {
  return (req, res, next) => {
    const address = addressOf(req);
    const nameKey = JSON.stringify([address, normalisedLogin(req.body)]);

    const nameHit = limits.loginByIpAndLogin.hit(nameKey);
    const addressHit = limits.loginByIp.hit(address);
    const refused = [nameHit, addressHit].filter((state) => !state.allowed);

    if (refused.length > 0) {
      // The other budget may have had room and already counted this
      // request: a request refused here never reaches the handler, so it
      // must not spend a budget it was never let through to try.
      if (nameHit.allowed) limits.loginByIpAndLogin.release(nameKey);
      if (addressHit.allowed) limits.loginByIp.release(address);
      next(
        refusal(res, Math.max(...refused.map((state) => state.retryAfterMs)))
      );
      return;
    }

    // Settled exactly once: on finish, or — if the connection closes first,
    // an abort that never fires 'finish' — on close instead, so a request
    // that never got an answer never leaves its claim spent either.
    let settled = false;
    res.on('finish', () => {
      if (settled) return;
      settled = true;
      if (res.statusCode === 401) {
        // A genuine failure: both claims stay spent.
        return;
      }
      // Anything else gives both claims back — only a 401 is an attempt
      // worth counting.
      limits.loginByIpAndLogin.release(nameKey);
      limits.loginByIp.release(address);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // A success also clears the rest of this name's own history, or
        // signing in to one real account would buy fresh guesses at every
        // other name sharing the address.
        limits.loginByIpAndLogin.reset(nameKey);
      }
    });
    res.on('close', () => {
      if (settled) return;
      settled = true;
      // No answer ever went out, so this proves nothing about the password:
      // give both claims back, never the success reset above.
      limits.loginByIpAndLogin.release(nameKey);
      limits.loginByIp.release(address);
    });
    next();
  };
}
