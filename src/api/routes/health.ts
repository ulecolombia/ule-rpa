/**
 * Health Check Routes
 * Monitor service health and dependencies
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from '../../orchestrator/queue.config';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redisConnection.ping();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
