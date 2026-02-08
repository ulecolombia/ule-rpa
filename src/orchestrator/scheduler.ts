/**
 * Scheduler for Maintenance and Monitoring Jobs
 * Runs periodic tasks to keep the queue system healthy
 */

import cron from 'node-cron';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import {
  taskQueue,
  deadLetterQueue,
  cleanOldJobs,
  getQueueStats,
  redisConnection,
} from './queue.config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Scheduled Jobs Configuration
 */
const SCHEDULES = {
  // Every 6 hours - Clean old completed jobs
  CLEAN_JOBS: '0 */6 * * *',

  // Every hour - Log queue statistics
  QUEUE_STATS: '0 * * * *',

  // Every 30 minutes - Check for stalled jobs
  STALLED_CHECK: '*/30 * * * *',

  // Every 5 minutes - Health check
  HEALTH_CHECK: '*/5 * * * *',

  // Daily at 3 AM - Clean old task logs
  CLEAN_LOGS: '0 3 * * *',

  // Every 15 minutes - Monitor dead letter queue
  DEAD_LETTER_MONITOR: '*/15 * * * *',

  // Every 2 hours - Check for paid planillas and download comprobantes
  CHECK_PLANILLAS: '0 */2 * * *',
};

/**
 * Clean old completed and failed jobs from queue
 */
async function cleanOldJobsTask() {
  try {
    logger.info('Running scheduled job: Clean old jobs');

    const grace = 24 * 60 * 60 * 1000; // 24 hours for completed
    await cleanOldJobs(grace);

    logger.info('Old jobs cleanup completed');
  } catch (error) {
    logger.error('Failed to clean old jobs', { error });
  }
}

/**
 * Log queue statistics for monitoring
 */
async function logQueueStatsTask() {
  try {
    const stats = await getQueueStats();

    logger.info('Queue statistics', {
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
      paused: stats.paused,
    });

    // Alert if queue is backed up
    if (stats.waiting > 100) {
      logger.warn('Queue backlog detected', { waiting: stats.waiting });
    }

    if (stats.failed > 50) {
      logger.warn('High number of failed jobs', { failed: stats.failed });
    }
  } catch (error) {
    logger.error('Failed to log queue stats', { error });
  }
}

/**
 * Check for stalled jobs and attempt recovery
 */
async function checkStalledJobsTask() {
  try {
    logger.debug('Checking for stalled jobs');

    // Get jobs that are marked as active but may be stalled
    const activeJobs = await taskQueue.getActive(0, 100);

    const now = Date.now();
    let stalledCount = 0;

    for (const job of activeJobs) {
      // Check if job has been processing for too long
      const processingTime = now - (job.processedOn || job.timestamp);
      const timeout = job.opts.timeout || 10 * 60 * 1000; // Default 10 min

      if (processingTime > timeout * 1.5) {
        logger.warn('Potentially stalled job detected', {
          jobId: job.id,
          type: job.data.type,
          processingTime: Math.round(processingTime / 1000) + 's',
          timeout: Math.round(timeout / 1000) + 's',
        });
        stalledCount++;
      }
    }

    if (stalledCount > 0) {
      logger.warn(`Found ${stalledCount} potentially stalled jobs`);
    }
  } catch (error) {
    logger.error('Failed to check stalled jobs', { error });
  }
}

/**
 * Health check for queue system
 */
async function healthCheckTask() {
  try {
    // Check Redis connection
    const redisPing = await redisConnection.ping();
    if (redisPing !== 'PONG') {
      logger.error('Redis health check failed');
      return;
    }

    // Check queue is responsive
    const stats = await getQueueStats();

    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    logger.debug('Health check passed', {
      redis: 'OK',
      queue: 'OK',
      database: 'OK',
      activeJobs: stats.active,
    });
  } catch (error) {
    logger.error('Health check failed', { error });
  }
}

/**
 * Clean old task logs from database
 */
async function cleanOldLogsTask() {
  try {
    logger.info('Running scheduled job: Clean old task logs');

    // Delete logs older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.taskLog.deleteMany({
      where: {
        timestamp: {
          lt: thirtyDaysAgo,
        },
        level: {
          in: ['DEBUG', 'INFO'], // Keep WARN and ERROR longer
        },
      },
    });

    logger.info(`Deleted ${result.count} old task logs`);

    // Also delete logs for very old tasks (90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const oldTaskLogs = await prisma.taskLog.deleteMany({
      where: {
        timestamp: {
          lt: ninetyDaysAgo,
        },
      },
    });

    if (oldTaskLogs.count > 0) {
      logger.info(`Deleted ${oldTaskLogs.count} very old task logs (90+ days)`);
    }
  } catch (error) {
    logger.error('Failed to clean old logs', { error });
  }
}

