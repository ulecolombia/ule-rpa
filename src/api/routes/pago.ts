/**
 * Pago Admin Routes
 * Routes for ULE Admin Centro de Pagos PILA
 *
 * These routes are called by ULE's pagoAdmin.service.ts
 * to manage PILA payment processing via RPA
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { sessionEvents } from '../../services/session-events';
import { emitTaskUpdate } from '../websocket';

const router = Router();
const prisma = new PrismaClient();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /api/admin/pago/dashboard
 * Dashboard summary for Centro de Pagos
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // Get planilla counts
    const [pendientes, vencidas, urgentes, enProceso] = await Promise.all([
      prisma.pilaPlanilla.count({
        where: { estadoPago: 'PENDIENTE' },
      }),
      prisma.pilaPlanilla.count({
        where: {
          estadoPago: 'PENDIENTE',
          fechaLimite: { lt: now },
        },
      }),
      prisma.pilaPlanilla.count({
        where: {
          estadoPago: 'PENDIENTE',
          fechaLimite: {
            gte: now,
            lte: threeDaysFromNow,
          },
        },
      }),
      prisma.pagoAdminSession.count({
        where: {
          status: {
            in: ['RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT'],
          },
        },
      }),
    ]);

    // Get total pending amount
    const totalMonto = await prisma.pilaPlanilla.aggregate({
      where: { estadoPago: 'PENDIENTE' },
      _sum: { total: true },
    });

    res.json({
      pendientes,
      vencidas,
      urgentes,
      proximas: urgentes,
      aTiempo: pendientes - vencidas - urgentes,
      totalMonto: totalMonto._sum.total || 0,
      sesionesActivas: enProceso,
      maxSesiones: 3,
    });
  } catch (error) {
    logger.error('Error fetching pago dashboard', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// PLANILLAS PENDIENTES
// ============================================================================

/**
 * GET /api/admin/pago/planillas-pendientes
 * List planillas pending payment, sorted by due date
 */
