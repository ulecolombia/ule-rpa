/**
 * Express API Server with WebSocket Support
 * Main server for ULE RPA Service
 *
 * FASE 5.2: Integración de WebSocket para tiempo real
 */

import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { errorMiddleware } from './middleware/error';
import { initializeWebSocket, closeWebSocket, getWebSocketStats } from './websocket';
import { registerToken } from '../services/socket-tokens';
import rateLimit from 'express-rate-limit';
import { apiLimiter, taskCreationLimiter, webhookLimiter } from './middleware/rateLimit';

const healthLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many health checks' });

// Import routes
import tasksRouter from './routes/tasks';
import healthRouter from './routes/health';
import webhooksRouter from './routes/webhooks';
import adminRouter from './routes/admin';
import logsRouter from './routes/logs';
import soiRouter from './routes/soi';
import pagoRouter from './routes/pago';

const app = express();

// Middleware global
app.use(
  helmet({
    // Allow WebSocket connections
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", `ws://localhost:${config.port}`, `wss://rpa.ulecolombia.com`],
      },
    },
  })
);
app.use(
  cors({
    origin: [config.ule.apiUrl, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean),
    credentials: true,
  })
);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request ID + Logging middleware
app.use((req, res, next) => {
  // Skip logging for WebSocket polling
  if (req.path.includes('/socket.io/')) {
    return next();
  }

  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as any).requestId = requestId;

  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Rate limiting
app.use('/api', apiLimiter);
app.use('/api/tasks', taskCreationLimiter);
app.use('/api/webhooks', webhookLimiter);

// Token registration endpoint (ULE backend registers temp tokens for WebSocket auth)
app.post('/api/admin/auth/register-token', (req, res): void => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { token, userId, expiresAt, permissions } = req.body;
  if (!token || !userId) {
    res.status(400).json({ error: 'token and userId are required' });
    return;
  }

  registerToken({
    token,
    userId,
    expiresAt: expiresAt || Date.now() + 30 * 60 * 1000, // default 30 min
    permissions: permissions || [],
  });

  res.json({ success: true, message: 'Token registered' });
});

// Routes
app.use('/health', healthLimiter, healthRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/pago', pagoRouter);
app.use('/api/logs', logsRouter);
app.use('/api/soi', soiRouter);

// WebSocket stats endpoint
app.get('/api/ws/stats', (req, res): void => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.json(getWebSocketStats());
});

// Serve static files (uploaded comprobantes)
app.use('/files', express.static(config.storage.path));

// Error handling
app.use(errorMiddleware);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize WebSocket and create HTTP server
const httpServer = initializeWebSocket(app);

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`WebSocket enabled at ws://localhost:${PORT}/socket.io/`);

  // Enlace/PSE processors removed - only SOI is supported

  logger.info('All services initialized');
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, closing server...`);

  // Close WebSocket first
  await closeWebSocket();

  // Then close HTTP server
  httpServer.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
export { httpServer };
