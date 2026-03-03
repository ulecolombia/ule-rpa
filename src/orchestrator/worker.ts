/**
 * BullMQ Worker - Processes RPA tasks from queue
 * Executes bots and updates task status in database
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection, moveToDeadLetter } from './queue.config';
import { logger, createChildLogger } from '../utils/logger';
// config removed - pilaOperator no longer used after Enlace removal
import { TaskInput, TaskResult } from '../types';

// SOI imports (only supported operator)
import {
  registrarUsuarioSOI,
  pagarPlanillaSOI,
  SOIUserData,
  SOIPagoData,
  // Nuevo bot de crear planilla con IBC
  SOIAuthBot,
  SOICrearPlanillaBot,
} from '../bots/soi';
import type { SOIPlanillaLiquidacion } from '../types/soi-planilla.types';
import { decryptPassword } from '../utils/crypto';

// Storage uploader - available for future use
// import { uploadComprobanteToStorage } from '../storage/uploader';
import { startScheduler, stopScheduler } from './scheduler';
import {
  emitTaskUpdate,
  emitTaskCompleted,
  emitTaskFailed,
  emitLog,
  emitPlanillaUpdate,
  emitQueueUpdate,
} from '../api/websocket';
import { getQueueStats } from './queue.config';
import {
  notificarLiquidacionCreada,
  notificarLiquidacionEnProgreso,
  notificarLiquidacionFallida,
} from '../services/ule-notifier';

const prisma = new PrismaClient();

/**
 * Log task progress to database
 */
async function logTaskProgress(
  taskId: string,
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  details?: any,
  screenshot?: string
) {
  try {
    await prisma.taskLog.create({
      data: {
        taskId,
        level,
        message,
        details: details || undefined,
        screenshot,
      },
    });

    // Emit log via WebSocket for real-time updates
    emitLog(taskId, { level, message, details });
  } catch (error) {
    logger.error('Failed to log task progress', { taskId, error });
  }
}

/**
 * Process task job
 */
