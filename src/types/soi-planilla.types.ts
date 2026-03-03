/**
 * Tipos para Liquidación de Planilla SOI
 *
 * Esta estructura representa TODOS los campos que el usuario puede/debe
 * llenar para liquidar una planilla en SOI.
 *
 * El RPA usa estos datos para diligenciar los formularios.
 * Los valores son VARIABLES - cada usuario tiene su propia información.
 */

// ============================================================
// TIPOS BASE
// ============================================================

export type TipoDocumento = 'CC' | 'CE' | 'NIT' | 'PA' | 'TI';

export type TipoCotizante =
  | '1'   // 1-DEPENDIENTE
  | '2'   // 2-SERVICIO DOMÉSTICO
  | '3'   // 3-INDEPENDIENTE
  | '4'   // 4-MADRE COMUNITARIA
  | '12'  // 12-APRENDIZ SENA
  | '51'  // 51-TRABAJADOR DE TIEMPO PARCIAL
  | '52'  // 52-COLOMBIANO RESIDENTE EN EL EXTERIOR
  | string; // Otros tipos

// SubTipo: DEJAR VACÍO para independientes (el sistema usa BDUA)
export type SubTipoCotizante = '' | string;

export type TipoNovedad =
  | 'ING'  // Ingreso
  | 'RET'  // Retiro
  | 'TDE'  // Traslado desde otra EPS
  | 'TAE'  // Traslado a otra EPS
  | 'TDP'  // Traslado desde otra AFP
  | 'TAP'  // Traslado a otra AFP
  | 'VSP'  // Variación permanente de salario
  | 'VST'  // Variación transitoria de salario
  | 'SLN'  // Suspensión temporal (licencia no remunerada)
  | 'IGE'  // Incapacidad general
  | 'LMA'  // Licencia de maternidad
  | 'VAC'  // Vacaciones
  | 'IRL'  // Incapacidad por riesgo laboral
  | string;

// ============================================================
// ESTRUCTURA PRINCIPAL
// ============================================================

/**
 * Información completa para liquidar una planilla
 */
export interface SOIPlanillaLiquidacion {
  // Identificación del proceso
  id?: string;
  userId: string;
  createdAt?: Date;
  status?: 'pending' | 'processing' | 'completed' | 'failed';

  // Período de liquidación
  periodo: {
    mes: number;   // 1-12
    anio: number;  // 2024, 2025, 2026...
  };

  // Información del aportante (Planilla Paso 1)
  aportante: SOIAportante;

  // Cotizante(s) a liquidar
  cotizantes: SOICotizante[];

  // Información de pago (opcional, para PSE)
  pago?: SOIPago;
}

/**
 * Información del Aportante (empleador o independiente)
 * Planilla Principal - Paso 1
 */
export interface SOIAportante {
  tipoAportante: '01' | '02';  // 01=Empleador, 02=Independiente
  claseAportante: string;      // 'I' = Independiente
  naturalezaJuridica: 'PRIVADA' | 'PUBLICA' | string;

  // Forma de presentación
  formaPresentacion: 'ÚNICO' | 'SUCURSAL' | string;

  // ARL
  arl?: {
    codigo: string;   // Ej: "14-11" para ARL SURA
    nombre?: string;
  };

  // Caja de compensación (opcional para independientes)
  cajaCompensacion?: {
    codigo: string;
    nombre?: string;
  };

  // Exoneración parafiscales
  exoneradoAportesSalud?: boolean;
  exoneradoAportesICBF?: boolean;
}

/**
 * Información de un Cotizante
 * Popup Agregar Cotizante - Pasos 1-5
 */
export interface SOICotizante {
  // ========== PASO 1: Información Básica ==========
  identificacion: {
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
  };

  nombres: {
    primerNombre: string;
    segundoNombre?: string;
    primerApellido: string;
    segundoApellido?: string;
  };

  clasificacion: {
    tipoCotizante: TipoCotizante;
    // IMPORTANTE: subTipoCotizante debe ser '' (vacío) para independientes
    // El sistema usa el valor correcto de BDUA automáticamente
    subTipoCotizante?: SubTipoCotizante;

    // Cotizante exonerado de parafiscales (Reforma Tributaria)
    exoneradoParafiscales?: boolean;

    // Colombiano residente en el exterior
    colombianoExterior?: boolean;
    fechaRadicacionExterior?: string;  // DD/MM/YYYY

    // Extranjero no obligado a pensión
    extranjeroNoObligadoPension?: boolean;

    // Liquidar solo FSP
    liquidarSoloFSP?: boolean;
  };

