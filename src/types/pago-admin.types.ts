import { PagoAdminStatus } from '@prisma/client';

/**
 * FASE 6: Tipos para Pago Admin-Controlled
 *
 * Flujo donde el admin inicia el RPA, este automatiza hasta Bancolombia,
 * y el admin toma control para completar el pago manualmente.
 */

// ============================================
// Request/Response Types para API
// ============================================

/**
 * Request para iniciar el RPA desde el dashboard
 */
export interface IniciarRPARequest {
  planillaId: string;
  adminId?: string; // ID del admin que inicia (opcional, se puede tomar del token)
}

/**
 * Response al iniciar el RPA
 */
export interface IniciarRPAResponse {
  success: boolean;
  sessionId: string;
  message: string;
  estimatedTimeToBank: string; // "2-3 minutos"
}

/**
 * Response con información de sesión
 */
export interface PagoAdminSessionInfo {
  sessionId: string;
  status: PagoAdminStatus;
  planilla: {
    id: string;
    numeroPlanilla: string;
    valorTotal: number;
    periodo: string;
    usuario: {
      nombre: string;
      documento: string;
    };
  };
  lastScreenshot: string | null;
  screenshotHistory: string[];
  startedAt: Date | null;
  awaitingAdminAt: Date | null;
  timeoutAt: Date | null;
  timeoutIn: number | null; // segundos restantes
  progress: number;
  progressMessage: string | null;
  canTakeScreenshot: boolean;
  adminId: string | null;
}

/**
 * Request para confirmar que el pago fue completado
 */
export interface ConfirmarPagoRequest {
  adminBelievesSuccess?: boolean; // Opcional: admin indica si cree que fue exitoso
}

/**
 * Request para cancelar una sesión
 */
export interface CancelarSesionRequest {
  reason?: string;
}

/**
 * Response de screenshot
 */
export interface ScreenshotResponse {
  screenshotUrl: string;
  capturedAt: Date;
}

/**
 * Lista de sesiones activas
 */
export interface SesionesActivasResponse {
  sessions: PagoAdminSessionInfo[];
  totalActive: number;
  maxAllowed: number; // 3 sesiones máximo
  canStartNew: boolean;
}

// ============================================
// WebSocket Event Types
// ============================================

/**
 * Evento: RPA iniciado
 */
export interface PagoAdminStartedEvent {
  sessionId: string;
  planillaId: string;
  status: 'RPA_STARTING';
  adminId: string;
}

/**
 * Evento: Progreso del RPA
 */
export interface PagoAdminProgressEvent {
  sessionId: string;
  status: PagoAdminStatus;
  message: string;
  progress: number; // 0-100
}

/**
 * Evento: RPA llegó a Bancolombia, esperando input del admin
 */
export interface PagoAdminAwaitingInputEvent {
  sessionId: string;
  planillaId: string;
  numeroPlanilla: string;
  valorTotal: number;
  screenshotUrl: string;
  timeoutMinutes: number;
  timeoutAt: Date;
  message: string;
}

/**
 * Evento: Screenshot actualizado
 */
export interface PagoAdminScreenshotEvent {
  sessionId: string;
  screenshotUrl: string;
  capturedAt: Date;
}

/**
 * Evento: Verificando pago
 */
export interface PagoAdminVerifyingEvent {
  sessionId: string;
  message: string;
}

/**
 * Evento: Pago completado exitosamente
 */
export interface PagoAdminCompletedEvent {
  sessionId: string;
  planillaId: string;
  success: true;
  transactionId: string | null;
  comprobanteUrl: string;
  message: string;
}

/**
 * Evento: Pago falló
 */
export interface PagoAdminFailedEvent {
  sessionId: string;
  planillaId: string;
  error: string;
  canRetry: boolean;
  failedAt: PagoAdminStatus; // En qué estado falló
}

/**
 * Evento: Timeout por inactividad
 */
export interface PagoAdminTimeoutEvent {
  sessionId: string;
  planillaId: string;
  message: string;
  inactiveMinutes: number;
}

/**
 * Union type de todos los eventos WebSocket
 */
