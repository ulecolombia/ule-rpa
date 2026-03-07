/**
 * Mi Planilla Types - Tipos para integración con miplanilla.com
 * Operador alternativo cuando SOI devuelve error APO-06002
 */

import { z } from 'zod';
import { TipoDocumentoEnum } from './soi.types';

// ============================================================================
// CONSTANTES Y URLs
// ============================================================================

export const MIPLANILLA_URLS = {
  // Landing
  landing: 'https://www.miplanilla.com/',

  // Portal Independientes
  portalIndependientes: 'https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes',

  // Registro
  registro: 'https://empresas.miplanilla.com/FSS/RegistroIndependientes',
  registroPreguntas: 'https://empresas.miplanilla.com/FSS/RegistroIndependientes/Preguntas',
  registroInfoBasica: 'https://empresas.miplanilla.com/FSS/RegistroIndependientes/InformacionBasica',
  registroAportes: 'https://empresas.miplanilla.com/FSS/RegistroIndependientes/AportesCotizante',
  registroUsuario: 'https://empresas.miplanilla.com/FSS/RegistroIndependientes/InformacionUsuario',

  // Dashboard (privado)
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',

  // Planillas
  generarPlanilla: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/GenerarPlanilla',
  administrarPlanillas: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas',

  // PSE
  pse: 'https://independientes2.miplanilla.com/pse/go.aspx',
} as const;

// ============================================================================
// CONFIGURACIÓN FIJA DE ULE PARA MI PLANILLA
// ============================================================================

export const ULE_MIPLANILLA_CONFIG = {
  // Email de ULE para Mi Planilla
  email: 'pagos.ule@gmail.com',

  // Actividad económica por defecto
  actividadEconomica: '9609', // Otras actividades de servicios

  // Valores por defecto en registro
  aportaArlVoluntario: false,
  aportaCajaCompensacion: false,
  trabajadorNuevo: false,
  ubicacionExterior: false,
  obligadoCotizarPension: true,

  // Notificaciones
  notificacionEmail: true,
  notificacionSms: false,
} as const;

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

/**
 * Credenciales para login en Mi Planilla
 * Usuario = CC + documento (ej: CC1047484978)
 */
export const MiPlanillaCredentialsSchema = z.object({
  tipoDocumento: TipoDocumentoEnum.default('CC'),
  documento: z.string().min(5).max(15),
  password: z.string().min(8),
});
export type MiPlanillaCredentials = z.infer<typeof MiPlanillaCredentialsSchema>;

/**
 * Datos para registrar usuario en Mi Planilla
 */
export const MiPlanillaRegistroSchema = z.object({
  // Identificación
  tipoDocumento: TipoDocumentoEnum.default('CC'),
  documento: z.string().min(5).max(15),

  // Datos personales
  primerNombre: z.string().min(2),
  segundoNombre: z.string().optional(),
  primerApellido: z.string().min(2),
  segundoApellido: z.string().optional(),

  // Contacto
  email: z.string().email().default(ULE_MIPLANILLA_CONFIG.email),
  celular: z.string().min(10).max(10),
  telefonoFijo: z.string().optional(),

  // Ubicación
  direccion: z.string().min(5),
  ciudad: z.string().min(2), // Nombre de ciudad para autocompletado

  // Datos de aportes
  ingresosMensuales: z.number().min(1300000), // Mínimo 1 SMLV
  epsCodigo: z.string(), // Código EPS (ej: EPS010 para Sura)
  afpCodigo: z.string(), // Código AFP (ej: 25-14 para Colpensiones)

  // Opcionales
  actividadEconomica: z.string().default(ULE_MIPLANILLA_CONFIG.actividadEconomica),
});
export type MiPlanillaRegistro = z.infer<typeof MiPlanillaRegistroSchema>;

/**
 * Request para crear planilla en Mi Planilla
 */
export const MiPlanillaPlanillaRequestSchema = z.object({
  // Credenciales
  tipoDocumento: TipoDocumentoEnum.default('CC'),
  documento: z.string(),
  password: z.string(), // Viene encriptada, RPA desencripta

  // Datos de la planilla
  periodoMes: z.number().min(1).max(12),
  periodoAno: z.number().min(2020).max(2030),
  ibc: z.number().min(1300000), // IBC a usar (puede diferir del registro)

  // Datos del cotizante (opcionales, para modificar)
  epsCodigo: z.string().optional(),
  afpCodigo: z.string().optional(),

  // Si quiere pagar inmediatamente
  iniciarPago: z.boolean().default(false),
  banco: z.string().optional(), // BANCOLOMBIA, etc.
});
export type MiPlanillaPlanillaRequest = z.infer<typeof MiPlanillaPlanillaRequestSchema>;

