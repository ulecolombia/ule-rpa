/**
 * SOI Portal Selectors
 * Selectores CSS para el portal SOI (servicio.nuevosoi.com.co)
 */

export const SOI_SELECTORS = {
  // URLs del portal SOI
  URLS: {
    BASE: 'https://servicio.nuevosoi.com.co/soi',
    LOGIN: 'https://servicio.nuevosoi.com.co/soi/index.do',
    LOGIN_EMPRESAS: 'https://servicio.nuevosoi.com.co/soi/index.do?codigoBanco=07',
    LOGIN_INDEPENDIENTES: 'https://servicio.nuevosoi.com.co/soi/index.do?LoginIndependiente=true',
    // Flujo de creación de usuario (admin de empresa - legacy)
    ADMINISTRAR_USUARIOS: 'https://servicio.nuevosoi.com.co/soi/inicioConsultaEdUsuarioAportante.do',
    CREAR_USUARIO: 'https://servicio.nuevosoi.com.co/soi/irCrearAportante.do',
    // Flujo de auto-registro de independientes (V2 - actual)
    REGISTRO_INDEPENDIENTES: 'https://servicio.nuevosoi.com.co/soi/inicioCreacionAportanteIndV2.do',
    // Planillas
    GESTIONAR_PLANILLAS: 'https://servicio.nuevosoi.com.co/soi/gestionarPlanilla.do',
    CONSULTAR_PLANILLAS: 'https://servicio.nuevosoi.com.co/soi/consultarplanillas.do',
    // Crear planilla en línea (flujo principal para independientes)
    CREAR_PLANILLA_EN_LINEA: 'https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do',
    // Flujo de pago
    PAGO_PLANILLAS: 'https://servicio.nuevosoi.com.co/soi/pagoPlanilla.do',
    SOPORTES_PAGO: 'https://servicio.nuevosoi.com.co/soi/soportesPago.do',
    PSE_REDIRECT: 'https://servicio.nuevosoi.com.co/soi/pse/redirect.do',
  },

  // Login de Empresas
  LOGIN: {
    // Tipo de documento empresa
    EMPRESA_TIPO_DOC: 'select[name="tipoDocEmpresa"]',
    EMPRESA_NUMERO_DOC: 'input[name="numeroDocEmpresa"]',

    // Tipo de documento usuario
    USUARIO_TIPO_DOC: 'select[name="tipoDocUsuario"]',
    USUARIO_NUMERO_DOC: 'input[name="numeroDocUsuario"]',

    // Clave
    PASSWORD: 'input[name="clave"]',
    PASSWORD_TOGGLE: 'button[id*="togglePassword"], .toggle-password',

    // Botón ingresar
    SUBMIT_BUTTON: 'button[type="submit"], input[type="submit"], button:has-text("Ingresar")',

    // Mensajes de error
    ERROR_MESSAGE: '.alert-danger, .error-message, .mensaje-error',

    // Token CSRF
    CSRF_TOKEN: 'input[name="_token"], input[name="csrf"]',
  },

  // Login de Independientes (sin sección de empresa)
  LOGIN_INDEPENDIENTE: {
    // Tipo de documento usuario/independiente
    TIPO_DOC: 'select[name="tipoIdUsuario"], #tipoIdUsuario',
    NUMERO_DOC: 'input[name="numeroIdUsuario"], #idNumeroIdentificacionUsuario',

    // Clave
    PASSWORD: 'input[name="claveUsuario"], #idClaveUsuario',

    // Botón ingresar
    SUBMIT_BUTTON: '#botonIngresarIndp, button[type="submit"]',

    // Mensajes de error
    ERROR_MESSAGE: '.alert-danger, .error-message, .mensaje-error, .invalid-feedback',
  },

  // Menú Principal (después de login)
  MENU: {
    APORTANTE: '.menu-aportante, a:has-text("Aportante")',
    EDITAR_DATOS: 'a:has-text("Editar datos aportante")',
    GESTIONAR_USUARIOS: 'a:has-text("Gestionar usuarios")',
    MI_PERFIL: 'a:has-text("Mi perfil")',
    GESTIONAR_PLANILLAS: 'a:has-text("Gestionar Planillas")',
    CONSULTAS: 'a:has-text("Consultas")',
    UNIFICAR_PAGO: 'a:has-text("Unificar para pago")',
    PAGOS_OTROS_OPERADORES: 'a:has-text("Pagos otros operadores")',
  },

  // Administrar Usuarios Aportante (Búsqueda)
  ADMIN_USUARIOS: {
    TIPO_DOC_BUSQUEDA: 'select[name*="tipoDocumento"], #tipoDocumento',
    NUMERO_DOC_BUSQUEDA: 'input[name*="numeroDocumento"], #numeroDocumento',
    BTN_BUSCAR: 'button:has-text("Buscar"), input[value="Buscar"]',
    BTN_CREAR_USUARIO: 'button:has-text("Crear Usuario"), input[value="Crear Usuario"]',

    // Tabla de resultados
    TABLA_RESULTADOS: 'table.resultados, table[id*="usuario"]',
    FILA_USUARIO: 'table tbody tr',
  },

  // Formulario Creación de Usuario Aportante (admin de empresa - legacy)
  CREAR_USUARIO: {
    // Información Básica Usuario
    TIPO_DOCUMENTO: 'select[name*="tipoDocumento"], select[id*="tipoDocumento"]',
    NUMERO_DOCUMENTO: 'input[name*="numeroDocumento"], input[id*="numeroDocumento"]',
    NOMBRES: 'input[name*="nombres"], input[name*="nombre"], input[id*="nombres"]',
    APELLIDOS: 'input[name*="apellidos"], input[id*="apellidos"]',
    DEPARTAMENTO: 'select[name*="departamento"], select[id*="departamento"]',
    MUNICIPIO: 'select[name*="municipio"], select[id*="municipio"]',
    TELEFONO: 'input[name*="telefono"], input[id*="telefono"]',
    EXTENSION: 'input[name*="ext"], input[id*="ext"]',
    CELULAR: 'input[name*="celular"], input[id*="celular"]',
    CORREO: 'input[name*="correo"], input[name*="email"], input[id*="correo"]',
    SMS_CHECKBOX: 'input[type="checkbox"][name*="sms"], input[type="checkbox"][id*="sms"]',

    // Información de Autorización
    ROL_SOI: 'select[name*="rolSoi"], select[id*="rolSoi"]',
    ROL_PCSS: 'select[name*="rolPcss"], select[id*="rolPcss"]',
    ACTIVO: 'select[name*="activo"], select[id*="activo"]',

    // Botones
    BTN_GUARDAR: 'button:has-text("Guardar"), input[value="Guardar"]',
    BTN_CANCELAR: 'button:has-text("Cancelar"), input[value="Cancelar"]',

    // Mensajes
    MENSAJE_EXITO: '.alert-success, .mensaje-exito',
    MENSAJE_ERROR: '.alert-danger, .mensaje-error',
  },

  // Formulario de Auto-Registro de Independientes V2 (flujo actual)
  REGISTRO_INDEPENDIENTE: {
    // Paso 1: Datos Personales
    TIPO_DOCUMENTO: '#tipoDocumentoAportante',
    NUMERO_DOCUMENTO: '#numeroDocumentoAportante',
    NOMBRES: '#nombresAportante',
    APELLIDOS: '#apellidosAportante',
    BTN_SIGUIENTE: '#siguiente2',

    // Paso 2: Contacto
    DEPARTAMENTO: '#departamento',
    MUNICIPIO: '#municipio',
    DIRECCION: '#direccion',
    TELEFONO: '#telefonoAportante',
    CELULAR: '#celular',
    CORREO: '#correoElectronico',
    COMO_NOS_CONOCISTE: '#comoNosConociste',
    CHECKBOX_TERMINOS: '#aceptaTermCondTratDatosCheckbox',
    BTN_FINALIZAR: '#finalizar',

    // Link de registro desde login
    LINK_REGISTRO: '.registrarseIndependienteLink, a[href*="inicioCreacionAportanteInd"]',

    // Mensajes
    MENSAJE_EXITO: '.alert-success, .mensaje-exito, .exito-registro',
    MENSAJE_ERROR: '.alert-danger, .mensaje-error, .error-registro',
  },

  // Gestionar Planillas
  PLANILLAS: {
    // Criterios de búsqueda
    PERIODO_MES: 'select[name*="mes"], select[id*="mes"]',
    PERIODO_ANO: 'select[name*="ano"], input[name*="ano"]',
    TIPO_PLANILLA: 'select[name*="tipoPlanilla"]',
    BTN_BUSCAR: 'button:has-text("Buscar"), input[value="Buscar"]',
    BTN_NUEVA_PLANILLA: 'button:has-text("Nueva"), input[value="Nueva"]',

    // Tabla de planillas
    TABLA_PLANILLAS: 'table.planillas, table[id*="planilla"]',
    FILA_PLANILLA: 'table tbody tr',

    // Acciones
    BTN_EDITAR: 'a:has-text("Editar"), button:has-text("Editar")',
    BTN_ELIMINAR: 'a:has-text("Eliminar"), button:has-text("Eliminar")',
    BTN_VER: 'a:has-text("Ver"), button:has-text("Ver")',
    BTN_PAGAR: 'a:has-text("Pagar"), button:has-text("Pagar")',
  },

  // Liquidación de Planilla (legacy - selectores genéricos)
  LIQUIDACION: {
    // Datos del cotizante
    TIPO_COTIZANTE: 'select[name*="tipoCotizante"]',
    SUBTIPO_COTIZANTE: 'select[name*="subtipoCotizante"]',
    IBC: 'input[name*="ibc"], input[name*="ingresoBase"]',

    // Entidades
    EPS: 'select[name*="eps"], select[id*="eps"]',
    AFP: 'select[name*="afp"], select[name*="pension"], select[id*="afp"]',
    ARL: 'select[name*="arl"], select[id*="arl"]',
    CCF: 'select[name*="ccf"], select[name*="cajaCompensacion"]',

    // Novedades
    NOVEDAD_INGRESO: 'input[name*="ingreso"], input[type="checkbox"][id*="ing"]',
    NOVEDAD_RETIRO: 'input[name*="retiro"], input[type="checkbox"][id*="ret"]',

    // Días
    DIAS_SALUD: 'input[name*="diasSalud"]',
    DIAS_PENSION: 'input[name*="diasPension"]',
    DIAS_ARL: 'input[name*="diasArl"]',

    // Valores calculados
    VALOR_SALUD: 'input[name*="valorSalud"], span[id*="valorSalud"]',
    VALOR_PENSION: 'input[name*="valorPension"], span[id*="valorPension"]',
    VALOR_ARL: 'input[name*="valorArl"], span[id*="valorArl"]',
    VALOR_TOTAL: 'input[name*="valorTotal"], span[id*="valorTotal"]',

    // Botones
    BTN_CALCULAR: 'button:has-text("Calcular"), input[value="Calcular"]',
    BTN_GUARDAR: 'button:has-text("Guardar"), input[value="Guardar"]',
    BTN_LIQUIDAR: 'button:has-text("Liquidar"), input[value="Liquidar"]',
  },

  // ============================================================================
  // CREAR PLANILLA - Flujo Principal (4 pasos)
  // URL: servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do
  // ============================================================================
  CREAR_PLANILLA: {
    // Link de inicio desde menú
    LINK_LIQUIDAR: 'a:contains("Deseo liquidar una planilla")',

    // === PASO 1: Información Básica del Aportante ===
    PASO1: {
      FORM: 'planillaEnLineaPaso1Form',
      TIPO_APORTANTE: 'select[name="tipoAportante"]',
      CLASE_APORTANTE: 'select[name="claseAportante"]',
      FORMA_PRESENTACION: 'select[name="formaPresent"]',
      ARL: 'select[name="arl"]',
      CAJA_COMPENSACION: '#cajaCompensacion',
      PERIODO_MES: '#periodoLiquidacionMes',
      PERIODO_ANIO: '#periodoLiquidacionAnnio',
      EXONERADO_SALUD: 'select[name="exoneradoSalud"]',
      EXONERADO_ICBF: 'select[name="exoneradoICBF"]',
      TIPO_PLANILLA: 'select[name="tipoPlanilla"]',
      BTN_SIGUIENTE: '#siguiente2',
      BTN_GUARDAR: '#guardar2',
    },

    // === PASO 2: Información Detallada (Cotizantes) ===
    PASO2: {
      FORM: 'formPlanillaEnLineaPaso2',
      BTN_AGREGAR_COTIZANTE: 'a[onclick*="agregarCotizante"]',
      INPUT_BUSCAR_DOCUMENTO: '#consultarCzte',
      BTN_BUSCAR: '#consultarCzteAll',
      TABLA_COTIZANTES: '#CrearPlanilla',
      CHECKBOX_COTIZANTE: 'input[name="seleccionado"]',
      BTN_GUARDAR: '#guardar2',
      BTN_ANTERIOR: '#anterior2',
      BTN_SIGUIENTE: '#siguiente2',
      BTN_ELIMINAR: '#eliminarLink',
    },

    // === PASO 3: Validación Afiliación ===
    PASO3: {
      BTN_ANTERIOR: '#anterior2',
      BTN_SIGUIENTE: '#siguiente2',
      MENSAJE_VALIDACION: '.mensaje-validacion',
    },

    // === PASO 4: Liquidación General ===
    PASO4: {
      RESUMEN_TOTAL: '#valorTotal, .total-liquidacion',
      BTN_GUARDAR: '#guardar2',
      BTN_ANTERIOR: '#anterior2',
      NUMERO_PLANILLA: '#numeroPlanilla',
    },
  },

  // ============================================================================
  // AGREGAR COTIZANTE - Popup (5 pasos)
  // URL: servicio.nuevosoi.com.co/soi/ingresarCotizante.do
  // VERIFICADO: 2026-02-22
  // ============================================================================
  AGREGAR_COTIZANTE: {
    // === PASO 1: Información Básica del Cotizante ===
    PASO1: {
      FORM: 'informacionBasica',
      // Identificación
      TIPO_DOCUMENTO: 'select[name="tipoIdentificacionCotizante"]',
      NUMERO_DOCUMENTO: 'input[name="numeroIdentificacionCotizante"]',
      // Nombres
      PRIMER_NOMBRE: 'input[name="primerNombreCotizante"]',
      SEGUNDO_NOMBRE: 'input[name="segundoNombreCotizante"]',
      PRIMER_APELLIDO: 'input[name="primerApellidoCotizante"]',
      SEGUNDO_APELLIDO: 'input[name="segundoApellidoCotizante"]',
      // Clasificación
      TIPO_COTIZANTE: 'select[name="tipoCotizante"]',
      // ⚠️ IMPORTANTE: subTipoCotizante debe dejarse en "SELECCIONE" para independientes
      // El sistema usa el valor correcto de BDUA automáticamente
      SUBTIPO_COTIZANTE: 'select[name="subTipoCotizante"]',
      EXONERADO_PARAFISCALES: 'select[name="exoneradoParafiscales"]',
      // Colombiano exterior
      COLOMBIANO_EXTERIOR: 'input[name="colombianoResidenteExterior"]',
      FECHA_EXTERIOR: 'input[name="fechaColResidenteExterior"]',
      // Extranjero
      EXTRANJERO_NO_OBLIGADO: 'input[name="extrajeroNoObligado"]',
      // Ubicación
      DEPARTAMENTO: 'select[name="departamento"]',
      MUNICIPIO: 'select[name="municipio"]',
      // Navegación
      BTN_SIGUIENTE: 'input#siguiente2',
    },

    // === PASO 2: Novedades ===
    PASO2: {
      // Novedades de ingreso/retiro
      NOVEDAD_INGRESO: 'input[name*="ingreso"]',
      FECHA_INGRESO: 'input[name*="fechaIngreso"]',
      NOVEDAD_RETIRO: 'input[name*="retiro"]',
      FECHA_RETIRO: 'input[name*="fechaRetiro"]',
      // Incapacidades
      INCAPACIDAD_GENERAL: 'input[name*="incapacidad"]',
      // Navegación
      BTN_SIGUIENTE: 'input[value="Siguiente"]',
      BTN_ANTERIOR: 'input[value="Anterior"]',
    },

    // === PASO 3: Seguridad Social (IBC) ⭐ VERIFICADO 2026-02-22 ===
    PASO3: {
      // ====== SALARIO ======
      // NOTA: El campo tiene un typo en SOI: "sarioBasico" no "salarioBasico"
      SALARIO_BASICO: 'input#sarioBasico',

      // ====== PENSIÓN ======
      ADMINISTRADORA_PENSION: 'select#administradoraPension',
      DIAS_COTIZADOS_PENSION: 'input#numeroDiasCotizadosPension',
      IBC_PENSION: 'input#ibcPension',  // ⭐ IBC PENSIÓN
      TARIFA_PENSION: 'select#tarifaPension',
      TOTAL_COTIZACION_PENSION: 'input#totalCotizacionPension',
      TARIFA_INDICADOR_ESPECIAL: 'select#tarifaIndicadorEspecial',

      // ====== SALUD ======
      ADMINISTRADORA_SALUD: 'select#administradoraSalud',
      DIAS_COTIZADOS_SALUD: 'input#numeroDiasCotizadosSalud',
      IBC_SALUD: 'input#ibcSalud',  // ⭐ IBC SALUD
      TARIFA_SALUD: 'select#tarifaSalud',
      TOTAL_COTIZACION_SALUD: 'input#totalCotizacionSalud',

      // ====== RIESGOS LABORALES (ARL) ======
      ADMINISTRADORA_ARL: 'select#administradoraArl',
      DIAS_COTIZADOS_ARL: 'input#numeroDiasCotizadosArl',
      IBC_ARL: 'input#ibcArl',
      TARIFA_ARL: 'select#tarifaArl',
      CLASE_RIESGO: 'select#claseRiesgo',
      TOTAL_COTIZACION_ARL: 'input#totalCotizacionArl',

      // ====== FSP (Fondo Solidaridad Pensional) ======
      APORTE_FSP: 'input#aporteFsp',
      APORTE_SUBSISTENCIA: 'input#aporteSubsistencia',

      // ====== NAVEGACIÓN ======
      BTN_SIGUIENTE: 'input#siguiente2',
      BTN_ANTERIOR: 'input#anterior2',
    },

    // === PASO 4: Parafiscales ===
    PASO4: {
      // SENA
      APORTE_SENA: 'input[name*="sena"]',
      // ICBF
      APORTE_ICBF: 'input[name*="icbf"]',
      // Caja Compensación
      CAJA_COMPENSACION: 'select[name*="cajaCompensacion"]',
      APORTE_CCF: 'input[name*="aporteCcf"]',
      // Navegación
      BTN_SIGUIENTE: 'input[value="Siguiente"]',
      BTN_ANTERIOR: 'input[value="Anterior"]',
    },

    // === PASO 5: Resumen ===
    PASO5: {
      // Totales
      TOTAL_PENSION: '.total-pension',
      TOTAL_SALUD: '.total-salud',
      TOTAL_ARL: '.total-arl',
      TOTAL_PARAFISCALES: '.total-parafiscales',
      TOTAL_GENERAL: '.total-general',
      // Navegación
      BTN_GUARDAR: 'input[value="Guardar"]',
      BTN_ANTERIOR: 'input[value="Anterior"]',
    },
  },

  // ============================================================================
  // VALORES POR DEFECTO PARA INDEPENDIENTES
  // ============================================================================
  DEFAULTS_INDEPENDIENTE: {
    TIPO_APORTANTE: '02',       // 02-INDEPENDIENTE
    CLASE_APORTANTE: 'I',       // I-INDEPENDIENTE
    FORMA_PRESENTACION: 'ÚNICO',
    TIPO_PLANILLA: 'I',         // I-INDEPENDIENTES
    TIPO_COTIZANTE: '3',        // 3-INDEPENDIENTE
    // ⚠️ IMPORTANTE: No seleccionar subtipo para independientes
    SUBTIPO_COTIZANTE: '',      // Dejar vacío
    DIAS_COTIZADOS: 30,         // Mes completo
    TARIFA_PENSION: 16,         // 16%
    TARIFA_SALUD: 12.5,         // 12.5%
    SALARIO_MINIMO_2026: 1423500,
  },

  // Pago de Planilla - Flujo completo
  PAGO: {
    // === PASO 1: Gestionar Planillas → Seleccionar tipo ===
    TAB_ACTIVOS: 'a:has-text("Activos"), button:has-text("Activos"), [data-tab="activos"]',
    TAB_EN_LINEA: 'a:has-text("En línea"), button:has-text("En línea"), [data-tab="enlinea"]',

    // === PASO 2: Tabla de planillas ===
    TABLA_PLANILLAS: 'table.planillas, table[id*="planilla"], table.tabla-planillas',
    FILA_PLANILLA: 'table tbody tr',
    CHECKBOX_PLANILLA: 'input[type="checkbox"][name*="planilla"], input[type="checkbox"][name*="check"]',
    CHECKBOX_SELECT_ALL: 'input[type="checkbox"][name*="selectAll"], input[type="checkbox"][id*="selectAll"]',

    // Columnas de tabla
    COL_NUMERO_PLANILLA: 'td[data-col="numero"], td:nth-child(2)',
    COL_PERIODO: 'td[data-col="periodo"], td:nth-child(3)',
    COL_VALOR: 'td[data-col="valor"], td:nth-child(4)',
    COL_ESTADO: 'td[data-col="estado"], td:nth-child(5)',

    // Botón continuar después de seleccionar planilla
    BTN_CONTINUAR: 'button:has-text("Continuar"), input[value="Continuar"], a:has-text("Continuar")',
    BTN_SIGUIENTE: 'button:has-text("Siguiente"), input[value="Siguiente"]',

    // === PASO 3: Formulario de datos antes de pago ===
    // Checkboxes obligatorios del formulario
    CHECKBOX_ACEPTO_TERMINOS: 'input[type="checkbox"][name*="terminos"], input[type="checkbox"][id*="terminos"]',
    CHECKBOX_AUTORIZO: 'input[type="checkbox"][name*="autorizo"], input[type="checkbox"][id*="autorizo"]',
    CHECKBOX_ACEPTO_DATOS: 'input[type="checkbox"][name*="datos"], input[type="checkbox"][id*="tratamiento"]',

    // Información del pagador (si se requiere)
    INPUT_NOMBRE_PAGADOR: 'input[name*="nombrePagador"], input[id*="nombrePagador"]',
    INPUT_DOCUMENTO_PAGADOR: 'input[name*="documentoPagador"], input[id*="documentoPagador"]',
    INPUT_EMAIL_PAGADOR: 'input[name*="emailPagador"], input[name*="correo"], input[id*="emailPagador"]',
    INPUT_TELEFONO_PAGADOR: 'input[name*="telefonoPagador"], input[id*="telefonoPagador"]',

    // === PASO 4: Resumen de liquidación ===
    RESUMEN_VALOR_TOTAL: '.valor-total, [id*="valorTotal"], .total-pagar',
    RESUMEN_DETALLE_SALUD: '[id*="valorSalud"], .detalle-salud',
    RESUMEN_DETALLE_PENSION: '[id*="valorPension"], .detalle-pension',
    RESUMEN_DETALLE_ARL: '[id*="valorArl"], .detalle-arl',

    // === PASO 5: Selección de método de pago ===
    BTN_PAGAR_PSE: 'button:has-text("PSE"), a:has-text("PSE"), input[value="PSE"], [data-pago="pse"]',
    BTN_PAGAR_EFECTIVO: 'button:has-text("Efectivo"), a:has-text("Efectivo")',
    BTN_PAGAR_TARJETA: 'button:has-text("Tarjeta"), a:has-text("Tarjeta")',

    // === PASO 6: Formulario PSE (campos reales de SOI) ===
    // Tipo de Aportante ante Entidades Financieras
    SELECT_TIPO_APORTANTE: 'select[name="codTipoEntidad"]',
    OPTION_APORTANTE_NATURAL: 'NATURAL',
    OPTION_APORTANTE_JURIDICA: 'JURIDICA',

    // Entidad Financiera (banco)
    SELECT_ENTIDAD_FINANCIERA: 'select[name="codEntidadFinanciera"]',

    // Legacy selectors (mantener por compatibilidad)
    SELECT_TIPO_PERSONA: 'select[name="codTipoEntidad"], select[name*="tipoPersona"]',
    OPTION_PERSONA_NATURAL: 'NATURAL',
    OPTION_PERSONA_JURIDICA: 'JURIDICA',
    SELECT_TIPO_DOC_PSE: 'select[name*="tipoDocumento"], select[id*="tipoDocPse"]',
    INPUT_NUMERO_DOC_PSE: 'input[name*="numeroDocumento"], input[id*="numDocPse"]',
    INPUT_EMAIL_PSE: 'input[name*="email"], input[name*="correo"], input[id*="emailPse"]',
    SELECT_BANCO: 'select[name="codEntidadFinanciera"], select[name*="banco"]',

    // Botón para ir al banco
    BTN_IR_BANCO: 'button:has-text("Ir al banco"), button:has-text("Pagar"), input[value="Pagar"]',
    BTN_CONFIRMAR_PSE: 'button:has-text("Confirmar"), input[value="Confirmar"]',

    // === PASO 7: Confirmación y comprobante ===
    BTN_FINALIZAR: 'button:has-text("Finalizar"), input[value="Finalizar"]',

    // Información de transacción
    NUMERO_TRANSACCION: '[id*="numeroTransaccion"], .numero-transaccion',
    NUMERO_PLANILLA: 'span[id*="numeroPlanilla"], td:has-text("Número")',
    ESTADO_TRANSACCION: '[id*="estadoTransaccion"], .estado-transaccion',
    FECHA_PAGO: '[id*="fechaPago"], .fecha-pago',

    // Comprobante
    BTN_DESCARGAR_COMPROBANTE: 'button:has-text("Descargar"), a:has-text("Descargar comprobante")',
    BTN_IMPRIMIR: 'button:has-text("Imprimir"), a:has-text("Imprimir")',
    COMPROBANTE_PAGO: '.comprobante, #comprobante, .soporte-pago',

    // Mensajes
    MENSAJE_EXITO: '.alert-success, .mensaje-exito, :has-text("exitosamente")',
    MENSAJE_ERROR: '.alert-danger, .mensaje-error, .error',
    MENSAJE_PENDIENTE: '.alert-warning, .mensaje-pendiente',
  },

  // Indicadores de estado
  ESTADO: {
    SPINNER: '.spinner, .loading, [class*="loading"]',
    MODAL: '.modal, [role="dialog"]',
    MODAL_CLOSE: '.modal .close, [role="dialog"] button[aria-label="Close"]',
    SESSION_EXPIRED: '.session-expired, :has-text("sesión ha expirado")',
    LOGGED_IN_USER: '.user-info, .usuario-logueado, [class*="userName"]',
  },

  // Tipos de documento comunes en SOI
  TIPOS_DOCUMENTO: {
    CC: 'C.C.',
    CE: 'C.E.',
    NIT: 'NIT',
    TI: 'T.I.',
    PA: 'PA',
    CD: 'CD',
  },

  // Roles SOI
  ROLES_SOI: {
    ADMINISTRADOR: 'Administrador',
    OPERADOR: 'Operador',
    CONSULTA: 'Consulta',
  },

  // Datos PSE de ULE Colombia (para pagos)
  PSE_ULE: {
    TIPO_PERSONA: 'Jurídica',
    TIPO_DOCUMENTO: 'NIT',
    NUMERO_DOCUMENTO: '902019031-4',
    EMAIL: 'pagos.ule@gmail.com',
    // Banco por defecto (Bancolombia)
    BANCO_DEFAULT: 'BANCOLOMBIA',
  },

  // Bancos disponibles en PSE
  BANCOS_PSE: {
    BANCOLOMBIA: 'Bancolombia',
    DAVIVIENDA: 'Davivienda',
    BBVA: 'BBVA',
    BANCO_BOGOTA: 'Banco de Bogotá',
    BANCO_OCCIDENTE: 'Banco de Occidente',
    BANCO_POPULAR: 'Banco Popular',
    NEQUI: 'Nequi',
    DAVIPLATA: 'Daviplata',
  },
};

export default SOI_SELECTORS;
