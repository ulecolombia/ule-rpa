/**
 * SOI Routes - Rutas para integración multi-usuario con SOI
 *
 * Endpoints:
 * - POST /api/soi/validate-credentials - Validar credenciales SOI existentes
 * - POST /api/soi/create-account - Crear cuenta SOI para usuario ULE
 * - POST /api/soi/planilla - Liquidar planilla con credenciales de usuario
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { logger } from '../../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { SOIAuthBot, crearCuentaSOI } from '../../bots/soi';
// TODO: reescribir - import { liquidarPlanillaAsUser } from '../../bots/soi';
import {
  SOICredentialsSchema,
  SOIUserRegistrationSchema,
  SOIPlanillaRequestSchema,
} from '../../types/soi.types';
import type { SOIPlanillaLiquidacion } from '../../types/soi-planilla.types';
import { encryptPassword } from '../../utils/crypto';
import { redisConnection } from '../../orchestrator/queue.config';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(authMiddleware);

/**
 * POST /api/soi/validate-credentials
 * Valida si las credenciales de un usuario son correctas en SOI
 *
 * Body:
 * - tipoDocumento: CC, CE, NIT, etc.
 * - documento: Número de documento
 * - password: Contraseña SOI
 *
 * Response:
 * - valid: boolean
 * - userName: nombre del usuario en SOI (si válido)
 * - accountType: tipo de cuenta
 * - message: mensaje descriptivo
 */
router.post('/validate-credentials', async (req: Request, res: Response) => {
  try {
    // Validar input
    const validation = SOICredentialsSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: validation.error.errors,
      });
    }

    const { tipoDocumento, documento, password } = validation.data;

    logger.info('Validating SOI credentials', { documento });

    // Crear instancia de auth bot y validar
    const authBot = new SOIAuthBot();
    const result = await authBot.validateCredentials({
      tipoDocumento,
      documento,
      password,
    });

    logger.info('SOI credentials validation result', {
      documento,
      valid: result.valid,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error validating SOI credentials', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al validar credenciales',
      message: errorMsg,
    });
  }
});

/**
 * POST /api/soi/create-account
 * Crea una cuenta SOI para un usuario de ULE
 * Usa datos fijos de ULE (email, celular) y genera password automática
 *
 * Body:
 * - tipoDocumento: CC, CE, etc.
 * - documento: Número de documento
 * - nombres: Nombres del usuario
 * - apellidos: Apellidos del usuario
 * - departamento: Departamento (requerido por SOI)
 * - municipio: Municipio (requerido por SOI)
 *
 * Response:
 * - success: boolean
 * - accountCreated: boolean
 * - generatedPassword: password generada (para guardar encriptada en ULE)
 * - passwordEncrypted: password encriptada con AES-256
 * - passwordIV: IV para desencriptar
 */
router.post('/create-account', async (req: Request, res: Response) => {
  try {
    // Validar input
    const validation = SOIUserRegistrationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: validation.error.errors,
      });
    }

    const userData = validation.data;

    logger.info('Creating SOI account', {
      documento: userData.documento,
      nombre: `${userData.nombres} ${userData.apellidos}`,
    });

    // Crear cuenta SOI
    const result = await crearCuentaSOI(userData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.message,
        accountCreated: false,
      });
    }

    // Si se creó la cuenta, encriptar la password para devolverla
    let encryptedData = null;
    if (result.generatedPassword) {
      const encrypted = encryptPassword(result.generatedPassword);
      encryptedData = {
        passwordEncrypted: encrypted.encrypted,
        passwordIV: encrypted.iv,
      };
    }

    logger.info('SOI account creation result', {
      documento: userData.documento,
      accountCreated: result.accountCreated,
    });

    return res.json({
      success: true,
      data: {
        accountCreated: result.accountCreated,
        message: result.message,
        // Solo enviar password si se creó la cuenta
        ...(encryptedData && {
          generatedPassword: result.generatedPassword, // Password en texto plano (para mostrar al usuario)
          ...encryptedData, // Password encriptada (para guardar en DB)
        }),
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error creating SOI account', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al crear cuenta SOI',
      message: errorMsg,
    });
  }
});

