/**
 * Reconciliation Job
 *
 * FASE 2: Maneja usuarios huérfanos que quedaron en estados incompletos
 *
 * Casos que reconcilia:
 * 1. Usuarios con soiAccountStatus = PENDING_CREATION o CREATING (registro incompleto)
 * 2. Usuarios con enlaceStatus = REGISTERING (registro atascado)
 * 3. Tareas PROCESSING que llevan más de 1 hora sin completar
 * 4. Planillas PENDIENTE que ya vencieron
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { addRegistroTask } from './queue.config';

const prisma = new PrismaClient();

/**
 * Configuración de reconciliación
 */
const RECONCILIATION_CONFIG = {
  // Tiempo máximo en estado CREATING/REGISTERING antes de reintentar
  MAX_STUCK_TIME_HOURS: 2,

  // Máximo de usuarios a procesar por corrida
  MAX_USERS_PER_RUN: 10,

  // Máximo de reintentos antes de marcar como ERROR
  MAX_RETRY_ATTEMPTS: 3,

  // Tiempo mínimo entre reintentos para el mismo usuario (horas)
  MIN_RETRY_INTERVAL_HOURS: 4,
};

interface ReconciliationStats {
  checkedUsers: number;
  stuckRegistrations: number;
  retriedRegistrations: number;
  markedAsError: number;
  staleTasks: number;
  expiredPlanillas: number;
  errors: number;
}

/**
 * Job principal de reconciliación
 */
export async function runReconciliation(): Promise<ReconciliationStats> {
  const stats: ReconciliationStats = {
    checkedUsers: 0,
    stuckRegistrations: 0,
    retriedRegistrations: 0,
    markedAsError: 0,
    staleTasks: 0,
    expiredPlanillas: 0,
    errors: 0,
  };

  logger.info('Starting reconciliation job');

  try {
    // 1. Reconciliar usuarios con registro atascado en SOI
    await reconcileStuckSOIRegistrations(stats);

    // 2. Reconciliar usuarios con enlaceStatus atascado
    await reconcileStuckEnlaceRegistrations(stats);

    // 3. Limpiar tareas PROCESSING estancadas
    await reconcileStaleTasks(stats);

    // 4. Marcar planillas vencidas
    await reconcileExpiredPlanillas(stats);

    logger.info('Reconciliation job completed', stats);
  } catch (error) {
    stats.errors++;
    logger.error('Reconciliation job failed', { error });
  }

  return stats;
}

/**
 * Reconcilia usuarios con soiAccountStatus = PENDING_CREATION o CREATING
 */
