/**
 * Validation utilities for Colombian-specific data
 */

import { z } from 'zod';

/**
 * Colombian document types
 */
export const DOCUMENT_TYPES = ['CC', 'CE', 'PEP', 'TI', 'RC'] as const;

/**
 * ARL risk levels
 */
export const ARL_RISK_LEVELS = ['I', 'II', 'III', 'IV', 'V'] as const;

/**
 * Common Colombian cities
 */
export const CITIES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Cúcuta',
  'Bucaramanga',
  'Pereira',
  'Santa Marta',
  'Ibagué',
  'Pasto',
  'Manizales',
  'Neiva',
  'Villavicencio',
  'Armenia',
] as const;

/**
 * Common EPS (Health) providers
 */
export const EPS_PROVIDERS = [
  'SANITAS',
  'SURA',
  'SALUD TOTAL',
  'COMPENSAR',
  'FAMISANAR',
  'NUEVA EPS',
  'ALIANSALUD',
  'COOSALUD',
  'MEDIMAS',
  'CAFESALUD',
] as const;

/**
 * Common Pension providers
 */
export const PENSION_PROVIDERS = [
  'PORVENIR',
  'PROTECCION',
  'COLFONDOS',
  'OLD MUTUAL',
  'SKANDIA',
  'COLPENSIONES',
] as const;

/**
 * Common ARL (Occupational Risk) providers
 */
export const ARL_PROVIDERS = [
  'SURA',
  'POSITIVA',
  'LIBERTY',
  'COLMENA',
  'BOLIVAR',
  'MAPFRE',
  'AXA COLPATRIA',
] as const;

/**
 * Validate Colombian document number
 */
export function validateDocumento(documento: string, tipo: string = 'CC'): {
  valid: boolean;
  error?: string;
} {
  // Remove non-digits
  const clean = documento.replace(/\D/g, '');

  if (!clean) {
    return { valid: false, error: 'Documento no puede estar vacío' };
  }

  switch (tipo) {
    case 'CC': // Cédula de Ciudadanía
      if (clean.length < 6 || clean.length > 10) {
        return { valid: false, error: 'CC debe tener entre 6 y 10 dígitos' };
      }
      break;

    case 'CE': // Cédula de Extranjería
      if (clean.length < 6 || clean.length > 10) {
        return { valid: false, error: 'CE debe tener entre 6 y 10 dígitos' };
      }
      break;

    case 'PEP': // Permiso Especial de Permanencia
      if (clean.length < 7 || clean.length > 12) {
        return { valid: false, error: 'PEP debe tener entre 7 y 12 dígitos' };
      }
      break;

    case 'TI': // Tarjeta de Identidad
      if (clean.length < 10 || clean.length > 11) {
        return { valid: false, error: 'TI debe tener 10 u 11 dígitos' };
      }
      break;

    default:
      return { valid: true };
  }

  if (!/^\d+$/.test(clean)) {
    return { valid: false, error: 'Documento debe contener solo números' };
  }

  return { valid: true };
}

/**
 * Validate Colombian phone number
 */
export function validateTelefono(telefono: string): {
  valid: boolean;
  error?: string;
} {
  // Remove non-digits
  const clean = telefono.replace(/\D/g, '');

  if (!clean) {
    return { valid: false, error: 'Teléfono no puede estar vacío' };
  }

  // Colombian mobile numbers: 10 digits starting with 3
  // Landlines: 7 digits (with area code: 10 digits)
  if (clean.length === 10) {
    if (!clean.startsWith('3')) {
      return { valid: false, error: 'Número celular debe empezar con 3' };
    }
  } else if (clean.length !== 7) {
    return { valid: false, error: 'Teléfono debe tener 7 o 10 dígitos' };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): {
  valid: boolean;
  error?: string;
} {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Email inválido' };
  }

  return { valid: true };
}

/**
 * Validate PILA period format (YYYY-MM)
 */
