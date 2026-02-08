/**
 * RPA Service Client
 *
 * Cliente TypeScript para integrar con el servicio RPA desde ULE.
 *
 * UBICACIÓN EN ULE: lib/rpa-client.ts
 *
 * EJEMPLO DE USO:
 *
 * import { rpaClient } from '@/lib/rpa-client';
 *
 * // Crear tarea de registro
 * const { taskId } = await rpaClient.createRegistroTask({
 *   uleUserId: 'user-123',
 *   userData: { ... }
 * });
 *
 * // Consultar estado
 * const { task } = await rpaClient.getTask(taskId);
 */

import {
  CreateRegistroTaskRequest,
  CreateLiquidacionTaskRequest,
  CreateComprobanteTaskRequest,
  CreateTaskResponse,
  GetTaskResponse,
  StatsResponse,
  RPAClientConfig,
  RPARequestOptions,
  RPAErrorResponse,
  RPATask,
} from '../types/rpa-client.types';

/**
 * Custom error for RPA client
 */
export class RPAClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'RPAClientError';
  }
}

/**
 * RPA Service Client
 */
export class RPAClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: RPAClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000; // 30 seconds default
  }

  /**
   * Make HTTP request to RPA service
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requestOptions: RPARequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = requestOptions.timeout || this.timeout;
    const retries = requestOptions.retries || 0;
    const retryDelay = requestOptions.retryDelay || 1000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData: RPAErrorResponse = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        throw new RPAClientError(
          errorData.error || 'Request failed',
          response.status,
          errorData
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry logic
      if (retries > 0 && error instanceof RPAClientError && error.statusCode !== 401) {
        console.warn(`Retrying request to ${url}, ${retries} attempts left`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return this.request<T>(
          endpoint,
          options,
          {
            ...requestOptions,
            retries: retries - 1,
            retryDelay: retryDelay * 2, // Exponential backoff
          }
        );
      }

      if (error instanceof RPAClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new RPAClientError('Request timeout', 408);
      }

      throw new RPAClientError(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Create a user registration task
   */
  async createRegistroTask(
    data: CreateRegistroTaskRequest,
    options?: RPARequestOptions
  ): Promise<CreateTaskResponse> {
    return this.request<CreateTaskResponse>(
      '/api/tasks/registro',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      options
    );
  }

  /**
   * Create a PILA liquidation task
   */
  async createLiquidacionTask(
    data: CreateLiquidacionTaskRequest,
    options?: RPARequestOptions
  ): Promise<CreateTaskResponse> {
    return this.request<CreateTaskResponse>(
      '/api/tasks/liquidacion',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      options
    );
  }

  /**
   * Create a comprobante download task
   */
  async createComprobanteTask(
    data: CreateComprobanteTaskRequest,
    options?: RPARequestOptions
  ): Promise<CreateTaskResponse> {
    return this.request<CreateTaskResponse>(
      '/api/tasks/comprobante',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      options
    );
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string, options?: RPARequestOptions): Promise<GetTaskResponse> {
    return this.request<GetTaskResponse>(`/api/tasks/${taskId}`, {}, options);
  }

  /**
   * List tasks with filters
   */
  async listTasks(filters?: {
    userId?: string;
    status?: string;
    type?: string;
  }): Promise<{ tasks: RPATask[] }> {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.type) params.append('type', filters.type);

    const queryString = params.toString();
    const endpoint = queryString ? `/api/tasks?${queryString}` : '/api/tasks';

    return this.request<{ tasks: RPATask[] }>(endpoint);
  }

  /**
   * Get queue and task statistics
   */
  async getStats(options?: RPARequestOptions): Promise<StatsResponse> {
    return this.request<StatsResponse>('/api/tasks/stats/summary', {}, options);
  }

  /**
   * Poll task until completed or failed
   *
   * @param taskId - Task ID to poll
   * @param interval - Polling interval in milliseconds (default: 2000)
   * @param maxAttempts - Maximum polling attempts (default: 150 = 5 minutes)
   * @returns Final task state
   */
  async pollTask(
    taskId: string,
    interval: number = 2000,
    maxAttempts: number = 150
  ): Promise<RPATask> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { task } = await this.getTask(taskId);

      if (task.status === 'COMPLETED' || task.status === 'FAILED') {
        return task;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new RPAClientError('Polling timeout: task did not complete in time');
  }

  /**
   * Wait for task to complete with callback
   *
   * @param taskId - Task ID to watch
   * @param onProgress - Callback for status updates
   * @param interval - Polling interval (default: 2000ms)
   * @param maxAttempts - Max attempts (default: 150)
   */
  async waitForTask(
    taskId: string,
    onProgress?: (task: RPATask) => void,
    interval: number = 2000,
    maxAttempts: number = 150
  ): Promise<RPATask> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { task } = await this.getTask(taskId);

      if (onProgress) {
        onProgress(task);
      }

      if (task.status === 'COMPLETED' || task.status === 'FAILED') {
        return task;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new RPAClientError('Wait timeout: task did not complete in time');
  }
}

/**
 * Default RPA client instance
 * Configured from environment variables
 */
export const rpaClient = new RPAClient({
  baseUrl: process.env.RPA_SERVICE_URL || 'http://localhost:3001',
  apiKey: process.env.RPA_API_KEY || '',
  timeout: 30000,
});

/**
 * Helper functions
 */

/**
 * Check if error is RPAClientError
 */
export function isRPAClientError(error: unknown): error is RPAClientError {
  return error instanceof RPAClientError;
}

/**
 * Safe wrapper for RPA calls with logging
 */
export async function safeRPACall<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`RPA call failed (${context})`, {
      error: error instanceof Error ? error.message : error,
      isRPAError: isRPAClientError(error),
      statusCode: isRPAClientError(error) ? error.statusCode : undefined,
    });
    return null;
  }
}

/**
 * Example usage in Next.js API route
 */
export async function exampleUsage() {
  // Create registration task
  try {
    const { taskId } = await rpaClient.createRegistroTask({
      uleUserId: 'user-123',
      userData: {
        tipoDocumento: 'CC',
        numeroDocumento: '1234567890',
        nombre: 'Juan Pérez',
        email: 'juan@example.com',
        telefono: '+573001234567',
        eps: 'Sanitas EPS',
        pension: 'Porvenir',
        arl: 'SURA',
      },
    });

    console.log('Task created:', taskId);

    // Poll until completed
    const task = await rpaClient.pollTask(taskId);
    console.log('Task completed:', task);

    return task;
  } catch (error) {
    if (isRPAClientError(error)) {
      console.error('RPA error:', error.message, error.statusCode);
    } else {
      console.error('Unknown error:', error);
    }
    throw error;
  }
}
