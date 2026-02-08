import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Ensure logs directory exists
const logsDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom format for console output (human-readable)
 */
const consoleFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${stack || message}`;

  // Add metadata if exists (excluding common fields)
  const metaKeys = Object.keys(metadata).filter(
    (key) => !['level', 'message', 'timestamp'].includes(key)
  );

  if (metaKeys.length > 0) {
    const cleanMeta = metaKeys.reduce((acc, key) => {
      acc[key] = metadata[key];
      return acc;
    }, {} as Record<string, any>);
    msg += ` ${JSON.stringify(cleanMeta)}`;
  }

  return msg;
});

/**
 * Create logger with custom configuration
 * @param options - Logger configuration options
 */
export function createLogger(options?: {
  level?: string;
  service?: string;
  console?: boolean;
  file?: boolean;
}) {
  const {
    level = process.env.LOG_LEVEL || 'info',
    service = 'ule-rpa-service',
    console: enableConsole = true,
    file: enableFile = process.env.NODE_ENV === 'production',
  } = options || {};

  const transports: winston.transport[] = [];

  // Console transport (development)
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          errors({ stack: true }),
          consoleFormat
        ),
      })
    );
  }

  // File transports (production)
  if (enableFile) {
    // Error logs only
    transports.push(
      new DailyRotateFile({
        dirname: logsDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '14d',
        maxSize: '20m',
        format: combine(
          timestamp(),
          errors({ stack: true }),
          json()
        ),
      })
    );

    // Combined logs (all levels)
    transports.push(
      new DailyRotateFile({
        dirname: logsDir,
        filename: 'combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m',
        format: combine(
          timestamp(),
          errors({ stack: true }),
          json()
        ),
      })
    );

    // Info logs only
    transports.push(
      new DailyRotateFile({
        dirname: logsDir,
        filename: 'info-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        maxFiles: '7d',
        maxSize: '20m',
        format: combine(
          timestamp(),
          json()
        ),
      })
    );
  }

  const logger = winston.createLogger({
    level,
    defaultMeta: { service },
    transports,
    exitOnError: false,
  });

  // Handle uncaught exceptions
  if (enableFile) {
    logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(logsDir, 'exceptions.log'),
      })
    );

    // Handle unhandled promise rejections
    logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(logsDir, 'rejections.log'),
      })
    );
  }

  return logger;
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Create child logger with context
 * Useful for adding consistent metadata like taskId, userId
 *
 * @example
 * const taskLogger = createChildLogger({ taskId: '123', userId: 'user-456' });
 * taskLogger.info('Processing task');
 * // Output: ... taskId: '123', userId: 'user-456' ...
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log with task context
 */
export function logWithTask(taskId: string, level: string, message: string, meta?: any) {
  const taskLogger = createChildLogger({ taskId });
  (taskLogger as any)[level](message, meta);
}

/**
 * Log bot action
 */
export function logBotAction(action: string, details?: any) {
  logger.info(`[BOT] ${action}`, { action, ...details });
}

/**
 * Log API request
 */
export function logApiRequest(method: string, path: string, details?: any) {
  logger.info(`[API] ${method} ${path}`, { method, path, ...details });
}

/**
 * Log database operation
 */
export function logDbOperation(operation: string, table: string, details?: any) {
  logger.debug(`[DB] ${operation} ${table}`, { operation, table, ...details });
}
