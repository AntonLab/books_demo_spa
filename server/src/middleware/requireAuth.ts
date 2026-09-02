import type { RequestHandler } from 'express';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import { UnauthorizedError } from '../types/errors.ts';

export interface RequireAuthDeps {
  sessionRepository: SessionRepository;
  userRepository: UserRepository;
}

export function createRequireAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || token.length === 0) {
      next(new UnauthorizedError());
      return;
    }

    // Expiry is enforced by the repository's SQL, not re-checked here.
    const session = await deps.sessionRepository.findValidByTokenHash(
      hashToken(token)
    );
    if (!session) {
      next(new UnauthorizedError());
      return;
    }

    // A session can outlive its user only in the window before the CASCADE
    // commits; treat it as unauthenticated rather than throwing.
    const user = await deps.userRepository.findById(session.userId);
    if (!user) {
      next(new UnauthorizedError());
      return;
    }

    req.user = user;
    next();
  };
}
