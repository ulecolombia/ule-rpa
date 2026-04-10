/**
 * Logs API Router
 * Endpoints for fetching and streaming task logs
 *
 * FASE 5.3: API de logs para dashboard
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication to all routes
router.use(authMiddleware);

// ============================================================================
// GET /api/logs/task/:taskId - Logs de una tarea específica
// ============================================================================

/**
 * Get logs for a specific task
 *
 * @route GET /api/logs/task/:taskId
 * @param taskId - Task ID
 * @query limit - Number of logs to return (default: 100, max: 500)
 * @query level - Filter by log level (DEBUG, INFO, WARN, ERROR)
 * @query since - Get logs after this timestamp (ISO string)
 *
 * @example
 * GET /api/logs/task/task-123?limit=50&level=ERROR
 */
router.get('/task/:taskId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 100, 500));
    const level = req.query.level as string;
    const since = req.query.since as string;

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        type: true,
        status: true,
        uleUserId: true,
        createdAt: true,
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Build where clause
    const where: any = { taskId };

    if (level) {
      where.level = level;
    }

    if (since) {
      where.timestamp = { gt: new Date(since) };
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    res.json({
      task: {
        id: task.id,
        type: task.type,
        status: task.status,
        userId: task.uleUserId,
      },
      count: logs.length,
      logs: logs.reverse(), // Return in chronological order
    });
  } catch (error) {
    logger.error('Error fetching task logs', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/logs/recent - Logs recientes de todas las tareas
// ============================================================================

/**
 * Get recent logs across all tasks
 *
 * @route GET /api/logs/recent
 * @query limit - Number of logs to return (default: 50, max: 200)
 * @query level - Filter by log level (DEBUG, INFO, WARN, ERROR)
 * @query type - Filter by task type (REGISTRO, LIQUIDACION, COMPROBANTE)
 * @query hours - Get logs from last N hours (default: 24)
 *
 * @example
 * GET /api/logs/recent?limit=100&level=ERROR&hours=12
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const level = req.query.level as string;
    const taskType = req.query.type as string;
    const hours = parseInt(req.query.hours as string) || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Build where clause
    const where: any = {
      timestamp: { gte: since },
    };

    if (level) {
      where.level = level;
    }

    if (taskType) {
      where.task = { type: taskType };
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        task: {
          select: {
            id: true,
            type: true,
            status: true,
            uleUserId: true,
          },
        },
      },
    });

    res.json({
      period: {
        hours,
        since: since.toISOString(),
      },
      filters: {
        level: level || null,
        type: taskType || null,
      },
      count: logs.length,
      logs,
    });
  } catch (error) {
    logger.error('Error fetching recent logs', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/logs/errors - Solo logs de error
// ============================================================================

/**
 * Get error logs with task context
 *
 * @route GET /api/logs/errors
 * @query limit - Number of logs (default: 50, max: 100)
 * @query hours - Get errors from last N hours (default: 24)
 * @query resolved - Include resolved tasks (default: false)
 *
 * @example
 * GET /api/logs/errors?hours=48&limit=100
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const hours = parseInt(req.query.hours as string) || 24;
    const includeResolved = req.query.resolved === 'true';

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const where: any = {
      level: 'ERROR',
      timestamp: { gte: since },
    };

    if (!includeResolved) {
      where.task = {
        status: { in: ['FAILED', 'PENDING', 'PROCESSING'] },
      };
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        task: {
          select: {
            id: true,
            type: true,
            status: true,
            uleUserId: true,
            error: true,
            attempts: true,
            createdAt: true,
            failedAt: true,
          },
        },
      },
    });

    // Group by task for summary
    const taskErrors = new Map<string, number>();
    logs.forEach((log) => {
      const count = taskErrors.get(log.taskId) || 0;
      taskErrors.set(log.taskId, count + 1);
    });

    res.json({
      period: {
        hours,
        since: since.toISOString(),
      },
      summary: {
        totalErrors: logs.length,
        uniqueTasks: taskErrors.size,
        taskErrorCounts: Object.fromEntries(taskErrors),
      },
      logs,
    });
  } catch (error) {
    logger.error('Error fetching error logs', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/logs/stream/:taskId - SSE stream para logs en tiempo real
// ============================================================================

/**
 * Stream logs for a task using Server-Sent Events
 *
 * @route GET /api/logs/stream/:taskId
 * @param taskId - Task ID to stream logs for
 *
 * Note: This endpoint uses SSE (Server-Sent Events) for real-time updates.
 * For full real-time support, use WebSocket instead.
 *
 * @example
 * const eventSource = new EventSource('/api/logs/stream/task-123');
 * eventSource.onmessage = (event) => {
 *   const log = JSON.parse(event.data);
 *   console.log(log);
 * };
 */
router.get('/stream/:taskId', async (req: Request, res: Response): Promise<void> => {
  const { taskId } = req.params;

  // Verify task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true },
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(
    `data: ${JSON.stringify({ type: 'connected', taskId, status: task.status })}\n\n`
  );

  // Track last log timestamp
  let lastTimestamp = new Date();

  // Poll for new logs every 2 seconds
  const interval = setInterval(async () => {
    try {
      const newLogs = await prisma.taskLog.findMany({
        where: {
          taskId,
          timestamp: { gt: lastTimestamp },
        },
        orderBy: { timestamp: 'asc' },
      });

      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify({ type: 'log', ...log })}\n\n`);
        lastTimestamp = log.timestamp;
      }

      // Check if task is completed/failed
      const currentTask = await prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true },
      });

      if (
        currentTask &&
        ['COMPLETED', 'FAILED', 'CANCELLED'].includes(currentTask.status)
      ) {
        res.write(
          `data: ${JSON.stringify({ type: 'task_ended', status: currentTask.status })}\n\n`
        );
        clearInterval(interval);
        res.end();
      }
    } catch (error) {
      logger.error('Error in log stream', { taskId, error });
    }
  }, 2000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    logger.debug('Log stream closed', { taskId });
  });
});

// ============================================================================
// GET /api/logs/stats - Estadísticas de logs
// ============================================================================

/**
 * Get log statistics
 *
 * @route GET /api/logs/stats
 * @query hours - Period to analyze (default: 24)
 *
 * @example
 * GET /api/logs/stats?hours=48
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Count by level
    const byLevel = await prisma.taskLog.groupBy({
      by: ['level'],
      _count: true,
      where: {
        timestamp: { gte: since },
      },
    });

    // Count by task type
    const byTaskType = await prisma.$queryRaw<
      Array<{ type: string; count: bigint }>
    >`
      SELECT t.type, COUNT(l.id) as count
      FROM "TaskLog" l
      JOIN "Task" t ON l."taskId" = t.id
      WHERE l.timestamp >= ${since}
      GROUP BY t.type
    `;

    // Error rate by hour
    const errorsByHour = await prisma.$queryRaw<
      Array<{ hour: Date; errors: bigint; total: bigint }>
    >`
      SELECT
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) FILTER (WHERE level = 'ERROR') as errors,
        COUNT(*) as total
      FROM "TaskLog"
      WHERE timestamp >= ${since}
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY hour DESC
    `;

    res.json({
      period: {
        hours,
        since: since.toISOString(),
      },
      byLevel: byLevel.reduce(
        (acc, item) => {
          acc[item.level] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byTaskType: byTaskType.map((item) => ({
        type: item.type,
        count: Number(item.count),
      })),
      errorsByHour: errorsByHour.map((item) => ({
        hour: item.hour,
        errors: Number(item.errors),
        total: Number(item.total),
        errorRate:
          Number(item.total) > 0
            ? ((Number(item.errors) / Number(item.total)) * 100).toFixed(1)
            : '0',
      })),
    });
  } catch (error) {
    logger.error('Error fetching log stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// DELETE /api/logs/cleanup - Limpiar logs antiguos
// ============================================================================

/**
 * Clean up old logs
 *
 * @route DELETE /api/logs/cleanup
 * @query days - Delete logs older than N days (default: 30, min: 7)
 *
 * @example
 * DELETE /api/logs/cleanup?days=30
 */
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    // Require explicit confirmation to prevent accidental deletions
    if (req.body?.confirm !== true) {
      res.status(400).json({ error: 'Confirmation required. Send { "confirm": true, "days": N } in body.' });
      return;
    }
    const days = Math.max(parseInt(req.body?.days || req.query.days as string) || 30, 7);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.taskLog.deleteMany({
      where: {
        timestamp: { lt: cutoff },
      },
    });

    logger.info('Logs cleanup completed', {
      deletedCount: result.count,
      olderThan: cutoff.toISOString(),
    });

    res.json({
      success: true,
      deleted: result.count,
      olderThan: cutoff.toISOString(),
    });
  } catch (error) {
    logger.error('Error cleaning up logs', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
