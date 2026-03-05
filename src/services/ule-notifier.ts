import { logger } from '../utils/logger';
import { config } from '../utils/config';

// ============================================
// INTERFACES
// ============================================
interface NotificacionPILA {
  tipo: 'PILA_COMPLETADA' | 'PILA_FALLIDA';
  planillaId: string;
  numeroPlanilla: string;
  comprobanteUrl?: string;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _NotificacionLiquidacion {
  tipo: 'LIQUIDACION_CREADA' | 'LIQUIDACION_LISTA' | 'LIQUIDACION_FALLIDA';
  planillaId?: string;
  numeroPlanilla?: string;
  periodo?: string;
  valorTotal?: number;
  valorSalud?: number;
  valorPension?: number;
  valorArl?: number;
  error?: string;
}

export interface WebhookPayload {
  event: string;
  userId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ============================================
// NOTIFICAR A USUARIO EN ULE
// ============================================
export async function notificarUsuarioULE(
  uleUserId: string,
  notificacion: NotificacionPILA
): Promise<void> {
  logger.info('Notifying ULE user', {
    uleUserId,
    tipo: notificacion.tipo,
  });

  try {
    // Llamar al API de ULE para crear notificación
    const response = await fetch(`${config.ule.apiUrl}/api/notificaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': config.ule.webhookSecret,
      },
      body: JSON.stringify({
        userId: uleUserId,
        tipo: notificacion.tipo,
        titulo:
          notificacion.tipo === 'PILA_COMPLETADA'
            ? 'Pago PILA Completado'
            : 'Error en Pago PILA',
        mensaje:
          notificacion.tipo === 'PILA_COMPLETADA'
            ? `Tu pago PILA ${notificacion.numeroPlanilla} se completó exitosamente. Comprobante disponible para descarga.`
            : `Hubo un error procesando tu pago PILA ${notificacion.numeroPlanilla}. ${notificacion.error}`,
        data: {
          planillaId: notificacion.planillaId,
          numeroPlanilla: notificacion.numeroPlanilla,
          comprobanteUrl: notificacion.comprobanteUrl,
        },
        leida: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`ULE API responded with status ${response.status}`);
    }

    const data = (await response.json()) as { id?: string };

    logger.info('ULE user notified successfully', {
      uleUserId,
      notificationId: data.id,
    });
  } catch (error) {
    logger.error('Error notifying ULE user', {
      uleUserId,
      error,
    });
    // No lanzar error, solo loguear
    // La notificación es importante pero no crítica
  }
}

// ============================================
// NOTIFICAR PAGO COMPLETADO
// ============================================
export async function notificarPagoCompletado(
  uleUserId: string,
  planillaId: string,
  numeroPlanilla: string,
  comprobanteUrl: string
): Promise<void> {
  await notificarUsuarioULE(uleUserId, {
    tipo: 'PILA_COMPLETADA',
    planillaId,
    numeroPlanilla,
    comprobanteUrl,
  });
}

// ============================================
// NOTIFICAR PAGO FALLIDO
// ============================================
export async function notificarPagoFallido(
  uleUserId: string,
  planillaId: string,
  numeroPlanilla: string,
  error: string
): Promise<void> {
  await notificarUsuarioULE(uleUserId, {
    tipo: 'PILA_FALLIDA',
    planillaId,
    numeroPlanilla,
    error,
  });
}

// ============================================
// WEBHOOK GENÉRICO A ULE
// ============================================
export async function enviarWebhookULE(
  payload: WebhookPayload
): Promise<boolean> {
  logger.info('Sending webhook to ULE', {
    event: payload.event,
    userId: payload.userId,
  });

  try {
    const response = await fetch(`${config.ule.apiUrl}/api/webhooks/rpa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': config.ule.webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ULE webhook responded with status ${response.status}`);
    }

    logger.info('Webhook sent successfully', {
      event: payload.event,
      userId: payload.userId,
    });

    return true;
  } catch (error) {
    logger.error('Error sending webhook to ULE', {
      event: payload.event,
      userId: payload.userId,
      error,
    });
    return false;
  }
}

// ============================================
// NOTIFICAR LIQUIDACIÓN CREADA
// ============================================
export async function notificarLiquidacionCreada(
  uleUserId: string,
  data: {
    numeroPlanilla: string;
    periodo: string;
    valorTotal: number;
    valorSalud: number;
    valorPension: number;
    valorArl?: number;
    planillaId?: string;
  }
): Promise<boolean> {
  return enviarWebhookULE({
    event: 'liquidacion.creada',
    userId: uleUserId,
    timestamp: new Date().toISOString(),
    data: {
      status: 'LISTA_PARA_PAGO',
      numeroPlanilla: data.numeroPlanilla,
      periodo: data.periodo,
      valorTotal: data.valorTotal,
      valorSalud: data.valorSalud,
      valorPension: data.valorPension,
      valorArl: data.valorArl || 0,
      planillaId: data.planillaId,
      message: `Planilla ${data.numeroPlanilla} creada exitosamente. Lista para pago.`,
    },
  });
}

// ============================================
// NOTIFICAR LIQUIDACIÓN EN PROGRESO
// ============================================
export async function notificarLiquidacionEnProgreso(
  uleUserId: string,
  data: {
    taskId: string;
    step: string;
    progress: number;
  }
): Promise<boolean> {
  return enviarWebhookULE({
    event: 'liquidacion.progreso',
    userId: uleUserId,
    timestamp: new Date().toISOString(),
    data: {
      status: 'EN_PROCESO',
      taskId: data.taskId,
      step: data.step,
      progress: data.progress,
    },
  });
}

// ============================================
// NOTIFICAR LIQUIDACIÓN FALLIDA
// ============================================
export async function notificarLiquidacionFallida(
  uleUserId: string,
  data: {
    error: string;
    taskId?: string;
    step?: string;
    periodo?: string;
  }
): Promise<boolean> {
  return enviarWebhookULE({
    event: 'liquidacion.fallida',
    userId: uleUserId,
    timestamp: new Date().toISOString(),
    data: {
      status: 'FALLIDA',
      error: data.error,
      taskId: data.taskId,
      step: data.step,
      periodo: data.periodo,
      message: `Error al crear planilla: ${data.error}`,
    },
  });
}
