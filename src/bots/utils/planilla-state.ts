/**
 * Planilla State Detection Module
 *
 * Implementa el árbol de decisión para detectar el estado de planillas
 * antes de crear nuevas o proceder con pagos.
 *
 * Árbol de decisión:
 *
 *   Bot inicia flujo de liquidación
 *              ↓
 *     ¿Ya existe planilla para este periodo?
 *          ↙              ↘
 *         SÍ               NO
 *          ↓                ↓
 *    ¿Está pagada?      Crear planilla nueva
 *       ↙      ↘
 *      SÍ       NO
 *       ↓        ↓
 *    Retornar   Ir directo
 *    comprobante al paso de pago
 *
 * @author Claude Code
 * @date 2026-03-05
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type PlanillaEstado =
  | 'NO_EXISTE'           // No hay planilla para este periodo
  | 'PENDIENTE_PAGO'      // Existe pero no está pagada
  | 'PAGADA'              // Ya está pagada
  | 'RECHAZADA'           // Fue rechazada
  | 'VENCIDA'             // Venció sin pagar
  | 'ERROR_VALIDACION'    // Error de validación en los datos del cotizante
  | 'ERROR_VERIFICACION'; // No se pudo determinar

export interface PlanillaStateResult {
  estado: PlanillaEstado;
  numeroPlanilla?: string;
  valorTotal?: number;
  periodo?: string;
  fechaPago?: Date;
  mensaje?: string;
}

export interface VerificacionPlanillaOptions {
  periodo: {
    mes: number;  // 1-12
    anio: number; // 2026
  };
  tipoDocumento: string;
  numeroDocumento: string;
}

export type AccionRecomendada =
  | 'CREAR_PLANILLA'
  | 'IR_A_PAGO'
  | 'DESCARGAR_COMPROBANTE'
  | 'REINTENTAR'
  | 'CORREGIR_DATOS'      // Usuario debe corregir datos en el operador
  | 'ERROR';

export interface DecisionResult {
  accion: AccionRecomendada;
  estado: PlanillaStateResult;
  mensaje: string;
}

// ============================================================================
// SOI STATE DETECTION
// ============================================================================

/**
 * Verifica el estado de planillas en SOI para un periodo específico
 */
