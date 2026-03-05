/**
 * Express API Server with WebSocket Support
 * Main server for ULE RPA Service
 *
 * FASE 5.2: Integración de WebSocket para tiempo real
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { errorMiddleware } from './middleware/error';
import { initializeWebSocket, closeWebSocket, getWebSocketStats } from './websocket';
// Enlace/PSE modules removed - only SOI is supported now
// import { apiLimiter } from './middleware/rateLimit'; // Uncomment to enable rate limiting

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
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  })
);
app.use(
  cors({
    origin: config.ule.apiUrl,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, _res, next) => {
  // Skip logging for WebSocket polling
  if (req.path.includes('/socket.io/')) {
    return next();
  }

  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Rate limiting (opcional - descomentar para habilitar)
// app.use('/api', apiLimiter);

// Routes
app.use('/health', healthRouter);
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