export type PagoAdminWebSocketEvent =
  | { type: 'pago-admin:started'; data: PagoAdminStartedEvent }
  | { type: 'pago-admin:progress'; data: PagoAdminProgressEvent }
  | { type: 'pago-admin:awaiting-input'; data: PagoAdminAwaitingInputEvent }
  | { type: 'pago-admin:screenshot'; data: PagoAdminScreenshotEvent }
  | { type: 'pago-admin:verifying'; data: PagoAdminVerifyingEvent }
  | { type: 'pago-admin:completed'; data: PagoAdminCompletedEvent }
  | { type: 'pago-admin:failed'; data: PagoAdminFailedEvent }
  | { type: 'pago-admin:timeout'; data: PagoAdminTimeoutEvent };

// ============================================
// Bot Internal Types
// ============================================

/**
 * Resultado del bot al llegar a Bancolombia
 */
export interface PagoHastaBancolombiaResult {
  success: boolean;
  reachedBank: boolean;
  bankScreenshotUrl?: string;
  browserSessionId?: string; // ID para recuperar la página después
  error?: string;
  errorAt?: PagoAdminStatus;
}

/**
 * Resultado de verificar y descargar comprobante
 */
export interface VerificarYDescargarResult {
  success: boolean;
  paymentApproved: boolean;
  transactionId?: string;
  comprobanteUrl?: string;
  error?: string;
}

/**
 * Callbacks para el bot
 */
export interface PagoAdminBotCallbacks {
  onProgress: (status: PagoAdminStatus, message: string, progress: number) => Promise<void>;
  onScreenshot: (screenshotUrl: string) => Promise<void>;
  onError: (error: string, status: PagoAdminStatus) => Promise<void>;
}

// ============================================
// Session Manager Types
// ============================================

/**
 * Datos de sesión activa en memoria
 */
export interface ActivePagoAdminSession {
  sessionId: string;
  planillaId: string;
  browserSessionId: string;
  adminId: string;
  startedAt: Date;
  awaitingAdminAt?: Date;
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * Configuración del sistema de pago admin
 */
export interface PagoAdminConfig {
  maxConcurrentSessions: number; // 3
  adminTimeoutMinutes: number; // 10
  screenshotIntervalSeconds: number; // Cada cuánto tomar screenshot automático
  cleanupIntervalMinutes: number; // Cada cuánto limpiar sesiones muertas
}

// ============================================
// Dashboard View Types (para frontend)
// ============================================

/**
 * Planilla pendiente vista desde el dashboard
 */
export interface PlanillaPendienteAdmin {
  id: string;
  numeroPlanilla: string;
  periodo: string;
  valorTotal: number;
  fechaLimite: Date;
  urgencia: 'VENCIDA' | 'URGENTE' | 'PROXIMA' | 'A_TIEMPO';
  diasRestantes: number;
  usuario: {
    id: string;
    nombre: string;
    documento: string;
  };
  // Estado de sesión si existe
  sesionActiva?: {
    sessionId: string;
    status: PagoAdminStatus;
    adminId: string | null;
    progress: number;
  };
}

/**
 * Resumen del dashboard de pagos
 */
export interface DashboardPagosResumen {
  planillasPendientes: number;
  vencidas: number;
  urgentes: number; // Vencen en < 2 días
  proximas: number; // Vencen en 2-5 días
  totalPorPagar: number; // Suma de valores
  sesionesActivas: number;
  maxSesiones: number;
}

// ============================================
// Error Types
// ============================================

export class PagoAdminError extends Error {
  constructor(
    message: string,
    public code: PagoAdminErrorCode,
    public sessionId?: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'PagoAdminError';
  }
}

export enum PagoAdminErrorCode {
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_LOCKED = 'SESSION_LOCKED', // Otro admin la tiene
  MAX_SESSIONS_REACHED = 'MAX_SESSIONS_REACHED',

  // State errors
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  ALREADY_PROCESSING = 'ALREADY_PROCESSING',
  NOT_AWAITING_INPUT = 'NOT_AWAITING_INPUT',

  // Browser errors
  BROWSER_SESSION_LOST = 'BROWSER_SESSION_LOST',
  PAGE_NOT_FOUND = 'PAGE_NOT_FOUND',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',

  // Payment errors
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  BANK_ERROR = 'BANK_ERROR',

  // Planilla errors
  PLANILLA_NOT_FOUND = 'PLANILLA_NOT_FOUND',
  PLANILLA_ALREADY_PAID = 'PLANILLA_ALREADY_PAID',
  PLANILLA_EXPIRED = 'PLANILLA_EXPIRED',

  // Generic
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
