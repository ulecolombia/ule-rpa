import { z } from 'zod';

export const TaskTypeEnum = z.enum([
  'REGISTRO',      // Registrar usuario en Enlace
  'LIQUIDACION',   // Liquidar planilla de PILA
  'COMPROBANTE',   // Descargar comprobante
  'FULL_FLOW',     // Flujo completo (registro + liquidación)
]);

export const TaskStatusEnum = z.enum([
  'PENDING',       // En cola
  'PROCESSING',    // Ejecutándose
  'COMPLETED',     // Completada exitosamente
  'FAILED',        // Falló después de reintentos
  'CANCELLED',     // Cancelada manualmente
  'AWAITING',      // Esperando acción externa (ej: pago PSE)
]);

export const EnlaceUserStatusEnum = z.enum([
  'PENDING',       // Esperando registro en Enlace
  'REGISTERING',   // Bot está registrando
  'REGISTERED',    // Registrado exitosamente
  'ERROR',         // Error en registro
]);

export const PagoStatusEnum = z.enum([
  'PENDIENTE',     // Liquidada, esperando pago
  'EN_PROCESO',    // Pagando (PSE en curso)
  'PAGADA',        // Pago confirmado
  'RECHAZADA',     // Pago rechazado
  'VENCIDA',       // Pasó fecha límite
]);

export const LogLevelEnum = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);

// Payload para registro de usuario
export const RegistroPayloadSchema = z.object({
  tipoDocumento: z.string().default('CC'),
  numeroDocumento: z.string(),
  nombre: z.string(),
  eps: z.string().optional(),
  pension: z.string().optional(),
  arl: z.string().optional(),
});

// Payload para liquidación PILA
export const LiquidacionPayloadSchema = z.object({
  numeroDocumento: z.string(),
  periodo: z.string(), // YYYY-MM
  ingresoBase: z.number().int().positive(),
  ibc: z.number().int().positive(), // Ingreso Base de Cotización
  salud: z.number().int().positive(),
  pension: z.number().int().positive(),
  arl: z.number().int().positive(),
  total: z.number().int().positive(),
  paymentId: z.string(), // ID del pago en ULE
});

// Payload para descarga de comprobante
export const ComprobantePayloadSchema = z.object({
  numeroPlanilla: z.string(),
  numeroDocumento: z.string(),
  periodo: z.string(), // YYYY-MM
});

// Payload para flujo completo
export const FullFlowPayloadSchema = z.object({
  registro: RegistroPayloadSchema,
  liquidacion: LiquidacionPayloadSchema.omit({ numeroDocumento: true }),
});

// Create Task Request
export const CreateTaskRequestSchema = z.object({
  type: TaskTypeEnum,
  priority: z.number().min(0).max(10).default(5),
  uleUserId: z.string(),
  enlaceUserId: z.string().optional(),
  paymentId: z.string().optional(),
  inputData: z.record(z.any()), // Will be validated based on type
});

// Types
export type TaskType = z.infer<typeof TaskTypeEnum>;
export type TaskStatus = z.infer<typeof TaskStatusEnum>;
export type EnlaceUserStatus = z.infer<typeof EnlaceUserStatusEnum>;
export type PagoStatus = z.infer<typeof PagoStatusEnum>;
export type LogLevel = z.infer<typeof LogLevelEnum>;

export type RegistroPayload = z.infer<typeof RegistroPayloadSchema>;
export type LiquidacionPayload = z.infer<typeof LiquidacionPayloadSchema>;
export type ComprobantePayload = z.infer<typeof ComprobantePayloadSchema>;
export type FullFlowPayload = z.infer<typeof FullFlowPayloadSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

// Response types
export interface PlanillaResult {
  numeroPlanilla: string;
  periodo: string;
  total: number;
  fechaLimite: Date;
}

export interface ComprobanteResult {
  fileName: string;
  filePath: string;
  fileUrl?: string;
  fileSize: number;
}
