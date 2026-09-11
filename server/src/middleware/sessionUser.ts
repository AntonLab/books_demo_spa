import type { Request } from 'express';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import type { PublicUser } from '../types/user.ts';

export interface RequireAuthDeps {
  sessionRepository: SessionRepository;
  userRepository: UserRepository;
}

// The cookie-to-user lookup shared by every auth middleware. It reports
// "nobody" for every failure — missing cookie, unknown token, expired
// session, deleted user, blocked account — because each of its three callers
// (requireAuth, requirePermission, optionalAuth) draws its own conclusion
// from that answer and none of them needs to know which of the five
// happened.
export async function resolveSessionUser(
  deps: RequireAuthDeps,
  req: Request
): Promise<PublicUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== 'string' || token.length === 0) return null;

  // Expiry is enforced by the repository's SQL, not re-checked here.
  const session = await deps.sessionRepository.findValidByTokenHash(
    hashToken(token)
  );
  if (!session) return null;

  const user = await deps.userRepository.findById(session.userId);

  // Blocking deletes an account's sessions, but a login that read `active`
  // just before the block can still create one after the purge. Treating a
  // blocked account's session as no session closes that window for as long
  // as the block lasts. A session can also outlive its user in the window
  // before the CASCADE commits; that is the null case.
  return user?.status === 'blocked' ? null : user;
}
