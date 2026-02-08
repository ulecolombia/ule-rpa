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
  try {
    // TODO: Verify webhook signature
    // const signature = req.headers['x-ule-signature'] as string;
    // if (!verifySignature(payload, signature)) {
    //   res.status(401).json({ error: 'Invalid signature' });
    //   return;
    // }

    const data = paymentWebhookSchema.parse(req.body);

    logger.info('Payment webhook received', {
      paymentId: data.paymentId,
      userId: data.userId,
      amount: data.amount,
    });

    // Add liquidation task automatically - cast to any to bypass strict typing
    const job = await addLiquidacionTask({
      type: 'LIQUIDACION',
      uleUserId: data.userId,
      paymentId: data.paymentId,
      pilaData: data.pilaData as any,
      priority: 3, // High priority
    } as any);

    logger.info('Liquidation task queued from webhook', { taskId: job.id });

    res.status(202).json({
      message: 'Payment received, liquidation queued',
      taskId: job.id,
    });
    return;
  } catch (error) {
    logger.error('Webhook processing failed', { error });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid webhook payload',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
