/**
 * BullMQ Queue Configuration
 * Manages RPA task queue with Redis backend
 */

import { Queue, QueueOptions, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { TaskInput } from '../types';

/**
 * Redis connection for BullMQ
 */
export const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Log Redis connection events
redisConnection.on('connect', () => {
  logger.info('Redis connected for BullMQ');
});

redisConnection.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

/**
 * Default queue options
 */
const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // 7 days
      count: 1000,
    },
    removeOnFail: {
      age: 30 * 24 * 3600, // 30 days for debugging
      count: 5000,
    },
  },
};

/**
 * Main RPA tasks queue
 */
export const taskQueue = new Queue('ule-rpa-tasks', queueOptions);

/**
 * Dead letter queue for permanently failed tasks
 */
export const deadLetterQueue = new Queue('ule-rpa-dead-letter', {
  connection: redisConnection,
});

// Queue event listeners
taskQueue.on('error', (error) => {
  logger.error('Task queue error:', error);
});

taskQueue.on('waiting', (jobId) => {
  logger.debug(`Job ${jobId.jobId} is waiting in queue`);
});

taskQueue.on('cleaned', (jobs, type) => {
  logger.info(`Cleaned ${jobs.length} ${type} jobs from queue`);
});

/**
 * Add REGISTRO task to queue
 * @param data - Task input data
 * @returns Job instance
 */
export async function addRegistroTask(data: TaskInput): Promise<Job> {
  logger.info('Adding REGISTRO task to queue', {
    userId: data.uleUserId,
    priority: data.priority,
  });

  return taskQueue.add(
    'registro',
    data,
    {
      priority: data.priority || 5,
      timeout: 5 * 60 * 1000, // 5 minutes
      jobId: `registro-${data.uleUserId}-${Date.now()}`,
      removeOnComplete: {
        age: 7 * 24 * 3600,
      },
    }
  );
}

/**
 * Add LIQUIDACION task to queue
 * @param data - Task input data
 * @returns Job instance
 */
export async function addLiquidacionTask(data: TaskInput): Promise<Job> {
  logger.info('Adding LIQUIDACION task to queue', {
    userId: data.uleUserId,
    paymentId: data.paymentId,
    priority: data.priority,
  });

  return taskQueue.add(
    'liquidacion',
    data,
    {
      priority: data.priority || 3, // Higher priority for liquidation
      timeout: 10 * 60 * 1000, // 10 minutes
      jobId: `liquidacion-${data.uleUserId}-${data.paymentId}-${Date.now()}`,
    }
  );
}

/**
 * Add COMPROBANTE task to queue
 * @param data - Task input data
 * @returns Job instance
 */
export async function addComprobanteTask(data: TaskInput): Promise<Job> {
  logger.info('Adding COMPROBANTE task to queue', {
    userId: data.uleUserId,
    priority: data.priority,
  });

  return taskQueue.add(
    'comprobante',
    data,
    {
      priority: data.priority || 7,
      timeout: 3 * 60 * 1000, // 3 minutes
      jobId: `comprobante-${data.uleUserId}-${Date.now()}`,
    }
  );
}

/**
 * Add FULL_FLOW task to queue (registro + liquidacion)
 * @param data - Task input data
 * @returns Job instance
 */
export async function addFullFlowTask(data: TaskInput): Promise<Job> {
  logger.info('Adding FULL_FLOW task to queue', {
    userId: data.uleUserId,
    priority: data.priority,
  });

  return taskQueue.add(
    'full_flow',
    data,
    {
      priority: data.priority || 2, // Very high priority
      timeout: 15 * 60 * 1000, // 15 minutes
      jobId: `full-flow-${data.uleUserId}-${Date.now()}`,
    }
  );
}

/**
 * Add generic task to queue
 * @param taskType - Type of task
 * @param data - Task data
 * @param options - Optional job options
 */
