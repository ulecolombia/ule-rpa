import { z } from 'zod';

export const UserStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

export const EnlaceUserSchema = z.object({
  uleUserId: z.string(),
  documento: z.string(),
  tipoDocumento: z.string().default('CC'),
  nombres: z.string(),
  apellidos: z.string(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  status: UserStatusEnum.default('ACTIVE'),
});

export type UserStatus = z.infer<typeof UserStatusEnum>;
export type EnlaceUserInput = z.infer<typeof EnlaceUserSchema>;