// ============================================================================
// INTERFACES DE RESULTADOS
// ============================================================================

/**
 * Resultado de registro en Mi Planilla
 */
export interface MiPlanillaRegistroResult {
  success: boolean;
  accountCreated: boolean;

  // Datos de la cuenta creada
  usuario?: string; // CC + documento (ej: CC1047484978)
  generatedPassword?: string; // Password generada (para guardar encriptada)

  message: string;
  error?: string;
  screenshotPath?: string;
}

/**
 * Resultado de login en Mi Planilla
 */
export interface MiPlanillaAuthResult {
  success: boolean;
  loggedIn: boolean;

  // Datos del usuario logueado
  nombreUsuario?: string;

  message: string;
  error?: string;
}

/**
 * Resultado de crear/liquidar planilla en Mi Planilla
 */
export interface MiPlanillaPlanillaResult {
  success: boolean;
  numeroPlanilla?: string;

  // Valores calculados
  valorSalud?: number;
  valorPension?: number;
  valorTotal?: number;

  // Período
  periodo?: string; // "Febrero de 2026"
  fechaVencimiento?: string;

  // Estado
  estado?: 'LIQUIDADA' | 'PENDIENTE_PAGO' | 'PAGADA' | 'ERROR' | 'YA_EXISTE' | 'YA_PAGADA';

  // Acción ejecutada por el árbol de decisión
  accionEjecutada?: 'CREAR_PLANILLA' | 'IR_A_PAGO' | 'DESCARGAR_COMPROBANTE' | 'CORREGIR_DATOS';

  // Si se inició pago
  pagoIniciado?: boolean;

  message: string;
  error?: string;
  screenshotPath?: string;
}

/**
 * Resultado de pago PSE en Mi Planilla
 */
export interface MiPlanillaPagoResult {
  success: boolean;
  transactionId?: string;

  // Datos del pago
  valorPagado?: number;
  banco?: string;
  fechaPago?: Date;

  message: string;
  error?: string;
  screenshotPath?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera el usuario de Mi Planilla (CC + documento)
 */
export function generateMiPlanillaUser(tipoDocumento: string, documento: string): string {
  return `${tipoDocumento}${documento}`;
}

/**
 * Genera una contraseña segura para Mi Planilla
 * Requisitos: letra, mayúscula, número, mínimo 8 caracteres
 */
export function generateMiPlanillaPassword(): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '@#$%&*';

