/**
 * Admin Dashboard Routes
 * FASE 5.1: Dashboard Principal con Métricas
 *
 * Endpoints for RPA administration and monitoring:
 * - Dashboard metrics
 * - Task management
 * - Planilla monitoring
 * - Queue statistics
 * - System health
 *
 * All routes require admin authentication (x-api-key + x-admin-secret)
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  adminAuthMiddleware,
  adminAuditMiddleware,
  AdminRequest,
} from '../middleware/adminAuth';
import { getQueueStats, taskQueue, deadLetterQueue } from '../../orchestrator/queue.config';
import {
  runReconciliation,
  getReconciliationStats,
  reconcileUser,
} from '../../orchestrator/reconciliation';
import {
  getAlerts,
  getActiveAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  getAlertsSummary,
  AlertSeverity,
  AlertType,
} from '../../services/alert.service';
import { logger } from '../../utils/logger';
import { decryptPassword, encryptPassword } from '../../utils/crypto';

const router = Router();
const prisma = new PrismaClient();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);
router.use(adminAuditMiddleware);

// ============================================================================
// DASHBOARD PRINCIPAL
// ============================================================================

/**
 * GET /api/admin/dashboard
 *
 * Métricas principales del dashboard
 *
 * Response:
 * {
 *   tasks: { today, thisMonth, byStatus, byType, successRate, recentFailures },
 *   users: { total, newToday },
 *   planillas: { pendientes, pagadasMes, totalPagadoHoy, totalPagadoMes },
 *   queue: { waiting, active, completed, failed, delayed },
 *   failures: [ ... last 10 failures ... ],
 *   system: { uptime, memory, lastCheck }
 * }
 */