async function reconcileStuckSOIRegistrations(stats: ReconciliationStats): Promise<void> {
  const cutoffTime = new Date(
    Date.now() - RECONCILIATION_CONFIG.MAX_STUCK_TIME_HOURS * 60 * 60 * 1000
  );

  // Buscar usuarios atascados
  const stuckUsers = await prisma.enlaceUser.findMany({
    where: {
      operador: 'SOI',
      soiAccountStatus: {
        in: ['PENDING_CREATION', 'CREATING'],
      },
      updatedAt: {
        lt: cutoffTime,
      },
    },
    include: {
      tasks: {
        where: {
          type: 'REGISTRO',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
    take: RECONCILIATION_CONFIG.MAX_USERS_PER_RUN,
  });

  stats.checkedUsers += stuckUsers.length;
  stats.stuckRegistrations += stuckUsers.length;

  for (const user of stuckUsers) {
    try {
      // Contar intentos previos
      const registroTasks = await prisma.task.count({
        where: {
          uleUserId: user.uleUserId,
          type: 'REGISTRO',
        },
      });

      // Si excede máximo de reintentos, marcar como error
      if (registroTasks >= RECONCILIATION_CONFIG.MAX_RETRY_ATTEMPTS) {
        await prisma.enlaceUser.update({
          where: { id: user.id },
          data: {
            soiAccountStatus: 'CREDENTIALS_ERROR',
            updatedAt: new Date(),
          },
        });

        stats.markedAsError++;
        logger.warn('User marked as CREDENTIALS_ERROR after max retries', {
          userId: user.uleUserId,
          documento: user.numeroDocumento,
          attempts: registroTasks,
        });
        continue;
      }

      // Verificar intervalo mínimo entre reintentos
      const lastTask = user.tasks[0];
      if (lastTask) {
        const timeSinceLastAttempt = Date.now() - lastTask.createdAt.getTime();
        const minInterval = RECONCILIATION_CONFIG.MIN_RETRY_INTERVAL_HOURS * 60 * 60 * 1000;

        if (timeSinceLastAttempt < minInterval) {
          logger.debug('Skipping user, too soon to retry', {
            userId: user.uleUserId,
            hoursSinceLastAttempt: Math.round(timeSinceLastAttempt / (60 * 60 * 1000)),
          });
          continue;
        }
      }

      // Crear nueva tarea de registro
      await addRegistroTask({
        type: 'REGISTRO',
        uleUserId: user.uleUserId,
        userData: {
          tipoDocumento: user.tipoDocumento,
          numeroDocumento: user.numeroDocumento,
          nombre: user.nombre,
          apellidos: user.apellidos || '',
          email: user.email || '',
          telefono: user.telefono || user.celular || '',
          eps: user.eps || '',
          pension: user.pension || '',
          arl: user.arl || '',
        },
        priority: 8, // Prioridad baja para reconciliación
      } as any);

      stats.retriedRegistrations++;
      logger.info('Created retry REGISTRO task for stuck user', {
        userId: user.uleUserId,
        documento: user.numeroDocumento,
        previousAttempts: registroTasks,
      });

      // Esperar entre tareas
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      stats.errors++;
      logger.error('Error reconciling stuck SOI user', {
        userId: user.uleUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Reconcilia usuarios con enlaceStatus = REGISTERING (legacy)
 */
async function reconcileStuckEnlaceRegistrations(stats: ReconciliationStats): Promise<void> {
  const cutoffTime = new Date(
    Date.now() - RECONCILIATION_CONFIG.MAX_STUCK_TIME_HOURS * 60 * 60 * 1000
  );

  // Buscar usuarios atascados en estado REGISTERING
  const stuckUsers = await prisma.enlaceUser.findMany({
    where: {
      enlaceStatus: 'REGISTERING',
      updatedAt: {
        lt: cutoffTime,
      },
    },
    take: RECONCILIATION_CONFIG.MAX_USERS_PER_RUN,
  });

  for (const user of stuckUsers) {
    try {
      // Resetear a PENDING para que pueda ser procesado de nuevo
      await prisma.enlaceUser.update({
        where: { id: user.id },
        data: {
          enlaceStatus: 'PENDING',
          updatedAt: new Date(),
        },
      });

      logger.info('Reset stuck REGISTERING user to PENDING', {
        userId: user.uleUserId,
        documento: user.numeroDocumento,
      });
    } catch (error) {
      stats.errors++;
      logger.error('Error reconciling stuck Enlace user', {
        userId: user.uleUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Reconcilia tareas PROCESSING que llevan demasiado tiempo
 */
async function reconcileStaleTasks(stats: ReconciliationStats): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Buscar tareas atascadas en PROCESSING
  const staleTasks = await prisma.task.findMany({
    where: {
      status: 'PROCESSING',
      startedAt: {
        lt: oneHourAgo,
      },
    },
    take: 50,
  });

  stats.staleTasks = staleTasks.length;

  for (const task of staleTasks) {
    try {
      // Marcar como FAILED
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          error: 'Task stalled - marked as failed by reconciliation job',
          failedAt: new Date(),
        },
      });

      logger.warn('Marked stale task as FAILED', {
        taskId: task.id,
        type: task.type,
        startedAt: task.startedAt,
      });
    } catch (error) {
      stats.errors++;
      logger.error('Error marking stale task as failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Marca planillas que ya pasaron su fecha límite como VENCIDA
 */
async function reconcileExpiredPlanillas(stats: ReconciliationStats): Promise<void> {
  const now = new Date();

  // Buscar planillas pendientes que ya vencieron
  const expiredPlanillas = await prisma.pilaPlanilla.findMany({
    where: {
      estadoPago: 'PENDIENTE',
      fechaLimite: {
        lt: now,
      },
    },
    take: 100,
  });

  stats.expiredPlanillas = expiredPlanillas.length;

  if (expiredPlanillas.length > 0) {
    // Actualizar todas de una vez
    const ids = expiredPlanillas.map((p) => p.id);

    await prisma.pilaPlanilla.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        estadoPago: 'VENCIDA',
      },
    });

    logger.info(`Marked ${expiredPlanillas.length} planillas as VENCIDA`);

    // Log detalles de cada una
    for (const planilla of expiredPlanillas.slice(0, 10)) {
      logger.info('Planilla marked as expired', {
        planillaId: planilla.id,
        numeroPlanilla: planilla.numeroPlanilla,
        periodo: planilla.periodo,
        fechaLimite: planilla.fechaLimite,
      });
    }
  }
}

/**
 * Obtener estadísticas de usuarios en estados problemáticos
 */
export async function getReconciliationStats(): Promise<{
  pendingCreation: number;
  creating: number;
  registering: number;
  credentialsError: number;
  staleProcessingTasks: number;
  expiredPendingPlanillas: number;
}> {
  const [
    pendingCreation,
    creating,
    registering,
    credentialsError,
    staleProcessingTasks,
    expiredPendingPlanillas,
  ] = await Promise.all([
    prisma.enlaceUser.count({
      where: { soiAccountStatus: 'PENDING_CREATION' },
    }),
    prisma.enlaceUser.count({
      where: { soiAccountStatus: 'CREATING' },
    }),
    prisma.enlaceUser.count({
      where: { enlaceStatus: 'REGISTERING' },
    }),
    prisma.enlaceUser.count({
      where: { soiAccountStatus: 'CREDENTIALS_ERROR' },
    }),
    prisma.task.count({
      where: {
        status: 'PROCESSING',
        startedAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    }),
    prisma.pilaPlanilla.count({
      where: {
        estadoPago: 'PENDIENTE',
        fechaLimite: {
          lt: new Date(),
        },
      },
    }),
  ]);

  return {
    pendingCreation,
    creating,
    registering,
    credentialsError,
    staleProcessingTasks,
    expiredPendingPlanillas,
  };
}

/**
 * Ejecutar reconciliación manual para un usuario específico
 */
export async function reconcileUser(uleUserId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const user = await prisma.enlaceUser.findUnique({
      where: { uleUserId },
    });

    if (!user) {
      return { success: false, action: 'none', error: 'User not found' };
    }

    // Si está atascado en SOI, reintentar registro
    if (user.soiAccountStatus === 'PENDING_CREATION' || user.soiAccountStatus === 'CREATING') {
      await addRegistroTask({
        type: 'REGISTRO',
        uleUserId: user.uleUserId,
        userData: {
          tipoDocumento: user.tipoDocumento,
          numeroDocumento: user.numeroDocumento,
          nombre: user.nombre,
          apellidos: user.apellidos || '',
          email: user.email || '',
          telefono: user.telefono || user.celular || '',
          eps: user.eps || '',
          pension: user.pension || '',
          arl: user.arl || '',
        },
        priority: 5,
      } as any);

      return { success: true, action: 'Created REGISTRO task' };
    }

    // Si tiene error de credenciales, resetear a NOT_LINKED
    if (user.soiAccountStatus === 'CREDENTIALS_ERROR') {
      await prisma.enlaceUser.update({
        where: { id: user.id },
        data: {
          soiAccountStatus: 'NOT_LINKED',
          soiPassword: null,
          soiPasswordIV: null,
        },
      });

      return { success: true, action: 'Reset to NOT_LINKED' };
    }

    return { success: true, action: 'No action needed' };
  } catch (error) {
    return {
      success: false,
      action: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
