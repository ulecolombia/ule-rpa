/**
 * Alert Service
 *
 * FASE 3: Sistema de alertas para administradores
 *
 * Envía alertas a través de múltiples canales:
 * - WebSocket (tiempo real al dashboard)
 * - Webhook a ULE (para notificaciones push)
 * - Logging estructurado (para análisis)
 *
 * Tipos de alertas:
 * - CRITICAL: Sistema caído, errores masivos
 * - HIGH: Muchos fallos consecutivos, cola atascada
 * - MEDIUM: Usuarios atascados, planillas vencidas
 * - LOW: Warnings, métricas fuera de rango
 */

import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { PrismaClient } from '@prisma/client';
import { emitAdminAlert } from '../api/websocket';

const prisma = new PrismaClient();

// ============================================
// TIPOS
// ============================================

export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum AlertType {
  // Sistema
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  QUEUE_BACKLOG = 'QUEUE_BACKLOG',
  QUEUE_STALLED = 'QUEUE_STALLED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',

  // Tareas
  TASK_FAILED = 'TASK_FAILED',
  TASK_CONSECUTIVE_FAILURES = 'TASK_CONSECUTIVE_FAILURES',
  TASK_STALLED = 'TASK_STALLED',

  // Usuarios
  USER_REGISTRATION_FAILED = 'USER_REGISTRATION_FAILED',
  USERS_STUCK = 'USERS_STUCK',

  // Planillas
  PLANILLAS_EXPIRING = 'PLANILLAS_EXPIRING',
  PLANILLA_PAYMENT_FAILED = 'PLANILLA_PAYMENT_FAILED',

  // Reconciliación
  RECONCILIATION_NEEDED = 'RECONCILIATION_NEEDED',
  RECONCILIATION_COMPLETED = 'RECONCILIATION_COMPLETED',

  // Comprobantes
  COMPROBANTE_DOWNLOAD_FAILED = 'COMPROBANTE_DOWNLOAD_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

// Store alertas en memoria (últimas 100)
const alertHistory: Alert[] = [];
const MAX_ALERTS = 100;

// Cooldown para evitar spam de alertas del mismo tipo
const alertCooldowns: Map<string, number> = new Map();
const COOLDOWN_MS = {
  [AlertSeverity.CRITICAL]: 5 * 60 * 1000, // 5 min
  [AlertSeverity.HIGH]: 15 * 60 * 1000, // 15 min
  [AlertSeverity.MEDIUM]: 30 * 60 * 1000, // 30 min
  [AlertSeverity.LOW]: 60 * 60 * 1000, // 1 hora
};

// ============================================
// FUNCIONES PRINCIPALES
// ============================================

/**
 * Crear y enviar una alerta
 */
export async function createAlert(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  message: string,
  details?: Record<string, unknown>
): Promise<Alert | null> {
  // Verificar cooldown
  const cooldownKey = `${type}:${severity}`;
  const lastAlert = alertCooldowns.get(cooldownKey);
  const now = Date.now();

  if (lastAlert && now - lastAlert < COOLDOWN_MS[severity]) {
    logger.debug('Alert suppressed due to cooldown', { type, severity });
    return null;
  }

  // Crear alerta
  const alert: Alert = {
    id: `alert_${now}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    severity,
    title,
    message,
    details,
    timestamp: new Date(),
    acknowledged: false,
  };

  // Guardar en historial
  alertHistory.unshift(alert);
  if (alertHistory.length > MAX_ALERTS) {
    alertHistory.pop();
  }

  // Actualizar cooldown
  alertCooldowns.set(cooldownKey, now);

  // Log
  const logLevel = severity === AlertSeverity.CRITICAL || severity === AlertSeverity.HIGH ? 'error' : 'warn';
  logger[logLevel](`[ALERT] ${title}`, {
    alertId: alert.id,
    type,
    severity,
    message,
    details,
  });

  // Enviar por WebSocket
  try {
    emitAdminAlert(alert);
  } catch (error) {
    logger.error('Failed to emit alert via WebSocket', { error });
  }

  // Enviar webhook a ULE para alertas críticas/high
  if (severity === AlertSeverity.CRITICAL || severity === AlertSeverity.HIGH) {
    await sendAlertWebhook(alert);
  }

  return alert;
}

/**
 * Enviar alerta via webhook a ULE
 */
async function sendAlertWebhook(alert: Alert): Promise<void> {
  try {
    const webhookUrl = `${config.ule.apiUrl}/api/webhooks/rpa-alerts`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': config.ule.webhookSecret,
      },
      body: JSON.stringify({
        event: 'rpa.alert',
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.timestamp.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      logger.warn('Failed to send alert webhook', {
        status: response.status,
        alertId: alert.id,
      });
    }
  } catch (error) {
    logger.error('Error sending alert webhook', { error, alertId: alert.id });
  }
}

// ============================================
// ALERTAS ESPECÍFICAS
// ============================================

/**
 * Alerta: Tarea falló
 */
export async function alertTaskFailed(
  taskId: string,
  taskType: string,
  error: string,
  uleUserId: string
): Promise<void> {
  await createAlert(
    AlertType.TASK_FAILED,
    AlertSeverity.MEDIUM,
    `Tarea ${taskType} falló`,
    error,
    { taskId, taskType, uleUserId }
  );
}

/**
 * Alerta: Múltiples fallos consecutivos
 */
export async function alertConsecutiveFailures(
  failureCount: number,
  taskType: string,
  recentErrors: string[]
): Promise<void> {
  const severity = failureCount >= 10 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

  await createAlert(
    AlertType.TASK_CONSECUTIVE_FAILURES,
    severity,
    `${failureCount} tareas ${taskType} fallaron consecutivamente`,
    `Últimos errores: ${recentErrors.slice(0, 3).join(', ')}`,
    { failureCount, taskType, recentErrors: recentErrors.slice(0, 5) }
  );
}

/**
 * Alerta: Cola con backlog alto
 */
export async function alertQueueBacklog(
  waitingJobs: number,
  activeJobs: number
): Promise<void> {
  const severity = waitingJobs > 200 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

  await createAlert(
    AlertType.QUEUE_BACKLOG,
    severity,
    `Cola con ${waitingJobs} tareas pendientes`,
    `Hay ${waitingJobs} tareas esperando y ${activeJobs} activas. Considerar aumentar capacidad.`,
    { waitingJobs, activeJobs }
  );
}

/**
 * Alerta: Usuarios atascados en registro
 */
export async function alertUsersStuck(
  count: number,
  states: { pendingCreation: number; creating: number; credentialsError: number }
): Promise<void> {
  if (count === 0) return;

  const severity = count > 20 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

  await createAlert(
    AlertType.USERS_STUCK,
    severity,
    `${count} usuarios atascados en registro`,
    `Pending: ${states.pendingCreation}, Creating: ${states.creating}, Credentials Error: ${states.credentialsError}`,
    states
  );
}

/**
 * Alerta: Planillas por vencer
 */
export async function alertPlanillasExpiring(count: number): Promise<void> {
  if (count === 0) return;

  const severity = count > 10 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

  await createAlert(
    AlertType.PLANILLAS_EXPIRING,
    severity,
    `${count} planillas por vencer en 3 días`,
    `Hay ${count} planillas pendientes de pago que vencen pronto.`,
    { count }
  );
}

/**
 * Alerta: Pago de planilla falló
 */
export async function alertPlanillaPaymentFailed(
  numeroPlanilla: string,
  error: string,
  uleUserId: string
): Promise<void> {
  await createAlert(
    AlertType.PLANILLA_PAYMENT_FAILED,
    AlertSeverity.HIGH,
    `Pago de planilla ${numeroPlanilla} falló`,
    error,
    { numeroPlanilla, uleUserId }
  );
}

/**
 * Alerta: Descarga de comprobante falló
 */
export async function alertComprobanteDownloadFailed(
  numeroPlanilla: string,
  error: string,
  uleUserId: string
): Promise<void> {
  await createAlert(
    AlertType.COMPROBANTE_DOWNLOAD_FAILED,
    AlertSeverity.MEDIUM,
    `Descarga de comprobante ${numeroPlanilla} falló`,
    error,
    { numeroPlanilla, uleUserId }
  );
}

/**
 * Alerta: Error de storage
 */
export async function alertStorageError(
  error: string,
  context?: Record<string, unknown>
): Promise<void> {
  await createAlert(
    AlertType.STORAGE_ERROR,
    AlertSeverity.HIGH,
    'Error de almacenamiento',
    error,
    context
  );
}

/**
 * Alerta: Error de sistema crítico
 */
export async function alertSystemError(
  error: string,
  component: string
): Promise<void> {
  await createAlert(
    AlertType.SYSTEM_ERROR,
    AlertSeverity.CRITICAL,
    `Error crítico en ${component}`,
    error,
    { component }
  );
}

/**
 * Alerta: Reconciliación necesaria
 */
export async function alertReconciliationNeeded(
  stats: { stuckUsers: number; staleTasks: number; expiredPlanillas: number }
): Promise<void> {
  const total = stats.stuckUsers + stats.staleTasks + stats.expiredPlanillas;
  if (total === 0) return;

  const severity = total > 50 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

  await createAlert(
    AlertType.RECONCILIATION_NEEDED,
    severity,
    `Reconciliación necesaria: ${total} items`,
    `Usuarios atascados: ${stats.stuckUsers}, Tareas estancadas: ${stats.staleTasks}, Planillas vencidas: ${stats.expiredPlanillas}`,
    stats
  );
}

// ============================================
// GESTIÓN DE ALERTAS
// ============================================

/**
 * Obtener historial de alertas
 */
export function getAlerts(options?: {
  severity?: AlertSeverity;
  type?: AlertType;
  acknowledged?: boolean;
  limit?: number;
}): Alert[] {
  let filtered = [...alertHistory];

  if (options?.severity) {
    filtered = filtered.filter((a) => a.severity === options.severity);
  }

  if (options?.type) {
    filtered = filtered.filter((a) => a.type === options.type);
  }

  if (options?.acknowledged !== undefined) {
    filtered = filtered.filter((a) => a.acknowledged === options.acknowledged);
  }

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Obtener alertas activas (no reconocidas)
 */
export function getActiveAlerts(): Alert[] {
  return alertHistory.filter((a) => !a.acknowledged);
}

/**
 * Reconocer una alerta
 */
export function acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
  const alert = alertHistory.find((a) => a.id === alertId);
  if (!alert) return false;

  alert.acknowledged = true;
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = acknowledgedBy;

  logger.info('Alert acknowledged', {
    alertId,
    acknowledgedBy,
  });

  return true;
}

/**
 * Reconocer todas las alertas
 */
export function acknowledgeAllAlerts(acknowledgedBy: string): number {
  let count = 0;
  const now = new Date();

  for (const alert of alertHistory) {
    if (!alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledgedAt = now;
      alert.acknowledgedBy = acknowledgedBy;
      count++;
    }
  }

  logger.info('All alerts acknowledged', { count, acknowledgedBy });

  return count;
}

/**
 * Obtener resumen de alertas
 */
export function getAlertsSummary(): {
  total: number;
  active: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<string, number>;
} {
  const bySeverity: Record<AlertSeverity, number> = {
    [AlertSeverity.CRITICAL]: 0,
    [AlertSeverity.HIGH]: 0,
    [AlertSeverity.MEDIUM]: 0,
    [AlertSeverity.LOW]: 0,
  };

  const byType: Record<string, number> = {};

  for (const alert of alertHistory) {
    bySeverity[alert.severity]++;
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  }

  return {
    total: alertHistory.length,
    active: alertHistory.filter((a) => !a.acknowledged).length,
    bySeverity,
    byType,
  };
}

// ============================================
// MONITOREO PERIÓDICO
// ============================================

/**
 * Ejecutar chequeos de monitoreo
 * Llamar desde el scheduler cada 5-15 minutos
 */
export async function runMonitoringChecks(): Promise<void> {
  logger.debug('Running monitoring checks');

  try {
    // 1. Verificar usuarios atascados
    const stuckUsersCounts = await prisma.enlaceUser.groupBy({
      by: ['soiAccountStatus'],
      where: {
        soiAccountStatus: {
          in: ['PENDING_CREATION', 'CREATING', 'CREDENTIALS_ERROR'],
        },
      },
      _count: true,
    });

    const stuckStates = {
      pendingCreation: 0,
      creating: 0,
      credentialsError: 0,
    };

    for (const item of stuckUsersCounts) {
      if (item.soiAccountStatus === 'PENDING_CREATION') {
        stuckStates.pendingCreation = item._count;
      } else if (item.soiAccountStatus === 'CREATING') {
        stuckStates.creating = item._count;
      } else if (item.soiAccountStatus === 'CREDENTIALS_ERROR') {
        stuckStates.credentialsError = item._count;
      }
    }

    const totalStuck =
      stuckStates.pendingCreation + stuckStates.creating + stuckStates.credentialsError;

    if (totalStuck > 5) {
      await alertUsersStuck(totalStuck, stuckStates);
    }

    // 2. Verificar planillas por vencer
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const expiringPlanillas = await prisma.pilaPlanilla.count({
      where: {
        estadoPago: 'PENDIENTE',
        fechaLimite: {
          gte: new Date(),
          lte: threeDaysFromNow,
        },
      },
    });

    if (expiringPlanillas > 0) {
      await alertPlanillasExpiring(expiringPlanillas);
    }

    // 3. Verificar tareas fallidas recientes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFailures = await prisma.task.findMany({
      where: {
        status: 'FAILED',
        failedAt: {
          gte: oneHourAgo,
        },
      },
      orderBy: {
        failedAt: 'desc',
      },
      take: 10,
      select: {
        type: true,
        error: true,
      },
    });

    if (recentFailures.length >= 5) {
      const types = [...new Set(recentFailures.map((f) => f.type))];
      const errors = recentFailures.map((f) => f.error || 'Unknown').filter(Boolean);

      await alertConsecutiveFailures(
        recentFailures.length,
        types.join(', '),
        errors as string[]
      );
    }

    logger.debug('Monitoring checks completed', {
      stuckUsers: totalStuck,
      expiringPlanillas,
      recentFailures: recentFailures.length,
    });
  } catch (error) {
    logger.error('Error running monitoring checks', { error });
    await alertSystemError(
      error instanceof Error ? error.message : 'Unknown error',
      'MonitoringChecks'
    );
  }
}