async function processTask(job: Job<TaskInput>): Promise<TaskResult> {
  const startTime = Date.now();
  const jobLogger = createChildLogger({
    jobId: job.id,
    type: job.data.type,
    userId: job.data.uleUserId,
    attempt: job.attemptsMade + 1,
  });

  jobLogger.info('Processing task');

  // Create or update task in database
  let task;
  try {
    task = await prisma.task.upsert({
      where: { id: job.id as string },
      create: {
        id: job.id as string,
        type: job.data.type as any, // TaskType extendido
        status: 'PROCESSING',
        uleUserId: job.data.uleUserId,
        enlaceUserId: job.data.enlaceUserId,
        paymentId: job.data.paymentId,
        inputData: job.data as any,
        priority: job.data.priority || 5,
        attempts: job.attemptsMade + 1,
        startedAt: new Date(),
      },
      update: {
        status: 'PROCESSING',
        attempts: job.attemptsMade + 1,
        startedAt: new Date(),
        error: null, // Clear previous error
      },
    });

    await logTaskProgress(task.id, 'INFO', `Task processing started - Attempt ${job.attemptsMade + 1}`);

    // Emit task started via WebSocket
    emitTaskUpdate(task.id, {
      status: 'PROCESSING',
      type: job.data.type,
      userId: job.data.uleUserId,
      message: `Processing ${job.data.type} task`,
    });
  } catch (error) {
    jobLogger.error('Failed to create/update task in database', { error });
    throw error;
  }

  let result: TaskResult = {
    success: false,
    data: undefined,
    duration: 0,
  };

  try {
    // Execute bot based on task type (each bot handles its own browser/auth)
    jobLogger.info(`Executing ${job.data.type} bot`);

    switch (job.data.type) {
      case 'REGISTRO': {
        const { userData, uleUserId } = job.data;

        if (!userData) {
          throw new Error('userData is required for REGISTRO task');
        }

        // SOI is the only supported operator
        const pilaOperator = 'soi';
        jobLogger.info('Using PILA operator: SOI');

        // Log de inicio
        await logTaskProgress(task.id, 'INFO', 'Starting user registration via SOI', {
          documento: userData.numeroDocumento,
          nombre: userData.nombre,
          operator: pilaOperator,
        });

        let registroResult: {
          success: boolean;
          enlaceUserId?: string;
          alreadyExists?: boolean;
          warnings?: string[];
          error?: string;
        };

        // === SOI Registration (sin reCAPTCHA) ===
        const soiUserData: SOIUserData = {
          tipoDocumento: userData.tipoDocumento || 'CC',
          numeroDocumento: userData.numeroDocumento,
          nombres: userData.nombre?.split(' ')[0] || userData.nombre,
          apellidos: userData.nombre?.split(' ').slice(1).join(' ') || '',
          departamento: userData.departamento || 'BOGOTA D.C.',
          municipio: userData.municipio || 'BOGOTA D.C.',
          telefono: userData.telefono,
          celular: userData.celular,
          correo: userData.correo || userData.email,
          enviarSMS: true,
          rolSOI: 'APORTANTE',
          activo: true,
        };

        const soiResult = await registrarUsuarioSOI(soiUserData);

        registroResult = {
          success: soiResult.success,
          enlaceUserId: soiResult.usuarioId,
          alreadyExists: soiResult.alreadyExists,
          warnings: soiResult.warnings,
          error: soiResult.error,
        };

        if (!registroResult.success) {
          throw new Error(registroResult.error || 'Registration failed');
        }

        // Guardar usuario en tabla EnlaceUser (mantener compatibilidad)
        const enlaceUser = await prisma.enlaceUser.upsert({
          where: { uleUserId },
          create: {
            uleUserId,
            tipoDocumento: userData.tipoDocumento,
            numeroDocumento: userData.numeroDocumento,
            nombre: userData.nombre,
            eps: userData.eps,
            pension: userData.pension,
            arl: userData.arl,
            enlaceUserId: registroResult.enlaceUserId,
            enlaceStatus: 'REGISTERED',
            registeredAt: new Date(),
            lastSyncAt: new Date(),
          },
          update: {
            enlaceUserId: registroResult.enlaceUserId,
            enlaceStatus: 'REGISTERED',
            nombre: userData.nombre,
            eps: userData.eps,
            pension: userData.pension,
            arl: userData.arl,
            lastSyncAt: new Date(),
          },
        });

        // Log de éxito
        await logTaskProgress(
          task.id,
          'INFO',
          registroResult.alreadyExists
            ? `User already existed in ${pilaOperator.toUpperCase()}`
            : `User registered successfully in ${pilaOperator.toUpperCase()}`,
          {
            enlaceUserId: registroResult.enlaceUserId,
            alreadyExists: registroResult.alreadyExists,
            warnings: registroResult.warnings,
            operator: pilaOperator,
          }
        );

        // Log warnings if any
        if (registroResult.warnings && registroResult.warnings.length > 0) {
          await logTaskProgress(task.id, 'WARN', 'Registration completed with warnings', {
            warnings: registroResult.warnings,
          });
        }

        result = {
          success: true,
          data: {
            enlaceUserId: registroResult.enlaceUserId,
            alreadyExists: registroResult.alreadyExists,
            warnings: registroResult.warnings,
            enlaceUserRecordId: enlaceUser.id,
            operator: pilaOperator,
          },
          duration: Date.now() - startTime,
        };
        break;
      }

      case 'LIQUIDACION': {
        // DEPRECATED: Use SOI_LIQUIDACION_COMPLETA instead
        throw new Error('LIQUIDACION task type is deprecated. Use SOI_LIQUIDACION_COMPLETA instead.');
      }

      case 'COMPROBANTE': {
        // DEPRECATED: Comprobante download via Enlace is no longer supported
        throw new Error('COMPROBANTE task type is deprecated. Use SOI comprobante flow instead.');
      }

      case 'FULL_FLOW': {
        // DEPRECATED: Use SOI_LIQUIDACION_COMPLETA instead
        throw new Error('FULL_FLOW task type is deprecated. Use SOI_LIQUIDACION_COMPLETA instead.');
      }

      case 'PAGO_SOI': {
        // Pago de planilla SOI vía PSE
        const { numeroPlanilla, valorTotal, planillaId, banco } = job.data;

        if (!numeroPlanilla || !valorTotal) {
          throw new Error('numeroPlanilla and valorTotal required for PAGO_SOI task');
        }

        // Log inicio
        await logTaskProgress(task.id, 'INFO', 'Starting SOI payment via PSE', {
          numeroPlanilla,
          valorTotal,
          banco: banco || 'DEFAULT',
        });

        // Preparar datos de pago
        const pagoData: SOIPagoData = {
          numeroPlanilla,
          valorTotal,
          pse: banco ? { banco } : undefined,
        };

        // Ejecutar pago
        const pagoResult = await pagarPlanillaSOI(pagoData);

        if (!pagoResult.success) {
          await logTaskProgress(task.id, 'ERROR', 'SOI payment failed', {
            error: pagoResult.error,
            estadoPago: pagoResult.estadoPago,
          });
          throw new Error(pagoResult.message || 'Payment failed');
        }

        // Log estado actual
        await logTaskProgress(task.id, 'INFO', 'SOI payment initiated', {
          estadoPago: pagoResult.estadoPago,
          transaccionId: pagoResult.transaccionId,
          awaitingBankRedirect: pagoResult.awaitingBankRedirect,
        });

        // Si el pago está en proceso (esperando banco)
        if (pagoResult.awaitingBankRedirect) {
          // Actualizar planilla si existe
          if (planillaId) {
            await prisma.pilaPlanilla.update({
              where: { id: planillaId },
              data: {
                estadoPago: 'EN_PROCESO',
              },
            });

            emitPlanillaUpdate(planillaId, {
              numeroPlanilla,
              estadoPago: 'EN_PROCESO',
              userId: job.data.uleUserId,
            });
          }

          // Emitir notificación de PSE en proceso
          emitTaskUpdate(task.id, {
            status: 'PROCESSING',
            message: 'Redirecting to bank for payment',
          } as any);
        }

        result = {
          success: true,
          data: {
            numeroPlanilla,
            estadoPago: pagoResult.estadoPago,
            transaccionId: pagoResult.transaccionId,
            urlBanco: pagoResult.urlBanco,
            awaitingBankRedirect: pagoResult.awaitingBankRedirect,
          },
          duration: Date.now() - startTime,
        };

        break;
      }

      // ============================================================================
      // SOI_LIQUIDACION_COMPLETA - Nuevo flujo con datos IBC completos
      // ============================================================================
      case 'SOI_LIQUIDACION_COMPLETA': {
        const { planillaData, uleUserId } = job.data as {
          planillaData: SOIPlanillaLiquidacion;
          uleUserId: string;
        };

        if (!planillaData) {
          throw new Error('planillaData required for SOI_LIQUIDACION_COMPLETA');
        }

        await logTaskProgress(task.id, 'INFO', 'Starting SOI planilla liquidation (complete flow)', {
          userId: uleUserId,
          periodo: `${planillaData.periodo.mes}/${planillaData.periodo.anio}`,
          cotizantes: planillaData.cotizantes.length,
        });

        // 1. Obtener credenciales y hacer login
        const soiAuthBot = new SOIAuthBot();

        // Desencriptar password si viene encriptada
        let soiPassword: string;
        if ((planillaData as any).soiPasswordEncrypted && (planillaData as any).soiPasswordIV) {
          soiPassword = decryptPassword(
            (planillaData as any).soiPasswordEncrypted,
            (planillaData as any).soiPasswordIV
          );
        } else if ((planillaData as any).soiPassword) {
          soiPassword = (planillaData as any).soiPassword;
        } else {
          throw new Error('No se encontró password de SOI');
        }

        const cotizantePrincipal = planillaData.cotizantes[0];
        const credentials = {
          tipoDocumento: cotizantePrincipal.identificacion.tipoDocumento as any,
          documento: cotizantePrincipal.identificacion.numeroDocumento,
          password: soiPassword,
        };

        await logTaskProgress(task.id, 'INFO', 'Logging in to SOI', {
          documento: credentials.documento,
        });

        await soiAuthBot.loginAsUser(credentials);
        const page = soiAuthBot.getPage();

        if (!page) {
          throw new Error('No se pudo obtener página después del login');
        }

        await logTaskProgress(task.id, 'INFO', 'SOI login successful, creating planilla');

        // Notificar progreso a ULE
        await notificarLiquidacionEnProgreso(uleUserId, {
          taskId: task.id,
          step: 'creando_planilla',
          progress: 30,
        });

        // 2. Crear planilla usando el nuevo bot
        const crearPlanillaBot = new SOICrearPlanillaBot(page, {
          takeScreenshots: true,
          screenshotPrefix: `soi-${uleUserId}-${Date.now()}`,
        });

        const liquidacionResult = await crearPlanillaBot.crearPlanilla(planillaData);

        if (!liquidacionResult.success) {
          // Notificar fallo a ULE
          await notificarLiquidacionFallida(uleUserId, {
            error: liquidacionResult.error || 'Liquidación falló',
            taskId: task.id,
            step: 'crear_planilla',
            periodo: `${planillaData.periodo.mes}/${planillaData.periodo.anio}`,
          });
          await soiAuthBot.close();
          throw new Error(liquidacionResult.error || 'Liquidación falló');
        }

        await logTaskProgress(task.id, 'INFO', 'Planilla created successfully', {
          numeroPlanilla: liquidacionResult.numeroPlanilla,
          valorTotal: liquidacionResult.valorTotal,
        });

        // 3. Guardar en DB
        const planilla = await prisma.pilaPlanilla.create({
          data: {
            uleUserId,
            enlaceUserId: job.data.enlaceUserId || '',
            taskId: task.id,
            paymentId: job.data.paymentId || '',
            numeroPlanilla: liquidacionResult.numeroPlanilla || '',
            periodo: `${planillaData.periodo.mes}/${planillaData.periodo.anio}`,
            ingresoBase: cotizantePrincipal.seguridadSocial.salarioBasico,
            ibc: cotizantePrincipal.seguridadSocial.pension.ibc,
            salud: liquidacionResult.desglose?.salud || 0,
            pension: liquidacionResult.desglose?.pension || 0,
            arl: liquidacionResult.desglose?.arl || 0,
            total: liquidacionResult.valorTotal || 0,
            estadoPago: 'PENDIENTE',
            fechaLiquidacion: new Date(),
            fechaLimite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        // 4. Emit WebSocket
        emitPlanillaUpdate(planilla.id, {
          numeroPlanilla: liquidacionResult.numeroPlanilla!,
          estadoPago: 'PENDIENTE',
          userId: uleUserId,
        } as any);

        // 5. Notificar a ULE via Webhook
        await notificarLiquidacionCreada(uleUserId, {
          numeroPlanilla: liquidacionResult.numeroPlanilla || '',
          periodo: `${planillaData.periodo.mes}/${planillaData.periodo.anio}`,
          valorTotal: liquidacionResult.valorTotal || 0,
          valorSalud: liquidacionResult.desglose?.salud || 0,
          valorPension: liquidacionResult.desglose?.pension || 0,
          valorArl: liquidacionResult.desglose?.arl || 0,
          planillaId: planilla.id,
        });

        emitTaskUpdate(task.id, {
          status: 'COMPLETED',
          type: 'SOI_LIQUIDACION_COMPLETA',
          message: 'Planilla liquidada exitosamente',
        } as any);

        // 6. Cerrar sesión
        await soiAuthBot.close();

        jobLogger.info('SOI_LIQUIDACION_COMPLETA completed', {
          planillaId: planilla.id,
          numeroPlanilla: liquidacionResult.numeroPlanilla,
        });

        result = {
          success: true,
          data: {
            planillaId: planilla.id,
            numeroPlanilla: liquidacionResult.numeroPlanilla,
            valorTotal: liquidacionResult.valorTotal,
            desglose: liquidacionResult.desglose,
          },
          duration: Date.now() - startTime,
        };

        break;
      }

      case 'ACTIVACION': {
        const { userData } = job.data;

        if (!userData?.numeroDocumento) {
          throw new Error('userData.numeroDocumento is required for ACTIVACION task');
        }

        await logTaskProgress(task.id, 'INFO', 'Starting SOI account activation', {
          documento: userData.numeroDocumento,
          nombre: userData.nombre,
        });

        // Import the activation service dynamically to avoid circular dependencies
        const { getSOIAccountActivationService } = await import('../services/soi-account-activation.service');
        const activationService = getSOIAccountActivationService();

        const activationResult = await activationService.processActivation({
          documento: userData.numeroDocumento,
          tipoDocumento: userData.tipoDocumento || 'CC',
          nombreCompleto: userData.nombre,
        });

        if (!activationResult.success) {
          // If email not found, it might not have arrived yet - throw to trigger retry
          if (activationResult.error === 'EMAIL_NOT_FOUND') {
            throw new Error('Activation email not found yet - will retry');
          }
          throw new Error(activationResult.error || activationResult.message);
        }

        await logTaskProgress(task.id, 'INFO', 'Account activated successfully', {
          documento: userData.numeroDocumento,
          message: activationResult.message,
        });

        result = {
          success: true,
          data: {
            documento: userData.numeroDocumento,
            activated: true,
            message: activationResult.message,
          },
          duration: Date.now() - startTime,
        };
        break;
      }

      default:
        throw new Error(`Unknown task type: ${job.data.type}`);
    }

    if (!result.success) {
      throw new Error(result.error || 'Task execution failed');
    }

    // Update task as COMPLETED
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        resultData: result.data as any,
        completedAt: new Date(),
      },
    });

    await logTaskProgress(task.id, 'INFO', 'Task completed successfully', {
      duration: result.duration,
    });

    // Emit task completed via WebSocket
    emitTaskCompleted(task.id, {
      type: job.data.type,
      result: result.data as Record<string, unknown>,
      duration: result.duration,
      userId: job.data.uleUserId,
    });

    jobLogger.info('Task completed successfully', {
      duration: Date.now() - startTime,
    });

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    jobLogger.error('Task failed', { error: errorMessage, stack: errorStack });

    // Guardar log de error detallado
    await logTaskProgress(
      task.id,
      'ERROR',
      'Task execution failed',
      {
        error: errorMessage,
        stack: errorStack,
        attempt: job.attemptsMade + 1,
        maxAttempts: 3,
      }
    );

    // Determine if should retry
    const shouldRetry = job.attemptsMade + 1 < 3;

    // Update task status
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: shouldRetry ? 'PENDING' : 'FAILED',
        error: errorMessage,
        failedAt: shouldRetry ? undefined : new Date(),
        resultData: result?.data as any,
      },
    });

    // Log final failure if max attempts reached
    if (!shouldRetry) {
      await logTaskProgress(
        task.id,
        'ERROR',
        'Task failed permanently after max attempts',
        {
          error: errorMessage,
          totalAttempts: job.attemptsMade + 1,
        }
      );

      // Emit task failed via WebSocket
      emitTaskFailed(task.id, errorMessage, {
        type: job.data.type,
        userId: job.data.uleUserId,
        attempts: job.attemptsMade + 1,
        willRetry: false,
      });
    } else {
      // Emit retry notification
      emitTaskUpdate(task.id, {
        status: 'PENDING',
        type: job.data.type,
        userId: job.data.uleUserId,
        message: `Retry scheduled (attempt ${job.attemptsMade + 1}/3)`,
      });
    }

    // Move to dead letter queue if max attempts reached
    if (!shouldRetry) {
      await moveToDeadLetter(job);
    }

    throw error; // Re-throw to let BullMQ handle retries
  }
}

