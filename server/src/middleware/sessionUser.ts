import type { Request } from 'express';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import { LAST_ONLINE_WINDOW_MS } from 'shared';
import type { AuthUser } from '../types/user.ts';

export interface RequireAuthDeps {
  sessionRepository: SessionRepository;
  userRepository: UserRepository;
}

// The cookie-to-user lookup shared by every auth middleware. It reports
// "nobody" for every failure — missing cookie, unknown token, expired
// session, deleted user, blocked account — because each of its two callers
// (requireAuth, requirePermission) draws its own conclusion
// from that answer and none of them needs to know which of the five
// happened. Its one side effect: it stamps the resolved user's lastSeenAt when
// the stored value is stale (the repository's WHERE still guards races).
export async function resolveSessionUser(
  deps: RequireAuthDeps,
  req: Request
): Promise<AuthUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== 'string' || token.length === 0) return null;

  // Expiry is enforced by the repository's SQL, not re-checked here.
  const session = await deps.sessionRepository.findValidByTokenHash(
    hashToken(token)
  );
  if (!session) return null;

  const record = await deps.userRepository.findForAuth(session.userId);

  // A second layer, not the fix. Blocking deletes an account's sessions, and
  // login re-checks the status under a lock before it opens one (see
  // sessionRepository.createIfCredentialCurrent), so a block normally leaves
  // nothing behind for this to catch. It still catches a block written
  // straight into the table, which purges nothing. A session can also
  // outlive its user in the window before the CASCADE commits; that is the
  // null case.
  if (!record || record.status === 'blocked') return null;

  const { lastSeenAt, ...user } = record;
  // Awaited and not caught: a database that cannot take this write cannot
  // serve the request either, and an unawaited write would outlive a test's
  // connection.
  if (
    !lastSeenAt ||
    lastSeenAt.getTime() < Date.now() - LAST_ONLINE_WINDOW_MS
  ) {
    await deps.userRepository.touchLastSeen(session.userId, new Date());
  }
  return user;
}
