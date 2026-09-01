import type { ErrorRequestHandler } from 'express';
import { UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';
import { AppError } from '../types/errors.ts';
import { logger } from '../logger.ts';

// Express 5 requires exactly four parameters here. With three it is treated as
// ordinary middleware and error handling silently stops working, so `_next`
// stays despite being unused.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: 'Request validation failed', details: error.issues });
    return;
  }

  // Backstop only — the repository already maps this to a ConflictError.
  if (error instanceof UniqueConstraintError) {
    res.status(409).json({ error: 'Conflict' });
    return;
  }

  logger.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal Server Error' });
};
