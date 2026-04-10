/**
 * Temporary token store for WebSocket authentication.
 * ULE registers tokens via POST /api/admin/auth/register-token,
 * then clients connect to Socket.io with auth.token.
 */

import { logger } from '../utils/logger';

interface RegisteredToken {
  token: string;
  userId: string;
  expiresAt: number;
  permissions: string[];
}

const tokens = new Map<string, RegisteredToken>();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of tokens) {
    if (value.expiresAt < now) {
      tokens.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug(`[SocketTokens] Cleaned ${cleaned} expired tokens`);
  }
}, 5 * 60 * 1000);

/**
 * Register a temporary token for WebSocket auth.
 */
export function registerToken(data: {
  token: string;
  userId: string;
  expiresAt: number;
  permissions?: string[];
}): void {
  tokens.set(data.token, {
    token: data.token,
    userId: data.userId,
    expiresAt: data.expiresAt,
    permissions: data.permissions || [],
  });
  logger.info('[SocketTokens] Token registered', {
    userId: data.userId,
    expiresIn: Math.round((data.expiresAt - Date.now()) / 1000) + 's',
  });
}

/**
 * Validate a token. Returns the token data if valid, null otherwise.
 */
export function validateToken(token: string): RegisteredToken | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return entry;
}
