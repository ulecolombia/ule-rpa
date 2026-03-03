import { z } from 'zod';
import { TipoDocumentoEnum, SOIAccountStatusEnum } from './soi.types';

export const UserStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

/**
 * Schema completo para usuario de ULE con integración SOI
 */
export const EnlaceUserSchema = z.object({
  // Identificación ULE
  uleUserId: z.string(),

  // Identificación personal
  tipoDocumento: TipoDocumentoEnum.default('CC'),
  documento: z.string().min(5).max(15),
  nombres: z.string().min(2),
  apellidos: z.string().min(2),

  // Contacto
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  celular: z.string().optional(),

  // Ubicación (requeridos para SOI)
  departamento: z.string().optional(),
  municipio: z.string().optional(),

  // Estado general
  status: UserStatusEnum.default('ACTIVE'),

  // ════════════════════════════════════════════
  // Campos SOI (nuevos)
  // ════════════════════════════════════════════

  // Estado de cuenta SOI
  soiAccountStatus: SOIAccountStatusEnum.default('NOT_LINKED'),

  // Password SOI (viene encriptado desde ULE)
  soiPassword: z.string().optional(),

  // Fecha de vinculación/creación de cuenta SOI
  soiLinkedAt: z.date().optional(),
});

export type UserStatus = z.infer<typeof UserStatusEnum>;
export type EnlaceUserInput = z.infer<typeof EnlaceUserSchema>;

/**
 * Schema para actualizar solo credenciales SOI de un usuario
 */
export const UpdateSOICredentialsSchema = z.object({
  uleUserId: z.string(),
  soiPassword: z.string(),
  soiAccountStatus: SOIAccountStatusEnum,
});
export type UpdateSOICredentials = z.infer<typeof UpdateSOICredentialsSchema>;

/**
 * Schema para crear usuario con todos los datos para SOI
 */
export const CreateUserWithSOISchema = EnlaceUserSchema.extend({
  // Para crear cuenta SOI, estos campos son obligatorios
  departamento: z.string().min(2),
  municipio: z.string().min(2),
});
export type CreateUserWithSOI = z.infer<typeof CreateUserWithSOISchema>;