/**
 * Monitor dead letter queue
 */
async function monitorDeadLetterQueueTask() {
  try {
    const dlqJobs = await deadLetterQueue.getJobs(['completed', 'waiting'], 0, 100);

    if (dlqJobs.length > 0) {
      logger.warn(`Dead letter queue contains ${dlqJobs.length} jobs`);

      // Log details of recent failures
      const recentFailures = dlqJobs.slice(0, 5);
      for (const job of recentFailures) {
        logger.warn('Dead letter job details', {
          originalJobId: job.data.originalJobId,
          jobName: job.data.originalJobName,
          reason: job.data.failedReason,
          attempts: job.data.attemptsMade,
          timestamp: job.data.timestamp,
        });
      }
    }

    // Alert if DLQ is growing too large
    if (dlqJobs.length > 50) {
      logger.error('Dead letter queue is growing large', {
        count: dlqJobs.length,
        message: 'Manual intervention may be required',
      });
    }
  } catch (error) {
    logger.error('Failed to monitor dead letter queue', { error });
  }
}

/**
 * Check for paid planillas and create COMPROBANTE tasks
 * FASE 4.4: Revisa planillas pendientes y descarga comprobantes cuando están pagadas
 */
async function checkPaidPlanillasTask() {
  try {
    logger.info('Running scheduled job: Check for paid planillas');

    // Buscar planillas que están pendientes de pago
    // y cuya fecha de liquidación fue hace más de 1 hora (dar tiempo para que se pague)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const pendingPlanillas = await prisma.pilaPlanilla.findMany({
      where: {
        estadoPago: 'PENDIENTE',
        fechaLiquidacion: {
          lt: oneHourAgo, // Liquidadas hace más de 1 hora
        },
        fechaLimite: {
          gte: new Date(), // No vencidas
        },
      },
      include: {
        comprobantes: true, // Para verificar si ya tiene comprobante
      },
      orderBy: {
        fechaLiquidacion: 'asc', // Más antiguas primero
      },
      take: 20, // Procesar máximo 20 por corrida
    });

    if (pendingPlanillas.length === 0) {
      logger.info('No pending planillas to check');
      return;
    }

    logger.info(`Found ${pendingPlanillas.length} pending planillas to check`);

    let tasksCreated = 0;
    let alreadyPaid = 0;
    let stillPending = 0;
    let errors = 0;

    for (const planilla of pendingPlanillas) {
      try {
        // Verificar si ya tiene comprobante
        if (planilla.comprobantes && planilla.comprobantes.length > 0) {
          logger.info('Planilla already has comprobante, skipping', {
            planillaId: planilla.id,
            numeroPlanilla: planilla.numeroPlanilla,
          });
          alreadyPaid++;
          continue;
        }

        // Verificar si ya hay una tarea COMPROBANTE pendiente o procesando para esta planilla
        const existingTask = await prisma.task.findFirst({
          where: {
            type: 'COMPROBANTE',
            inputData: {
              path: ['planillaId'],
              equals: planilla.id,
            },
            status: {
              in: ['PENDING', 'PROCESSING', 'WAITING'],
            },
          },
        });

        if (existingTask) {
          logger.info('COMPROBANTE task already exists for planilla', {
            planillaId: planilla.id,
            taskId: existingTask.id,
          });
          continue;
        }

        // Crear tarea COMPROBANTE (el worker verificará si está pagada)
        const { addComprobanteTask } = await import('./queue.config');

        const job = await addComprobanteTask({
          type: 'COMPROBANTE',
          uleUserId: planilla.uleUserId,
          numeroPlanilla: planilla.numeroPlanilla,
          planillaId: planilla.id,
          priority: 4, // Prioridad media-baja (no es urgente)
        } as any);

        logger.info('Created COMPROBANTE task', {
          taskId: job.id,
          numeroPlanilla: planilla.numeroPlanilla,
          planillaId: planilla.id,
        });

        tasksCreated++;

        // Esperar un poco entre tareas para no sobrecargar
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Error creating COMPROBANTE task for planilla', {
          planillaId: planilla.id,
          numeroPlanilla: planilla.numeroPlanilla,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errors++;
      }
    }

    logger.info('Check paid planillas completed', {
      checked: pendingPlanillas.length,
      tasksCreated,
      alreadyPaid,
      stillPending,
      errors,
    });
  } catch (error) {
    logger.error('Failed to check paid planillas', { error });
  }
}

