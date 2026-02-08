/**
 * BullMQ Worker - Processes RPA tasks from queue
 * Executes bots and updates task status in database
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection, moveToDeadLetter } from './queue.config';
import { logger, createChildLogger } from '../utils/logger';
import { TaskInput, TaskResult } from '../types';
import { registrarUsuario } from '../bots/enlace/registro.bot';
import { liquidarPilaConConfirmacion } from '../bots/enlace/liquidacion.bot';
import { descargarComprobanteEnlace } from '../bots/enlace/comprobante.bot';
import { verificarEstadoPlanilla, descargarComprobante } from '../bots/enlace/comprobante.bot';
import { uploadComprobanteToStorage } from '../storage/uploader';
import { startScheduler, stopScheduler } from './scheduler';

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
        type: job.data.type,
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

        // Log de inicio
        await logTaskProgress(task.id, 'INFO', 'Starting user registration', {
          documento: userData.numeroDocumento,
          nombre: userData.nombre,
        });

        // Ejecutar bot de registro (nueva función)
        const registroResult = await registrarUsuario(userData);

        if (!registroResult.success) {
          throw new Error(registroResult.error || 'Registration failed');
        }

        // Guardar usuario en tabla EnlaceUser
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
            ? 'User already existed in Enlace'
            : 'User registered successfully',
          {
            enlaceUserId: registroResult.enlaceUserId,
            alreadyExists: registroResult.alreadyExists,
            warnings: registroResult.warnings,
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
          },
          duration: Date.now() - startTime,
        };
        break;
      }

      case 'LIQUIDACION': {
        const { uleUserId, pilaData, paymentId } = job.data;

        if (!pilaData) {
          throw new Error('pilaData is required for LIQUIDACION task');
        }

        // Obtener usuario de Enlace
        const enlaceUser = await prisma.enlaceUser.findUnique({
          where: { uleUserId },
        });

        if (!enlaceUser || enlaceUser.enlaceStatus !== 'REGISTERED') {
          throw new Error('User not registered in Enlace');
        }

        // Log de inicio
        await logTaskProgress(task.id, 'INFO', 'Starting PILA liquidation', {
          documento: enlaceUser.numeroDocumento,
          periodo: pilaData.periodo,
          total: pilaData.total,
        });

        // Ejecutar liquidación con confirmación completa
        const liquidacionResult = await liquidarPilaConConfirmacion(
          enlaceUser.numeroDocumento,
          pilaData
        );

        if (!liquidacionResult.success) {
          throw new Error(liquidacionResult.error || 'Liquidation failed');
        }

        // Guardar planilla en DB
        const planilla = await prisma.pilaPlanilla.create({
          data: {
            uleUserId,
            enlaceUserId: enlaceUser.id,
            taskId: task.id,
            paymentId: paymentId || '',

            numeroPlanilla: liquidacionResult.numeroPlanilla!,
            periodo: pilaData.periodo,

            ingresoBase: pilaData.ingresoBase,
            ibc: pilaData.ibc,
            salud: pilaData.salud,
            pension: pilaData.pension,
            arl: pilaData.arl,
            total: pilaData.total,

            estadoPago: 'PENDIENTE',
            fechaLiquidacion: new Date(),
            fechaLimite:
              liquidacionResult.fechaLimite || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        // Actualizar tarea a AWAITING (esperando pago PSE)
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'AWAITING',
            resultData: {
              numeroPlanilla: liquidacionResult.numeroPlanilla,
              planillaId: planilla.id,
              urlPSE: liquidacionResult.urlPSE,
            } as any,
          },
        });

        // Log de éxito
        await logTaskProgress(task.id, 'INFO', 'PILA liquidated successfully - awaiting PSE payment', {
          numeroPlanilla: liquidacionResult.numeroPlanilla,
          planillaId: planilla.id,
        });

        // Log warnings if any
        if (liquidacionResult.warnings && liquidacionResult.warnings.length > 0) {
          await logTaskProgress(task.id, 'WARN', 'Liquidation completed with warnings', {
            warnings: liquidacionResult.warnings,
          });
        }

        result = {
          success: true,
          data: {
            numeroPlanilla: liquidacionResult.numeroPlanilla,
            planillaId: planilla.id,
            estadoPago: 'PENDIENTE',
          },
          duration: Date.now() - startTime,
        };

        break;
      }

      case 'COMPROBANTE': {
        const { numeroPlanilla, planillaId } = job.data;

        if (!numeroPlanilla || !planillaId) {
          throw new Error('numeroPlanilla and planillaId required for COMPROBANTE task');
        }

        // Obtener datos de planilla
        const planilla = await prisma.pilaPlanilla.findUnique({
          where: { id: planillaId },
          include: { enlaceUser: true },
        });

        if (!planilla) {
          throw new Error(`Planilla not found: ${planillaId}`);
        }

        // Log inicio
        await logTaskProgress(task.id, 'INFO', 'Checking planilla payment status', {
          numeroPlanilla,
          planillaId,
        });

        // 1. Verificar estado
        const status = await verificarEstadoPlanilla(numeroPlanilla);

        if (status.estado !== 'PAGADA') {
          jobLogger.info('Planilla not paid yet', {
            numeroPlanilla,
            estado: status.estado,
          });

          // Actualizar estado si cambió
          if (status.estado === 'RECHAZADA' || status.estado === 'VENCIDA') {
            await prisma.pilaPlanilla.update({
              where: { id: planillaId },
              data: { estadoPago: status.estado },
            });

            await logTaskProgress(task.id, 'WARN', `Planilla status changed to ${status.estado}`, {
              numeroPlanilla,
              estado: status.estado,
            });
          }

          throw new Error(`Planilla not paid: ${status.estado}`);
        }

        // 2. Descargar comprobante
        await logTaskProgress(task.id, 'INFO', 'Planilla is paid, downloading comprobante PDF', {
          numeroPlanilla,
          fechaPago: status.fechaPago,
          valor: status.valor,
        });

        const downloadResult = await descargarComprobante(numeroPlanilla);

        if (!downloadResult.success || !downloadResult.localPath) {
          throw new Error(downloadResult.error || 'Download failed');
        }

        await logTaskProgress(task.id, 'INFO', 'Comprobante downloaded successfully', {
          localPath: downloadResult.localPath,
          fileName: downloadResult.fileName,
          fileSize: downloadResult.fileSize,
        });

        // 3. Subir a storage de ULE
        await logTaskProgress(task.id, 'INFO', 'Uploading comprobante to storage', {
          localPath: downloadResult.localPath,
        });

        const uploadResult = await uploadComprobanteToStorage(
          downloadResult.localPath,
          {
            userId: planilla.uleUserId,
            numeroPlanilla,
            periodo: planilla.periodo,
            valor: planilla.total,
            fechaPago: status.fechaPago || new Date(),
          },
          false // Don't cleanup yet - will do manually after DB save
        );

        if (!uploadResult.success || !uploadResult.url) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        await logTaskProgress(task.id, 'INFO', 'Comprobante uploaded to storage', {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
        });

        // 4. Guardar comprobante en DB
        const comprobante = await prisma.comprobante.create({
          data: {
            planillaId,
            uleUserId: planilla.uleUserId,
            fileName: downloadResult.fileName!,
            filePath: uploadResult.publicId!,
            fileUrl: uploadResult.url,
            fileSize: downloadResult.fileSize!,
            downloadedAt: new Date(),
            uploadedToUle: true,
            uploadedAt: new Date(),
          },
        });

        // 5. Actualizar planilla como pagada
        await prisma.pilaPlanilla.update({
          where: { id: planillaId },
          data: {
            estadoPago: 'PAGADA',
            fechaPago: status.fechaPago || new Date(),
          },
        });

        // 6. Limpiar archivo local
        const { storageUploader } = await import('../storage/uploader');
        await storageUploader.cleanupLocalFile(downloadResult.localPath);

        // Log éxito
        await logTaskProgress(task.id, 'INFO', 'Comprobante processed successfully', {
          comprobanteId: comprobante.id,
          fileUrl: uploadResult.url,
          estadoPago: 'PAGADA',
        });

        result = {
          success: true,
          data: {
            comprobanteId: comprobante.id,
            fileUrl: uploadResult.url,
            fileName: downloadResult.fileName,
            fileSize: downloadResult.fileSize,
            estadoPago: 'PAGADA',
          },
          duration: Date.now() - startTime,
        };

        break;
      }

      case 'FULL_FLOW': {
        // Execute full flow: registro + liquidacion
        if (!job.data.userData || !job.data.pilaData) {
          throw new Error('userData and pilaData are required for FULL_FLOW task');
        }

        await logTaskProgress(task.id, 'INFO', 'Starting FULL_FLOW: Registration phase');

        // Phase 1: Registration (using new function)
        const registroResult = await registrarUsuario(job.data.userData);

        if (!registroResult.success) {
          throw new Error(`Registration failed: ${registroResult.error}`);
        }

        // Save/update EnlaceUser
        await prisma.enlaceUser.upsert({
          where: { uleUserId: job.data.uleUserId },
          create: {
            uleUserId: job.data.uleUserId,
            tipoDocumento: job.data.userData.tipoDocumento,
            numeroDocumento: job.data.userData.numeroDocumento,
            nombre: job.data.userData.nombre,
            eps: job.data.userData.eps,
            pension: job.data.userData.pension,
            arl: job.data.userData.arl,
            enlaceUserId: registroResult.enlaceUserId,
            enlaceStatus: 'REGISTERED',
            registeredAt: new Date(),
            lastSyncAt: new Date(),
          },
          update: {
            enlaceUserId: registroResult.enlaceUserId,
            enlaceStatus: 'REGISTERED',
            lastSyncAt: new Date(),
          },
        });

        await logTaskProgress(task.id, 'INFO', 'Registration completed, starting liquidation');

        // Phase 2: Liquidation (using new complete flow)
        const liquidacionResult = await liquidarPilaConConfirmacion(
          job.data.userData.numeroDocumento,
          job.data.pilaData
        );

        if (!liquidacionResult.success) {
          throw new Error(`Liquidation failed: ${liquidacionResult.error}`);
        }

        // Save planilla if liquidation succeeded
        const enlaceUser = await prisma.enlaceUser.findUnique({
          where: { uleUserId: job.data.uleUserId },
        });

        if (enlaceUser) {
          await prisma.pilaPlanilla.create({
            data: {
              uleUserId: job.data.uleUserId,
              enlaceUserId: enlaceUser.id,
              taskId: task.id,
              paymentId: job.data.paymentId || '',
              numeroPlanilla: liquidacionResult.numeroPlanilla!,
              periodo: job.data.pilaData.periodo,
              ingresoBase: job.data.pilaData.ingresoBase,
              ibc: job.data.pilaData.ibc,
              salud: job.data.pilaData.salud,
              pension: job.data.pilaData.pension,
              arl: job.data.pilaData.arl,
              total: job.data.pilaData.total,
              estadoPago: 'PENDIENTE',
              fechaLiquidacion: new Date(),
              fechaLimite:
                liquidacionResult.fechaLimite || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
        }

        await logTaskProgress(task.id, 'INFO', 'FULL_FLOW completed successfully');

        result = {
          success: true,
          data: {
            registro: {
              enlaceUserId: registroResult.enlaceUserId,
              alreadyExists: registroResult.alreadyExists,
              warnings: registroResult.warnings,
            },
            liquidacion: {
              numeroPlanilla: liquidacionResult.numeroPlanilla,
              fechaLimite: liquidacionResult.fechaLimite,
              urlPSE: liquidacionResult.urlPSE,
            },
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
taskWorker.on('completed', (job) => {
  logger.info('Job completed', {
    jobId: job.id,
    type: job.data.type,
    returnValue: job.returnvalue,
  });
});

taskWorker.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
    attempt: job?.attemptsMade,
  });
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
