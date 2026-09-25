import { createHash } from 'node:crypto';
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

export function createAuthRateLimits(): AuthRateLimits {
  const limiters = {
    loginByIpAndLogin: createRateLimiter(AUTH_RATE_LIMITS.loginByIpAndLogin),
    loginByIp: createRateLimiter(AUTH_RATE_LIMITS.loginByIp),
    register: createRateLimiter(AUTH_RATE_LIMITS.register),
    resetRequest: createRateLimiter(AUTH_RATE_LIMITS.resetRequest),
  };

  return {
    ...limiters,
    stop() {
      for (const limiter of Object.values(limiters)) limiter.stop();
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

// The name half of the IP+login key, hashed (SHA-256, hex) rather than kept
// verbatim. loginSchema puts no cap on login, and this runs ahead of
// validate, so an unbounded body (express.json() allows up to 100 KB) would
// otherwise leave an unbounded key sitting in the limiter's map until the
// sweep drops it — a cheap way to grow retained memory without ever failing
// a single login. A fixed-size digest keeps the key's size constant whatever
// the client sends.
function loginNameKey(address: string, body: unknown): string {
  const digest = createHash('sha256')
    .update(normalisedLogin(body))
    .digest('hex');
  return JSON.stringify([address, digest]);
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

// Login: only a failure counts — a 401, or an abort (the connection closing
// before any answer goes out) — but both budgets are counted the moment the
// request arrives, before validate, the lookup or argon2 run — never on a
// later check-then-record path. A request is counted, provisionally, against
// both the instant it is seen; the reservation is given back only when an
// answer other than a 401 goes out. Counting up front is what closes the
// race a peek-then-record design leaves open: with the count written only
// when the response finishes, every request still waiting on argon2 reads
// the same unspent budget, so C requests fired at once cost only about one
// slot between them instead of C. Hitting first means each arrival claims
// its own slot as it is seen — Node runs one request's synchronous
// middleware to completion before starting the next's, so there is no window
// for two arrivals to read the same count.
export function limitFailedLogins(
  limits: Pick<AuthRateLimits, 'loginByIpAndLogin' | 'loginByIp'>
): RequestHandler {
  return (req, res, next) => {
    const address = addressOf(req);
    const nameKey = loginNameKey(address, req.body);

    const nameHit = limits.loginByIpAndLogin.hit(nameKey);
    const addressHit = limits.loginByIp.hit(address);
    const refused = [nameHit, addressHit].filter((state) => !state.allowed);

    if (refused.length > 0) {
      // A request refused here never reaches the handler, so it was never
      // really an attempt: both budgets give back the hit this hit added,
      // including the one that did not refuse it — hit() always increments,
      // even on the budget that refuses, so leaving that one un-released
      // would let a burst of refused attempts keep inflating the count that
      // refused them, locking the budget for longer than its own limit ever
      // earned.
      limits.loginByIpAndLogin.release(nameKey);
      limits.loginByIp.release(address);
      next(
        refusal(res, Math.max(...refused.map((state) => state.retryAfterMs)))
      );
      return;
    }

    // Settled exactly once, by whichever of 'finish' and 'close' comes
    // first. 'close' follows every 'finish'; one that comes first is an
    // abort, which never fires 'finish'.
    let settled = false;
    res.on('finish', () => {
      if (settled) return;
      settled = true;
      if (res.statusCode === 401) {
        // A genuine failure: both claims stay spent.
        return;
      }
      // Any other answer gives both claims back: of the answers, only a 401
      // is an attempt worth counting.
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
      // An abort keeps both claims spent, as a 401 does, and never earns
      // the success reset, even should a late 'finish' follow. The handler
      // goes on to run the lookup and argon2 after the client has gone, so
      // giving the claims back would let a client abort and repeat for
      // unlimited argon2 work per address without ever being refused.
      settled = true;
    });
    next();
  };
}
