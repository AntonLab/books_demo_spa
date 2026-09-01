import type { Request, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ValidationError } from '../types/errors.ts';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      req.validated = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
      };
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ValidationError(error.issues));
        return;
      }
      next(error);
    }
  };

// The three accessors below are the only place a cast is needed: the schema
// that produced the value is chosen at the route, not knowable here.
export function validatedBody<T>(req: Request): T {
  return req.validated.body as T;
}

export function validatedQuery<T>(req: Request): T {
  return req.validated.query as T;
}

export function validatedParams<T>(req: Request): T {
  return req.validated.params as T;
}
