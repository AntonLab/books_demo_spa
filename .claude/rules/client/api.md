---
paths:
  - 'client/src/api/**'
---

# `src/api/`

- `client.ts`'s `request<T>()` prefixes `/api`, sends
  `credentials: 'include'` and turns non-2xx into a typed `ApiError`. Keep
  `include` even though `/api` is same-origin today: fetch's default
  `same-origin` would silently drop the httpOnly `sid` the day the API moves
  to another origin. `client.test.ts` pins it. Only `src/queries/` calls these
  functions.
- **`body` is an object, not a string**: `request()` stringifies it and sets
  `Content-Type` itself. A JSON string would be double-encoded.
- **A `Blob` body (a `File`: Covers, Avatars) is sent as-is**, with the blob's
  own type as `Content-Type` and no stringify. `client.test.ts` pins both
  paths.
- **Every write echoes the CSRF token**: `request()` reads the `xsrfToken`
  cookie and sends it as `X-XSRF-Token` on any method but `GET`. The server
  answers 403 to a write carrying a session without it.
- `updateChapter` sends `expectedUpdatedAt`, the version the edit started from;
  the server answers 409 if the chapter changed since.
- **Each module has its own test pinning the request contract**, because every
  other test mocks the module: method, exact URL and query encoding, JSON body
  (none on a GET), `X-XSRF-Token` on writes only, and how a success and a
  typical error come back. These tests alone stub `window.fetch`, against
  `src/test/httpFixtures.ts`. A new API function gets a case there, or nothing
  checks what it sends.
