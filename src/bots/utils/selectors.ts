/**
 * CSS/XPath Selectors for Enlace Operativo
 * IMPORTANT: These are estimated selectors and must be adjusted according to the real UI
 */

export const SELECTORS = {
  // Login page
  LOGIN: {
    TIPO_DOC_SELECT: 'select[name="tipoDocumento"]',
    NUMERO_DOC_INPUT: 'input[name="numeroDocumento"]',
    PASSWORD_INPUT: 'input[name="password"]',
    USER_INPUT: 'input[name="usuario"]',
    RECAPTCHA: '.g-recaptcha',
    RECAPTCHA_CHECKBOX: 'iframe[src*="recaptcha"]',
    CONTINUAR_BUTTON: 'button:has-text("Continuar")',
    INGRESAR_BUTTON: 'button[type="submit"]',
    ERROR_MESSAGE: '.alert-danger, .error-message',
    SUCCESS_MESSAGE: '.alert-success',
  },

  // Dashboard
  DASHBOARD: {
    USER_MENU: '[data-testid="user-menu"]',
    USER_NAME: '.user-name, .username',
    SIDEBAR_MENU: 'nav[role="navigation"]',
    MAIN_CONTENT: 'main, #main-content',
    LOADING: '.loading, .spinner',
  },

  // Administrar aportantes
  APORTANTES: {
    MENU_ITEM: 'a:has-text("Administrar aportantes")',
    BUSCAR_INPUT: 'input[placeholder*="Buscar"]',
    AGREGAR_BUTTON: 'button:has-text("Agregar")',
    AGREGAR_APORTANTE: 'button:has-text("Agregar aportante")',
    NUEVO_APORTANTE: 'button:has-text("Nuevo aportante")',

    // Formulario de registro
    FORM: {
      TIPO_DOC: 'select[name="tipoDocumento"]',
      NUMERO_DOC: 'input[name="numeroDocumento"]',
      NOMBRE: 'input[name="nombre"]',
      PRIMER_NOMBRE: 'input[name="primerNombre"]',
      SEGUNDO_NOMBRE: 'input[name="segundoNombre"]',
      PRIMER_APELLIDO: 'input[name="primerApellido"]',
      SEGUNDO_APELLIDO: 'input[name="segundoApellido"]',
      EMAIL: 'input[name="email"]',
      TELEFONO: 'input[name="telefono"]',
      CELULAR: 'input[name="celular"]',
      DIRECCION: 'input[name="direccion"]',
      CIUDAD: 'select[name="ciudad"]',
      DEPARTAMENTO: 'select[name="departamento"]',
      EPS: 'select[name="eps"]',
      PENSION: 'select[name="pension"]',
      AFP: 'select[name="afp"]',
      ARL: 'select[name="arl"]',
      CAJA_COMPENSACION: 'select[name="cajaCompensacion"]',
      GUARDAR: 'button[type="submit"]',
      GUARDAR_TEXT: 'button:has-text("Guardar")',
      CANCELAR: 'button:has-text("Cancelar")',
    },

    // Lista de resultados
    RESULTS: {
      TABLE: 'table',
      TBODY: 'table tbody',
      ROW: 'tr[data-user-id]',
      ROW_ALT: 'table tbody tr',
      NO_RESULTS: 'text="No se encontraron resultados"',
      NO_RESULTS_ALT: '.no-results, .empty-state',
      NOMBRE_COL: 'td:nth-child(1)',
      DOCUMENTO_COL: 'td:nth-child(2)',
      ESTADO_COL: 'td:nth-child(3)',
      ACCIONES_COL: 'td:nth-child(4)',
    },
  },

  // Liquidación PILA
  LIQUIDACION: {
    // Navegación
    MENU_LIQUIDAR: 'a:has-text("Liquidar PILA")',
    MENU_ITEM: 'a:has-text("Liquidar PILA")',
    MENU_ITEM_ALT: 'a[href*="liquidar"]',
    MENU_GENERADOR: 'a[href*="generador-planillas"]',

    // Selección de usuario
    SELECT_APORTANTE: 'select[name="aportante"]',
    BUSCAR_APORTANTE_INPUT: 'input[placeholder*="Buscar aportante"]',
    BUSCAR_APORTANTE: 'input[placeholder*="Buscar aportante"]',
    SELECCIONAR_APORTANTE: 'button:has-text("Seleccionar")',

    // Opciones de liquidación
    PLANILLA_EN_LINEA: 'button:has-text("Planilla en línea")',
    CARGA_ARCHIVO: 'button:has-text("Carga de archivo")',
    DUPLICAR_PLANILLA: 'button:has-text("Duplicar planilla")',

    // Formulario de liquidación
    FORM: {
      // Período
      PERIODO: 'input[name="periodo"]',
      MES: 'select[name="mes"]',
      ANIO: 'select[name="anio"]',
      ANO: 'input[name="ano"]',

      // Días cotizados
      DIAS_COTIZADOS: 'input[name="diasCotizados"]',

      // IBC (Ingreso Base de Cotización)
      IBC_INPUT: 'input[name="ibc"]',
      IBC: 'input[name="ibc"]',
      INGRESO_BASE: 'input[name="ingresoBase"]',

      // Salud (12.5%)
      SALUD_INPUT: 'input[name="salud"]',
      SALUD: 'input[name="salud"]',
      SALUD_PORCENTAJE: 'input[name="saludPorcentaje"]',

      // Pensión (16%)
      PENSION_INPUT: 'input[name="pension"]',
      PENSION: 'input[name="pension"]',
      PENSION_PORCENTAJE: 'input[name="pensionPorcentaje"]',

      // ARL (varía por nivel de riesgo)
      ARL_INPUT: 'input[name="arl"]',
      ARL: 'input[name="arl"]',
      ARL_NIVEL_RIESGO: 'select[name="nivelRiesgo"]',
      NIVEL_RIESGO_ARL: 'select[name="nivelRiesgoARL"]',
      ARL_PORCENTAJE: 'input[name="arlPorcentaje"]',

      // Total
      TOTAL_DISPLAY: '[data-field="total"]',
      TOTAL: 'input[name="total"]',

      // Acciones
      CALCULAR: 'button:has-text("Calcular")',
      VALIDAR: 'button:has-text("Validar")',
      CONFIRMAR: 'button:has-text("Confirmar")',
      LIQUIDAR: 'button:has-text("Liquidar")',
      GENERAR: 'button:has-text("Generar planilla")',
      GENERAR_PLANILLA: 'button:has-text("Generar planilla")',
      CANCELAR: 'button:has-text("Cancelar")',
    },

    // Resultado de liquidación
    RESULTADO: {
      NUMERO_PLANILLA: '[data-field="numeroPlanilla"]',
      NUMERO_PLANILLA_ALT: 'text=/Planilla No[.:] \\d+/',
      NUMERO_PLANILLA_DATA: '[data-planilla-numero]',
      NUMERO_PLANILLA_CLASS: '.planilla-numero',
      VALOR_TOTAL: '[data-field="valorTotal"]',
      TOTAL_PAGAR: '.total-pagar',
      FECHA_LIMITE: '[data-field="fechaLimite"]',
      FECHA_LIMITE_CLASS: '.fecha-limite',
      MENSAJE_EXITO: '.success, .alert-success',
      ESTADO: '.estado-planilla',
    },

    // Resultado legacy (mantener compatibilidad)
    RESULT: {
      NUMERO_PLANILLA: '[data-planilla-numero]',
      NUMERO_PLANILLA_ALT: '.planilla-numero',
      FECHA_LIMITE: '.fecha-limite',
      TOTAL_PAGAR: '.total-pagar',
      ESTADO: '.estado-planilla',
    },

    // PSE (Pago en línea)
    PSE: {
      BOTON_PAGAR: 'button:has-text("Pagar")',
      BOTON_PAGAR_PSE: 'button:has-text("Pagar con PSE")',
      SELECCIONAR_PSE: 'input[value="PSE"]',
      RADIO_PSE: 'input[type="radio"][value="PSE"]',
      IFRAME_PSE: 'iframe[name="pse-iframe"]',
      IFRAME_PAGOS: 'iframe[src*="pse"], iframe[src*="pagos"]',
      CONTINUAR_PAGO: 'button:has-text("Continuar al pago")',
    },
  },

  // Comprobantes (Fase 4)
  COMPROBANTES: {
    // Navegación
    MENU_COMPROBANTES: 'a:has-text("Comprobantes")',
    MENU_ITEM: 'a:has-text("Comprobantes")',

    // Búsqueda
    BUSCAR_INPUT: 'input[placeholder*="Buscar"]',
    BUSCAR_PLANILLA: 'input[placeholder*="Número de planilla"]',
    FILTRO_PERIODO: 'select[name="periodo"]',
    BUSCAR_PERIODO: 'input[name="periodo"]',
    FILTRO_ESTADO: 'select[name="estado"]',
    BUSCAR_BUTTON: 'button:has-text("Buscar")',

    // Resultados
    RESULTS: {
      TABLE: 'table.comprobantes-table',
      TABLE_ALT: 'table',
      ROW: 'tr[data-planilla-id]',
      ROW_ALT: 'table tbody tr',
      NUMERO_PLANILLA: 'td[data-field="numeroPlanilla"]',
      NUMERO_PLANILLA_ALT: 'td:nth-child(1)',
      FECHA_PAGO: 'td[data-field="fechaPago"]',
      FECHA_PAGO_ALT: 'td:nth-child(2)',
      VALOR: 'td[data-field="valor"]',
      VALOR_ALT: 'td:nth-child(3)',
      ESTADO: 'td[data-field="estado"]',
      ESTADO_ALT: 'td:nth-child(4)',

      // Acciones
      BOTON_DESCARGAR: 'button:has-text("Descargar")',
      BOTON_VER_PDF: 'button:has-text("Ver PDF")',
      DESCARGAR_PDF: 'button:has-text("Descargar PDF")',
      VER_COMPROBANTE: 'button:has-text("Ver comprobante")',
      LINK_PDF: 'a[href*=".pdf"]',

      NO_RESULTS: 'text="No se encontraron comprobantes"',
      NO_RESULTS_ALT: '.no-results, .empty-state',
    },

    // Estados de planilla
    ESTADO_PAGADA: '.estado-pagada, .badge-success',
    ESTADO_PENDIENTE: '.estado-pendiente, .badge-warning',
    ESTADO_RECHAZADA: '.estado-rechazada, .badge-danger',
    ESTADO_VENCIDA: '.estado-vencida, .badge-secondary',
  },

  // COMPROBANTE (Legacy - mantener compatibilidad)
  COMPROBANTE: {
    MENU_ITEM: 'a:has-text("Comprobantes")',
    BUSCAR_PLANILLA: 'input[placeholder*="Número de planilla"]',
    BUSCAR_PERIODO: 'input[name="periodo"]',
    BUSCAR_BUTTON: 'button:has-text("Buscar")',
    DESCARGAR_BUTTON: 'button:has-text("Descargar")',
    DESCARGAR_PDF: 'button:has-text("Descargar PDF")',
    VER_COMPROBANTE: 'button:has-text("Ver comprobante")',

    RESULTS: {
      TABLE: 'table',
      ROW: 'tr[data-planilla-id]',
      NUMERO_PLANILLA: 'td:nth-child(1)',
      PERIODO: 'td:nth-child(2)',
      TOTAL: 'td:nth-child(3)',
      ESTADO: 'td:nth-child(4)',
      ACCIONES: 'td:nth-child(5)',
    },
  },

  // Common elements
  COMMON: {
    LOADING: '.loading, .spinner, [role="progressbar"]',
    LOADING_OVERLAY: '.loading-overlay',
    MODAL: '.modal, [role="dialog"]',
    MODAL_CLOSE: '.modal .close, [aria-label="Close"]',
    MODAL_CONFIRM: '.modal button:has-text("Confirmar")',
    MODAL_CANCEL: '.modal button:has-text("Cancelar")',
    ALERT_SUCCESS: '.alert-success, .success-message',
    ALERT_ERROR: '.alert-danger, .error-message',
    ALERT_WARNING: '.alert-warning',
    TOAST_SUCCESS: '.toast-success',
    TOAST_ERROR: '.toast-error',
    BUTTON_PRIMARY: 'button.btn-primary',
    BUTTON_SECONDARY: 'button.btn-secondary',
    BUTTON_CANCEL: 'button.btn-cancel',
  },

  // Navigation
  NAV: {
    HOME: 'a[href="/tablero"]',
    DASHBOARD: 'a[href="/tablero"]',
    APORTANTES: 'a[href*="aportantes"]',
    LIQUIDACION: 'a[href*="liquidacion"]',
    COMPROBANTES: 'a[href*="comprobantes"]',
    REPORTES: 'a[href*="reportes"]',
    CONFIGURACION: 'a[href*="configuracion"]',
    LOGOUT: 'button:has-text("Cerrar sesión")',
    LOGOUT_ALT: 'a:has-text("Salir")',
  },
};

