import type { RequestHandler } from 'express';
import { isModeratorRole } from 'shared';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';

// Runs after requireAuth, which sets req.user.
export function createRequireModerator(): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!isModeratorRole(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