  ubicacion: {
    departamento: string;   // Código departamento
    municipio: string;      // Código municipio
  };

  // Cotizante principal (para dependientes de otro cotizante)
  cotizantePrincipal?: {
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
  };

  // ========== PASO 2: Novedades ==========
  novedades?: SOINovedades;

  // ========== PASO 3: Seguridad Social (IBC) ==========
  seguridadSocial: SOISeguridadSocial;

  // ========== PASO 4: Parafiscales ==========
  parafiscales?: SOIParafiscales;
}

/**
 * Novedades del cotizante
 * Popup Agregar Cotizante - Paso 2
 */
export interface SOINovedades {
  // Novedad de ingreso/retiro
  ingreso?: {
    fecha: string;  // DD/MM/YYYY
  };
  retiro?: {
    fecha: string;  // DD/MM/YYYY
  };

  // Traslados
  trasladoDesdeEPS?: {
    fecha: string;
    epsAnterior: string;
  };
  trasladoAEPS?: {
    fecha: string;
    epsNueva: string;
  };
  trasladoDesdeAFP?: {
    fecha: string;
    afpAnterior: string;
  };
  trasladoAAFP?: {
    fecha: string;
    afpNueva: string;
  };

  // Variación de salario
  variacionSalarioPermanente?: boolean;
  variacionSalarioTransitorio?: boolean;

  // Incapacidades
  incapacidadGeneral?: {
    diasIncapacidad: number;
    fechaInicio: string;
    fechaFin: string;
  };
  incapacidadRiesgoLaboral?: {
    diasIncapacidad: number;
    fechaInicio: string;
    fechaFin: string;
  };

  // Licencias
  licenciaMaternidad?: {
    diasLicencia: number;
    fechaInicio: string;
    fechaFin: string;
  };
  licenciaNoRemunerada?: {
    diasLicencia: number;
    fechaInicio: string;
    fechaFin: string;
  };

  // Vacaciones
  vacaciones?: {
    diasVacaciones: number;
    fechaInicio: string;
    fechaFin: string;
  };

  // Otros
  otrasNovedades?: string[];
}

/**
 * Seguridad Social - IBC y aportes
 * Popup Agregar Cotizante - Paso 3
 *
 * ⭐ ESTOS SON LOS CAMPOS IBC QUE EL USUARIO DEBE LLENAR
 */
export interface SOISeguridadSocial {
  // Salario base del cotizante
  salarioBasico: number;  // Campo: sarioBasico (tiene typo en SOI)

  // ========== PENSIÓN ==========
  pension: {
    // AFP del usuario
    administradora: {
      codigo: string;   // Ej: "224,25-14" para COLPENSIONES
      nombre?: string;  // "COLPENSIONES"
    };

    // Días cotizados (normalmente 30, puede ser menos)
    diasCotizados: number;  // Campo: numeroDiasCotizadosPension

    // ⭐ IBC Pensión - El valor que el usuario quiere cotizar
    ibc: number;  // Campo: ibcPension

    // Tarifa (normalmente 16%, puede variar)
    tarifa?: number;  // Campo: tarifaPension

    // Total cotización (calculado: IBC * tarifa)
    totalCotizacion?: number;  // Campo: totalCotizacionPension

    // Indicador tarifa especial (para pensionados, etc.)
    indicadorTarifaEspecial?: string;  // Campo: tarifaIndicadorEspecial
  };

  // ========== SALUD ==========
  salud: {
    // EPS del usuario
    administradora: {
      codigo: string;   // Ej: "126,EPS002" para SALUD TOTAL
      nombre?: string;  // "SALUD TOTAL"
    };

    // Días cotizados
    diasCotizados: number;  // Campo: numeroDiasCotizadosSalud

    // ⭐ IBC Salud - El valor que el usuario quiere cotizar
    ibc: number;  // Campo: ibcSalud

    // Tarifa (normalmente 12.5%)
    tarifa?: number;  // Campo: tarifaSalud

    // Total cotización
    totalCotizacion?: number;  // Campo: totalCotizacionSalud
  };

