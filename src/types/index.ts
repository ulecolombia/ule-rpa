export * from './task.types';
export * from './user.types';

/**
 * User data from ULE
 * Complete information about an independent worker
 */
export interface UserData {
  uleUserId: string;
  tipoDocumento: 'CC' | 'CE' | 'PEP';
  numeroDocumento: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  eps: string;
  pension: string;
  arl: string;
}

/**
 * PILA liquidation data
 * All values required for generating a PILA payment
 */
export interface PilaData {
  periodo: string; // Format: "YYYY-MM" (e.g., "2026-02")
  ingresoBase: number; // Monthly income
  ibc: number; // Ingreso Base de Cotización (contribution base)
  diasCotizados: number; // Days worked in the period (usually 30)
  salud: number; // Health contribution amount
  pension: number; // Pension contribution amount
  arl: number; // Occupational risk insurance amount
  nivelRiesgoARL: 'I' | 'II' | 'III' | 'IV' | 'V'; // Risk level
  total: number; // Total amount to pay (salud + pension + arl)
}

/**
 * Task input for creating new RPA tasks
 */
export interface TaskInput {
  type: 'REGISTRO' | 'LIQUIDACION' | 'COMPROBANTE' | 'FULL_FLOW';
  uleUserId: string;
  enlaceUserId?: string;
  userData?: UserData;
  pilaData?: PilaData;
  paymentId?: string;
  priority?: number;
}

/**
 * Task result returned after execution
 */
export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  screenshot?: string;
}

/**
 * Bot response wrapper
 * Generic response from bot operations
 */
export interface BotResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  screenshot?: string;
  duration?: number;
}

/**
 * Enlace authentication result
 */
export interface EnlaceAuthResult {
  authenticated: boolean;
  sessionId?: string;
  cookies?: any;
  error?: string;
}

/**
 * Enlace user registration result
 */
export interface EnlaceRegistroResult {
  registered: boolean;
  enlaceUserId?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Enlace PILA liquidation result
 */
export interface EnlaceLiquidacionResult {
  liquidated: boolean;
  numeroPlanilla?: string;
  total?: number;
  fechaLimite?: Date;
  error?: string;
}

/**
 * Enlace comprobante download result
 */
export interface EnlaceComprobanteResult {
  downloaded: boolean;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Enlace user search result
 */
export interface EnlaceSearchResult {
  found: boolean;
  userData?: {
    numeroDocumento: string;
    nombre: string;
    estado: string;
    enlaceUserId?: string;
  };
  error?: string;
}

/**
 * API response wrapper
 * Standard format for all API responses
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Task log entry
 */
export interface TaskLogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: any;
  screenshot?: string;
  timestamp?: Date;
}

/**
 * Task statistics
 */
export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  awaiting: number;
  successRate: number;
  avgDuration: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

/**
 * Health check response
 */
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  queue?: QueueStats;
  memory?: {
    used: number;
    total: number;
    percentage: number;
  };
}

/**
 * Webhook payload from ULE
 */
export interface WebhookPayload {
  event: 'task.create' | 'payment.completed' | 'user.registered';
  timestamp: string;
  data: any;
  signature: string;
}

/**
 * File upload result
 */
export interface FileUploadResult {
  fileName: string;
  filePath: string;
  fileUrl?: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}