/**
 * Create and start worker
 */
export const taskWorker = new Worker<TaskInput>('ule-rpa-tasks', processTask, {
  connection: redisConnection,
  concurrency: 3, // Process up to 3 tasks simultaneously
  limiter: {
    max: 10, // Max 10 jobs
    duration: 60000, // per minute
  },
});

// Event listeners
taskWorker.on('completed', async (job) => {
  logger.info('Job completed', {
    jobId: job.id,
    type: job.data.type,
    returnValue: job.returnvalue,
  });

  // Emit queue update via WebSocket
  try {
    const stats = await getQueueStats();
    emitQueueUpdate(stats);
  } catch (error) {
    logger.error('Failed to emit queue update', { error });
  }
});

taskWorker.on('failed', async (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
    attempt: job?.attemptsMade,
  });

  // Emit queue update via WebSocket
  try {
    const stats = await getQueueStats();
    emitQueueUpdate(stats);
  } catch (error) {
    logger.error('Failed to emit queue update', { error });
  }
});

taskWorker.on('error', (err) => {
  logger.error('Worker error', { error: err.message });
});

taskWorker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

taskWorker.on('active', (job) => {
  logger.debug('Job active', {
    jobId: job.id,
    type: job.data.type,
  });
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, closing worker...`);

  try {
    stopScheduler();
    await taskWorker.close();
    await prisma.$disconnect();
    logger.info('Worker closed gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in worker', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in worker', { reason });
  gracefulShutdown('unhandledRejection');
});

logger.info('Worker started and waiting for jobs...');

// Start scheduler for maintenance jobs
startScheduler();