// TODO: reescribir - POST /api/soi/planilla endpoint
// Este endpoint usaba liquidarPlanillaAsUser que fue borrado
router.post('/planilla', async (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: 'Endpoint temporalmente deshabilitado - pendiente reescribir',
  });
});

/**
 * POST /api/soi/link-account
 * Vincula una cuenta SOI existente con un usuario ULE
 * Valida las credenciales y las guarda encriptadas
 *
 * Body:
 * - uleUserId: ID del usuario en ULE
 * - tipoDocumento: CC, CE, etc.
 * - documento: Número de documento
 * - password: Contraseña SOI actual del usuario
 *
 * Response:
 * - success: boolean
 * - linked: boolean
 * - passwordEncrypted: password encriptada
 * - passwordIV: IV para desencriptar
 */
router.post('/link-account', async (req: Request, res: Response) => {
  try {
    const LinkAccountSchema = z.object({
      uleUserId: z.string(),
      tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PA', 'TI', 'RC']),
      documento: z.string().min(5).max(15),
      password: z.string().min(4),
    });

    const validation = LinkAccountSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: validation.error.errors,
      });
    }

    const { uleUserId, tipoDocumento, documento, password } = validation.data;

    logger.info('Linking SOI account', { uleUserId, documento });

    // Primero validar que las credenciales sean correctas
    const authBot = new SOIAuthBot();
    const validationResult = await authBot.validateCredentials({
      tipoDocumento,
      documento,
      password,
    });

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        error: 'Credenciales inválidas',
        message: validationResult.message,
        linked: false,
      });
    }

    // Encriptar password para guardar
    const encrypted = encryptPassword(password);

    logger.info('SOI account linked successfully', { uleUserId, documento });

    return res.json({
      success: true,
      data: {
        linked: true,
        userName: validationResult.userName,
        accountType: validationResult.accountType,
        passwordEncrypted: encrypted.encrypted,
        passwordIV: encrypted.iv,
        message: 'Cuenta vinculada exitosamente',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error linking SOI account', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al vincular cuenta SOI',
      message: errorMsg,
    });
  }
});

// Task queue for async processing
const taskQueue = new Queue('ule-rpa-tasks', { connection: redisConnection });

/**
 * POST /api/soi/liquidar-planilla-completa
 * Endpoint principal para liquidar planilla con datos IBC completos
 *
 * Este endpoint recibe TODA la información necesaria para crear una planilla
 * incluyendo los campos IBC verificados del Paso 3 de SOI.
 *
 * Body: SOIPlanillaLiquidacion (ver src/types/soi-planilla.types.ts)
 *
 * Response:
 * - success: boolean
 * - taskId: ID de la tarea en cola
 * - status: 'QUEUED'
 */
router.post('/liquidar-planilla-completa', async (req: Request, res: Response) => {
  try {
    const planillaData: SOIPlanillaLiquidacion = req.body;

    // Validar estructura mínima
    if (!planillaData.cotizantes || planillaData.cotizantes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un cotizante',
      });
    }

    if (!planillaData.periodo?.mes || !planillaData.periodo?.anio) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el periodo (mes y año)',
      });
    }

    const cotizante = planillaData.cotizantes[0];

    if (!cotizante.seguridadSocial?.pension?.ibc || !cotizante.seguridadSocial?.salud?.ibc) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere IBC para pensión y salud',
      });
    }

    if (!cotizante.identificacion?.numeroDocumento) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere número de documento del cotizante',
      });
    }

    // Validar que venga la password (encriptada o no)
    const hasPassword = (planillaData as any).soiPassword ||
                       ((planillaData as any).soiPasswordEncrypted && (planillaData as any).soiPasswordIV);

    if (!hasPassword) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere la contraseña SOI del usuario',
      });
    }

    const uleUserId = planillaData.userId || cotizante.identificacion.numeroDocumento;

    logger.info('Queuing SOI_LIQUIDACION_COMPLETA task', {
      userId: uleUserId,
      periodo: `${planillaData.periodo.mes}/${planillaData.periodo.anio}`,
      ibcPension: cotizante.seguridadSocial.pension.ibc,
      ibcSalud: cotizante.seguridadSocial.salud.ibc,
    });

    // Agregar tarea a la cola
    const jobId = `soi-liquidacion-${uleUserId}-${Date.now()}`;
    const job = await taskQueue.add(
      'SOI_LIQUIDACION_COMPLETA',
      {
        type: 'SOI_LIQUIDACION_COMPLETA',
        uleUserId,
        planillaData,
        priority: 5,
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    logger.info('Task queued successfully', { jobId: job.id });

    return res.json({
      success: true,
      data: {
        taskId: job.id,
        status: 'QUEUED',
        message: 'Tarea de liquidación agregada a la cola',
        estimatedTime: '2-5 minutos',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error queuing liquidacion task', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al procesar solicitud',
      message: errorMsg,
    });
  }
});

