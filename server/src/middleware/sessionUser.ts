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

// The cookie-to-user lookup both auth middlewares share. It reports "nobody"
// for every failure — missing cookie, unknown token, expired session, deleted
// user — because the two callers want opposite things from that answer and
// neither needs to know which of the four happened.
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

  // A session can outlive its user only in the window before the CASCADE
  // commits; treat it as unauthenticated rather than throwing.
  return await deps.userRepository.findById(session.userId);
}
