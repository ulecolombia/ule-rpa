/**
 * Tasks Routes
 * Endpoints for RPA task management
 */

import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  addRegistroTask,
  addLiquidacionTask,
  addComprobanteTask,
  getQueueStats,
} from '../../orchestrator/queue.config';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication to all routes
router.use(authMiddleware);

// GET /api/tasks - List tasks
router.get('/', async (req, res) => {
  const { userId, status, type } = req.query;

  const tasks = await prisma.task.findMany({
    where: {
      ...(userId && { uleUserId: userId as string }),
      ...(status && { status: status as any }),
      ...(type && { type: type as any }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({ tasks });
});

// GET /api/tasks/:id - Get specific task
router.get('/:id', async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      logs: {
        orderBy: { timestamp: 'desc' },
        take: 100,
      },
    },
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

// POST /api/tasks/registro - Create registration task
const registroSchema = z.object({
  uleUserId: z.string(),
  userData: z.object({
    tipoDocumento: z.enum(['CC', 'CE', 'PEP']),
    numeroDocumento: z.string(),
    nombre: z.string(),
    email: z.string().email(),
    telefono: z.string(),
    eps: z.string(),
    pension: z.string(),
    arl: z.string(),
  }),
});

router.post('/registro', async (req, res) => {
  const data = registroSchema.parse(req.body);

  // Check for pending registration task
  const existing = await prisma.task.findFirst({
    where: {
      uleUserId: data.uleUserId,
      type: 'REGISTRO',
      status: { in: ['PENDING', 'PROCESSING'] },
    },
  });

  if (existing) {
    res.status(409).json({
      error: 'Registration task already pending',
      taskId: existing.id,
    });
    return;
  }

  // Add task to queue - cast to any to bypass strict typing for now
  const job = await addRegistroTask({
    type: 'REGISTRO',
    uleUserId: data.uleUserId,
    userData: data.userData as any,
  } as any);

  res.status(202).json({
    message: 'Registration task queued',
    taskId: job.id,
  });
});

// POST /api/tasks/liquidacion - Create liquidation task
const liquidacionSchema = z.object({
  uleUserId: z.string(),
  paymentId: z.string(),
  pilaData: z.object({
    periodo: z.string(),
    ingresoBase: z.number(),
    ibc: z.number(),
    salud: z.number(),
    pension: z.number(),
    arl: z.number(),
    total: z.number(),
  }),
});

router.post('/liquidacion', async (req, res) => {
  const data = liquidacionSchema.parse(req.body);

  // Verify user is registered in Enlace
  const enlaceUser = await prisma.enlaceUser.findUnique({
    where: { uleUserId: data.uleUserId },
  });

  if (!enlaceUser || enlaceUser.enlaceStatus !== 'REGISTERED') {
    res.status(400).json({
      error: 'User not registered in Enlace',
    });
    return;
  }

  // Add task to queue - cast to any to bypass strict typing for now
  const job = await addLiquidacionTask({
    type: 'LIQUIDACION',
    uleUserId: data.uleUserId,
    paymentId: data.paymentId,
    pilaData: data.pilaData as any,
  } as any);

  res.status(202).json({
    message: 'Liquidation task queued',
    taskId: job.id,
  });
});

// POST /api/tasks/comprobante - Create comprobante download task
const comprobanteSchema = z.object({
  uleUserId: z.string(),
  numeroPlanilla: z.string(),
  periodo: z.string(),
});

router.post('/comprobante', async (req, res) => {
  const data = comprobanteSchema.parse(req.body);

  // Verify planilla exists
  const planilla = await prisma.pilaPlanilla.findUnique({
    where: { numeroPlanilla: data.numeroPlanilla },
  });

  if (!planilla) {
    res.status(404).json({
      error: 'Planilla not found',
    });
    return;
  }

  // Add task to queue - cast to any to bypass strict typing
  const job = await addComprobanteTask({
    type: 'COMPROBANTE',
    uleUserId: data.uleUserId,
    pilaData: {
      periodo: data.periodo,
    } as any,
  } as any);

  res.status(202).json({
    message: 'Comprobante download task queued',
    taskId: job.id,
  });
});

// GET /api/tasks/stats - Queue and task statistics
router.get('/stats/summary', async (_req, res) => {
  const queueStats = await getQueueStats();

  const dbStats = await prisma.task.groupBy({
    by: ['status'],
    _count: true,
  });

  res.json({
    queue: queueStats,
    database: dbStats,
  });
});

export default router;
