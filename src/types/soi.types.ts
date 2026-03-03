/**
 * SOI Types - Tipos para integración multi-usuario con SOI
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const TipoDocumentoEnum = z.enum(['CC', 'CE', 'NIT', 'PA', 'TI', 'RC']);
export type TipoDocumento = z.infer<typeof TipoDocumentoEnum>;

export const SOIAccountStatusEnum = z.enum([
  'NOT_LINKED',      // Usuario no ha vinculado cuenta SOI
  'PENDING_CREATION', // Pendiente crear cuenta en SOI
  'CREATING',        // Bot creando cuenta
  'ACTIVE',          // Cuenta activa y vinculada
  'CREDENTIALS_ERROR', // Credenciales inválidas
  'BLOCKED',         // Cuenta bloqueada en SOI
]);
export type SOIAccountStatus = z.infer<typeof SOIAccountStatusEnum>;

// ============================================================================
// USUARIO SOI (para crear/validar cuenta)
// ============================================================================

/**
 * Datos mínimos para validar credenciales SOI
 */
export const SOICredentialsSchema = z.object({
  tipoDocumento: TipoDocumentoEnum,
  documento: z.string().min(5).max(15),
  password: z.string().min(4),
});
export type SOICredentials = z.infer<typeof SOICredentialsSchema>;

/**
 * Datos completos para crear usuario en SOI
 */
export const SOIUserRegistrationSchema = z.object({
  // Identificación
  tipoDocumento: TipoDocumentoEnum,
  documento: z.string().min(5).max(15),

  // Datos personales
  nombres: z.string().min(2),
  apellidos: z.string().min(2),

  // Ubicación (requeridos por SOI)
  departamento: z.string().min(2),
  municipio: z.string().min(2),

  // Contacto del usuario real (para notificaciones ULE)
  celularUsuario: z.string().optional(),
  emailUsuario: z.string().email().optional(),
});
export type SOIUserRegistration = z.infer<typeof SOIUserRegistrationSchema>;

/**
 * Resultado de crear cuenta SOI
 */
export interface SOIAccountCreationResult {
  success: boolean;
  accountCreated: boolean;
  generatedPassword?: string; // Password generada (para guardar encriptada)
  message: string;
  error?: string;
}

/**
 * Resultado de validar credenciales SOI
 */
export interface SOICredentialsValidationResult {
  valid: boolean;
  userName?: string;      // Nombre del usuario en SOI
  accountType?: string;   // Tipo de cuenta (INDEPENDIENTE, etc.)
  message: string;
  error?: string;
}

// ============================================================================
// PLANILLA SOI
// ============================================================================

/**
 * Datos para crear una planilla
 */
export const SOIPlanillaRequestSchema = z.object({
  // Credenciales del usuario
  tipoDocumento: TipoDocumentoEnum,
  documento: z.string(),
  soiPassword: z.string(), // Viene encriptada, RPA desencripta

  // Datos de la planilla
  periodoMes: z.number().min(1).max(12),
  periodoAno: z.number().min(2020).max(2030),
  ibc: z.number().min(1300000), // Mínimo 1 SMLV

  // Opcionales - datos del cotizante
  diasCotizados: z.number().min(1).max(30).default(30),
  primerNombre: z.string().optional(),
  primerApellido: z.string().optional(),
  departamento: z.string().optional(), // Código departamento (ej: "11" = Bogotá)
  municipio: z.string().optional(),     // Código municipio (ej: "001")
  epsCodigo: z.string().optional(),     // Código EPS del usuario
  afpCodigo: z.string().optional(),     // Código AFP del usuario

  // Si quiere pagar inmediatamente
  iniciarPago: z.boolean().default(false),
  banco: z.string().optional(), // BANCOLOMBIA, etc.
});
export type SOIPlanillaRequest = z.infer<typeof SOIPlanillaRequestSchema>;

/**
 * Resultado de crear planilla
 */
export interface SOIPlanillaResult {
  success: boolean;
  numeroPlanilla?: string;

  // Valores calculados
  valorSalud?: number;
  valorPension?: number;
  valorArl?: number;
  valorTotal?: number;

  // Estado
  estado?: 'LIQUIDADA' | 'PENDIENTE_PAGO' | 'PAGADA' | 'ERROR';

  // Si se inició pago
  pagoIniciado?: boolean;
  urlPago?: string; // URL PSE si aplica

  message: string;
  error?: string;
  screenshotPath?: string;
}

// ============================================================================
// CONFIGURACIÓN FIJA DE ULE
// ============================================================================

/**
 * Datos fijos que ULE usa para crear cuentas SOI
 */
export const ULE_SOI_CONFIG = {
  // Email de ULE para recibir notificaciones de SOI y activación de cuentas
  email: 'pagos.ule@gmail.com',

  // Celular de ULE
  celular: '3000000000', // TODO: Definir número real de ULE

  // Prefijo para teléfono aleatorio
  telefonoPrefix: '601',

  // Roles por defecto
  rolSOI: 'SELECCIONE',
  rolPCSS: 'SELECCIONE',

  // Estado por defecto
  activo: 'SI',
} as const;

/**
 * Genera un teléfono fijo aleatorio para SOI
 */
export function generateRandomPhone(): string {
  const suffix = Math.floor(Math.random() * 9000000) + 1000000;
  return `${ULE_SOI_CONFIG.telefonoPrefix}${suffix}`;
}

// ============================================================================
// TIPOS PARA API REQUESTS
// ============================================================================

/**
 * Request para validar credenciales
 */
export const ValidateCredentialsRequestSchema = z.object({
  tipoDocumento: TipoDocumentoEnum,
  documento: z.string(),
  password: z.string(),
});
export type ValidateCredentialsRequest = z.infer<typeof ValidateCredentialsRequestSchema>;

/**
 * Request para crear cuenta SOI
 */
export const CreateSOIAccountRequestSchema = SOIUserRegistrationSchema;
export type CreateSOIAccountRequest = z.infer<typeof CreateSOIAccountRequestSchema>;

/**
 * Request para crear planilla
 */
export const CreatePlanillaRequestSchema = SOIPlanillaRequestSchema;
export type CreatePlanillaRequest = z.infer<typeof CreatePlanillaRequestSchema>;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TipoDocumentoEnum,
  SOIAccountStatusEnum,
  SOICredentialsSchema,
  SOIUserRegistrationSchema,
  SOIPlanillaRequestSchema,
  ValidateCredentialsRequestSchema,
  CreateSOIAccountRequestSchema,
  CreatePlanillaRequestSchema,
  ULE_SOI_CONFIG,
  generateRandomPhone,
};
