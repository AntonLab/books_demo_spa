import type { ErrorRequestHandler } from 'express';
import { UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';
import { AppError } from '../types/errors.ts';
import { logger } from '../logger.ts';

/**
 * body-parser (and other Express-ecosystem middleware) signal a client
 * fault — a truncated/malformed JSON body, a body over the size limit, an
 * unsupported charset, ... — by attaching a numeric `statusCode` (or, on
 * some errors, `status`) in the 4xx range. Neither property exists on
 * arbitrary thrown values, so this reads them back defensively rather than
 * assuming the shape.
 */
function clientFaultStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { statusCode, status } = error as {
    statusCode?: unknown;
    status?: unknown;
  };
  const code = typeof statusCode === 'number' ? statusCode : status;
  return typeof code === 'number' && code >= 400 && code < 500
    ? code
    : undefined;
}

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

  // Client faults surfaced by body-parser et al. Some of these (a malformed
  // JSON body, `entity.parse.failed`) attach the raw request body — which can
  // hold a plaintext password — as an own property of the error, so this
  // branch must never log the error object or echo it back in the response.
  const status = clientFaultStatus(error);
  if (status !== undefined) {
    res.status(status).json({ error: 'Invalid request' });
    return;
  }

  // Log only name/message/stack, never the error object itself: a
  // SequelizeDatabaseError (and its .parent/.original) carry `sql` and
  // `parameters`, which can hold sensitive bound values such as a password hash.
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error('Unhandled error', { name, message, stack });
  res.status(500).json({ error: 'Internal Server Error' });
};
