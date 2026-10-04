import type { RequestHandler } from 'express';
import { isModeratorRole } from 'shared';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';

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