  // Garantizar al menos 1 de cada tipo
  let password = '';
  password += lower[Math.floor(Math.random() * lower.length)];
  password += upper[Math.floor(Math.random() * upper.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Completar hasta 12 caracteres
  const all = lower + upper + numbers;
  for (let i = 0; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Mezclar
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Valida si una contraseña cumple requisitos de Mi Planilla
 */
export function isValidMiPlanillaPassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// ============================================================================
// SELECTORES CSS
// ============================================================================

export const MIPLANILLA_SELECTORS = {
  // ════════════════════════════════════════════════════════════
  // LANDING
  // ════════════════════════════════════════════════════════════
  btnIndependiente: [
    'a[href*="independientes"]',
    'button:has-text("Independiente")',
    '.btn-independiente',
  ],

  // ════════════════════════════════════════════════════════════
  // PORTAL INDEPENDIENTES
  // ════════════════════════════════════════════════════════════
  popupClose: [
    '.modal .close',
    '.modal button[class*="close"]',
    '[class*="modal"] .btn-close',
    'button[aria-label="Close"]',
  ],
  btnRegistro: [
    'a[href*="Registro"]',
    'button:has-text("REGISTRO")',
    '.btn-registro',
  ],

  // Login - Selectores probados en dry-run (Feb 2026)
  // El formulario de login de independientes usa #usuario y #clave directamente
  // Usuario = CC + documento (ej: CC1047484978), NO hay select separado de tipo doc
  selectTipoDocLogin: [
    // NO HAY SELECT DE TIPO DOC EN LOGIN - el usuario incluye el tipo
  ],
  inputNumDocLogin: [
    '#usuario', // Input principal de login (usuario = CC1047484978)
    'input[name*="numDoc"]',
    '#numeroDocumento',
    'input[id*="NumeroDocumento"]',
  ],
  inputPasswordLogin: [
    '#clave', // Input de contraseña
    'input[type="password"]',
    'input[name*="password"]',
    'input[id*="Password"]',
  ],
  btnEntrar: [
    'button.btn.btn-primary.button-cta', // Botón exacto de login
    'button:has-text("Entrar")',
    'input[type="submit"][value*="Entrar"]',
    '.btn-entrar',
  ],

  // ════════════════════════════════════════════════════════════
  // REGISTRO - PASO INICIAL
  // ════════════════════════════════════════════════════════════
  selectTipoDocRegistro: [
    'select[name*="tipoDoc"]',
    '#tipoDocumento',
  ],
  inputNumDocRegistro: [
    'input[name*="numDoc"]',
    '#numeroDocumento',
  ],
  btnIniciarRegistro: [
    'button:has-text("Iniciar Registro")',
    'input[type="submit"][value*="Iniciar"]',
  ],

  // ════════════════════════════════════════════════════════════
  // REGISTRO - PREGUNTAS
  // ════════════════════════════════════════════════════════════
  radioAportePropio: [
    'input[value*="propio"]',
    'label:has-text("Aporte Propio")',
    '[data-value="propio"]',
  ],
  radioIndependiente: [
    'input[value*="independiente"]',
    'label:has-text("Independiente")',
    '[data-value="independiente"]',
  ],
  btnContinuar: [
    'button:has-text("Continuar")',
    'input[type="submit"][value*="Continuar"]',
  ],

  // ════════════════════════════════════════════════════════════
  // REGISTRO - INFORMACIÓN BÁSICA
  // ════════════════════════════════════════════════════════════
  inputPrimerNombre: [
    'input[name*="primerNombre"]',
    'input[id*="PrimerNombre"]',
    '#primerNombre',
  ],
  inputSegundoNombre: [
    'input[name*="segundoNombre"]',
    'input[id*="SegundoNombre"]',
    '#segundoNombre',
  ],
  inputPrimerApellido: [
    'input[name*="primerApellido"]',
    'input[id*="PrimerApellido"]',
    '#primerApellido',
  ],
  inputSegundoApellido: [
    'input[name*="segundoApellido"]',
    'input[id*="SegundoApellido"]',
    '#segundoApellido',
  ],
  inputEmail: [
    'input[type="email"]',
    'input[name*="correo"]',
    'input[id*="Correo"]',
  ],
  inputCelular: [
    'input[name*="celular"]',
    'input[id*="Celular"]',
    '#celular',
  ],
  inputTelefono: [
    'input[name*="telefono"]',
    'input[id*="Telefono"]',
    '#telefonoFijo',
  ],
  inputDireccion: [
    'input[name*="direccion"]',
    'input[id*="Direccion"]',
    '#direccion',
  ],
  inputCiudad: [
    'input[name*="ciudad"]',
    'input[id*="Ciudad"]',
    '#ciudad',
  ],
  modalCiudades: [
    '.modal:has-text("Ciudades")',
    '[class*="modal"][class*="ciudad"]',
  ],
  modalCiudadesInput: [
    '.modal input[type="text"]',
    '.modal input[placeholder*="buscar"]',
  ],
  modalCiudadesOption: [
    '.modal li',
    '.modal [class*="option"]',
    '.modal [role="option"]',
  ],
  selectActividadEconomica: [
    'select[name*="actividad"]',
    'select[id*="Actividad"]',
    '#actividadEconomica',
  ],

  // ════════════════════════════════════════════════════════════
  // REGISTRO - INFORMACIÓN DE APORTES
  // ════════════════════════════════════════════════════════════
  radioUbicacionColombia: [
    'input[value*="colombia"]',
    'label:has-text("No, mi ubicación actual es en Colombia")',
  ],
  radioCotizarPensionSi: [
    'label:has-text("Sí, debo cotizar")',
    'input[name*="pension"][value="si"]',
  ],
  inputIngresos: [
    'input[name*="ingresos"]',
    'input[id*="Ingresos"]',
    '#ingresosMensuales',
  ],
  selectEps: [
    'select[name*="eps"]',
    'select[id*="Eps"]',
    '#eps',
  ],
  selectAfp: [
    'select[name*="pension"]',
    'select[name*="afp"]',
    'select[id*="Pension"]',
    '#fondoPension',
  ],
  radioArlNo: [
    'label:has-text("No"):near(label:has-text("riesgos laborales"))',
    'input[name*="arl"][value="no"]',
  ],
  radioCajaNo: [
    'label:has-text("No"):near(label:has-text("cajas"))',
    'input[name*="caja"][value="no"]',
  ],
  radioNovedadNo: [
    'label:has-text("No"):near(label:has-text("novedad"))',
    'input[name*="novedad"][value="no"]',
  ],

  // ════════════════════════════════════════════════════════════
  // REGISTRO - DATOS DE USUARIO
  // ════════════════════════════════════════════════════════════
  radioNotifEmailSi: [
    'label:has-text("Sí"):near(label:has-text("correo electrónico"))',
    'input[name*="notifEmail"][value="si"]',
  ],
  radioNotifSmsNo: [
    'label:has-text("No"):near(label:has-text("mensaje de texto"))',
    'input[name*="notifSms"][value="no"]',
  ],
  inputPasswordRegistro: [
    'input[name*="password"]:not([name*="confirm"])',
    'input[id*="Password"]:not([id*="Confirm"])',
    '#password',
  ],
  inputPasswordConfirm: [
    'input[name*="confirm"]',
    'input[id*="Confirm"]',
    '#confirmPassword',
  ],
  checkboxDatosPersonales: [
    'input[name*="datos"]',
    'input[id*="Datos"]',
    '#autorizaDatos',
  ],
  checkboxTerminos: [
    'input[name*="terminos"]',
    'input[id*="Terminos"]',
    '#aceptaTerminos',
  ],
  btnFinalizarRegistro: [
    'button:has-text("Finalizar Registro")',
    'input[type="submit"][value*="Finalizar"]',
  ],

  // ════════════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════════════
  btnGenerarNuevaPlanilla: [
    'button:has-text("Generar nueva planilla")',
    'a:has-text("Generar nueva planilla")',
    '.btn-generar-planilla',
  ],
  menuPlanillas: [
    'a:has-text("Planillas")',
    '[class*="menu"] a[href*="Planilla"]',
  ],

  // ════════════════════════════════════════════════════════════
  // GENERAR PLANILLA - Selectores probados en dry-run (Feb 2026)
  // ════════════════════════════════════════════════════════════
  modalArlNoActualizar: [
    'button:has-text("No, continuar sin actualizar")',
    '.modal button:has-text("No")',
  ],
  radioTipoPlanillaPropia: [
    '#I', // Radio input directo para "Pagos de mis propios aportes"
    'input[value="I"]',
    'input[value*="propios"]',
    'label:has-text("Pagos de mis propios aportes")',
    '[data-tipo="propios"]',
  ],
  inputIngresosMensuales: [
    '#IngresosMensuales', // Campo IBC en formulario de modificar info
    'input[name="IngresosMensuales"]',
    'input[name*="ingresos"]',
  ],
  btnCambiarPeriodo: [
    'button:has-text("Cambiar Período")',
    'a:has-text("Cambiar Período")',
  ],
  btnModificarInfo: [
    'a:has-text("Modificar información")',
    'button:has-text("Modificar")',
    '[class*="modificar"]',
  ],
  btnAgregarNovedad: [
    'a:has-text("Agregar Novedad")',
    'button:has-text("Agregar Novedad")',
  ],
  btnGuardarEmpleado: [
    'button:has-text("Guardar empleado")',
    'input[type="submit"][value*="Guardar"]',
  ],
  btnGenerarPlanillaFinal: [
    'button:has-text("Generar Planilla")',
    'input[type="submit"][value*="Generar"]',
  ],
  toastSuccess: [
    '.toast:has-text("correctamente")',
    '[class*="alert-success"]',
    '[class*="toast-success"]',
  ],

  // ════════════════════════════════════════════════════════════
  // PAGO
  // ════════════════════════════════════════════════════════════
  btnPagarAqui: [
    'button:has-text("Paga aquí")',
    'a:has-text("Paga aquí")',
    '.btn-pagar',
  ],
  btnSeleccionarMedioPago: [
    'button:has-text("Seleccionar medio de pago")',
    'input[type="submit"][value*="Seleccionar"]',
  ],
  radioPSE: [
    'input[value*="pse"]',
    'label:has-text("Pago por PSE")',
    '[data-metodo="pse"]',
  ],
  selectTipoCliente: [
    'select[name*="tipoCliente"]',
    '#tipoCliente',
  ],
  selectBanco: [
    'select[name*="banco"]',
    '#banco',
  ],
  btnContinuarPago: [
    'button:has-text("Continuar con el pago")',
    'input[type="submit"][value*="Continuar"]',
  ],

  // ════════════════════════════════════════════════════════════
  // TABLA PLANILLAS
  // ════════════════════════════════════════════════════════════
  tablaPlanillas: [
    'table[class*="planilla"]',
    '.tabla-planillas',
    '[class*="grid-planillas"]',
  ],
  filaPlanilla: [
    'tr[class*="planilla"]',
    '.fila-planilla',
  ],

} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  MIPLANILLA_URLS,
  ULE_MIPLANILLA_CONFIG,
  MiPlanillaCredentialsSchema,
  MiPlanillaRegistroSchema,
  MiPlanillaPlanillaRequestSchema,
  MIPLANILLA_SELECTORS,
  generateMiPlanillaUser,
  generateMiPlanillaPassword,
  isValidMiPlanillaPassword,
};
