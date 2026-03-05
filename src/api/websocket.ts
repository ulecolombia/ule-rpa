/**
 * WebSocket Server for Real-time Updates
 * FASE 5.2: WebSocket para tiempo real
 *
 * Emits events to connected admin clients:
 * - task:updated - Task status changed
 * - task:completed - Task completed successfully
 * - task:failed - Task failed
 * - task:created - New task created
 * - log:new - New log entry
 * - metric:updated - Metric value changed
 * - queue:updated - Queue status changed
 * - planilla:updated - Planilla status changed
 */

import { Server, Socket, DisconnectReason } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { createServer, Server as HttpServer } from 'http';
import express from 'express';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { getQueueStats } from '../orchestrator/queue.config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Socket.io server instance
let io: Server | null = null;

// Connected clients count
let connectedClients = 0;

// Metrics update interval
let metricsInterval: NodeJS.Timeout | null = null;

/**
 * Initialize WebSocket server
 *
 * @param app - Express application
 * @returns HTTP server with WebSocket support
 *
 * @example
 * const httpServer = initializeWebSocket(app);
 * httpServer.listen(3001, () => console.log('Server with WS running'));
 */
export function initializeWebSocket(app: express.Application): HttpServer {
  const httpServer = createServer(app);

  // Allow both production and development origins
  const allowedOrigins = [
    config.ule.apiUrl,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for WebSocket
  io.use((socket: Socket, next: (err?: ExtendedError) => void) => {
    const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['x-api-key'];

    if (!apiKey || apiKey !== config.apiKey) {
      logger.warn('WebSocket auth failed', {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error('Unauthorized'));
    }

    logger.debug('WebSocket auth successful', { socketId: socket.id });
    next();
  });

  // Handle connections
  io.on('connection', (socket: Socket) => {
    connectedClients++;

    logger.info('Admin client connected', {
      socketId: socket.id,
      ip: socket.handshake.address,
      totalClients: connectedClients,
    });

    // Send initial connection confirmation
    socket.emit('connected', {
      message: 'Connected to RPA service',
      timestamp: new Date().toISOString(),
      socketId: socket.id,
    });

    // Handle subscription to specific task updates
    socket.on('subscribe:task', (taskId: string) => {
      socket.join(`task:${taskId}`);
      logger.debug('Client subscribed to task', { socketId: socket.id, taskId });
    });

    // Handle unsubscription
    socket.on('unsubscribe:task', (taskId: string) => {
      socket.leave(`task:${taskId}`);
      logger.debug('Client unsubscribed from task', { socketId: socket.id, taskId });
    });

    // Handle request for current stats
    socket.on('request:stats', async () => {
      try {
        const stats = await getQueueStats();
        socket.emit('stats:current', {
          queue: stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error sending stats', { error });
      }
    });

    // Handle request for active tasks
    socket.on('request:activeTasks', async () => {
      try {
        const tasks = await prisma.task.findMany({
          where: {
            status: { in: ['PENDING', 'PROCESSING', 'AWAITING'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        socket.emit('activeTasks:current', {
          tasks,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error sending active tasks', { error });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason: DisconnectReason) => {
      connectedClients--;

      logger.info('Admin client disconnected', {
        socketId: socket.id,
        reason,
        totalClients: connectedClients,
      });
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error('WebSocket error', { socketId: socket.id, error });
    });
  });

  // Start metrics broadcast interval (every 30 seconds if clients connected)
  startMetricsBroadcast();

  logger.info('WebSocket server initialized', {
    path: '/socket.io/',
    cors: allowedOrigins,
  });

  return httpServer;
}

/**
 * Start periodic metrics broadcast
 * Only broadcasts if there are connected clients
 */
function startMetricsBroadcast(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }

  metricsInterval = setInterval(async () => {
    if (connectedClients > 0 && io) {
      try {
        const stats = await getQueueStats();

        io.emit('metrics:broadcast', {
          queue: stats,
          connectedClients,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error broadcasting metrics', { error });
      }
    }
  }, 30000); // Every 30 seconds
}

/**
 * Stop metrics broadcast
 */
export function stopMetricsBroadcast(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// ============================================================================
// EVENT EMITTERS
// ============================================================================

/**
 * Emit task created event
 *
 * @param taskId - Task ID
 * @param data - Task data
 *
 * @example
 * emitTaskCreated('task-123', {
 *   type: 'REGISTRO',
 *   userId: 'user-456',
 *   priority: 5
 * });
 */
export function emitTaskCreated(taskId: string, data: {
  type: string;
  userId: string;
  priority?: number;
}): void {
  if (!io) return;

  const event = {
    taskId,
    ...data,
    timestamp: new Date().toISOString(),
  };

  io.emit('task:created', event);
  logger.debug('Emitted task:created', { taskId });
}

/**
 * Emit task updated event
 *
 * @param taskId - Task ID
 * @param data - Update data
 *
 * @example
 * emitTaskUpdate('task-123', {
 *   status: 'PROCESSING',
 *   progress: 50
 * });
 */
export function emitTaskUpdate(taskId: string, data: {
  status: string;
  type?: string;
  userId?: string;
  progress?: number;
  message?: string;
}): void {
  if (!io) return;

  const event = {
    taskId,
    ...data,
    timestamp: new Date().toISOString(),
  };

  // Emit to all clients
  io.emit('task:updated', event);

  // Also emit to room for clients subscribed to this task
  io.to(`task:${taskId}`).emit('task:detail', event);

  logger.debug('Emitted task:updated', { taskId, status: data.status });
}

/**
 * Emit task completed event
 *
 * @param taskId - Task ID
 * @param data - Completion data
 *
 * @example
 * emitTaskCompleted('task-123', {
 *   type: 'REGISTRO',
 *   result: { enlaceUserId: '12345' },
 *   duration: 45000
 * });
 */
export function emitTaskCompleted(taskId: string, data: {
  type: string;
  result?: Record<string, unknown>;
  duration?: number;
  userId?: string;
}): void {
  if (!io) return;

  const event = {
    taskId,
    status: 'COMPLETED',
    ...data,
    timestamp: new Date().toISOString(),
  };

  io.emit('task:completed', event);
  io.to(`task:${taskId}`).emit('task:detail', event);

  logger.debug('Emitted task:completed', { taskId, duration: data.duration });
}

/**
 * Emit task failed event
 *
 * @param taskId - Task ID
 * @param error - Error message
 * @param details - Additional details
 *
 * @example
 * emitTaskFailed('task-123', 'Connection timeout', { attempt: 3 });
 */
export function emitTaskFailed(taskId: string, error: string, details?: {
  type?: string;
  userId?: string;
  attempts?: number;
  willRetry?: boolean;
}): void {
  if (!io) return;

  const event = {
    taskId,
    status: 'FAILED',
    error,
    ...details,
    timestamp: new Date().toISOString(),
  };

  io.emit('task:failed', event);
  io.to(`task:${taskId}`).emit('task:detail', event);

  logger.debug('Emitted task:failed', { taskId, error });
}

/**
 * Emit new log entry
 *
 * @param taskId - Task ID
 * @param log - Log entry
 *
 * @example
 * emitLog('task-123', {
 *   level: 'INFO',
 *   message: 'Starting registration',
 *   details: { documento: '123456' }
 * });
 */
export function emitLog(taskId: string, log: {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
}): void {
  if (!io) return;

  const event = {
    taskId,
    ...log,
    timestamp: new Date().toISOString(),
  };

  // Only emit to clients subscribed to this task
  io.to(`task:${taskId}`).emit('log:new', event);

  // Also emit to global log stream (for admin dashboard)
  if (log.level === 'ERROR' || log.level === 'WARN') {
    io.emit('log:important', event);
  }
}

/**
 * Emit metric update
 *
 * @param metric - Metric name
 * @param value - New value
 *
 * @example
 * emitMetricUpdate('tasksCompleted', 150);
 * emitMetricUpdate('queueSize', { waiting: 5, active: 2 });
 */
export function emitMetricUpdate(metric: string, value: unknown): void {
  if (!io) return;

  const event = {
    metric,
    value,
    timestamp: new Date().toISOString(),
  };

  io.emit('metric:updated', event);
}

/**
 * Emit queue status update
 *
 * @param stats - Queue statistics
 *
 * @example
 * emitQueueUpdate({ waiting: 10, active: 3, completed: 500 });
 */
export function emitQueueUpdate(stats: {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed?: number;
}): void {
  if (!io) return;

  const event = {
    ...stats,
    timestamp: new Date().toISOString(),
  };

  io.emit('queue:updated', event);
}

/**
 * Emit planilla status update
 *
 * @param planillaId - Planilla ID
 * @param data - Update data
 *
 * @example
 * emitPlanillaUpdate('planilla-123', {
 *   numeroPlanilla: '999888777',
 *   estadoPago: 'PAGADA',
 *   hasComprobante: true
 * });
 */
export function emitPlanillaUpdate(planillaId: string, data: {
  numeroPlanilla: string;
  estadoPago: string;
  hasComprobante?: boolean;
  userId?: string;
}): void {
  if (!io) return;

  const event = {
    planillaId,
    ...data,
    timestamp: new Date().toISOString(),
  };

  io.emit('planilla:updated', event);
}

/**
 * Emit comprobante ready event
 *
 * @param data - Comprobante data
 *
 * @example
 * emitComprobanteReady({
 *   planillaId: 'planilla-123',
 *   numeroPlanilla: '999888777',
 *   fileUrl: 'https://storage.example.com/...',
 *   userId: 'user-456'
 * });
 */
export function emitComprobanteReady(data: {
  planillaId: string;
  numeroPlanilla: string;
  fileUrl: string;
  userId: string;
}): void {
  if (!io) return;

  const event = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  io.emit('comprobante:ready', event);
}

/**
 * Get current connection stats
 */
export function getWebSocketStats(): {
  connected: boolean;
  clients: number;
  rooms: number;
} {
  if (!io) {
    return { connected: false, clients: 0, rooms: 0 };
  }

  return {
    connected: true,
    clients: connectedClients,
    rooms: io.sockets.adapter.rooms.size,
  };
}

/**
 * Broadcast message to all connected clients
 *
 * @param event - Event name
 * @param data - Event data
 */
export function broadcast(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Close WebSocket server
 */
export async function closeWebSocket(): Promise<void> {
  stopMetricsBroadcast();

  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
    io = null;
  }
}

// ============================================================================
// EVENTOS PSE - FASE 6.3
// ============================================================================

/**
 * Emitir alerta: se necesita código dinámico
 *
 * @param data - Session and payment data
 *
 * @example
 * emitPseCodeRequired({
 *   sessionId: 'pse_planilla123_1234567890',
 *   planillaId: 'planilla-123',
 *   numeroPlanilla: 'PL999888777',
 *   valorTotal: 580000,
 *   expiresAt: new Date(Date.now() + 60000),
 *   taskId: 'task-456'
 * });
 */
export function emitPseCodeRequired(data: {
  sessionId: string;
  planillaId: string;
  numeroPlanilla: string;
  valorTotal: number;
  expiresAt: Date;
  taskId: string;
}): void {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot emit PSE code required');
    return;
  }

  const payload = {
    ...data,
    timestamp: new Date().toISOString(),
    urgency: 'HIGH',
    timeout: 60, // segundos
    expiresAt: data.expiresAt.toISOString(),
  };

  logger.info('Emitting PSE code required alert', {
    sessionId: data.sessionId,
    numeroPlanilla: data.numeroPlanilla,
  });

  // Broadcast a todos los clientes conectados
  io.emit('pse:code-required', payload);
}

/**
 * Emitir: código recibido, procesando pago
 *
 * @param data - Session data
 */
export function emitPseCodeReceived(data: {
  sessionId: string;
  planillaId: string;
}): void {
  if (!io) return;

  logger.info('Emitting PSE code received', {
    sessionId: data.sessionId,
  });

  io.emit('pse:code-received', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emitir: pago completado o fallido
 *
 * @param data - Payment result data
 */
export function emitPsePaymentCompleted(data: {
  sessionId: string;
  planillaId: string;
  success: boolean;
  error?: string;
}): void {
  if (!io) return;

  logger.info('Emitting PSE payment completed', {
    sessionId: data.sessionId,
    success: data.success,
  });

  io.emit('pse:payment-completed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emitir: sesión expiró por timeout
 *
 * @param data - Session data
 */
export function emitPseTimeout(data: {
  sessionId: string;
  planillaId: string;
}): void {
  if (!io) return;

  logger.warn('Emitting PSE timeout', {
    sessionId: data.sessionId,
  });

  io.emit('pse:timeout', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// FASE 6: PAGO ADMIN-CONTROLLED EVENTS
// ============================================

/**
 * Emitir evento genérico a todos los clientes conectados
 * Usado por el worker de pago admin-controlled
 *
 * @param event - Nombre del evento
 * @param data - Datos del evento
 */
export function emitToAll(event: string, data: unknown): void {
  if (!io) return;

  logger.debug('Emitting event to all clients', {
    event,
    clientsCount: connectedClients,
  });

  io.emit(event, {
    ...(typeof data === 'object' && data !== null ? data : { data }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emitir evento de pago admin: inicio
 */
export function emitPagoAdminStarted(data: {
  sessionId: string;
  planillaId: string;
  status: string;
  adminId: string;
}): void {
  emitToAll('pago-admin:started', data);
}

/**
 * Emitir evento de pago admin: progreso
 */
export function emitPagoAdminProgress(data: {
  sessionId: string;
  status: string;
  message: string;
  progress: number;
}): void {
  emitToAll('pago-admin:progress', data);
}

/**
 * Emitir evento de pago admin: esperando input del admin
 */
export function emitPagoAdminAwaitingInput(data: {
  sessionId: string;
  planillaId: string;
  numeroPlanilla: string;
  valorTotal: number;
  screenshotUrl: string;
  timeoutMinutes: number;
  timeoutAt: Date;
  message: string;
}): void {
  logger.info('Emitting pago-admin:awaiting-input', {
    sessionId: data.sessionId,
    planillaId: data.planillaId,
  });
  emitToAll('pago-admin:awaiting-input', data);
}

/**
 * Emitir evento de pago admin: completado
 */
export function emitPagoAdminCompleted(data: {
  sessionId: string;
  planillaId: string;
  success: boolean;
  transactionId?: string | null;
  comprobanteUrl?: string;
  message: string;
}): void {
  logger.info('Emitting pago-admin:completed', {
    sessionId: data.sessionId,
    success: data.success,
  });
  emitToAll('pago-admin:completed', data);
}

/**
 * Emitir evento de pago admin: fallido
 */
export function emitPagoAdminFailed(data: {
  sessionId: string;
  planillaId: string;
  error: string;
  canRetry: boolean;
  failedAt: string;
}): void {
  logger.warn('Emitting pago-admin:failed', {
    sessionId: data.sessionId,
    error: data.error,
  });
  emitToAll('pago-admin:failed', data);
}

/**
 * Emitir evento de pago admin: timeout
 */
export function emitPagoAdminTimeout(data: {
  sessionId: string;
  planillaId: string;
  message: string;
  inactiveMinutes: number;
}): void {
  logger.warn('Emitting pago-admin:timeout', {
    sessionId: data.sessionId,
  });
  emitToAll('pago-admin:timeout', data);
}

// ============================================
// FASE 3: ALERTAS ADMIN
// ============================================

/**
 * Emitir alerta a administradores
 */
export function emitAdminAlert(alert: {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}): void {
  if (!io) return;

  logger.info('Emitting admin alert', {
    alertId: alert.id,
    type: alert.type,
    severity: alert.severity,
  });

  io.emit('alert:new', {
    ...alert,
    timestamp: alert.timestamp.toISOString(),
  });
}

// Export io instance for advanced use cases
export { io };
