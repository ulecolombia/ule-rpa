/**
 * Mi Planilla Bots - Exports
 *
 * Operador alternativo para usuarios que no pueden registrarse en SOI
 * (error APO-06002: El aportante ya existe en el sistema)
 */

// Registro
export { MiPlanillaRegistroBot, registrarUsuarioMiPlanilla } from './registro.bot';

// Autenticación
export {
  MiPlanillaAuthBot,
  getMiPlanillaAuthBot,
  resetMiPlanillaAuthBot,
  type MiPlanillaSession,
} from './auth.bot';

// Liquidación
export {
  MiPlanillaLiquidacionBot,
  crearPlanillaMiPlanilla,
} from './liquidacion.bot';

// Pago
export {
  MiPlanillaPagoBot,
  iniciarPagoMiPlanilla,
  type MiPlanillaPagoRequest,
} from './pago.bot';

// Flujo Completo Admin-Controlled (Login → Verificar/Generar planilla → Pago → Bancolombia)
export {
  ejecutarFlujoCompletoMiPlanilla,
  type FlujoCompletoContext,
  type FlujoCompletoResult,
} from './flujo-completo-admin.bot';

// Re-export types
export * from '../../types/miplanilla.types';
