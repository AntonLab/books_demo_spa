---
paths:
  - 'server/src/middleware/**'
  - 'server/src/controllers/authController.ts'
  - 'server/src/routes/authRoutes.ts'
  - 'server/src/repositories/sessionRepository.ts'
  - 'server/src/repositories/passwordResetRepository.ts'
  - 'server/src/repositories/userRepository.ts'
  - 'server/src/sessionCookie.ts'
  - 'server/src/tokens.ts'
  - 'server/src/password.ts'
  - 'server/src/rateLimit.ts'
  - 'server/src/delivery/**'
---

# Sessions, sign-in, reset and CSRF

## Sessions

- `sid` is an opaque 32-byte base64url token: `httpOnly`, `sameSite: 'lax'`
  (so a reset link from a mail client arrives signed in), `secure` only in
  production, seven days. Set and cleared through one options object in
  `sessionCookie.ts`: a `clearCookie` with different options leaves the cookie.
- Session and reset tokens are stored as SHA-256 hashes, not argon2 (ADR-0001).
- Login always opens a new session row, which rules out session fixation.
- `resolveSessionUser` (`middleware/sessionUser.ts`) reports nobody for a
  missing cookie, unknown token, expired session, deleted user or blocked
  account: a guarded route answers 401, a public one serves a Guest.

## Login

- **One answer to two questions**: an unknown login and a wrong password give
  the same 401, and the unknown-login path spends an argon2 verify on a cached
  dummy hash so timing cannot tell them apart. `authController.spec.ts` drives
  the `verify` seam: a wall-clock assertion would flake, and an ESM binding
  cannot be spied on.
- A blocked account is checked **after** the password, or the 403 would confirm
  the account to someone without it.
- **A login in flight cannot outlive a block or a password change.** argon2 is
  slow enough for either to commit mid-verify, so `createIfCredentialCurrent`
  re-reads the account under `SELECT … FOR SHARE` in the session insert's
  transaction and inserts nothing unless the hash is unchanged and the account
  not blocked. `register` skips this: a new account has nothing in flight.

## Blocking and password changes

- Blocking ends the account's sessions in the same transaction, only on the
  transition into `blocked`. A block written straight into the table purges
  nothing; `resolveSessionUser` is the second layer that catches it.
- Blocking does not touch content: no query filters by the author's `status`.
  Hiding a blocked author's work is a separate Moderator action.
- A password change through `PATCH /api/users/:id` ends every session on the
  account, the caller's included, and clears the caller's own `sid`.

## Password reset

- A request always answers 202, or the endpoint would enumerate accounts. A new
  request invalidates the outstanding token. Tokens live one hour: a link sits
  in a mailbox.
- Confirmation stores the password, stamps the token used and revokes every
  session in one transaction. Unknown, expired and used tokens share one 400.
- A real mailer adds a second `RESET_DELIVERY` value and the switch in
  `index.ts` for it.

## CSRF (`middleware/csrfProtection.ts`)

Two layers ahead of every route; neither leans on `sameSite: 'lax'`. Reads pass.

- **`createCrossOriginProtection`**, after Go's `http.CrossOriginProtection`:
  an `Origin` equal to `APP_BASE_URL` passes (the client reaches the API through
  its dev proxy, under another Host); otherwise `Sec-Fetch-Site` must be
  `same-origin` or `none`; with no `Sec-Fetch-Site`, `Origin` must name the
  request's own host; with neither header it is not a browser and passes.
- **`requireXsrfToken`**: `xsrfToken` (not httpOnly) holds
  `HMAC-SHA256(session token, "xsrf")`; a write carrying `sid` must echo it in
  `X-XSRF-Token`. It is bound to the session, so a token planted by a sibling
  subdomain fails. No session, no token needed. A missing or stale token cookie
  is reissued.
- Route specs get the token from `routeTestKit.testkit.ts`; the refusals are
  covered in `csrfProtection.spec.ts`; `app.spec.ts` does the real handshake.

## Sign-in rate limiting (`middleware/authRateLimit.ts`)

In memory, fixed window, mounted before `validate` so a refusal costs no parse,
lookup or argon2. A limited Account is not Blocked.

| Route                                   | Key        | Limit         | Counts                     |
| --------------------------------------- | ---------- | ------------- | -------------------------- |
| `POST /api/auth/login`                  | IP + login | 10 per 15 min | failed or aborted attempts |
| `POST /api/auth/login`                  | IP         | 50 per 15 min | failed or aborted attempts |
| `POST /api/auth/register`               | IP         | 5 per hour    | every request              |
| `POST /api/auth/password-reset/request` | IP         | 5 per hour    | every request              |

- **Login claims both budgets on arrival** (`hit`), or parallel attempts would
  all read the same unspent count while argon2 runs. A refusal releases
  **both** claims, or refused attempts would keep extending their own lockout.
  A 401 or an abort keeps both: the handler still runs argon2 after the client
  leaves, so returning an abort's claims would buy unlimited argon2 work. A 400,
  403 or 2xx releases both, and a 2xx also clears the IP + login history. The
  per-IP budget survives a success, or one real account buys fresh guesses at
  every other.
- The login half of the key is trimmed, lower-cased and SHA-256 hashed, so case
  or whitespace buys no fresh budget and an unbounded `login` (this runs before
  `validate`) cannot leave an unbounded key in memory.
- Refusal is 429 with `Retry-After` in whole seconds and "Try again in N
  minutes." (singular at 1).
- Keyed on `req.ip`, so `TRUST_PROXY` matters behind a proxy. Each process keeps
  its own counts, and a restart forgets them.
- Test harnesses pass `unlimitedAuthRateLimits()`; only
  `authRateLimit.spec.ts` and the rate-limit cases in `authRoutes.spec.ts`
  use the real set.
