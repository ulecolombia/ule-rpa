/**
 * Webhooks Routes
 * Receive webhooks from ULE application
 */

import { Router } from 'express';
import { z } from 'zod';
import { addLiquidacionTask } from '../../orchestrator/queue.config';
import { logger } from '../../utils/logger';

const router = Router();

// POST /api/webhooks/payment-confirmed
// ULE calls this endpoint when a payment is confirmed
const paymentWebhookSchema = z.object({
  paymentId: z.string(),
  userId: z.string(),
  amount: z.number(),
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

router.post('/payment-confirmed', async (req, res) => {
  // TODO: Verificar firma de Wompi
  // const signature = req.headers['x-webhook-signature'];
  // const isValid = verifyWompiSignature(req.body, signature, WOMPI_SECRET);
  // if (!isValid) {
  //   return res.status(401).json({ error: 'Invalid signature' });
  // }

  const data = paymentWebhookSchema.parse(req.body);

  logger.info('Payment confirmed webhook received', {
    paymentId: data.paymentId,
    userId: data.userId,
    amount: data.amount,
  });

  try {
    // Crear tarea de liquidación con alta prioridad
    const job = await addLiquidacionTask({
      type: 'LIQUIDACION',
      uleUserId: data.userId,
      paymentId: data.paymentId,
      pilaData: data.pilaData as any,
      priority: 2, // Alta prioridad
    } as any);

    logger.info('Liquidation task created', {
      taskId: job.id,
      userId: data.userId,
    });

    res.status(202).json({
      message: 'Payment received, liquidation queued',
      taskId: job.id,
    });
  } catch (error) {
    logger.error('Error processing payment webhook', { error });

    // Retornar 200 para que Wompi no reintente
    // pero loguear el error para revisar después
    res.status(200).json({
      message: 'Webhook received but processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