export async function addTaskToQueue(
  taskType: string,
  data: TaskInput,
  options?: {
    priority?: number;
    timeout?: number;
    jobId?: string;
  }
): Promise<Job> {
  logger.info('Adding task to queue', { taskType, userId: data.uleUserId });

  const defaultTimeout = {
    REGISTRO: 5 * 60 * 1000,
    LIQUIDACION: 10 * 60 * 1000,
    COMPROBANTE: 3 * 60 * 1000,
    FULL_FLOW: 15 * 60 * 1000,
  }[taskType] || 5 * 60 * 1000;

  return taskQueue.add(
    taskType.toLowerCase(),
    data,
    {
      priority: options?.priority || data.priority || 5,
      timeout: options?.timeout || defaultTimeout,
      jobId: options?.jobId || `${taskType.toLowerCase()}-${data.uleUserId}-${Date.now()}`,
    }
  );
}

/**
 * Get queue statistics
 * @returns Queue stats object
 */
export async function getQueueStats() {
  const counts = await taskQueue.getJobCounts();

  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
    paused: counts.paused || 0,
  };
}

/**
 * Get job by ID
 * @param jobId - Job ID
 */
export async function getJob(jobId: string): Promise<Job | undefined> {
  return taskQueue.getJob(jobId);
}

/**
 * Get waiting jobs
 */
export async function getWaitingJobs(start = 0, end = 10): Promise<Job[]> {
  return taskQueue.getWaiting(start, end);
}

/**
 * Get active jobs
 */
export async function getActiveJobs(start = 0, end = 10): Promise<Job[]> {
  return taskQueue.getActive(start, end);
}

/**
 * Get failed jobs
 */
export async function getFailedJobs(start = 0, end = 10): Promise<Job[]> {
  return taskQueue.getFailed(start, end);
}

/**
 * Get completed jobs
 */
export async function getCompletedJobs(start = 0, end = 10): Promise<Job[]> {
  return taskQueue.getCompleted(start, end);
}

/**
 * Retry a failed job
 * @param jobId - Job ID to retry
 */
export async function retryJob(jobId: string): Promise<void> {
  const job = await taskQueue.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (await job.isFailed()) {
    await job.retry();
    logger.info(`Job ${jobId} queued for retry`);
  } else {
    throw new Error(`Job ${jobId} is not in failed state`);
  }
}

/**
 * Move permanently failed job to dead letter queue
 * @param job - Failed job
 */
export async function moveToDeadLetter(job: Job): Promise<void> {
  try {
    await deadLetterQueue.add(
      'dead-letter',
      {
        originalJobId: job.id,
        originalJobName: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: new Date(),
      },
      {
        removeOnComplete: {
          age: 90 * 24 * 3600, // Keep for 90 days
        },
      }
    );

    await job.remove();
    logger.warn(`Job ${job.id} moved to dead letter queue`, {
      jobId: job.id,
      reason: job.failedReason,
    });
  } catch (error) {
    logger.error(`Failed to move job ${job.id} to dead letter queue:`, error);
  }
}

/**
 * Clean old jobs from queue
 * @param grace - Grace period in milliseconds
 */
export async function cleanOldJobs(grace: number = 24 * 3600 * 1000): Promise<void> {
  try {
    const [completedCleaned, failedCleaned] = await Promise.all([
      taskQueue.clean(grace, 1000, 'completed'),
      taskQueue.clean(7 * 24 * 3600 * 1000, 1000, 'failed'), // Keep failed for 7 days
    ]);

    logger.info('Old jobs cleaned from queue', {
      completed: completedCleaned.length,
      failed: failedCleaned.length,
    });
  } catch (error) {
    logger.error('Error cleaning old jobs:', error);
  }
}

/**
 * Pause queue (stop processing new jobs)
 */
export async function pauseQueue(): Promise<void> {
  await taskQueue.pause();
  logger.warn('Task queue paused');
}

/**
 * Resume queue
 */
export async function resumeQueue(): Promise<void> {
  await taskQueue.resume();
  logger.info('Task queue resumed');
}

/**
 * Drain queue (remove all waiting jobs)
 */
export async function drainQueue(): Promise<void> {
  await taskQueue.drain();
  logger.warn('Task queue drained (all waiting jobs removed)');
}

/**
 * Close queue connection
 */
export async function closeQueue(): Promise<void> {
  await taskQueue.close();
  await deadLetterQueue.close();
  await redisConnection.quit();
  logger.info('Queue connections closed');
}
