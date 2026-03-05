/**
 * SOI Bots Module
 * Exporta todos los bots y utilidades para el portal SOI
 */

// Auth
export {
  SOIAuthBot,
  getSOIAuthBot,
  resetSOIAuthBot,
  type SOICredentials,
  type SOIUserCredentials,
  type SOISession,
} from './auth.bot';

// Registro
export {
  SOIRegistroBot,
  registrarUsuarioSOI,
  crearCuentaSOI,
  type SOIUserData,
  type SOIRegistrationResult,
} from './registro.bot';

// Liquidación (legacy)
export {
  SOILiquidacionBot,
  liquidarPlanillaSOI,
  liquidarPlanillaAsUser,
  type SOILiquidacionData,
  type SOILiquidacionResult,
} from './liquidacion.bot';

// Crear Planilla (nuevo - flujo completo con IBC)
export {
  SOICrearPlanillaBot,
  crearPlanillaSOI,
  type CrearPlanillaResult,
  type CrearPlanillaOptions,
} from './crear-planilla.bot';

// Pago
export {
  SOIPagoBot,
  pagarPlanillaSOI,
  verificarPagoSOI,
  type SOIPagoData,
  type SOIPagoResult,
} from './pago.bot';

// Comprobante (FASE 1 - Descarga de comprobantes)
export {
  SOIComprobanteBot,
  getSOIComprobanteBot,
  descargarComprobanteSOI,
  verificarEstadoPlanillaSOI,
  type ComprobanteDownloadResult,
  type ComprobanteData,
} from './comprobante.bot';

// Selectors
export { SOI_SELECTORS } from './selectors';
