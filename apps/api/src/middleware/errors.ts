import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, 'bad_request', details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'Not permitted') => new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');
export const conflict = (message: string) => new HttpError(409, message, 'conflict');
/** Raised when a plan limit would be exceeded; the client shows an upgrade prompt. */
export const paymentRequired = (message: string, details?: unknown) =>
  new HttpError(402, message, 'plan_limit_reached', details);

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncRoute<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as T, res, next).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'validation_failed', message: 'Request validation failed', details: error.issues },
    });
    return;
  }

  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }

  // Duplicate key: surface as a conflict rather than a 500.
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  ) {
    res.status(409).json({
      error: { code: 'conflict', message: 'A record with that unique value already exists' },
    });
    return;
  }

  logger.error({ err: error }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}
