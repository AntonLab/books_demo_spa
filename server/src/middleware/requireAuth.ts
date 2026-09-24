import type { RequestHandler } from 'express';
import { resolveSessionUser, type RequireAuthDeps } from './sessionUser.ts';
import { UnauthorizedError } from '../types/errors.ts';

export function createRequireAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    // The five ways this can fail are all one answer here: no user, so 401.
    const user = await resolveSessionUser(deps, req);
    if (!user) {
      next(new UnauthorizedError());
      return;
    }

    req.user = user;
    next();
  };
}