  // ========== RIESGOS LABORALES (ARL) ==========
  riesgosLaborales?: {
    administradora?: {
      codigo: string;
      nombre?: string;
    };
    diasCotizados?: number;
    ibc?: number;
    claseRiesgo?: '1' | '2' | '3' | '4' | '5';  // I a V
    tarifa?: number;  // Depende del nivel de riesgo
    totalCotizacion?: number;
  };

  // ========== FSP (Fondo Solidaridad Pensional) ==========
  // Aplica si IBC > 4 SMLMV
  fsp?: {
    aporteFSP?: number;
    aporteSubsistencia?: number;
  };
}

/**
 * Parafiscales
 * Popup Agregar Cotizante - Paso 4
 */
export interface SOIParafiscales {
  // SENA
  sena?: {
    aporte: number;
    tarifa?: number;  // 2%
  };

  // ICBF
  icbf?: {
    aporte: number;
    tarifa?: number;  // 3%
  };

  // Caja de Compensación
  cajaCompensacion?: {
    codigo: string;
    nombre?: string;
    aporte: number;
    tarifa?: number;  // 4%
  };

  // MEN (Ministerio Educación Nacional) - Solo sector público
  men?: {
    aporte: number;
  };

  // ESAP - Solo sector público
  esap?: {
    aporte: number;
  };
}

/**
 * Información de pago PSE
 */
export interface SOIPago {
  banco: {
    codigo: string;
    nombre: string;
  };
  tipoCuenta?: 'ahorros' | 'corriente';
  tipoPersona?: 'natural' | 'juridica';

  // Montos
  totalAPagar: number;

  // Estado del pago
  estado?: 'pendiente' | 'procesando' | 'aprobado' | 'rechazado';
  referenciaPago?: string;
  fechaPago?: Date;
}

// ============================================================
// CONSTANTES Y DEFAULTS
// ============================================================

/**
 * Valores por defecto para independiente típico
 * NOTA: Estos son solo defaults, el usuario puede cambiarlos
 */
export const SOI_DEFAULTS_INDEPENDIENTE = {
  aportante: {
    tipoAportante: '02' as const,
    claseAportante: 'I',
    naturalezaJuridica: 'PRIVADA',
    formaPresentacion: 'ÚNICO',
  },

  cotizante: {
    tipoCotizante: '3' as const,  // Independiente
    subTipoCotizante: '',         // VACÍO - importante
    exoneradoParafiscales: false,
    colombianoExterior: false,
  },

  seguridadSocial: {
    diasCotizados: 30,  // Mes completo
    tarifaPension: 16,  // 16%
    tarifaSalud: 12.5,  // 12.5%
  },
};

/**
 * Salario mínimo 2026 (ejemplo, actualizar cada año)
 */
export const SALARIO_MINIMO_2026 = 1423500;

/**
 * IBC mínimo para independientes = Salario mínimo
 */
export const IBC_MINIMO_INDEPENDIENTE = SALARIO_MINIMO_2026;

// ============================================================
// SELECTORES SOI (Referencia)
// ============================================================

/**
 * Selectores de campos en SOI - Paso 3 Seguridad Social
 * Estos son los IDs/names de los campos en el HTML de SOI
 */
export const SOI_SELECTORS_PASO3 = {
  // Salario
  salarioBasico: '#sarioBasico',  // NOTA: tiene typo en SOI

  // Pensión
  administradoraPension: '#administradoraPension',
  numeroDiasCotizadosPension: '#numeroDiasCotizadosPension',
  ibcPension: '#ibcPension',
  tarifaPension: '#tarifaPension',
  totalCotizacionPension: '#totalCotizacionPension',
  tarifaIndicadorEspecial: '#tarifaIndicadorEspecial',

  // Salud
  administradoraSalud: '#administradoraSalud',
  numeroDiasCotizadosSalud: '#numeroDiasCotizadosSalud',
  ibcSalud: '#ibcSalud',
  tarifaSalud: '#tarifaSalud',
  totalCotizacionSalud: '#totalCotizacionSalud',

  // Navegación
  siguiente: '#siguiente2',
  anterior: '#anterior2',
};
