/**
 * Express API Server
 * Main server for ULE RPA Service
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { errorMiddleware } from './middleware/error';
// import { apiLimiter } from './middleware/rateLimit'; // Uncomment to enable rate limiting

// Import routes
import tasksRouter from './routes/tasks';
import healthRouter from './routes/health';
import webhooksRouter from './routes/webhooks';

const app = express();

// Middleware global
app.use(helmet());
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

// Serve static files (uploaded comprobantes)
app.use('/files', express.static(config.storage.path));

// Error handling
app.use(errorMiddleware);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = config.port;
const server = app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server...');
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
});

export default app;