router.get('/dashboard', async (_req: AdminRequest, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ========================================
    // Estadísticas de tareas (paralelo)
    // ========================================
    const [
      tasksToday,
      tasksThisMonth,
      tasksByStatus,
      tasksByType,
      recentFailures,
    ] = await Promise.all([
      // Tareas hoy
      prisma.task.count({
        where: { createdAt: { gte: today } },
      }),

      // Tareas este mes
      prisma.task.count({
        where: { createdAt: { gte: thisMonth } },
      }),

      // Por estado
      prisma.task.groupBy({
        by: ['status'],
        _count: true,
        where: {
          createdAt: { gte: thisMonth },
        },
      }),

      // Por tipo
      prisma.task.groupBy({
        by: ['type'],
        _count: true,
        where: {
          createdAt: { gte: thisMonth },
        },
      }),

      // Fallos recientes (últimas 24h)
      prisma.task.findMany({
        where: {
          status: 'FAILED',
          createdAt: { gte: last24h },
        },
        orderBy: { failedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          error: true,
          failedAt: true,
          uleUserId: true,
        },
      }),

    ]);

    // ========================================
    // Estadísticas de usuarios
    // ========================================
    const [totalUsers, newUsersToday, usersByStatus] = await Promise.all([
      prisma.enlaceUser.count({
        where: { enlaceStatus: 'REGISTERED' },
      }),

      prisma.enlaceUser.count({
        where: {
          enlaceStatus: 'REGISTERED',
          registeredAt: { gte: today },
        },
      }),

      prisma.enlaceUser.groupBy({
        by: ['enlaceStatus'],
        _count: true,
      }),
    ]);

    // ========================================
    // Estadísticas de planillas
    // ========================================
    const [
      planillasPendientes,
      planillasEnProceso,
      planillasPagadasMes,
      planillasVencidas,
      totalPagadoHoy,
      totalPagadoMes,
    ] = await Promise.all([
      prisma.pilaPlanilla.count({
        where: { estadoPago: 'PENDIENTE' },
      }),

      prisma.pilaPlanilla.count({
        where: { estadoPago: 'EN_PROCESO' },
      }),

      prisma.pilaPlanilla.count({
        where: {
          estadoPago: 'PAGADA',
          fechaPago: { gte: thisMonth },
        },
      }),

      prisma.pilaPlanilla.count({
        where: {
          estadoPago: 'PENDIENTE',
          fechaLimite: { lt: now },
        },
      }),

      prisma.pilaPlanilla.aggregate({
        where: {
          estadoPago: 'PAGADA',
          fechaPago: { gte: today },
        },
        _sum: { total: true },
        _count: true,
      }),

      prisma.pilaPlanilla.aggregate({
        where: {
          estadoPago: 'PAGADA',
          fechaPago: { gte: thisMonth },
        },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    // ========================================
    // Estado de la cola
    // ========================================
    const queueStats = await getQueueStats();

    // ========================================
    // Calcular métricas derivadas
    // ========================================
    const totalCompleted =
      tasksByStatus.find((s) => s.status === 'COMPLETED')?._count || 0;
    const totalFailed = tasksByStatus.find((s) => s.status === 'FAILED')?._count || 0;
    const successRate =
      totalCompleted + totalFailed > 0
        ? (totalCompleted / (totalCompleted + totalFailed)) * 100
        : 100;

    // Formatear respuesta
    const statusMap: Record<string, number> = {};
    tasksByStatus.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    const typeMap: Record<string, number> = {};
    tasksByType.forEach((t) => {
      typeMap[t.type] = t._count;
    });

    const userStatusMap: Record<string, number> = {};
    usersByStatus.forEach((u) => {
      userStatusMap[u.enlaceStatus || 'UNKNOWN'] = u._count;
    });

    // System info
    const memUsage = process.memoryUsage();

    res.json({
      timestamp: new Date().toISOString(),

      tasks: {
        today: tasksToday,
        thisMonth: tasksThisMonth,
        byStatus: statusMap,
        byType: typeMap,
        successRate: parseFloat(successRate.toFixed(1)),
        recentFailuresCount: recentFailures.length,
      },

      users: {
        total: totalUsers,
        newToday: newUsersToday,
        byStatus: userStatusMap,
      },

      planillas: {
        pendientes: planillasPendientes,
        enProceso: planillasEnProceso,
        pagadasMes: planillasPagadasMes,
        vencidas: planillasVencidas,
        totalPagadoHoy: totalPagadoHoy._sum.total || 0,
        totalPagadoMes: totalPagadoMes._sum.total || 0,
        countPagadasHoy: totalPagadoHoy._count || 0,
      },

      queue: {
        ...queueStats,
        health: queueStats.waiting < 100 ? 'healthy' : 'backlog',
      },

      failures: recentFailures,

      system: {
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard metrics', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// TAREAS
// ============================================================================

/**
 * GET /api/admin/tasks/recent
 *
 * Lista las tareas más recientes
 *
 * Query params:
 * - limit: número de tareas (default: 20, max: 100)
 * - status: filtrar por estado
 * - type: filtrar por tipo
 */
router.get('/tasks/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string;
    const type = req.query.type as string;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 3,
        },
      },
    });

    res.json({
      count: tasks.length,
      tasks: tasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        uleUserId: task.uleUserId,
        priority: task.priority,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        failedAt: task.failedAt,
        error: task.error,
        duration: calculateDuration(task),
        recentLogs: task.logs,
      })),
    });
  } catch (error) {
    logger.error('Error fetching recent tasks', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tasks/active
 *
 * Lista las tareas actualmente en progreso
 */
router.get('/tasks/active', async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING', 'AWAITING'],
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
    });

    res.json({
      count: tasks.length,
      tasks: tasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        uleUserId: task.uleUserId,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        waitingTime: task.startedAt
          ? null
          : Math.round((Date.now() - task.createdAt.getTime()) / 1000),
        processingTime: task.startedAt
          ? Math.round((Date.now() - task.startedAt.getTime()) / 1000)
          : null,
        recentLogs: task.logs,
      })),
    });
  } catch (error) {
    logger.error('Error fetching active tasks', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tasks/:id
 *
 * Detalle completo de una tarea
 */
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({
      task: {
        ...task,
        duration: calculateDuration(task),
      },
    });
  } catch (error) {
    logger.error('Error fetching task detail', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tasks/:id/retry
 *
 * Reintentar una tarea fallida
 */
router.post('/tasks/:id/retry', async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.status !== 'FAILED') {
      res.status(400).json({
        error: 'Cannot retry',
        message: 'Only failed tasks can be retried',
      });
      return;
    }

    // Reset task status
    await prisma.task.update({
      where: { id },
      data: {
        status: 'PENDING',
        error: null,
        failedAt: null,
        startedAt: null,
        completedAt: null,
      },
    });

    // Add log entry
    await prisma.taskLog.create({
      data: {
        taskId: id,
        level: 'INFO',
        message: `Task retried by admin from ${req.admin?.ip}`,
      },
    });

    // Re-add to queue
    const inputData = task.inputData as any;
    await taskQueue.add(task.type.toLowerCase(), {
      ...inputData,
      taskId: id,
      type: task.type,
      uleUserId: task.uleUserId,
    });

    logger.info('Task retried by admin', {
      taskId: id,
      adminIp: req.admin?.ip,
    });

    res.json({
      success: true,
      message: 'Task queued for retry',
      taskId: id,
    });
  } catch (error) {
    logger.error('Error retrying task', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tasks/:id/cancel
 *
 * Cancelar una tarea pendiente
 */
router.post('/tasks/:id/cancel', async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (!['PENDING', 'WAITING'].includes(task.status)) {
      res.status(400).json({
        error: 'Cannot cancel',
        message: 'Only pending or waiting tasks can be cancelled',
      });
      return;
    }

    // Update task status
    await prisma.task.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        error: `Cancelled by admin from ${req.admin?.ip}`,
        failedAt: new Date(),
      },
    });

    // Add log entry
    await prisma.taskLog.create({
      data: {
        taskId: id,
        level: 'WARN',
        message: `Task cancelled by admin from ${req.admin?.ip}`,
      },
    });

    // Try to remove from queue
    const job = await taskQueue.getJob(id);
    if (job) {
      await job.remove();
    }

    logger.info('Task cancelled by admin', {
      taskId: id,
      adminIp: req.admin?.ip,
    });

    res.json({
      success: true,
      message: 'Task cancelled',
      taskId: id,
    });
  } catch (error) {
    logger.error('Error cancelling task', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// PLANILLAS
// ============================================================================

/**
 * GET /api/admin/planillas/pending
 *
 * Lista planillas pendientes de pago, ordenadas por fecha límite
 */
router.get('/planillas/pending', async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const planillas = await prisma.pilaPlanilla.findMany({
      where: {
        estadoPago: {
          in: ['PENDIENTE', 'EN_PROCESO'],
        },
      },
      orderBy: { fechaLimite: 'asc' },
      include: {
        enlaceUser: {
          select: {
            nombre: true,
            numeroDocumento: true,
            tipoDocumento: true,
          },
        },
      },
    });

    res.json({
      count: planillas.length,
      planillas: planillas.map((p) => ({
        id: p.id,
        numeroPlanilla: p.numeroPlanilla,
        periodo: p.periodo,
        total: p.total,
        estadoPago: p.estadoPago,
        fechaLimite: p.fechaLimite,
        fechaLiquidacion: p.fechaLiquidacion,
        diasRestantes: p.fechaLimite
          ? Math.ceil((p.fechaLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null,
        vencida: p.fechaLimite ? p.fechaLimite < now : false,
        usuario: p.enlaceUser,
      })),
    });
  } catch (error) {
    logger.error('Error fetching pending planillas', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/planillas/expiring
 *
 * Lista planillas que vencen pronto (próximos 3 días)
 */
router.get('/planillas/expiring', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const planillas = await prisma.pilaPlanilla.findMany({
      where: {
        estadoPago: 'PENDIENTE',
        fechaLimite: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      orderBy: { fechaLimite: 'asc' },
      include: {
        enlaceUser: {
          select: {
            nombre: true,
            numeroDocumento: true,
          },
        },
      },
    });

    res.json({
      count: planillas.length,
      urgent: planillas.length,
      planillas,
    });
  } catch (error) {
    logger.error('Error fetching expiring planillas', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ESTADÍSTICAS Y REPORTES
// ============================================================================

/**
 * GET /api/admin/stats/timeline
 *
 * Estadísticas por día (últimos N días)
 *
 * Query params:
 * - days: número de días (default: 30, max: 90)
 */
router.get('/stats/timeline', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Obtener tareas agrupadas por día y estado
    const tasksByDay = await prisma.$queryRaw<
      Array<{ date: Date; status: string; count: bigint }>
    >`
      SELECT
        DATE("createdAt") as date,
        status,
        COUNT(*) as count
      FROM "Task"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt"), status
      ORDER BY date DESC
    `;

    // Obtener planillas pagadas por día
    const planillasByDay = await prisma.$queryRaw<
      Array<{ date: Date; count: bigint; total: number }>
    >`
      SELECT
        DATE("fechaPago") as date,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total
      FROM "PilaPlanilla"
      WHERE "fechaPago" >= ${startDate}
        AND "estadoPago" = 'PAGADA'
      GROUP BY DATE("fechaPago")
      ORDER BY date DESC
    `;

    // Obtener usuarios registrados por día
    const usersByDay = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT
        DATE("registeredAt") as date,
        COUNT(*) as count
      FROM "EnlaceUser"
      WHERE "registeredAt" >= ${startDate}
        AND "enlaceStatus" = 'REGISTERED'
      GROUP BY DATE("registeredAt")
      ORDER BY date DESC
    `;

    res.json({
      days,
      startDate,
      tasks: tasksByDay.map((t) => ({
        date: t.date,
        status: t.status,
        count: Number(t.count),
      })),
      planillas: planillasByDay.map((p) => ({
        date: p.date,
        count: Number(p.count),
        total: Number(p.total),
      })),
      users: usersByDay.map((u) => ({
        date: u.date,
        count: Number(u.count),
      })),
    });
  } catch (error) {
    logger.error('Error fetching timeline stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/performance
 *
 * Métricas de rendimiento del RPA
 */
router.get('/stats/performance', async (_req: Request, res: Response) => {
  try {
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Tiempos promedio por tipo de tarea
    const avgByType = await prisma.$queryRaw<
      Array<{ type: string; avgSeconds: number; count: bigint }>
    >`
      SELECT
        type,
        AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as "avgSeconds",
        COUNT(*) as count
      FROM "Task"
      WHERE status = 'COMPLETED'
        AND "completedAt" IS NOT NULL
        AND "startedAt" IS NOT NULL
        AND "createdAt" >= ${last7d}
      GROUP BY type
    `;

    // Tasa de éxito por tipo
    const successRateByType = await prisma.$queryRaw<
      Array<{ type: string; completed: bigint; failed: bigint }>
    >`
      SELECT
        type,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed
      FROM "Task"
      WHERE "createdAt" >= ${last7d}
        AND status IN ('COMPLETED', 'FAILED')
      GROUP BY type
    `;

    // Errores más comunes
    const commonErrors = await prisma.$queryRaw<
      Array<{ error: string; count: bigint }>
    >`
      SELECT
        SUBSTRING(error FROM 1 FOR 100) as error,
        COUNT(*) as count
      FROM "Task"
      WHERE status = 'FAILED'
        AND error IS NOT NULL
        AND "createdAt" >= ${last7d}
      GROUP BY SUBSTRING(error FROM 1 FOR 100)
      ORDER BY count DESC
      LIMIT 10
    `;

    res.json({
      period: '7 days',
      avgProcessingTime: avgByType.map((a) => ({
        type: a.type,
        avgSeconds: Math.round(Number(a.avgSeconds) || 0),
        count: Number(a.count),
      })),
      successRate: successRateByType.map((s) => ({
        type: s.type,
        completed: Number(s.completed),
        failed: Number(s.failed),
        rate:
          Number(s.completed) + Number(s.failed) > 0
            ? ((Number(s.completed) / (Number(s.completed) + Number(s.failed))) * 100).toFixed(1)
            : '100',
      })),
      commonErrors: commonErrors.map((e) => ({
        error: e.error,
        count: Number(e.count),
      })),
    });
  } catch (error) {
    logger.error('Error fetching performance stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// COLA Y SISTEMA
// ============================================================================

/**
 * GET /api/admin/queue/status
 *
 * Estado detallado de la cola BullMQ
 */
router.get('/queue/status', async (_req: Request, res: Response) => {
  try {
    const [
      queueStats,
      waitingJobs,
      activeJobs,
      delayedJobs,
      dlqJobs,
    ] = await Promise.all([
      getQueueStats(),
      taskQueue.getJobs(['waiting'], 0, 10),
      taskQueue.getJobs(['active'], 0, 10),
      taskQueue.getJobs(['delayed'], 0, 10),
      deadLetterQueue.getJobs(['completed', 'waiting'], 0, 10),
    ]);

    res.json({
      stats: queueStats,
      waiting: waitingJobs.map((j) => ({
        id: j.id,
        name: j.name,
        data: { type: j.data.type, userId: j.data.uleUserId },
        timestamp: j.timestamp,
        priority: j.opts.priority,
      })),
      active: activeJobs.map((j) => ({
        id: j.id,
        name: j.name,
        data: { type: j.data.type, userId: j.data.uleUserId },
        processedOn: j.processedOn,
        attemptsMade: j.attemptsMade,
      })),
      delayed: delayedJobs.map((j) => ({
        id: j.id,
        name: j.name,
        delay: j.opts.delay,
        timestamp: j.timestamp,
      })),
      deadLetter: {
        count: dlqJobs.length,
        jobs: dlqJobs.slice(0, 5).map((j) => ({
          id: j.id,
          originalJobId: j.data.originalJobId,
          reason: j.data.failedReason,
          timestamp: j.data.timestamp,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching queue status', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/queue/pause
 *
 * Pausar la cola (no procesa nuevos jobs)
 */
router.post('/queue/pause', async (req: AdminRequest, res: Response) => {
  try {
    await taskQueue.pause();

    logger.warn('Queue paused by admin', { ip: req.admin?.ip });

    res.json({
      success: true,
      message: 'Queue paused',
      paused: true,
    });
  } catch (error) {
    logger.error('Error pausing queue', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/queue/resume
 *
 * Reanudar la cola
 */
router.post('/queue/resume', async (req: AdminRequest, res: Response) => {
  try {
    await taskQueue.resume();

    logger.info('Queue resumed by admin', { ip: req.admin?.ip });

    res.json({
      success: true,
      message: 'Queue resumed',
      paused: false,
    });
  } catch (error) {
    logger.error('Error resuming queue', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/queue/clean
 *
 * Limpiar jobs completados/fallidos de la cola
 *
 * Body:
 * - type: 'completed' | 'failed' | 'all'
 * - grace: tiempo en ms (default: 24h)
 */
router.post('/queue/clean', async (req: AdminRequest, res: Response) => {
  try {
    const { type = 'all', grace = 24 * 60 * 60 * 1000 } = req.body;

    let cleaned = { completed: 0, failed: 0 };

    if (type === 'completed' || type === 'all') {
      const completedCleaned = await taskQueue.clean(grace, 1000, 'completed');
      cleaned.completed = completedCleaned.length;
    }

    if (type === 'failed' || type === 'all') {
      const failedCleaned = await taskQueue.clean(grace, 1000, 'failed');
      cleaned.failed = failedCleaned.length;
    }

    logger.info('Queue cleaned by admin', {
      ip: req.admin?.ip,
      cleaned,
    });

    res.json({
      success: true,
      message: 'Queue cleaned',
      cleaned,
    });
  } catch (error) {
    logger.error('Error cleaning queue', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/system/health
 *
 * Health check detallado del sistema
 */
router.get('/system/health', async (_req: Request, res: Response) => {
  try {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy', latency: Date.now() - dbStart };
    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Redis/Queue check
    const queueStart = Date.now();
    try {
      await getQueueStats();
      checks.queue = { status: 'healthy', latency: Date.now() - queueStart };
    } catch (error) {
      checks.queue = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Overall status
    const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error) {
    logger.error('Error in health check', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/admin/logs/recent
 *
 * Logs recientes de tareas
 *
 * Query params:
 * - limit: número de logs (default: 100)
 * - level: filtrar por nivel (INFO, WARN, ERROR)
 * - taskId: filtrar por tarea
 */
router.get('/logs/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const level = req.query.level as string;
    const taskId = req.query.taskId as string;

    const where: any = {};

    if (level) {
      where.level = level;
    }

    if (taskId) {
      where.taskId = taskId;
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        task: {
          select: {
            type: true,
            status: true,
          },
        },
      },
    });

    res.json({
      count: logs.length,
      logs,
    });
  } catch (error) {
    logger.error('Error fetching logs', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ERRORES
// ============================================================================

/**
 * GET /api/admin/errors/recent
 * Obtener errores recientes del sistema
 */
router.get('/errors/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    // Tareas fallidas recientes
    const failedTasks = await prisma.task.findMany({
      where: {
        status: 'FAILED',
      },
      include: {
        logs: {
          where: {
            level: 'ERROR',
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
    });

    // Sesiones PSE fallidas
    const failedSessions = await prisma.pseSession.findMany({
      where: {
        status: {
          in: ['FAILED', 'TIMEOUT'],
        },
      },
      include: {
        planilla: {
          select: {
            numeroPlanilla: true,
            periodo: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
    });

    res.json({
      success: true,
      failedTasks: failedTasks.map((task) => ({
        id: task.id,
        type: task.type,
        error: task.error,
        uleUserId: task.uleUserId,
        completedAt: task.completedAt,
        lastErrorLog: task.logs[0] || null,
      })),
      failedSessions: failedSessions.map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        planillaId: session.planillaId,
        numeroPlanilla: session.planilla?.numeroPlanilla,
        periodo: session.planilla?.periodo,
        completedAt: session.completedAt,
      })),
    });
  } catch (error) {
    logger.error('Error getting recent errors', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// ALERTAS (FASE 3)
// ============================================================================

/**
 * GET /api/admin/alerts
 *
 * Obtener historial de alertas
 *
 * Query params:
 * - severity: filtrar por severidad (CRITICAL, HIGH, MEDIUM, LOW)
 * - type: filtrar por tipo
 * - acknowledged: filtrar por reconocidas (true/false)
 * - limit: número máximo de alertas (default: 50)
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const severity = req.query.severity as AlertSeverity | undefined;
    const type = req.query.type as AlertType | undefined;
    const acknowledged = req.query.acknowledged
      ? req.query.acknowledged === 'true'
      : undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const alerts = getAlerts({ severity, type, acknowledged, limit });

    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    logger.error('Error fetching alerts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/alerts/active
 *
 * Obtener alertas activas (no reconocidas)
 */
router.get('/alerts/active', async (_req: Request, res: Response) => {
  try {
    const alerts = getActiveAlerts();

    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    logger.error('Error fetching active alerts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/alerts/summary
 *
 * Obtener resumen de alertas
 */
router.get('/alerts/summary', async (_req: Request, res: Response) => {
  try {
    const summary = getAlertsSummary();

    res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    logger.error('Error fetching alerts summary', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/alerts/:id/acknowledge
 *
 * Reconocer una alerta
 */
router.post('/alerts/:id/acknowledge', async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const acknowledgedBy = req.admin?.ip || 'unknown';

    const success = acknowledgeAlert(id, acknowledgedBy);

    if (!success) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Alert acknowledged',
      alertId: id,
    });
  } catch (error) {
    logger.error('Error acknowledging alert', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/alerts/acknowledge-all
 *
 * Reconocer todas las alertas
 */
router.post('/alerts/acknowledge-all', async (req: AdminRequest, res: Response) => {
  try {
    const acknowledgedBy = req.admin?.ip || 'unknown';

    const count = acknowledgeAllAlerts(acknowledgedBy);

    res.json({
      success: true,
      message: `${count} alerts acknowledged`,
      count,
    });
  } catch (error) {
    logger.error('Error acknowledging all alerts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// RECONCILIACIÓN (FASE 2)
// ============================================================================

/**
 * GET /api/admin/reconciliation/stats
 *
 * Estadísticas de usuarios en estados problemáticos
 */
router.get('/reconciliation/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getReconciliationStats();

    res.json({
      success: true,
      stats,
      needsAttention:
        stats.pendingCreation +
          stats.creating +
          stats.registering +
          stats.staleProcessingTasks +
          stats.expiredPendingPlanillas >
        0,
    });
  } catch (error) {
    logger.error('Error fetching reconciliation stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/reconciliation/run
 *
 * Ejecutar job de reconciliación manualmente
 */
router.post('/reconciliation/run', async (req: AdminRequest, res: Response) => {
  try {
    logger.info('Manual reconciliation triggered by admin', { ip: req.admin?.ip });

    const result = await runReconciliation();

    res.json({
      success: true,
      message: 'Reconciliation completed',
      result,
    });
  } catch (error) {
    logger.error('Error running reconciliation', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/reconciliation/user/:uleUserId
 *
 * Reconciliar un usuario específico
 */
router.post('/reconciliation/user/:uleUserId', async (req: AdminRequest, res: Response) => {
  try {
    const { uleUserId } = req.params;

    logger.info('Manual user reconciliation by admin', {
      uleUserId,
      ip: req.admin?.ip,
    });

    const result = await reconcileUser(uleUserId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error('Error reconciling user', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/stuck
 *
 * Lista usuarios en estados problemáticos
 */
router.get('/users/stuck', async (_req: Request, res: Response) => {
  try {
    const [pendingCreation, creating, registering, credentialsError] = await Promise.all([
      prisma.enlaceUser.findMany({
        where: { soiAccountStatus: 'PENDING_CREATION' },
        select: {
          id: true,
          uleUserId: true,
          numeroDocumento: true,
          nombre: true,
          operador: true,
          soiAccountStatus: true,
          updatedAt: true,
        },
        take: 50,
      }),
      prisma.enlaceUser.findMany({
        where: { soiAccountStatus: 'CREATING' },
        select: {
          id: true,
          uleUserId: true,
          numeroDocumento: true,
          nombre: true,
          operador: true,
          soiAccountStatus: true,
          updatedAt: true,
        },
        take: 50,
      }),
      prisma.enlaceUser.findMany({
        where: { enlaceStatus: 'REGISTERING' },
        select: {
          id: true,
          uleUserId: true,
          numeroDocumento: true,
          nombre: true,
          operador: true,
          enlaceStatus: true,
          updatedAt: true,
        },
        take: 50,
      }),
      prisma.enlaceUser.findMany({
        where: { soiAccountStatus: 'CREDENTIALS_ERROR' },
        select: {
          id: true,
          uleUserId: true,
          numeroDocumento: true,
          nombre: true,
          operador: true,
          soiAccountStatus: true,
          updatedAt: true,
        },
        take: 50,
      }),
    ]);

    res.json({
      success: true,
      users: {
        pendingCreation,
        creating,
        registering,
        credentialsError,
      },
      totals: {
        pendingCreation: pendingCreation.length,
        creating: creating.length,
        registering: registering.length,
        credentialsError: credentialsError.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching stuck users', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// OPERACIONES MANUALES DE EMERGENCIA
// ============================================================================

/**
 * GET /api/admin/emergency/user/:uleUserId
 *
 * Obtener TODA la información de un usuario incluyendo credenciales desencriptadas
 * ⚠️ SOLO PARA EMERGENCIAS - Cuando el RPA falla y necesitas hacer operaciones manuales
 *
 * Devuelve:
 * - Datos del usuario
 * - Credenciales SOI (desencriptadas)
 * - Credenciales Mi Planilla (desencriptadas)
 * - Planillas pendientes
 * - URLs de los portales
 */
router.get('/emergency/user/:uleUserId', async (req: AdminRequest, res: Response) => {
  try {
    const { uleUserId } = req.params;

    logger.warn('EMERGENCY: Admin accessing user credentials', {
      uleUserId,
      adminIp: req.admin?.ip,
    });

    const user = await prisma.enlaceUser.findUnique({
      where: { uleUserId },
      include: {
        planillas: {
          where: {
            estadoPago: {
              in: ['PENDIENTE', 'EN_PROCESO'],
            },
          },
          orderBy: { fechaLimite: 'asc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    // Check credential availability (do NOT decrypt or return passwords)
    const hasSoiCredentials = !!(user.soiPassword && user.soiPasswordIV);
    const hasMiPlanillaCredentials = !!(user.miplanillaPassword && user.miplanillaPasswordIV);

    res.json({
      success: true,

      usuario: {
        uleUserId: user.uleUserId,
        tipoDocumento: user.tipoDocumento,
        numeroDocumento: user.numeroDocumento,
        nombre: user.nombre,
        apellidos: user.apellidos,
        email: user.email,
        telefono: user.telefono || user.celular,
        operador: user.operador,
        soiAccountStatus: user.soiAccountStatus,
      },

      credenciales: {
        soi: (user.operador === 'SOI' || hasSoiCredentials) ? {
          portal: 'https://www.nuevosoi.com.co/independientes',
          tipoDocumento: user.tipoDocumento,
          documento: user.numeroDocumento,
          hasPassword: hasSoiCredentials,
          status: user.soiAccountStatus,
        } : null,

        miPlanilla: (user.operador === 'MI_PLANILLA' || hasMiPlanillaCredentials) ? {
          portal: 'https://independientes2.miplanilla.com/',
          usuario: 'CC' + user.numeroDocumento,
          hasPassword: hasMiPlanillaCredentials,
        } : null,
      },

      planillasPendientes: user.planillas.map((p) => ({
        id: p.id,
        numeroPlanilla: p.numeroPlanilla,
        periodo: p.periodo,
        total: p.total,
        estadoPago: p.estadoPago,
        fechaLimite: p.fechaLimite,
        diasRestantes: Math.ceil(
          (p.fechaLimite.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      })),
    });
  } catch (error) {
    logger.error('Error in emergency user lookup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/emergency/users/pending
 *
 * Lista todos los usuarios con planillas pendientes de pago
 * Para operaciones manuales masivas
 */
router.get('/emergency/users/pending', async (req: AdminRequest, res: Response) => {
  try {
    logger.warn('EMERGENCY: Admin listing all pending users', {
      adminIp: req.admin?.ip,
    });

    const usersWithPending = await prisma.enlaceUser.findMany({
      where: {
        planillas: {
          some: {
            estadoPago: 'PENDIENTE',
            fechaLimite: {
              gte: new Date(), // No vencidas
            },
          },
        },
      },
      include: {
        planillas: {
          where: {
            estadoPago: 'PENDIENTE',
          },
          orderBy: { fechaLimite: 'asc' },
        },
      },
      orderBy: {
        planillas: {
          _count: 'desc',
        },
      },
    });

    const result = usersWithPending.map((user) => ({
      uleUserId: user.uleUserId,
      nombre: user.nombre,
      documento: user.numeroDocumento,
      operador: user.operador,
      credenciales: {
        usuario: user.operador === 'MI_PLANILLA' ? 'CC' + user.numeroDocumento : user.numeroDocumento,
        hasPassword: user.operador === 'SOI'
          ? !!(user.soiPassword && user.soiPasswordIV)
          : !!(user.miplanillaPassword && user.miplanillaPasswordIV),
      },
      planillas: user.planillas.map((p) => ({
        numeroPlanilla: p.numeroPlanilla,
        periodo: p.periodo,
        total: p.total,
        fechaLimite: p.fechaLimite,
        diasRestantes: Math.ceil(
          (p.fechaLimite.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      })),
      totalPendiente: user.planillas.reduce((sum, p) => sum + p.total, 0),
    }));

    res.json({
      success: true,
      count: result.length,
      users: result,
      portales: {
        soi: 'https://www.nuevosoi.com.co/independientes',
        miPlanilla: 'https://independientes2.miplanilla.com/',
      },
    });
  } catch (error) {
    logger.error('Error listing pending users', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/emergency/user/:uleUserId/change-operator
 *
 * Cambiar el operador de un usuario (SOI <-> MI_PLANILLA)
 * Útil cuando SOI no funciona para un usuario específico
 */
router.post('/emergency/user/:uleUserId/change-operator', async (req: AdminRequest, res: Response) => {
  try {
    const { uleUserId } = req.params;
    const { newOperator } = req.body;

    if (!['SOI', 'MI_PLANILLA'].includes(newOperator)) {
      res.status(400).json({ error: 'Operador inválido. Debe ser SOI o MI_PLANILLA' });
      return;
    }

    logger.warn('EMERGENCY: Admin changing user operator', {
      uleUserId,
      newOperator,
      adminIp: req.admin?.ip,
    });

    const user = await prisma.enlaceUser.findUnique({
      where: { uleUserId },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const oldOperator = user.operador;

    await prisma.enlaceUser.update({
      where: { uleUserId },
      data: {
        operador: newOperator,
        // Si cambia a Mi Planilla y no tiene credenciales, resetear SOI status
        ...(newOperator === 'MI_PLANILLA' && !user.miplanillaPassword
          ? { soiAccountStatus: 'NOT_LINKED' }
          : {}),
      },
    });

    res.json({
      success: true,
      message: `Operador cambiado de ${oldOperator} a ${newOperator}`,
      uleUserId,
      oldOperator,
      newOperator,
      note: newOperator === 'MI_PLANILLA' && !user.miplanillaPassword
        ? 'El usuario no tiene credenciales de Mi Planilla. Necesitará registrarse.'
        : undefined,
    });
  } catch (error) {
    logger.error('Error changing operator', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/emergency/planilla/:planillaId/mark-paid
 *
 * Marcar una planilla como pagada manualmente
 * Usar cuando pagaste manualmente en el portal
 */
router.post('/emergency/planilla/:planillaId/mark-paid', async (req: AdminRequest, res: Response) => {
  try {
    const { planillaId } = req.params;
    const { transactionId, notes } = req.body;

    logger.warn('EMERGENCY: Admin marking planilla as paid manually', {
      planillaId,
      transactionId,
      adminIp: req.admin?.ip,
    });

    const planilla = await prisma.pilaPlanilla.findUnique({
      where: { id: planillaId },
    });

    if (!planilla) {
      res.status(404).json({ error: 'Planilla no encontrada' });
      return;
    }

    await prisma.pilaPlanilla.update({
      where: { id: planillaId },
      data: {
        estadoPago: 'PAGADA',
        fechaPago: new Date(),
      },
    });

    // Crear log de la acción
    await prisma.taskLog.create({
      data: {
        taskId: planilla.taskId,
        level: 'WARN',
        message: 'Planilla marcada como PAGADA manualmente por admin',
        details: {
          planillaId,
          transactionId,
          notes,
          adminIp: req.admin?.ip,
          timestamp: new Date().toISOString(),
        },
      },
    });

    res.json({
      success: true,
      message: 'Planilla marcada como PAGADA',
      planillaId,
      numeroPlanilla: planilla.numeroPlanilla,
      periodo: planilla.periodo,
      total: planilla.total,
    });
  } catch (error) {
    logger.error('Error marking planilla as paid', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// CREDENCIALES CON AUDITORIA
// ============================================================================

/**
 * GET /api/admin/usuarios/:uleUserId/credenciales
 *
 * Obtener credenciales de un usuario con trazabilidad completa.
 * Registra la acción en AuditLog para compliance.
 *
 * Devuelve:
 * - Datos básicos del usuario
 * - Credenciales SOI (desencriptadas)
 * - Credenciales Mi Planilla (desencriptadas)
 */
router.get('/usuarios/:uleUserId/credenciales', async (req: AdminRequest, res: Response) => {
  try {
    const { uleUserId } = req.params;
    const adminIp = req.admin?.ip || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Buscar usuario
    const user = await prisma.enlaceUser.findUnique({
      where: { uleUserId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Check credential availability (do NOT decrypt or return passwords)
    const hasSoiCredentials = !!(user.soiPassword && user.soiPasswordIV);
    const hasMiPlanillaCredentials = !!(user.miplanillaPassword && user.miplanillaPasswordIV);

    // ========================================
    // REGISTRAR EN AUDIT LOG
    // ========================================
    await prisma.auditLog.create({
      data: {
        accion: 'CREDENCIALES_CONSULTADAS',
        adminId: adminIp,
        uleUserId: user.uleUserId,
        ip: adminIp,
        metadata: {
          userAgent,
          timestamp: new Date().toISOString(),
          operador: user.operador,
          soiCredencialesDisponibles: hasSoiCredentials,
          miplanillaCredencialesDisponibles: hasMiPlanillaCredentials,
        },
      },
    });

    logger.warn('AUDIT: Credenciales consultadas (sin revelar passwords)', {
      uleUserId,
      adminIp,
      operador: user.operador,
    });

    // ========================================
    // RESPUESTA (sin passwords)
    // ========================================
    res.json({
      success: true,
      uleUserId: user.uleUserId,
      nombre: user.nombre,
      cedula: user.numeroDocumento,
      operador: user.operador,

      soi: hasSoiCredentials ? {
        usuario: user.numeroDocumento,
        hasPassword: true,
        tipoDocumento: user.tipoDocumento,
        portal: 'https://www.nuevosoi.com.co/independientes',
      } : null,

      miPlanilla: hasMiPlanillaCredentials ? {
        usuario: 'CC' + user.numeroDocumento,
        hasPassword: true,
        portal: 'https://independientes2.miplanilla.com/',
      } : null,

      auditado: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error obteniendo credenciales', { error });
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
});

/**
 * GET /api/admin/audit/credenciales
 *
 * Historial de accesos a credenciales (para compliance)
 */
router.get('/audit/credenciales', async (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const uleUserId = req.query.uleUserId as string;

    const where: any = {
      accion: 'CREDENCIALES_REVELADAS',
    };

    if (uleUserId) {
      where.uleUserId = uleUserId;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      count: logs.length,
      logs: logs.map((log) => ({
        id: log.id,
        uleUserId: log.uleUserId,
        adminId: log.adminId,
        ip: log.ip,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    logger.error('Error obteniendo audit logs', { error });
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
});

// ============================================================================
// ACTUALIZAR CREDENCIALES (para intervención manual del admin)
// ============================================================================

/**
 * PUT /api/admin/usuarios/:uleUserId/credenciales
 *
 * Permite al admin actualizar la clave de SOI o Mi Planilla de un usuario.
 * Caso de uso: el admin cambió la clave manualmente en el portal del operador
 * y necesita que el RPA tenga la clave actualizada para operar.
 *
 * Body:
 * {
 *   operador: "SOI" | "MI_PLANILLA",
 *   password: "nueva-clave-del-usuario"
 * }
 */
router.put('/usuarios/:uleUserId/credenciales', async (req: AdminRequest, res: Response) => {
  try {
    const { uleUserId } = req.params;
    const { operador, password } = req.body;
    const adminIp = req.admin?.ip || req.ip || 'unknown';

    if (!operador || !password) {
      res.status(400).json({ error: 'operador y password son requeridos' });
      return;
    }

    if (!['SOI', 'MI_PLANILLA'].includes(operador)) {
      res.status(400).json({ error: 'operador debe ser SOI o MI_PLANILLA' });
      return;
    }

    const user = await prisma.enlaceUser.findUnique({ where: { uleUserId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const encrypted = encryptPassword(password);

    if (operador === 'SOI') {
      await prisma.enlaceUser.update({
        where: { uleUserId },
        data: {
          soiPassword: encrypted.encrypted,
          soiPasswordIV: encrypted.iv,
          soiAccountStatus: 'ACTIVE',
          soiLinkedAt: new Date(),
        },
      });
    } else {
      await prisma.enlaceUser.update({
        where: { uleUserId },
        data: {
          miplanillaPassword: encrypted.encrypted,
          miplanillaPasswordIV: encrypted.iv,
          miplanillaUser: `${user.tipoDocumento || 'CC'}${user.numeroDocumento}`,
          miplanillaLinkedAt: new Date(),
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'CREDENCIALES_ACTUALIZADAS',
        adminId: adminIp,
        uleUserId,
        ip: adminIp,
        metadata: {
          operador,
          timestamp: new Date().toISOString(),
          userAgent: req.headers['user-agent'] || 'unknown',
        },
      },
    });

    logger.warn('AUDIT: Admin updated user credentials', {
      uleUserId,
      operador,
      adminIp,
    });

    res.json({
      success: true,
      message: `Credenciales de ${operador} actualizadas para ${user.nombre}`,
      operador,
      uleUserId,
    });
  } catch (error) {
    logger.error('Error updating credentials', { error });
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '< 1m';
}

/**
 * Calculate task duration in seconds
 */
function calculateDuration(task: {
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}): number | null {
  if (!task.startedAt) return null;

  const endTime = task.completedAt || task.failedAt || new Date();
  return Math.round((endTime.getTime() - task.startedAt.getTime()) / 1000);
}

export default router;