/**
 * GET /api/soi/task/:taskId
 * Consulta el estado de una tarea de liquidación
 */
router.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const job = await taskQueue.getJob(taskId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
      });
    }

    const state = await job.getState();
    const progress = job.progress;

    return res.json({
      success: true,
      data: {
        taskId,
        status: state.toUpperCase(),
        progress,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error getting task status', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al consultar estado',
      message: errorMsg,
    });
  }
});

/**
 * POST /api/soi/activate-account
 * Activa una cuenta SOI usando el email de activación
 *
 * Este endpoint dispara el proceso de:
 * 1. Buscar email de activación en pagos.ule@gmail.com
 * 2. Hacer click en el link de activación
 * 3. Crear contraseña automáticamente
 * 4. Guardar credenciales encriptadas en Supabase
 *
 * Body:
 * - uleUserId: ID del usuario en ULE
 * - documento: Número de documento del usuario
 * - tipoDocumento: Tipo de documento (default CC)
 * - nombre: Nombre completo del usuario (opcional)
 *
 * Response:
 * - success: boolean
 * - taskId: ID de la tarea en cola
 * - status: 'QUEUED'
 */
router.post('/activate-account', async (req: Request, res: Response) => {
  try {
    const ActivateAccountSchema = z.object({
      uleUserId: z.string().min(1),
      documento: z.string().min(5).max(15),
      tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PA', 'TI', 'RC']).default('CC'),
      nombre: z.string().optional(),
    });

    const validation = ActivateAccountSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: validation.error.errors,
      });
    }

    const { uleUserId, documento, tipoDocumento, nombre } = validation.data;

    logger.info('Queuing ACTIVACION task', {
      uleUserId,
      documento,
    });

    // Agregar tarea a la cola con reintentos largos
    const jobId = `activacion-${uleUserId}-${Date.now()}`;
    const job = await taskQueue.add(
      'ACTIVACION',
      {
        type: 'ACTIVACION',
        uleUserId,
        userData: {
          numeroDocumento: documento,
          tipoDocumento,
          nombre: nombre || '',
        },
        priority: 6,
      },
      {
        jobId,
        attempts: 5, // Más reintentos porque el email puede demorar
        backoff: { type: 'exponential', delay: 30000 }, // 30s, 60s, 120s...
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    logger.info('ACTIVACION task queued', { jobId: job.id, documento });

    return res.json({
      success: true,
      data: {
        taskId: job.id,
        status: 'QUEUED',
        message: 'Tarea de activación agregada a la cola. El sistema buscará el email de activación y completará el proceso automáticamente.',
        estimatedTime: '1-5 minutos (dependiendo de la llegada del email)',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error queuing activation task', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al procesar solicitud de activación',
      message: errorMsg,
    });
  }
});

/**
 * GET /api/soi/gmail-status
 * Verifica el estado de la configuración de Gmail OAuth
 *
 * Response:
 * - configured: boolean - Si hay credenciales
 * - hasToken: boolean - Si ya está autorizado
 * - authUrl: string - URL para autorizar (si no tiene token)
 */
router.get('/gmail-status', async (_req: Request, res: Response) => {
  try {
    const { getSOIAccountActivationService } = await import('../../services/soi-account-activation.service');
    const activationService = getSOIAccountActivationService();
    const status = await activationService.checkGmailSetup();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error checking Gmail status', { error: errorMsg });

    return res.status(500).json({
      success: false,
      error: 'Error al verificar estado de Gmail',
      message: errorMsg,
    });
  }
});

export default router;
