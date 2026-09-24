---
paths:
  - 'server/src/index.ts'
  - 'server/src/app.ts'
  - 'server/src/shutdown.ts'
  - 'server/src/expiryPurge.ts'
  - 'server/src/logger.ts'
  - 'server/src/middleware/securityHeaders.ts'
  - 'server/src/middleware/errorHandler.ts'
---

# Process and app operations

## Security headers

`createApp` disables `X-Powered-By` and sets `X-Content-Type-Options: nosniff`
as its first middleware, so errors, 404s and parse failures carry it too.
`createApp.spec.ts` checks `createApp`'s own app: Express 5 sets
`X-Powered-By` in `app.handle`, so a wrapping `express()` (the route test kit's
`withApp`) adds it back.

## Graceful shutdown (`shutdown.ts`)

- `SIGTERM`/`SIGINT` via `process.once`: stop every interval handed in
  (`stoppables`), close the server and idle connections, then
  `sequelize.close()`. `process.exitCode` is left alone.
- The other signal mid-shutdown joins the one under way. The same signal twice
  is a hard kill: `once` removed the listener, so Node's default is back.
- A 10 s deadline (`SHUTDOWN_TIMEOUT_MS`, `unref()`ed) drops open connections
  and exits 1, as does a pool that fails to close.
- `npm run dev` restarts with `SIGTERM`, so every dev restart takes this path.
  `shutdown.spec.ts` uses fakes, not real signals.

## Bind errors (`index.ts`)

A failed bind logs `Could not start the HTTP server`, never "listening";
`index.ts` sets `exitCode = 1` and runs the graceful shutdown so the pool
closes.

## Expiry purge (`expiryPurge.ts`)

Deletes expired sessions and reset tokens more than 30 days past expiry
(`RESET_TOKEN_RETENTION_MS`; the month keeps evidence of a reset request).
Once at boot after `syncPermissions()`, then hourly on an `unref()`ed interval
the shutdown stops. Logs only when it deleted something, and never rejects: a
database hiccup costs one pass, not the process.

## Error handler

A body over `express.json()`'s 102,400-byte limit is 413 and an unsupported
charset 415, both `{ error: 'Invalid request' }`. A `UniqueConstraintError` is a
bare 409.
