import type { RequestHandler } from 'express';
import { resolveSessionUser, type RequireAuthDeps } from './sessionUser.ts';
import { UnauthorizedError } from '../types/errors.ts';

// Re-exported so the route factories keep importing it from here: every one of
// them takes a RequireAuthDeps-shaped object and this is where they have always
// found the type.
export type { RequireAuthDeps };

export function createRequireAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    // The four ways this can fail are all one answer here: no user, so 401.
    // optionalAuth shares the lookup and draws the opposite conclusion.
    const user = await resolveSessionUser(deps, req);
    if (!user) {
      next(new UnauthorizedError());
      return;
    }

    req.user = user;
    next();
  };
}
