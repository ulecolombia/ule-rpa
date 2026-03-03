/**
 * Admin Authentication Middleware
 * Enhanced authentication for admin dashboard endpoints
 *
 * Features:
 * - API Key validation
 * - Admin secret validation (double auth)
 * - Request logging for audit
 * - IP allowlist (optional)
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';

/**
 * Extended Request with admin info
 */
export interface AdminRequest extends Request {
  admin?: {
    authenticated: boolean;
    ip: string;
    timestamp: Date;
  };
}

/**
 * Admin authentication middleware
 *
 * Validates:
 * 1. x-api-key header (same as regular API)
 * 2. x-admin-secret header (additional admin secret)
 *
 * Environment variables:
 * - API_KEY: Regular API key
 * - ADMIN_SECRET: Additional secret for admin access
 * - ADMIN_IP_ALLOWLIST: Comma-separated IPs (optional)
 */
export function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string;
  const adminSecret = req.headers['x-admin-secret'] as string;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // Log admin access attempt
  logger.info('Admin access attempt', {
    path: req.path,
    method: req.method,
    ip: clientIp,
    hasApiKey: !!apiKey,
    hasAdminSecret: !!adminSecret,
  });

  // 1. Validate API key
  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn('Admin auth failed: Invalid API key', { ip: clientIp });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
    });
    return;
  }

  // 2. Validate admin secret (if configured)
  const configuredAdminSecret = process.env.ADMIN_SECRET;

  if (configuredAdminSecret) {
    if (!adminSecret || adminSecret !== configuredAdminSecret) {
      logger.warn('Admin auth failed: Invalid admin secret', { ip: clientIp });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing admin secret',
      });
      return;
    }
  }

  // 3. IP Allowlist check (if configured)
  const ipAllowlist = process.env.ADMIN_IP_ALLOWLIST;

  if (ipAllowlist) {
    const allowedIps = ipAllowlist.split(',').map((ip) => ip.trim());

    // Check if client IP matches allowlist
    const isAllowed = allowedIps.some(
      (allowed) => clientIp === allowed || clientIp.includes(allowed)
    );

    if (!isAllowed) {
      logger.warn('Admin auth failed: IP not in allowlist', {
        ip: clientIp,
        allowlist: allowedIps,
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied from this IP address',
      });
      return;
    }
  }

  // 4. Attach admin info to request
  req.admin = {
    authenticated: true,
    ip: clientIp,
    timestamp: new Date(),
  };

  // 5. Log successful auth
  logger.info('Admin auth successful', {
    ip: clientIp,
    path: req.path,
  });

  next();
}

/**
 * Read-only admin middleware
 * Only allows GET requests for monitoring/viewing
 */
export function adminReadOnlyMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  // First, apply regular admin auth
  adminAuthMiddleware(req, res, () => {
    // Then check method
    if (req.method !== 'GET') {
      logger.warn('Read-only admin attempted write operation', {
        ip: req.admin?.ip,
        method: req.method,
        path: req.path,
      });
      res.status(405).json({
        error: 'Method not allowed',
        message: 'This endpoint only allows read operations',
      });
      return;
    }
    next();
  });
}

/**
 * Admin action audit logger
 * Logs all admin actions for compliance/debugging
 */
export function adminAuditMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  // Capture original end function
  const originalEnd = res.end;

  // Override end to log response
  res.end = function (chunk?: any, encoding?: any) {
    logger.info('Admin action completed', {
      ip: req.admin?.ip,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      timestamp: new Date().toISOString(),
    });

    // Call original end
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}
