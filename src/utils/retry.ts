import { logger } from './logger';

// ============================================
// INTERFACES
// ============================================
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number; // Default: 2 (exponential backoff)
  maxDelayMs?: number; // Límite máximo de delay
  retryableErrors?: string[]; // Errores que permiten retry
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

// ============================================
// FUNCIÓN DE RETRY CON BACKOFF EXPONENCIAL
// ============================================
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const {
    maxAttempts,
    delayMs,
    backoffMultiplier = 2,
    maxDelayMs = 60000, // 60 segundos max
    retryableErrors = [],
    onRetry,
  } = options;

  let lastError: Error | null = null;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug('Retry attempt', { attempt, maxAttempts });

      const result = await fn();

      logger.info('Retry succeeded', { attempt });

      return {
        success: true,
        data: result,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn('Retry attempt failed', {
        attempt,
        maxAttempts,
        error: lastError.message,
      });

      // Verificar si el error es retryable
      if (retryableErrors.length > 0) {
        const isRetryable = retryableErrors.some((retryableError) =>
          lastError!.message.toLowerCase().includes(retryableError.toLowerCase())
        );

        if (!isRetryable) {
          logger.error('Non-retryable error encountered', {
            error: lastError.message,
          });
          break;
        }
      }

      // Si es el último intento, no esperar
      if (attempt === maxAttempts) {
        break;
      }

      // Callback de retry
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Esperar antes del siguiente intento
      logger.debug('Waiting before retry', {
        delayMs: currentDelay,
        nextAttempt: attempt + 1,
      });

      await sleep(currentDelay);

      // Incrementar delay con backoff exponencial
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  // Todos los intentos fallaron
  logger.error('All retry attempts failed', {
    attempts: maxAttempts,
    lastError: lastError?.message,
  });

  return {
    success: false,
    error: lastError!,
    attempts: maxAttempts,
  };
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// PREDEFINIDOS: RETRY PARA CASOS COMUNES
// ============================================

export const RETRY_PRESETS = {
  // Para operaciones de red (API calls, etc.)
  NETWORK: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'network error',
      'timeout',
    ],
  },

  // Para operaciones de navegador/Puppeteer
  BROWSER: {
    maxAttempts: 3,
    delayMs: 2000,
    backoffMultiplier: 1.5,
    retryableErrors: [
      'navigation timeout',
      'waiting for selector',
      'element not found',
      'detached',
    ],
  },

  // Para operaciones de PSE (más intentos, más tiempo)
  PSE: {
    maxAttempts: 2, // Solo 2 intentos para evitar bloqueos
    delayMs: 5000,
    backoffMultiplier: 1,
    retryableErrors: ['timeout', 'network', 'connection'],
  },

  // Para descarga de comprobantes
  COMPROBANTE: {
    maxAttempts: 5,
    delayMs: 10000, // 10 segundos
    backoffMultiplier: 1.5,
    retryableErrors: ['not found', 'pendiente', 'procesando'],
  },
};