router.get('/planillas-pendientes', async (_req: Request, res: Response) => {
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
            uleUserId: true,
          },
        },
      },
    });

    // Check for active sessions
    const activeSessions = await prisma.pagoAdminSession.findMany({
      where: {
        status: {
          in: ['RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT', 'VERIFYING_PAYMENT'],
        },
      },
      select: {
        planillaId: true,
        sessionId: true,
        status: true,
      },
    });

    const sessionMap = new Map(
      activeSessions.map((s) => [s.planillaId, s])
    );

    const totalMonto = planillas.reduce((sum, p) => sum + (p.total || 0), 0);

    res.json({
      planillas: planillas.map((p) => {
        const session = sessionMap.get(p.id);
        return {
          id: p.id,
          numeroPlanilla: p.numeroPlanilla,
          periodo: p.periodo,
          uleUserId: p.enlaceUser?.uleUserId,
          total: p.total,
          fechaLimite: p.fechaLimite?.toISOString(),
          fechaLiquidacion: p.fechaLiquidacion?.toISOString(),
          estadoPago: p.estadoPago,
          diasRestantes: p.fechaLimite
            ? Math.ceil((p.fechaLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null,
          vencida: p.fechaLimite ? p.fechaLimite < now : false,
          enlaceUser: p.enlaceUser
            ? {
                nombre: p.enlaceUser.nombre,
                numeroDocumento: p.enlaceUser.numeroDocumento,
              }
            : null,
          // Active session info
          sessionId: session?.sessionId,
          sessionStatus: session?.status,
        };
      }),
      total: planillas.length,
      totalMonto,
    });
  } catch (error) {
    logger.error('Error fetching planillas pendientes', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// SESIONES DE PAGO
// ============================================================================

/**
 * GET /api/admin/pago/sessions/active
 * List active payment sessions
 */
router.get('/sessions/active', async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.pagoAdminSession.findMany({
      where: {
        status: {
          in: ['RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT', 'VERIFYING_PAYMENT', 'DOWNLOADING_RECEIPT'],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        planilla: {
          include: {
            enlaceUser: {
              select: {
                nombre: true,
                numeroDocumento: true,
              },
            },
          },
        },
      },
    });

    res.json({
      sessions: sessions.map((s) => ({
        id: s.sessionId,
        planillaId: s.planillaId,
        planilla: s.planilla
          ? {
              numeroPlanilla: s.planilla.numeroPlanilla,
              periodo: s.planilla.periodo,
              total: s.planilla.total,
              enlaceUser: s.planilla.enlaceUser,
            }
          : null,
        status: s.status,
        progress: s.progress,
        message: s.progressMessage || getStatusMessage(s.status),
        screenshotUrl: s.lastScreenshot,
        startedAt: s.startedAt?.toISOString(),
        timeoutAt: s.timeoutAt?.toISOString(),
        completedAt: s.completedAt?.toISOString(),
        error: s.errorMessage,
      })),
      count: sessions.length,
      maxAllowed: 3,
    });
  } catch (error) {
    logger.error('Error fetching active sessions', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/pago/sessions/history
 * List completed payment sessions
 */
router.get('/sessions/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const sessions = await prisma.pagoAdminSession.findMany({
      where: {
        status: {
          in: ['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'],
        },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: {
        planilla: {
          include: {
            enlaceUser: {
              select: {
                nombre: true,
                numeroDocumento: true,
              },
            },
          },
        },
      },
    });

    res.json({
      sessions: sessions.map((s) => ({
        id: s.sessionId,
        planillaId: s.planillaId,
        planilla: s.planilla
          ? {
              numeroPlanilla: s.planilla.numeroPlanilla,
              periodo: s.planilla.periodo,
              total: s.planilla.total,
              enlaceUser: s.planilla.enlaceUser,
            }
          : null,
        status: s.status,
        completedAt: s.completedAt?.toISOString(),
        error: s.errorMessage,
        transactionId: s.transactionId,
      })),
    });
  } catch (error) {
    logger.error('Error fetching session history', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/pago/session/:sessionId
 * Get specific session details
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.pagoAdminSession.findUnique({
      where: { sessionId },
      include: {
        planilla: {
          include: {
            enlaceUser: {
              select: {
                nombre: true,
                numeroDocumento: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      id: session.sessionId,
      planillaId: session.planillaId,
      planilla: session.planilla
        ? {
            numeroPlanilla: session.planilla.numeroPlanilla,
            periodo: session.planilla.periodo,
            total: session.planilla.total,
            enlaceUser: session.planilla.enlaceUser,
          }
        : null,
      status: session.status,
      progress: session.progress,
      message: session.progressMessage || getStatusMessage(session.status),
      screenshotUrl: session.lastScreenshot,
      startedAt: session.startedAt?.toISOString(),
      timeoutAt: session.timeoutAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      error: session.errorMessage,
      transactionId: session.transactionId,
    });
  } catch (error) {
    logger.error('Error fetching session', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// RPA ACTIONS
// ============================================================================

/**
 * POST /api/admin/pago/iniciar-rpa
 * Start RPA process for a planilla
 */
router.post('/iniciar-rpa', async (req: AdminRequest, res: Response) => {
  try {
    const { planillaId } = req.body;

    if (!planillaId) {
      res.status(400).json({ error: 'planillaId is required' });
      return;
    }

    // Check planilla exists and is pending
    const planilla = await prisma.pilaPlanilla.findUnique({
      where: { id: planillaId },
      include: {
        enlaceUser: true,
      },
    });

    if (!planilla) {
      res.status(404).json({ error: 'Planilla not found' });
      return;
    }

    if (planilla.estadoPago !== 'PENDIENTE') {
      res.status(400).json({ error: 'Planilla is not pending payment' });
      return;
    }

    // Check for active sessions limit
    const activeSessions = await prisma.pagoAdminSession.count({
      where: {
        status: {
          in: ['RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT'],
        },
      },
    });

    if (activeSessions >= 3) {
      res.status(400).json({
        error: 'Maximum concurrent sessions reached',
        maxSessions: 3,
        activeSessions,
      });
      return;
    }

    // Check if planilla already has an active session
    const existingSession = await prisma.pagoAdminSession.findFirst({
      where: {
        planillaId,
        status: {
          in: ['RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT'],
        },
      },
    });

    if (existingSession) {
      res.status(400).json({
        error: 'Planilla already has an active session',
        sessionId: existingSession.sessionId,
      });
      return;
    }

    // Create new session
    const sessionId = `pago_admin_${planillaId}_${Date.now()}`;
    const timeoutAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min timeout

    const session = await prisma.pagoAdminSession.create({
      data: {
        sessionId,
        planillaId,
        status: 'RPA_STARTING',
        valorTotal: planilla.total || 0,
        startedAt: new Date(),
        timeoutAt,
        progress: 5,
        progressMessage: 'Iniciando proceso RPA...',
        adminId: req.admin?.ip,
      },
    });

    // Update planilla status
    await prisma.pilaPlanilla.update({
      where: { id: planillaId },
      data: { estadoPago: 'EN_PROCESO' },
    });

    logger.info('RPA session started', {
      sessionId,
      planillaId,
      adminIp: req.admin?.ip,
    });

    // TODO: Actually trigger the RPA bot here via queue
    // For now, we just create the session record

    res.json({
      sessionId,
      message: 'RPA session started',
      status: 'RPA_STARTING',
    });
  } catch (error) {
    logger.error('Error starting RPA', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/pago/session/:sessionId/screenshot
 * Request updated screenshot
 */
router.post('/session/:sessionId/screenshot', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.pagoAdminSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // TODO: Actually trigger screenshot capture from RPA
    // For now, return current screenshot
    res.json({
      screenshotUrl: session.lastScreenshot || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error requesting screenshot', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/pago/session/:sessionId/confirmar-pago
 * Confirm payment was completed in bank
 */
router.post('/session/:sessionId/confirmar-pago', async (req: AdminRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.pagoAdminSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'AWAITING_ADMIN_INPUT') {
      res.status(400).json({
        error: 'Session is not awaiting admin input',
        currentStatus: session.status,
      });
      return;
    }

    // Update session status
    await prisma.pagoAdminSession.update({
      where: { sessionId },
      data: {
        status: 'VERIFYING_PAYMENT',
        progress: 80,
        progressMessage: 'Verificando pago en el banco...',
      },
    });

    logger.info('Payment confirmed by admin', {
      sessionId,
      adminIp: req.admin?.ip,
    });

    // Emit event to notify the waiting bot
    sessionEvents.emit(`payment-confirmed:${sessionId}`);

    // Update planilla status
    await prisma.pilaPlanilla.updateMany({
      where: { taskId: sessionId },
      data: { estadoPago: 'EN_PROCESO' },
    });

    // Emit WebSocket update for dashboard
    emitTaskUpdate(sessionId, {
      status: 'RUNNING',
      message: 'Admin confirmó pago - descargando comprobante',
    });

    res.json({
      message: 'Payment confirmation received, verifying...',
      status: 'VERIFYING_PAYMENT',
    });
  } catch (error) {
    logger.error('Error confirming payment', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/pago/session/:sessionId/cancelar
 * Cancel active session
 */
router.post('/session/:sessionId/cancelar', async (req: AdminRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.pagoAdminSession.findUnique({
      where: { sessionId },
      include: { planilla: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(session.status)) {
      res.status(400).json({
        error: 'Session is already finished',
        status: session.status,
      });
      return;
    }

    // Update session
    await prisma.pagoAdminSession.update({
      where: { sessionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorMessage: `Cancelled by admin from ${req.admin?.ip}`,
        progress: 0,
      },
    });

    // Revert planilla status
    if (session.planilla) {
      await prisma.pilaPlanilla.update({
        where: { id: session.planillaId },
        data: { estadoPago: 'PENDIENTE' },
      });
    }

    logger.info('Session cancelled by admin', {
      sessionId,
      adminIp: req.admin?.ip,
    });

    res.json({
      message: 'Session cancelled',
      status: 'CANCELLED',
    });
  } catch (error) {
    logger.error('Error cancelling session', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function getStatusMessage(status: string): string {
  const messageMap: Record<string, string> = {
    PENDING_ADMIN: 'Esperando inicio...',
    RPA_STARTING: 'Iniciando RPA...',
    RPA_AUTHENTICATING: 'Autenticando en SOI...',
    RPA_NAVIGATING: 'Navegando al portal...',
    RPA_PSE_PROCESS: 'Procesando pago PSE...',
    AWAITING_ADMIN_INPUT: 'Esperando pago manual en Bancolombia',
    VERIFYING_PAYMENT: 'Verificando pago...',
    DOWNLOADING_RECEIPT: 'Descargando comprobante...',
    COMPLETED: 'Pago completado',
    FAILED: 'Error en el proceso',
    TIMEOUT: 'Sesión expirada',
    CANCELLED: 'Sesión cancelada',
  };
  return messageMap[status] || 'Estado desconocido';
}

export default router;
