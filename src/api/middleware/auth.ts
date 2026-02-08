/**
 * Authentication Middleware
 * Validates API key from request headers
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
