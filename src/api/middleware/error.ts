/**
 * Error Handling Middleware
 * Catches and formats errors for API responses
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Request error', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.context && { context: err.context }),
    });
    return;
  }

  // Error desconocido
  res.status(500).json({
    error: 'Internal server error',
  });
}