/**
 * XPath Selectors (alternative to CSS when needed)
 */
export const XPATH_SELECTORS = {
  BUTTON_BY_TEXT: (text: string) => `//button[contains(text(), "${text}")]`,
  LINK_BY_TEXT: (text: string) => `//a[contains(text(), "${text}")]`,
  INPUT_BY_PLACEHOLDER: (placeholder: string) =>
    `//input[contains(@placeholder, "${placeholder}")]`,
  LABEL_BY_TEXT: (text: string) => `//label[contains(text(), "${text}")]`,
  DIV_WITH_TEXT: (text: string) => `//div[contains(text(), "${text}")]`,
  SPAN_WITH_TEXT: (text: string) => `//span[contains(text(), "${text}")]`,
  TABLE_ROW_WITH_TEXT: (text: string) => `//tr[contains(., "${text}")]`,
};

/**
 * Helper to get selector with fallback
 */
export function getSelectorWithFallback(primary: string, fallback: string): string[] {
  return [primary, fallback];
}

/**
 * URL Patterns for Enlace Operativo
 */
export const URL_PATTERNS = {
  BASE: 'https://suaporte.com.co',
  LOGIN: 'https://suaporte.com.co/sso/#/login',
  DASHBOARD: 'https://suaporte.com.co/tablero/',
  APORTANTES: 'https://suaporte.com.co/gestion/#/home/administrar-aportantes',
  LIQUIDACION: 'https://suaporte.com.co/generador-planillas/#/',
  LIQUIDACION_ALT: 'https://suaporte.com.co/liquidacion/',
  COMPROBANTES: 'https://suaporte.com.co/comprobantes/#/',
  COMPROBANTES_ALT: 'https://suaporte.com.co/comprobantes/',
};
