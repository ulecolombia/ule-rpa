/**
 * BullMQ Worker - Processes RPA tasks from queue
 * Executes bots and updates task status in database
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection, moveToDeadLetter, addActivacionTask } from './queue.config';
import { logger, createChildLogger } from '../utils/logger';
// config removed - pilaOperator no longer used after Enlace removal
import { TaskInput, TaskResult } from '../types';

// SOI imports
import {
  crearCuentaSOI, // Función correcta para auto-registro de independientes
  // TODO: reescribir - pagarPlanillaSOI,
  // TODO: reescribir - SOIPagoData,
  // Nuevo bot de crear planilla con IBC
  SOIAuthBot,
  // TODO: reescribir - SOICrearPlanillaBot,
  // FASE 1: Comprobante bot
  descargarComprobanteSOI,
  verificarEstadoPlanillaSOI,
} from '../bots/soi';
import type { SOIUserRegistration, SOIAccountCreationResult } from '../types/soi.types';

// Mi Planilla imports - FASE 1: Comprobante support + FASE 2: Registro fallback
import {
  descargarComprobanteMiPlanilla,
  verificarEstadoPlanillaMiPlanilla,
  registrarUsuarioMiPlanilla,
} from '../bots/miplanilla';
import type { MiPlanillaRegistro, MiPlanillaRegistroResult } from '../types/miplanilla.types';
import { encryptPassword } from '../utils/crypto';

import type { SOIPlanillaLiquidacion } from '../types/soi-planilla.types';
import { decryptPassword } from '../utils/crypto';

// Árbol de decisión para verificar estado de planillas
import {
  verificarEstadoPlanillaSOI as verificarEstadoSOI,
  aplicarArbolDecision,
  type AccionRecomendada,
} from '../bots/utils/planilla-state';

// Storage uploader - FASE 1: Enabled for comprobante upload
import { uploadComprobanteToStorage } from '../storage/uploader';

import { startScheduler, stopScheduler } from './scheduler';
import {
  emitTaskUpdate,
  emitTaskCompleted,
  emitTaskFailed,
  emitLog,
  emitPlanillaUpdate,
  emitQueueUpdate,
  emitComprobanteReady,
} from '../api/websocket';
import { getQueueStats } from './queue.config';

// ULE notifier - all notifications
import {
  notificarLiquidacionCreada,
  notificarLiquidacionEnProgreso,
  notificarLiquidacionFallida,
  notificarPagoCompletado,
} from '../services/ule-notifier';

// FASE 3: Alert service
import {
  alertTaskFailed,
  alertQueueBacklog,
  alertComprobanteDownloadFailed,
  alertSystemError,
} from '../services/alert.service';

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

        // Variables para tracking del fallback
        let finalOperator: 'SOI' | 'MI_PLANILLA' | null = null;
        let soiError: string | null = null;
        let miPlanillaError: string | null = null;
        let registroExitoso = false;
        let registroResult: {
          success: boolean;
          enlaceUserId?: string;
          alreadyExists?: boolean;
          warnings?: string[];
          error?: string;
          generatedPassword?: string;
        } = { success: false };

        // ═══════════════════════════════════════════════════════════════
        // PASO 1: Intentar registro en SOI (operador preferido)
        // Usa crearCuentaSOI() que navega al formulario público de auto-registro
        // ═══════════════════════════════════════════════════════════════
        jobLogger.info('REGISTRO: Attempting SOI registration (auto-registro independientes)');
        await logTaskProgress(task.id, 'INFO', 'Intentando registro en SOI (auto-registro independientes)', {
          documento: userData.numeroDocumento,
          nombre: userData.nombre,
        });

        // Preparar datos para el formulario de auto-registro de SOI
        const nombreParts = (userData.nombre || '').split(' ');
        const soiUserData: SOIUserRegistration = {
          tipoDocumento: (userData.tipoDocumento as 'CC' | 'CE' | 'NIT' | 'PA' | 'TI' | 'RC') || 'CC',
          documento: userData.numeroDocumento,
          nombres: nombreParts[0] || userData.nombre,
          apellidos: nombreParts.slice(1).join(' ') || '',
          departamento: userData.departamento || 'BOGOTA D.C.',
          municipio: userData.municipio || 'BOGOTA D.C.',
          celularUsuario: userData.celular,
          emailUsuario: userData.correo || userData.email,
        };

        try {
          const soiResult: SOIAccountCreationResult = await crearCuentaSOI(soiUserData);

          if (soiResult.success && soiResult.accountCreated) {
            // SOI exitoso - cuenta creada
            finalOperator = 'SOI';
            registroExitoso = true;
            registroResult = {
              success: true,
              enlaceUserId: userData.numeroDocumento,
              alreadyExists: false,
              generatedPassword: soiResult.generatedPassword,
            };
            jobLogger.info('REGISTRO: SOI account created successfully');
          } else if (soiResult.success && !soiResult.accountCreated) {
            // Usuario ya existe en SOI - hacer fallback a Mi Planilla
            soiError = soiResult.message || 'Usuario ya existe en SOI';
            jobLogger.warn(`REGISTRO: SOI user already exists - ${soiError}`);
            await logTaskProgress(task.id, 'WARN', `SOI: Usuario ya existe, haciendo fallback a Mi Planilla`, {
              message: soiResult.message,
            });
          } else {
            // SOI falló por otro motivo
            soiError = soiResult.error || soiResult.message || 'Unknown SOI error';
            jobLogger.warn(`REGISTRO: SOI failed - ${soiError}`);
            await logTaskProgress(task.id, 'WARN', `SOI registration failed: ${soiError}`, {});
          }
        } catch (error) {
          soiError = error instanceof Error ? error.message : String(error);
          jobLogger.error(`REGISTRO: SOI exception - ${soiError}`);
          await logTaskProgress(task.id, 'ERROR', `SOI registration exception: ${soiError}`, {});
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: Si SOI falló, intentar Mi Planilla como fallback
        // ═══════════════════════════════════════════════════════════════
        if (!registroExitoso) {
          jobLogger.info('REGISTRO: Attempting Mi Planilla fallback');
          await logTaskProgress(task.id, 'INFO', 'Intentando registro en Mi Planilla (fallback)', {
            soiError: soiError,
          });

          // Preparar datos para Mi Planilla
          const nombreParts = (userData.nombre || '').split(' ');
          const miPlanillaData: MiPlanillaRegistro = {
            tipoDocumento: (userData.tipoDocumento as 'CC' | 'CE') || 'CC',
            documento: userData.numeroDocumento,
            primerNombre: nombreParts[0] || '',
            segundoNombre: nombreParts.length > 2 ? nombreParts[1] : undefined,
            primerApellido: nombreParts.length > 2 ? nombreParts[2] : (nombreParts[1] || ''),
            segundoApellido: nombreParts.length > 3 ? nombreParts.slice(3).join(' ') : undefined,
            email: userData.correo || userData.email || 'ulecolombia@gmail.com',
            celular: userData.celular || userData.telefono || '3001234567',
            direccion: userData.direccion || 'Calle 1 # 1-1',
            ciudad: userData.municipio || userData.ciudad || 'Bogotá',
            ingresosMensuales: 1300000, // Mínimo 1 SMLV
            epsCodigo: userData.eps || 'EPS010', // Sura default
            afpCodigo: userData.pension || '25-14', // Colpensiones default
            actividadEconomica: '0010', // Default actividad económica
          };

          try {
            const miPlanillaResult: MiPlanillaRegistroResult = await registrarUsuarioMiPlanilla(miPlanillaData);

            if (miPlanillaResult.success) {
              // Mi Planilla exitoso
              finalOperator = 'MI_PLANILLA';
              registroExitoso = true;
              registroResult = {
                success: true,
                enlaceUserId: miPlanillaResult.usuario,
                alreadyExists: false,
                generatedPassword: miPlanillaResult.generatedPassword,
              };
              jobLogger.info('REGISTRO: Mi Planilla registration successful');
              await logTaskProgress(task.id, 'INFO', 'Usuario registrado exitosamente en Mi Planilla', {
                usuario: miPlanillaResult.usuario,
              });
            } else {
              // Mi Planilla también falló
              miPlanillaError = miPlanillaResult.error || miPlanillaResult.message || 'Unknown Mi Planilla error';
              jobLogger.error(`REGISTRO: Mi Planilla failed - ${miPlanillaError}`);
              await logTaskProgress(task.id, 'ERROR', `Mi Planilla registration failed: ${miPlanillaError}`, {});
            }
          } catch (error) {
            miPlanillaError = error instanceof Error ? error.message : String(error);
            jobLogger.error(`REGISTRO: Mi Planilla exception - ${miPlanillaError}`);
            await logTaskProgress(task.id, 'ERROR', `Mi Planilla registration exception: ${miPlanillaError}`, {});
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: Evaluar resultado final
        // ═══════════════════════════════════════════════════════════════
        if (registroExitoso && finalOperator) {
          // Éxito - guardar usuario con el operador correcto
          const enlaceUser = await prisma.enlaceUser.upsert({
            where: { uleUserId },
            create: {
              uleUserId,
              tipoDocumento: userData.tipoDocumento,
              numeroDocumento: userData.numeroDocumento,
              nombre: userData.nombre,
              email: userData.correo || userData.email,
              celular: userData.celular,
              telefono: userData.telefono,
              departamento: userData.departamento,
              municipio: userData.municipio,
              eps: userData.eps,
              pension: userData.pension,
              arl: userData.arl,
              operador: finalOperator,
              enlaceUserId: registroResult.enlaceUserId,
              enlaceStatus: 'REGISTERED',
              // Guardar credenciales según operador
              ...(finalOperator === 'MI_PLANILLA' && registroResult.generatedPassword ? (() => {
                const encrypted = encryptPassword(registroResult.generatedPassword!);
                return {
                  miplanillaUser: `${userData.tipoDocumento || 'CC'}${userData.numeroDocumento}`,
                  miplanillaPassword: encrypted.encrypted,
                  miplanillaPasswordIV: encrypted.iv,
                  miplanillaLinkedAt: new Date(),
                };
              })() : {}),
              ...(finalOperator === 'SOI' ? (() => {
                // Si hay password generada por SOI, guardarla encriptada
                // (esto solo ocurre si activarCuentaSOI ya corrió)
                if (registroResult.generatedPassword) {
                  const encrypted = encryptPassword(registroResult.generatedPassword);
                  return {
                    soiAccountStatus: 'ACTIVE',
                    soiPassword: encrypted.encrypted,
                    soiPasswordIV: encrypted.iv,
                    soiLinkedAt: new Date(),
                  };
                }
                // Sin password = cuenta creada pero pendiente de activación por email
                return {
                  soiAccountStatus: 'PENDING_CREATION',
                  soiLinkedAt: new Date(),
                };
              })() : {}),
              registeredAt: new Date(),
              lastSyncAt: new Date(),
            },
            update: {
              operador: finalOperator,
              enlaceUserId: registroResult.enlaceUserId,
              enlaceStatus: 'REGISTERED',
              nombre: userData.nombre,
              eps: userData.eps,
              pension: userData.pension,
              arl: userData.arl,
              ...(finalOperator === 'MI_PLANILLA' && registroResult.generatedPassword ? (() => {
                const encrypted = encryptPassword(registroResult.generatedPassword!);
                return {
                  miplanillaUser: `${userData.tipoDocumento || 'CC'}${userData.numeroDocumento}`,
                  miplanillaPassword: encrypted.encrypted,
                  miplanillaPasswordIV: encrypted.iv,
                  miplanillaLinkedAt: new Date(),
                };
              })() : {}),
              ...(finalOperator === 'SOI' ? (() => {
                if (registroResult.generatedPassword) {
                  const encrypted = encryptPassword(registroResult.generatedPassword);
                  return {
                    soiAccountStatus: 'ACTIVE',
                    soiPassword: encrypted.encrypted,
                    soiPasswordIV: encrypted.iv,
                    soiLinkedAt: new Date(),
                  };
                }
                // Sin password = cuenta creada pero pendiente de activación por email
                return {
                  soiAccountStatus: 'PENDING_CREATION',
                  soiLinkedAt: new Date(),
                };
              })() : {}),
              lastSyncAt: new Date(),
            },
          });

          await logTaskProgress(
            task.id,
            'INFO',
            `Usuario registrado exitosamente en ${finalOperator}`,
            {
              enlaceUserId: registroResult.enlaceUserId,
              operator: finalOperator,
              alreadyExists: registroResult.alreadyExists,
              usedFallback: finalOperator === 'MI_PLANILLA' && soiError !== null,
            }
          );

          // ═══════════════════════════════════════════════════════════════
          // PASO 4: Si es SOI y no hay password, encolar tarea ACTIVACION
          // La cuenta está creada pero pendiente de activación por email
          // ═══════════════════════════════════════════════════════════════
          if (finalOperator === 'SOI' && !registroResult.generatedPassword) {
            jobLogger.info('REGISTRO: Enqueueing ACTIVACION task with 90s delay');
            await logTaskProgress(task.id, 'INFO', 'Encolando tarea ACTIVACION con delay de 90s', {
              documento: userData.numeroDocumento,
            });

            try {
              await addActivacionTask(
                {
                  type: 'ACTIVACION',
                  uleUserId: uleUserId,
                  // Solo pasamos los campos necesarios para ACTIVACION
                  userData: {
                    uleUserId: uleUserId,
                    tipoDocumento: userData.tipoDocumento,
                    numeroDocumento: userData.numeroDocumento,
                    nombre: userData.nombre,
                    email: userData.correo || userData.email || '',
                    // Campos requeridos por el tipo pero no usados en ACTIVACION
                    telefono: userData.telefono || '',
                    direccion: userData.direccion || '',
                    ciudad: userData.ciudad || '',
                    eps: userData.eps || '',
                    pension: userData.pension || '',
                    arl: userData.arl || '',
                  },
                },
                { delay: 90000 } // 90 segundos para dar tiempo al email de SOI
              );
              jobLogger.info('REGISTRO: ACTIVACION task enqueued successfully');
            } catch (activacionError) {
              // No fallar el REGISTRO si no se puede encolar ACTIVACION
              jobLogger.error('REGISTRO: Failed to enqueue ACTIVACION task', {
                error: activacionError instanceof Error ? activacionError.message : String(activacionError),
              });
            }
          }

          result = {
            success: true,
            data: {
              enlaceUserId: registroResult.enlaceUserId,
              alreadyExists: registroResult.alreadyExists,
              warnings: registroResult.warnings,
              enlaceUserRecordId: enlaceUser.id,
              operator: finalOperator,
              usedFallback: finalOperator === 'MI_PLANILLA',
              soiError: finalOperator === 'MI_PLANILLA' ? soiError : undefined,
              activacionEnqueued: finalOperator === 'SOI' && !registroResult.generatedPassword,
            },
            duration: Date.now() - startTime,
          };
        } else {
          // ═══════════════════════════════════════════════════════════════
          // AMBOS FALLARON - Marcar REQUIRES_MANUAL_REVIEW
          // ═══════════════════════════════════════════════════════════════
          jobLogger.error('REGISTRO: Both SOI and Mi Planilla failed - marking for manual review');

          // Guardar usuario con estado REQUIRES_MANUAL_REVIEW y los errores
          const enlaceUser = await prisma.enlaceUser.upsert({
            where: { uleUserId },
            create: {
              uleUserId,
              tipoDocumento: userData.tipoDocumento,
              numeroDocumento: userData.numeroDocumento,
              nombre: userData.nombre,
              email: userData.correo || userData.email,
              celular: userData.celular,
              telefono: userData.telefono,
              departamento: userData.departamento,
              municipio: userData.municipio,
              eps: userData.eps,
              pension: userData.pension,
              arl: userData.arl,
              enlaceStatus: 'REQUIRES_MANUAL_REVIEW',
              registeredAt: new Date(),
              lastSyncAt: new Date(),
            },
            update: {
              enlaceStatus: 'REQUIRES_MANUAL_REVIEW',
              nombre: userData.nombre,
              email: userData.correo || userData.email,
              celular: userData.celular,
              eps: userData.eps,
              pension: userData.pension,
              arl: userData.arl,
              lastSyncAt: new Date(),
            },
          });

          // Log detallado con ambos errores
          await logTaskProgress(task.id, 'ERROR', 'REQUIRES_MANUAL_REVIEW: Ambos operadores fallaron', {
            soiError: soiError,
            miPlanillaError: miPlanillaError,
            userData: {
              nombre: userData.nombre,
              tipoDocumento: userData.tipoDocumento,
              numeroDocumento: userData.numeroDocumento,
              email: userData.correo || userData.email,
            },
            timestamp: new Date().toISOString(),
          });

          // Emitir evento WebSocket para notificar al dashboard admin
          emitLog(task.id, {
            level: 'ERROR',
            message: `REQUIERE ATENCIÓN MANUAL: Usuario ${userData.nombre} (${userData.tipoDocumento} ${userData.numeroDocumento})`,
            details: {
              type: 'REQUIRES_MANUAL_REVIEW',
              uleUserId,
              userData: {
                nombre: userData.nombre,
                tipoDocumento: userData.tipoDocumento,
                numeroDocumento: userData.numeroDocumento,
                email: userData.correo || userData.email,
                celular: userData.celular,
              },
              errors: {
                soi: soiError,
                miPlanilla: miPlanillaError,
              },
              enlaceUserRecordId: enlaceUser.id,
              timestamp: new Date().toISOString(),
              userMessage: 'Estamos verificando tu información, en menos de 24 horas te contactamos para completar tu registro.',
            },
          });

          // Lanzar error para marcar la tarea como fallida pero con info útil
          const errorMessage = `REQUIRES_MANUAL_REVIEW: SOI error: "${soiError}" | Mi Planilla error: "${miPlanillaError}"`;
          throw new Error(errorMessage);
        }
        break;
      }

      case 'LIQUIDACION': {
        // DEPRECATED: Use SOI_LIQUIDACION_COMPLETA instead
        throw new Error('LIQUIDACION task type is deprecated. Use SOI_LIQUIDACION_COMPLETA instead.');
      }

      case 'COMPROBANTE': {
        // FASE 1: Implementación completa del flujo de comprobantes (SOI y Mi Planilla)
        const { numeroPlanilla, planillaId } = job.data;
        const periodo = job.data.pilaData?.periodo;

        if (!numeroPlanilla) {
          throw new Error('numeroPlanilla is required for COMPROBANTE task');
        }

        // Determinar operador del usuario
        const enlaceUser = await prisma.enlaceUser.findUnique({
          where: { uleUserId: job.data.uleUserId },
          select: {
            operador: true,
            tipoDocumento: true,
            numeroDocumento: true,
            miplanillaPassword: true,
            miplanillaPasswordIV: true,
          },
        });

        const operador = enlaceUser?.operador || 'SOI';

        // Log inicio
        await logTaskProgress(task.id, 'INFO', 'Starting comprobante download', {
          numeroPlanilla,
          planillaId,
          periodo,
          operador,
        });

        // Variables para resultado de descarga (polimórfico)
        let estadoResult: { estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA' };
        let downloadResult: { success: boolean; filePath?: string; fileName?: string; fileSize?: number; error?: string };

        // PASO 1: Verificar estado de la planilla según operador
        if (operador === 'MI_PLANILLA' && enlaceUser?.miplanillaPassword) {
          await logTaskProgress(task.id, 'INFO', 'Verifying planilla status in Mi Planilla');

          // Desencriptar password de Mi Planilla
          const miplanillaPass = enlaceUser.miplanillaPasswordIV
            ? decryptPassword(enlaceUser.miplanillaPassword, enlaceUser.miplanillaPasswordIV)
            : enlaceUser.miplanillaPassword;

          estadoResult = await verificarEstadoPlanillaMiPlanilla(numeroPlanilla, {
            tipoDocumento: (enlaceUser.tipoDocumento || 'CC') as 'CC' | 'CE',
            documento: enlaceUser.numeroDocumento || '',
            password: miplanillaPass,
          });
        } else {
          await logTaskProgress(task.id, 'INFO', 'Verifying planilla status in SOI');
          estadoResult = await verificarEstadoPlanillaSOI(numeroPlanilla);
        }

        if (estadoResult.estado !== 'PAGADA') {
          await logTaskProgress(task.id, 'WARN', 'Planilla is not PAGADA', {
            estado: estadoResult.estado,
            numeroPlanilla,
          });

          // No es error crítico - la planilla aún no está pagada
          result = {
            success: false,
            error: `Planilla not ready for comprobante download. Status: ${estadoResult.estado}`,
            duration: Date.now() - startTime,
            data: {
              numeroPlanilla,
              estadoPlanilla: estadoResult.estado,
              shouldRetry: estadoResult.estado === 'PENDIENTE',
            },
          };
          break;
        }

        // PASO 2: Descargar comprobante según operador
        if (operador === 'MI_PLANILLA' && enlaceUser?.miplanillaPassword) {
          await logTaskProgress(task.id, 'INFO', 'Downloading comprobante PDF from Mi Planilla');

          // Desencriptar password de Mi Planilla
          const miplanillaPass = enlaceUser.miplanillaPasswordIV
            ? decryptPassword(enlaceUser.miplanillaPassword, enlaceUser.miplanillaPasswordIV)
            : enlaceUser.miplanillaPassword;

          downloadResult = await descargarComprobanteMiPlanilla({
            numeroPlanilla,
            uleUserId: job.data.uleUserId,
            periodo,
            tipoDocumento: (enlaceUser.tipoDocumento || 'CC') as 'CC' | 'CE',
            documento: enlaceUser.numeroDocumento || '',
            password: miplanillaPass,
          });
        } else {
          await logTaskProgress(task.id, 'INFO', 'Downloading comprobante PDF from SOI');
          downloadResult = await descargarComprobanteSOI({
            numeroPlanilla,
            uleUserId: job.data.uleUserId,
            periodo,
          });
        }

        if (!downloadResult.success) {
          await logTaskProgress(task.id, 'ERROR', 'Failed to download comprobante', {
            error: downloadResult.error,
          });
          throw new Error(downloadResult.error || 'Comprobante download failed');
        }

        // PASO 3: Subir a storage
        await logTaskProgress(task.id, 'INFO', 'Uploading comprobante to storage', {
          localPath: downloadResult.filePath,
          fileSize: downloadResult.fileSize,
        });

        // Obtener datos de la planilla para metadata
        let planillaData = { total: 0 };
        if (planillaId) {
          const planilla = await prisma.pilaPlanilla.findUnique({
            where: { id: planillaId },
            select: { total: true },
          });
          if (planilla) {
            planillaData = planilla;
          }
        }

        const uploadResult = await uploadComprobanteToStorage(
          downloadResult.filePath!,
          {
            userId: job.data.uleUserId,
            numeroPlanilla,
            periodo: periodo || new Date().toISOString().slice(0, 7),
            valor: planillaData.total,
            fechaPago: new Date(),
          },
          true // cleanup local file after upload
        );

        if (!uploadResult.success) {
          await logTaskProgress(task.id, 'ERROR', 'Failed to upload comprobante to storage', {
            error: uploadResult.error,
          });
          throw new Error(uploadResult.error || 'Storage upload failed');
        }

        // PASO 4: Crear registro de Comprobante y actualizar planilla
        await logTaskProgress(task.id, 'INFO', 'Creating comprobante record', {
          planillaId,
          fileUrl: uploadResult.url,
        });

        if (planillaId) {
          // Crear registro de comprobante
          await prisma.comprobante.upsert({
            where: { planillaId },
            create: {
              planillaId,
              uleUserId: job.data.uleUserId,
              fileName: downloadResult.fileName || `comprobante_${numeroPlanilla}.pdf`,
              filePath: uploadResult.publicId || '',
              fileUrl: uploadResult.url,
              fileSize: downloadResult.fileSize || 0,
              mimeType: 'application/pdf',
              downloadedAt: new Date(),
              uploadedToUle: true,
              uploadedAt: new Date(),
            },
            update: {
              fileName: downloadResult.fileName || `comprobante_${numeroPlanilla}.pdf`,
              filePath: uploadResult.publicId || '',
              fileUrl: uploadResult.url,
              fileSize: downloadResult.fileSize || 0,
              uploadedToUle: true,
              uploadedAt: new Date(),
            },
          });

          // Actualizar estado de la planilla
          await prisma.pilaPlanilla.update({
            where: { id: planillaId },
            data: {
              estadoPago: 'PAGADA',
              fechaPago: new Date(),
            },
          });

          // Emitir actualización via WebSocket
          emitPlanillaUpdate(planillaId, {
            numeroPlanilla,
            estadoPago: 'PAGADA',
            hasComprobante: true,
            userId: job.data.uleUserId,
          });

          // Emitir evento específico de comprobante listo
          emitComprobanteReady({
            planillaId,
            numeroPlanilla,
            fileUrl: uploadResult.url!,
            userId: job.data.uleUserId,
          });
        }

        // PASO 5: Notificar a ULE
        await logTaskProgress(task.id, 'INFO', 'Notifying ULE about comprobante');
        await notificarPagoCompletado(
          job.data.uleUserId,
          planillaId || '',
          numeroPlanilla,
          uploadResult.url!
        );

        await logTaskProgress(task.id, 'INFO', 'Comprobante process completed successfully', {
          comprobanteUrl: uploadResult.url,
          fileSize: downloadResult.fileSize,
        });

        result = {
          success: true,
          duration: Date.now() - startTime,
          data: {
            numeroPlanilla,
            comprobanteUrl: uploadResult.url,
            fileName: downloadResult.fileName,
            fileSize: downloadResult.fileSize,
            estadoPlanilla: 'PAGADA',
          },
        };
        break;
      }

      case 'FULL_FLOW': {
        // DEPRECATED: Use SOI_LIQUIDACION_COMPLETA instead
        throw new Error('FULL_FLOW task type is deprecated. Use SOI_LIQUIDACION_COMPLETA instead.');
      }

      // TODO: reescribir - PAGO_SOI case usa pagarPlanillaSOI que fue borrado
      case 'PAGO_SOI': {
        throw new Error('PAGO_SOI task type temporalmente deshabilitado - pendiente reescribir');
      }

      // ============================================================================
      // SOI_LIQUIDACION_COMPLETA - Nuevo flujo con datos IBC completos
      // ============================================================================
      // TODO: reescribir - SOI_LIQUIDACION_COMPLETA case usa SOICrearPlanillaBot que fue borrado
      case 'SOI_LIQUIDACION_COMPLETA': {
        throw new Error('SOI_LIQUIDACION_COMPLETA task type temporalmente deshabilitado - pendiente reescribir');
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

        // ═══════════════════════════════════════════════════════════════
        // Actualizar EnlaceUser con soiAccountStatus: 'ACTIVE' y password
        // ═══════════════════════════════════════════════════════════════
        if (activationResult.activation?.generatedPassword) {
          const encrypted = encryptPassword(activationResult.activation.generatedPassword);

          await prisma.enlaceUser.updateMany({
            where: { numeroDocumento: userData.numeroDocumento },
            data: {
              soiAccountStatus: 'ACTIVE',
              soiPassword: encrypted.encrypted,
              soiPasswordIV: encrypted.iv,
              soiLinkedAt: new Date(),
              lastSyncAt: new Date(),
            },
          });

          await logTaskProgress(task.id, 'INFO', 'EnlaceUser updated with SOI credentials', {
            documento: userData.numeroDocumento,
            soiAccountStatus: 'ACTIVE',
          });
        } else {
          // Activación exitosa pero sin password (raro, pero posible)
          await prisma.enlaceUser.updateMany({
            where: { numeroDocumento: userData.numeroDocumento },
            data: {
              soiAccountStatus: 'ACTIVE',
              soiLinkedAt: new Date(),
              lastSyncAt: new Date(),
            },
          });
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
            passwordSaved: !!activationResult.activation?.generatedPassword,
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

  // FASE 3: Send alert for failed task
  try {
    if (job) {
      await alertTaskFailed(
        job.id || 'unknown',
        job.data.type,
        err.message,
        job.data.uleUserId
      );
    }
  } catch (alertError) {
    logger.error('Failed to send task failed alert', { error: alertError });
  }

  // Emit queue update via WebSocket
  try {
    const stats = await getQueueStats();
    emitQueueUpdate(stats);

    // FASE 3: Alert if queue is backing up
    if (stats.waiting > 50) {
      await alertQueueBacklog(stats.waiting, stats.active);
    }
  } catch (error) {
    logger.error('Failed to emit queue update', { error });
  }
});

taskWorker.on('error', async (err) => {
  logger.error('Worker error', { error: err.message });

  // FASE 3: Alert for worker error (critical)
  try {
    await alertSystemError(err.message, 'TaskWorker');
  } catch (alertError) {
    logger.error('Failed to send worker error alert', { error: alertError });
  }
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