export async function verificarEstadoPlanillaSOI(
  page: Page,
  options: VerificacionPlanillaOptions
): Promise<PlanillaStateResult> {
  const periodoStr = `${options.periodo.mes.toString().padStart(2, '0')}/${options.periodo.anio}`;

  logger.info('Verificando estado de planilla en SOI', {
    periodo: periodoStr,
    documento: options.numeroDocumento,
  });

  try {
    // Navegar a consulta de planillas
    const consultaUrl = 'https://servicio.nuevosoi.com.co/soi/consultarplanillas.do';
    await page.goto(consultaUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Buscar planillas para el periodo
    const resultado = await page.evaluate((periodo, doc) => {
      const bodyText = document.body.innerText.toLowerCase();

      // Verificar si hay errores de validación (alta prioridad)
      const validationErrors = [
        'error de validación',
        'error validación',
        'datos inválidos',
        'cotizante no válido',
        'afiliación no encontrada',
        'no se encontró afiliación',
        'eps no registrada',
        'afp no registrada',
        'arl no registrada',
        'bdua', // Error de consulta BDUA
        'datos inconsistentes',
        'información incompleta',
        'persona no encontrada',
      ];

      for (const errPattern of validationErrors) {
        if (bodyText.includes(errPattern)) {
          return {
            estado: 'ERROR_VALIDACION' as const,
            mensaje: `Se detectó: ${errPattern}`,
          };
        }
      }

      // Verificar si hay mensaje de "no hay planillas"
      if (
        bodyText.includes('no se encontraron planillas') ||
        bodyText.includes('no hay planillas') ||
        bodyText.includes('sin planillas')
      ) {
        return { estado: 'NO_EXISTE' as const };
      }

      // Buscar en la tabla de planillas
      const rows = document.querySelectorAll('table tbody tr, .planilla-row, tr[data-planilla]');

      for (const row of Array.from(rows)) {
        const rowText = row.textContent || '';

        // Verificar si esta fila corresponde al periodo buscado
        // El periodo en SOI aparece como "02/2026" o "2026-02"
        const periodoFormats = [
          periodo,
          periodo.split('/').reverse().join('-'),
          periodo.replace('/', '-'),
        ];

        const matchesPeriodo = periodoFormats.some(fmt => rowText.includes(fmt));

        if (matchesPeriodo) {
          // Extraer número de planilla
          const numMatch = rowText.match(/\b(\d{8,15})\b/);
          const numeroPlanilla = numMatch ? numMatch[1] : undefined;

          // Extraer valor
          const valorMatch = rowText.match(/\$\s*([\d.,]+)/);
          const valorTotal = valorMatch
            ? parseInt(valorMatch[1].replace(/[.,]/g, ''), 10)
            : undefined;

          // Determinar estado
          const estadoCell = row.querySelector('.estado, td:last-child, [class*="estado"]');
          const estadoText = (estadoCell?.textContent || rowText).toLowerCase();

          let estado: 'PENDIENTE_PAGO' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' = 'PENDIENTE_PAGO';

          if (estadoText.includes('pagad') || estadoText.includes('aprobad')) {
            estado = 'PAGADA';
          } else if (estadoText.includes('rechazad') || estadoText.includes('fallid')) {
            estado = 'RECHAZADA';
          } else if (estadoText.includes('vencid')) {
            estado = 'VENCIDA';
          }

          return {
            estado,
            numeroPlanilla,
            valorTotal,
            periodo,
          };
        }
      }

      // No se encontró planilla para este periodo
      return { estado: 'NO_EXISTE' as const };

    }, periodoStr, options.numeroDocumento);

    logger.info('Estado de planilla SOI determinado', resultado);
    return resultado as PlanillaStateResult;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error verificando estado en SOI', { error: errorMsg });

    return {
      estado: 'ERROR_VERIFICACION',
      mensaje: errorMsg,
    };
  }
}

// ============================================================================
// MI PLANILLA STATE DETECTION
// ============================================================================

/**
 * Verifica el estado de planillas en Mi Planilla para un periodo específico
 */
export async function verificarEstadoPlanillaMiPlanilla(
  page: Page,
  options: VerificacionPlanillaOptions
): Promise<PlanillaStateResult> {
  const periodoStr = `${options.periodo.mes.toString().padStart(2, '0')}/${options.periodo.anio}`;

  logger.info('Verificando estado de planilla en Mi Planilla', {
    periodo: periodoStr,
    documento: options.numeroDocumento,
  });

  try {
    // Navegar a administrar planillas
    const adminUrl = 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas';
    await page.goto(adminUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Buscar planillas en la página
    const resultado = await page.evaluate((periodo) => {
      const bodyText = document.body.innerText.toLowerCase();

      // Verificar si hay errores de validación (alta prioridad)
      const validationErrors = [
        'error de validación',
        'personas incluidas en la planilla (0)',
        'personas incluidas (0)',
        'no hay cotizantes',
        'cotizante no configurado',
        'información incompleta',
        'debe completar',
        'datos requeridos',
        'eps no válida',
        'afp no válida',
        'actualice sus datos',
        'perfil incompleto',
      ];

      for (const errPattern of validationErrors) {
        if (bodyText.includes(errPattern)) {
          return {
            estado: 'ERROR_VALIDACION' as const,
            mensaje: `Se detectó: ${errPattern}`,
          };
        }
      }

      // Verificar si hay mensaje de "no hay planillas pendientes"
      if (
        bodyText.includes('no tienes planillas pendientes') ||
        bodyText.includes('no hay planillas disponibles') ||
        bodyText.includes('en este momento no tienes planillas')
      ) {
        // Podría haber planillas pagadas - verificar historial
        // Por ahora asumimos que no hay planilla para el periodo
        return { estado: 'NO_EXISTE' as const };
      }

      // Buscar links/botones "Paga aquí" que indican planilla pendiente
      const links = document.querySelectorAll('a, button');
      let planillaPendiente = false;

      for (const el of Array.from(links)) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        const href = (el as HTMLAnchorElement).href?.toLowerCase() || '';
        if (text.includes('paga') || href.includes('pagar')) {
          planillaPendiente = true;
          break;
        }
      }

      // Buscar en tablas/cards de planillas
      const planillaElements = document.querySelectorAll(
        '.planilla-card, .planilla-item, table tbody tr, [data-planilla]'
      );

      for (const el of Array.from(planillaElements)) {
        const elText = el.textContent || '';

        // Verificar si corresponde al periodo
        if (elText.includes(periodo) || elText.includes(periodo.replace('/', '-'))) {
          // Extraer datos
          const numMatch = elText.match(/(?:planilla|número)[:\s]*(\d{6,15})/i);
          const valorMatch = elText.match(/\$\s*([\d.,]+)/);

          // Determinar estado
          const elTextLower = elText.toLowerCase();
          let estado: 'PENDIENTE_PAGO' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' = 'PENDIENTE_PAGO';

          if (elTextLower.includes('pagad') || elTextLower.includes('aprobad')) {
            estado = 'PAGADA';
          } else if (elTextLower.includes('rechazad')) {
            estado = 'RECHAZADA';
          } else if (elTextLower.includes('vencid')) {
            estado = 'VENCIDA';
          }

          return {
            estado,
            numeroPlanilla: numMatch ? numMatch[1] : undefined,
            valorTotal: valorMatch ? parseInt(valorMatch[1].replace(/[.,]/g, ''), 10) : undefined,
            periodo,
          };
        }
      }

      // Si hay planilla pendiente pero no coincide el periodo
      if (planillaPendiente) {
        // Hay alguna planilla pendiente, pero no para este periodo específico
        // Extraer datos de la planilla pendiente actual
        const valorMatch = bodyText.match(/\$\s*([\d.,]+)/);

        return {
          estado: 'PENDIENTE_PAGO' as const,
          valorTotal: valorMatch ? parseInt(valorMatch[1].replace(/[.,]/g, ''), 10) : undefined,
          mensaje: 'Planilla pendiente encontrada (periodo puede no coincidir)',
        };
      }

      return { estado: 'NO_EXISTE' as const };

    }, periodoStr);

    logger.info('Estado de planilla Mi Planilla determinado', resultado);
    return resultado as PlanillaStateResult;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error verificando estado en Mi Planilla', { error: errorMsg });

    return {
      estado: 'ERROR_VERIFICACION',
      mensaje: errorMsg,
    };
  }
}

// ============================================================================
// DECISION TREE
// ============================================================================

/**
 * Aplica el árbol de decisión basado en el estado de la planilla
 */
export function aplicarArbolDecision(estadoPlanilla: PlanillaStateResult): DecisionResult {
  logger.info('Aplicando árbol de decisión', { estado: estadoPlanilla.estado });

  switch (estadoPlanilla.estado) {
    case 'NO_EXISTE':
      return {
        accion: 'CREAR_PLANILLA',
        estado: estadoPlanilla,
        mensaje: 'No existe planilla para este periodo. Se debe crear una nueva.',
      };

    case 'PENDIENTE_PAGO':
      return {
        accion: 'IR_A_PAGO',
        estado: estadoPlanilla,
        mensaje: `Planilla ${estadoPlanilla.numeroPlanilla || 'existente'} pendiente de pago. Ir directo al paso de pago.`,
      };

    case 'PAGADA':
      return {
        accion: 'DESCARGAR_COMPROBANTE',
        estado: estadoPlanilla,
        mensaje: `Planilla ${estadoPlanilla.numeroPlanilla || 'existente'} ya está pagada. Descargar comprobante.`,
      };

    case 'RECHAZADA':
      return {
        accion: 'CREAR_PLANILLA',
        estado: estadoPlanilla,
        mensaje: 'Planilla anterior fue rechazada. Se debe crear una nueva.',
      };

    case 'VENCIDA':
      return {
        accion: 'CREAR_PLANILLA',
        estado: estadoPlanilla,
        mensaje: 'Planilla anterior venció. Se debe crear una nueva.',
      };

    case 'ERROR_VALIDACION':
      return {
        accion: 'CORREGIR_DATOS',
        estado: estadoPlanilla,
        mensaje: `Error de validación: ${estadoPlanilla.mensaje || 'Datos del cotizante incorrectos'}. El usuario debe corregir sus datos en el operador.`,
      };

    case 'ERROR_VERIFICACION':
      return {
        accion: 'REINTENTAR',
        estado: estadoPlanilla,
        mensaje: `Error verificando estado: ${estadoPlanilla.mensaje}`,
      };

    default:
      return {
        accion: 'ERROR',
        estado: estadoPlanilla,
        mensaje: 'Estado desconocido',
      };
  }
}

// ============================================================================
// UNIFIED INTERFACE
// ============================================================================

export type Operador = 'SOI' | 'MI_PLANILLA';

/**
 * Verifica el estado de planilla usando el operador correcto
 */
export async function verificarEstadoPlanilla(
  page: Page,
  operador: Operador,
  options: VerificacionPlanillaOptions
): Promise<DecisionResult> {
  let estadoPlanilla: PlanillaStateResult;

  if (operador === 'SOI') {
    estadoPlanilla = await verificarEstadoPlanillaSOI(page, options);
  } else {
    estadoPlanilla = await verificarEstadoPlanillaMiPlanilla(page, options);
  }

  return aplicarArbolDecision(estadoPlanilla);
}

/**
 * Helper para obtener el periodo actual (mes anterior si estamos en los primeros días)
 */
export function getPeriodoActual(): { mes: number; anio: number } {
  const now = new Date();
  let mes = now.getMonth() + 1; // getMonth() es 0-indexed
  let anio = now.getFullYear();

  // Si estamos en los primeros 5 días del mes, el periodo a pagar es el mes anterior
  if (now.getDate() <= 5) {
    mes = mes - 1;
    if (mes === 0) {
      mes = 12;
      anio = anio - 1;
    }
  }

  return { mes, anio };
}
