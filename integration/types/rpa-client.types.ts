/**
 * TypeScript Types for RPA Service Integration
 *
 * UBICACIÓN EN ULE: types/rpa-client.types.ts
 */

/**
 * Tipos de documentos colombianos
 */
export type TipoDocumento = 'CC' | 'CE' | 'PEP' | 'TI' | 'PASSPORT';

/**
 * Estados de tareas RPA
 */
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Tipos de tareas RPA
 */
export type TaskType = 'REGISTRO' | 'LIQUIDACION' | 'COMPROBANTE' | 'FULL_FLOW';

/**
 * Datos de usuario para registro en Enlace
 */
export interface RPAUserData {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombre: string;
  email: string;
  telefono: string;
  eps: string;
  pension: string;
  arl: string;
}

/**
 * Datos de liquidación PILA
 */
export interface RPAPilaData {
  periodo: string; // YYYY-MM
  ingresoBase: number;
  ibc: number;
  salud: number;
  pension: number;
  arl: number;
  total: number;
}

/**
 * Request para crear tarea de registro
 */
export interface CreateRegistroTaskRequest {
  uleUserId: string;
  userData: RPAUserData;
}

/**
 * Request para crear tarea de liquidación
 */
export interface CreateLiquidacionTaskRequest {
  uleUserId: string;
  paymentId: string;
  pilaData: RPAPilaData;
}

/**
 * Request para crear tarea de comprobante
 */
export interface CreateComprobanteTaskRequest {
  uleUserId: string;
  numeroPlanilla: string;
  periodo: string;
}

/**
 * Response al crear una tarea
 */
export interface CreateTaskResponse {
  message: string;
  taskId: string;
}

/**
 * Error response del RPA
 */
export interface RPAErrorResponse {
  error: string;
  taskId?: string;
}

/**
 * Log de tarea
 */
export interface TaskLog {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, any>;
  screenshot?: string;
  timestamp: string;
}

/**
 * Resultado de registro
 */
export interface RegistroResult {
  enlaceUserId: string;
  alreadyExists?: boolean;
  warnings?: string[];
  enlaceUserRecordId?: string;
}

/**
 * Resultado de liquidación
 */
export interface LiquidacionResult {
  planillaId: string;
  numeroPlanilla: string;
  total: number;
  fechaLimite: string;
}

/**
 * Resultado de comprobante
 */
export interface ComprobanteResult {
  comprobanteId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

/**
 * Tarea RPA completa
 */
export interface RPATask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  uleUserId: string;
  enlaceUserId?: string;
  inputData: Record<string, any>;
  resultData?: RegistroResult | LiquidacionResult | ComprobanteResult;
  error?: string;
  attempts: number;
  priority: number;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
  logs?: TaskLog[];
}

/**
 * Response al consultar una tarea
 */
export interface GetTaskResponse {
  task: RPATask;
}

/**
 * Estadísticas de cola
 */
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

/**
 * Estadísticas de base de datos
 */
export interface DatabaseStats {
  status: TaskStatus;
  _count: number;
}

/**
 * Response de estadísticas
 */
export interface StatsResponse {
  queue: QueueStats;
  database: DatabaseStats[];
}

/**
 * Webhook payload del RPA
 */
export interface RPAWebhookPayload {
  event: 'task.completed' | 'task.failed' | 'task.started';
  taskId: string;
  uleUserId: string;
  type: TaskType;
  status: TaskStatus;
  resultData?: RegistroResult | LiquidacionResult | ComprobanteResult;
  error?: string;
  timestamp: string;
}

/**
 * Configuración del cliente RPA
 */
export interface RPAClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number; // milliseconds
}

/**
 * Opciones para requests
 */
export interface RPARequestOptions {
  retries?: number;
  retryDelay?: number; // milliseconds
  timeout?: number; // milliseconds
}
