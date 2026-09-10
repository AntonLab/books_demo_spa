import type { RequestHandler } from 'express';
import { resolveSessionUser, type RequireAuthDeps } from './sessionUser.ts';

// The counterpart to requireAuth for public reads that still want to know who
// is asking — a like button has to render "you liked this", and a 401 would
// break the page for every anonymous visitor. Nothing behind this middleware
// may rely on req.user being set.
export function createOptionalAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const user = await resolveSessionUser(deps, req);
    if (user) req.user = user;
    next();
  };
}