/**
 * Sync task statuses between database and queue
 * Ensures database is consistent with actual job states
 */
async function syncTaskStatusesTask() {
  try {
    logger.debug('Syncing task statuses');

    // Find tasks in PROCESSING state that have no active job
    const processingTasks = await prisma.task.findMany({
      where: {
        status: 'PROCESSING',
        startedAt: {
          lt: new Date(Date.now() - 30 * 60 * 1000), // Started over 30 min ago
        },
      },
      take: 50,
    });

    let syncedCount = 0;

    for (const task of processingTasks) {
      const job = await taskQueue.getJob(task.id);

      if (!job) {
        // Job doesn't exist in queue anymore, mark as failed
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'FAILED',
            error: 'Job lost from queue (possibly server restart)',
            failedAt: new Date(),
          },
        });

        logger.warn('Orphaned task marked as failed', { taskId: task.id });
        syncedCount++;
      } else {
        // Check job state
        const state = await job.getState();

        if (state === 'completed') {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
          syncedCount++;
        } else if (state === 'failed') {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              status: 'FAILED',
              error: job.failedReason || 'Job failed',
              failedAt: new Date(),
            },
          });
          syncedCount++;
        }
      }
    }

    if (syncedCount > 0) {
      logger.info(`Synced ${syncedCount} task statuses`);
    }
  } catch (error) {
    logger.error('Failed to sync task statuses', { error });
  }
}

/**
 * Initialize and start all scheduled jobs
 */
export function startScheduler() {
  logger.info('Starting scheduler...');

  // Clean old jobs every 6 hours
  cron.schedule(SCHEDULES.CLEAN_JOBS, cleanOldJobsTask, {
    name: 'clean-old-jobs',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Clean old jobs (every 6 hours)');

  // Log queue stats every hour
  cron.schedule(SCHEDULES.QUEUE_STATS, logQueueStatsTask, {
    name: 'queue-stats',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Queue statistics (every hour)');

  // Check stalled jobs every 30 minutes
  cron.schedule(SCHEDULES.STALLED_CHECK, checkStalledJobsTask, {
    name: 'stalled-check',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Stalled jobs check (every 30 minutes)');

  // Health check every 5 minutes
  cron.schedule(SCHEDULES.HEALTH_CHECK, healthCheckTask, {
    name: 'health-check',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Health check (every 5 minutes)');

  // Clean old logs daily at 3 AM
  cron.schedule(SCHEDULES.CLEAN_LOGS, cleanOldLogsTask, {
    name: 'clean-old-logs',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Clean old logs (daily at 3 AM)');

  // Monitor dead letter queue every 15 minutes
  cron.schedule(SCHEDULES.DEAD_LETTER_MONITOR, monitorDeadLetterQueueTask, {
    name: 'dead-letter-monitor',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Dead letter queue monitor (every 15 minutes)');

  // Sync task statuses every hour
  cron.schedule(SCHEDULES.QUEUE_STATS, syncTaskStatusesTask, {
    name: 'sync-task-statuses',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Sync task statuses (every hour)');

  // Check for paid planillas every 2 hours
  cron.schedule(SCHEDULES.CHECK_PLANILLAS, checkPaidPlanillasTask, {
    name: 'check-paid-planillas',
    timezone: 'America/Bogota',
  });
  logger.info('Scheduled: Check paid planillas (every 2 hours)');

  logger.info('Scheduler started successfully - 8 jobs scheduled');

  // Run health check immediately on startup
  healthCheckTask();
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler() {
  logger.info('Stopping scheduler...');
  cron.getTasks().forEach((task) => {
    task.stop();
  });
  logger.info('Scheduler stopped');
}

/**
 * Get list of scheduled jobs
 */
export function getScheduledJobs() {
  const tasks = cron.getTasks();
  return Array.from(tasks.entries()).map(([name, task]) => ({
    name,
    running: task.getStatus() === 'scheduled',
  }));
}