export function validatePilaPeriod(periodo: string): {
  valid: boolean;
  error?: string;
} {
  const regex = /^\d{4}-(0[1-9]|1[0-2])$/;

  if (!regex.test(periodo)) {
    return { valid: false, error: 'Periodo debe estar en formato YYYY-MM' };
  }

  const [year, month] = periodo.split('-').map(Number);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Can't liquidate future periods
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    return { valid: false, error: 'No se puede liquidar un periodo futuro' };
  }

  // Can't liquidate periods older than 2 years
  const periodDate = new Date(year, month - 1);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  if (periodDate < twoYearsAgo) {
    return { valid: false, error: 'Periodo muy antiguo (máximo 2 años)' };
  }

  return { valid: true };
}

/**
 * Validate IBC (Ingreso Base de Cotización)
 */
export function validateIBC(
  ibc: number,
  salarioMinimo: number = 1300000
): {
  valid: boolean;
  error?: string;
} {
  const min = salarioMinimo;
  const max = salarioMinimo * 25;

  if (ibc < min) {
    return {
      valid: false,
      error: `IBC no puede ser menor al salario mínimo (${min})`,
    };
  }

  if (ibc > max) {
    return {
      valid: false,
      error: `IBC no puede ser mayor a 25 SMMLV (${max})`,
    };
  }

  return { valid: true };
}

/**
 * Validate días cotizados (1-30)
 */
export function validateDiasCotizados(dias: number): {
  valid: boolean;
  error?: string;
} {
  if (dias < 1 || dias > 30) {
    return { valid: false, error: 'Días cotizados debe estar entre 1 y 30' };
  }

  return { valid: true };
}

/**
 * Zod schemas for validation
 */

export const DocumentoSchema = z
  .string()
  .min(6, 'Documento debe tener al menos 6 caracteres')
  .max(12, 'Documento debe tener máximo 12 caracteres')
  .regex(/^\d+$/, 'Documento debe contener solo números');

export const TelefonoSchema = z
  .string()
  .regex(/^[0-9]{7,10}$/, 'Teléfono debe tener entre 7 y 10 dígitos');

export const EmailSchema = z.string().email('Email inválido');

export const PilaPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo debe estar en formato YYYY-MM')
  .refine(
    (periodo) => {
      const [year, month] = periodo.split('-').map(Number);
      const now = new Date();
      const periodDate = new Date(year, month - 1);
      return periodDate <= now;
    },
    { message: 'No se puede liquidar un periodo futuro' }
  );

export const IBCSchema = z
  .number()
  .int('IBC debe ser un número entero')
  .positive('IBC debe ser positivo')
  .refine(
    (value) => {
      const salarioMinimo = 1300000;
      return value >= salarioMinimo && value <= salarioMinimo * 25;
    },
    { message: 'IBC debe estar entre 1 y 25 SMMLV' }
  );

export const DiasCotizadosSchema = z
  .number()
  .int('Días cotizados debe ser un número entero')
  .min(1, 'Debe tener al menos 1 día cotizado')
  .max(30, 'No puede tener más de 30 días cotizados');

/**
 * Full UserData validation schema
 */
export const UserDataSchema = z.object({
  uleUserId: z.string().min(1, 'uleUserId es requerido'),
  tipoDocumento: z.enum(DOCUMENT_TYPES),
  numeroDocumento: DocumentoSchema,
  nombre: z.string().min(3, 'Nombre debe tener al menos 3 caracteres'),
  email: EmailSchema,
  telefono: TelefonoSchema,
  direccion: z.string().min(5, 'Dirección debe tener al menos 5 caracteres'),
  ciudad: z.string().min(3, 'Ciudad es requerida'),
  eps: z.string().min(2, 'EPS es requerida'),
  pension: z.string().min(2, 'Pensión es requerida'),
  arl: z.string().min(2, 'ARL es requerida'),
});

/**
 * Full PilaData validation schema
 */
export const PilaDataSchema = z.object({
  periodo: PilaPeriodSchema,
  ingresoBase: z.number().int().positive('Ingreso base debe ser positivo'),
  ibc: IBCSchema,
  diasCotizados: DiasCotizadosSchema,
  salud: z.number().int().positive('Valor salud debe ser positivo'),
  pension: z.number().int().positive('Valor pensión debe ser positivo'),
  arl: z.number().int().positive('Valor ARL debe ser positivo'),
  nivelRiesgoARL: z.enum(ARL_RISK_LEVELS),
  total: z.number().int().positive('Total debe ser positivo'),
});
