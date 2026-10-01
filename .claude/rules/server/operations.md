---
paths:
  - 'server/src/index.ts'
  - 'server/src/app.ts'
  - 'server/src/shutdown.ts'
  - 'server/src/expiryPurge.ts'
  - 'server/src/announcements/**'
  - 'server/src/online/**'
  - 'server/src/logger.ts'
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
It also deletes Notifications read more than `NOTIFICATION_READ_TTL_MS` (one
minute) ago; the list already hides them, so the purge only reclaims rows.
Once at boot after `syncPermissions()`, then hourly on an `unref()`ed interval
the shutdown stops. Logs only when it deleted something, and never rejects: a
database hiccup costs one pass, not the process.

## Announcement pass (`announcements/announcementPass.ts`)

- Once at boot, then every minute on an `unref()`ed interval the shutdown
  stops; a tick while a pass still runs is skipped. One server instance only
  (ADR-0013).
- `announcementRepository.announce(now)` claims and writes everything in one
  transaction: Chapters out while their Book is a Draft are marked silently,
  released Books become New books, due Chapters become New chapters. Selection
  is "`announcedAt IS NULL`", never a time window; the claim is a `FOR UPDATE`
  read plus `UPDATE … WHERE announcedAt IS NULL`.
- Every `announcedAt` write is `silent: true`. Without it the claim would move
  `chapters.updatedAt`, and a Co-author's next save of that Chapter would
  answer 409.
- Stream pushes and mail happen only after the commit. A failed email is
  logged (`Announcement mail failed`, with the `userId`) and not retried.
- Shutdown does not wait for a pass already in flight: it stops the interval,
  not the tick. A recipient not yet mailed when the process exits loses that
  email, with no retry — the row is already claimed (`announcedAt` set), so
  the next pass will not send it again either.

## Online registry (`online/onlineRegistry.ts`)

- An Account is Online while `GET /api/notifications/stream` (SSE) holds a
  connection for it. The registry is in-process memory; a second instance
  would not see it.
- Every 30 s, and before each announcement pass looks at it, the registry
  checks each stream's session through `findLiveSessions`. It closes a stream
  whose session expired, was deleted, or belongs to a Blocked Account; the
  rest get a `: ping` comment that keeps proxies from timing it out.
- A session that ends elsewhere — a password reset, a block, expiry — does not
  close its stream on the spot: the stream closes at the next revalidation,
  within 30 s.
- The shutdown stops the registry before `server.close()`, which would
  otherwise wait on every open stream.

## Error handler

A body over `express.json()`'s 102,400-byte limit is 413 and an unsupported
charset 415, both `{ error: 'Invalid request' }`. A `UniqueConstraintError` is a
bare 409.
