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
import { logger } from '../../utils/logger';

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
