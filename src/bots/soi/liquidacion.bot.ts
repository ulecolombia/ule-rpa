/**
 * SOI Liquidation Bot
 * Maneja la liquidación de planillas PILA en SOI
 *
 * Soporta dos modos:
 * 1. Admin Mode: Usa sesión singleton del admin (para gestión interna)
 * 2. User Mode: Login con credenciales del usuario (para multi-usuario)
 */

import { Page } from 'puppeteer';
import { getSOIAuthBot, SOIAuthBot, SOIUserCredentials } from './auth.bot';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import { SOIPlanillaRequest, SOIPlanillaResult } from '../../types/soi.types';
// BotError available from '../utils/errors' if needed

/**
 * Calcula los días de un mes específico
 * Considera años bisiestos para febrero
 */
function getDaysInMonth(month: number, year: number): number {
  // Usar Date para obtener el último día del mes
  // El día 0 del mes siguiente es el último día del mes actual
  return new Date(year, month, 0).getDate();
}

export interface SOILiquidacionData {
  // Datos del cotizante
  tipoDocumento: string;
  numeroDocumento: string;
  tipoCotizante?: string;
  subtipoCotizante?: string;

  // Periodo
  mes: number;
  ano: number;

  // Ingreso Base de Cotización
  ibc: number;

  // Entidades
  eps?: string;
  afp?: string;
  arl?: string;
  ccf?: string;

  // Novedades
  novedadIngreso?: boolean;
  novedadRetiro?: boolean;

  // Días
  diasSalud?: number;
  diasPension?: number;
  diasArl?: number;
}

export interface SOILiquidacionResult {
  success: boolean;
  numeroPlanilla?: string;
  valorTotal?: number;
  valorSalud?: number;
  valorPension?: number;
  valorArl?: number;
  message: string;
}

export class SOILiquidacionBot {
  private authBot: SOIAuthBot;

  constructor() {
    this.authBot = getSOIAuthBot();
  }

  /**
   * Liquida una planilla PILA para un usuario
   */
  async liquidarPlanilla(data: SOILiquidacionData): Promise<SOILiquidacionResult> {
    logger.info('Starting PILA liquidation in SOI', {
      documento: data.numeroDocumento,
      periodo: `${data.mes}/${data.ano}`,
      ibc: data.ibc,
    });

    try {
      // Asegurar autenticación
      const page = await this.authBot.ensureAuthenticated();

      // Navegar a gestionar planillas
      await this.navegarAGestionPlanillas(page);

      // Verificar si ya existe una planilla para el periodo
      const existingPlanilla = await this.buscarPlanillaExistente(
        page,
        data.mes,
        data.ano,
        data.numeroDocumento
      );

      if (existingPlanilla) {
        logger.info('Planilla already exists for period', {
          numeroPlanilla: existingPlanilla,
        });
        return {
          success: true,
          numeroPlanilla: existingPlanilla,
          message: 'Planilla ya existe para este periodo',
        };
      }

      // Crear nueva planilla
      const result = await this.crearNuevaPlanilla(page, data);

      logger.info('Liquidation completed', {
        documento: data.numeroDocumento,
        success: result.success,
        numeroPlanilla: result.numeroPlanilla,
      });

      return result;
    } catch (error) {
      logger.error('Error in PILA liquidation', {
        documento: data.numeroDocumento,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Navega a la página de gestión de planillas
   */
  private async navegarAGestionPlanillas(page: Page): Promise<void> {
    logger.info('Navigating to planilla management');

    await page.goto(SOI_SELECTORS.URLS.GESTIONAR_PLANILLAS, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(1000);
    logger.info('Planilla management page loaded');
  }

  /**
   * Busca una planilla existente para el periodo
   */
  private async buscarPlanillaExistente(
    page: Page,
    mes: number,
    ano: number,
    documento: string
  ): Promise<string | null> {
    try {
      // Seleccionar periodo
      await this.selectPeriodo(page, mes, ano);

      // Buscar
      await this.clickButton(page, SOI_SELECTORS.PLANILLAS.BTN_BUSCAR);
      await page.waitForTimeout(2000);

      // Buscar en la tabla de resultados
      const planilla = await page.evaluate((doc) => {
        const rows = document.querySelectorAll('table tbody tr');
        for (const row of rows) {
          const text = row.textContent || '';
          if (text.includes(doc)) {
            // Buscar número de planilla
            const cells = row.querySelectorAll('td');
            for (const cell of cells) {
              const content = cell.textContent?.trim() || '';
              if (/^\d{10,}$/.test(content)) {
                return content;
              }
            }
          }
        }
        return null;
      }, documento);

      return planilla;
    } catch {
      return null;
    }
  }

  /**
   * Crea una nueva planilla
   */
  private async crearNuevaPlanilla(
    page: Page,
    data: SOILiquidacionData
  ): Promise<SOILiquidacionResult> {
    logger.info('Creating new planilla');

    try {
      // Click en nueva planilla
      await this.clickButton(page, SOI_SELECTORS.PLANILLAS.BTN_NUEVA_PLANILLA);
      await page.waitForTimeout(2000);

      // Llenar datos de la liquidación
      await this.llenarDatosLiquidacion(page, data);

      // Calcular
      await this.clickButton(page, SOI_SELECTORS.LIQUIDACION.BTN_CALCULAR);
      await page.waitForTimeout(2000);

      // Obtener valores calculados
      const valores = await this.obtenerValoresCalculados(page);

      // Guardar/Liquidar
      await this.clickButton(page, SOI_SELECTORS.LIQUIDACION.BTN_LIQUIDAR);
      await page.waitForTimeout(3000);

      // Obtener número de planilla generado
      const numeroPlanilla = await this.obtenerNumeroPlanilla(page);

      await page.screenshot({ path: 'screenshots/soi-liquidacion-result.png', fullPage: true });

      return {
        success: true,
        numeroPlanilla,
        ...valores,
        message: 'Planilla liquidada exitosamente',
      };
    } catch (error) {
      logger.error('Error creating planilla', { error });
      await page.screenshot({ path: 'screenshots/soi-liquidacion-error.png', fullPage: true });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al crear planilla',
      };
    }
  }

  /**
   * Llena los datos de liquidación
   */
  private async llenarDatosLiquidacion(
    page: Page,
    data: SOILiquidacionData
  ): Promise<void> {
    // Tipo de cotizante
    if (data.tipoCotizante) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.TIPO_COTIZANTE, data.tipoCotizante);
    }

    // Subtipo de cotizante
    if (data.subtipoCotizante) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.SUBTIPO_COTIZANTE, data.subtipoCotizante);
    }

    // IBC
    await this.fillInput(page, SOI_SELECTORS.LIQUIDACION.IBC, data.ibc.toString());

    // EPS
    if (data.eps) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.EPS, data.eps);
    }

    // AFP
    if (data.afp) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.AFP, data.afp);
    }

    // ARL
    if (data.arl) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.ARL, data.arl);
    }

    // CCF
    if (data.ccf) {
      await this.selectOption(page, SOI_SELECTORS.LIQUIDACION.CCF, data.ccf);
    }

    // Novedades
    if (data.novedadIngreso) {
      await this.checkCheckbox(page, SOI_SELECTORS.LIQUIDACION.NOVEDAD_INGRESO);
    }
    if (data.novedadRetiro) {
      await this.checkCheckbox(page, SOI_SELECTORS.LIQUIDACION.NOVEDAD_RETIRO);
    }

    // Días (si no se especifican, usar 30)
    const dias = data.diasSalud || 30;
    await this.fillInput(page, SOI_SELECTORS.LIQUIDACION.DIAS_SALUD, dias.toString());
    await this.fillInput(page, SOI_SELECTORS.LIQUIDACION.DIAS_PENSION, (data.diasPension || dias).toString());
    await this.fillInput(page, SOI_SELECTORS.LIQUIDACION.DIAS_ARL, (data.diasArl || dias).toString());
  }

  /**
   * Obtiene los valores calculados
   */
  private async obtenerValoresCalculados(page: Page): Promise<{
    valorSalud?: number;
    valorPension?: number;
    valorArl?: number;
    valorTotal?: number;
  }> {
    // Obtener valores uno por uno para evitar problemas de esbuild con __name
    const valorSalud = await this.getNumericValue(page, '[id*="valorSalud"], [name*="valorSalud"]');
    const valorPension = await this.getNumericValue(page, '[id*="valorPension"], [name*="valorPension"]');
    const valorArl = await this.getNumericValue(page, '[id*="valorArl"], [name*="valorArl"]');
    const valorTotal = await this.getNumericValue(page, '[id*="valorTotal"], [name*="valorTotal"]');

    return { valorSalud, valorPension, valorArl, valorTotal };
  }

  /**
   * Helper para obtener un valor numérico de un selector
   * Separado para evitar problemas de esbuild con __name dentro de page.evaluate
   */
  private async getNumericValue(page: Page, selector: string): Promise<number | undefined> {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.replace(/[^0-9]/g, '') || '0';
        return parseInt(text, 10) || undefined;
      }
      return undefined;
    }, selector);
  }

  /**
   * Obtiene el número de planilla generado
   */
  private async obtenerNumeroPlanilla(page: Page): Promise<string | undefined> {
    const numeroPlanilla = await page.evaluate(() => {
      // Buscar en diferentes lugares (sin :has-text que no es válido en CSS)
      const selectors = [
        '[id*="numeroPlanilla"]',
        '[name*="numeroPlanilla"]',
        '.numero-planilla',
      ];

      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent?.trim() || '';
            const match = text.match(/\d{10,}/);
            if (match) return match[0];
          }
        } catch {
          continue;
        }
      }

      // Buscar en celdas de tabla que contengan "Número"
      const tds = document.querySelectorAll('td');
      for (const td of tds) {
        if (td.textContent?.toLowerCase().includes('número') || td.textContent?.toLowerCase().includes('planilla')) {
          const nextTd = td.nextElementSibling;
          if (nextTd) {
            const match = nextTd.textContent?.match(/\d{10,}/);
            if (match) return match[0];
          }
        }
      }

      // Buscar en mensajes de éxito
      const successMsg = document.querySelector('.alert-success, .mensaje-exito');
      if (successMsg) {
        const text = successMsg.textContent || '';
        const match = text.match(/\d{10,}/);
        if (match) return match[0];
      }

      // Buscar cualquier número de planilla en el body
      const bodyText = document.body.innerText;
      const match = bodyText.match(/planilla[:\s]*(\d{10,})/i);
      if (match) return match[1];

      return undefined;
    });

    return numeroPlanilla;
  }

  /**
   * Selecciona el periodo
   */
  private async selectPeriodo(page: Page, mes: number, ano: number): Promise<void> {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    await this.selectOption(page, SOI_SELECTORS.PLANILLAS.PERIODO_MES, meses[mes - 1] || mes.toString());
    await this.selectOption(page, SOI_SELECTORS.PLANILLAS.PERIODO_ANO, ano.toString());
  }

  // === Helper methods ===

  private async selectOption(page: Page, selector: string, value: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        try {
          const element = await page.$(sel.trim());
          if (element) {
            await page.evaluate(
              (s, v) => {
                const select = document.querySelector(s) as HTMLSelectElement;
                if (select) {
                  const options = Array.from(select.options);
                  const option = options.find(
                    (opt) =>
                      opt.value.toLowerCase().includes(v.toLowerCase()) ||
                      opt.text.toLowerCase().includes(v.toLowerCase())
                  );
                  if (option) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              },
              sel.trim(),
              value
            );
            break;
          }
        } catch {
          continue;
        }
      }
      await page.waitForTimeout(300);
    } catch {
      logger.warn('Could not select option', { selector, value });
    }
  }

  private async fillInput(page: Page, selector: string, value: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        try {
          const element = await page.$(sel.trim());
          if (element) {
            await page.click(sel.trim(), { clickCount: 3 });
            await page.type(sel.trim(), value, { delay: 30 });
            await page.waitForTimeout(200);
            return;
          }
        } catch {
          continue;
        }
      }
    } catch {
      logger.warn('Could not fill input', { selector, value });
    }
  }

  private async checkCheckbox(page: Page, selector: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        try {
          const element = await page.$(sel.trim());
          if (element) {
            const isChecked = await page.evaluate(
              (s) => (document.querySelector(s) as HTMLInputElement)?.checked,
              sel.trim()
            );
            if (!isChecked) {
              await page.click(sel.trim());
            }
            return;
          }
        } catch {
          continue;
        }
      }
    } catch {
      logger.warn('Could not check checkbox', { selector });
    }
  }

  private async clickButton(page: Page, selector: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        try {
          const element = await page.$(sel.trim());
          if (element) {
            await element.click();
            return;
          }
        } catch {
          continue;
        }
      }
    } catch {
      logger.warn('Could not click button', { selector });
    }
  }
}

/**
 * Función helper para liquidar planilla (modo admin)
 */
export async function liquidarPlanillaSOI(
  data: SOILiquidacionData
): Promise<SOILiquidacionResult> {
  const bot = new SOILiquidacionBot();
  return bot.liquidarPlanilla(data);
}

/**
 * Liquida una planilla usando credenciales de usuario específico
 * Crea sesión independiente, ejecuta y cierra
 *
 * @param request - Datos de la planilla incluyendo credenciales
 * @returns Resultado de la liquidación
 */
export async function liquidarPlanillaAsUser(
  request: SOIPlanillaRequest
): Promise<SOIPlanillaResult> {
  logger.info('Starting user-specific planilla liquidation', {
    documento: request.documento,
    periodo: `${request.periodoMes}/${request.periodoAno}`,
    ibc: request.ibc,
  });

  // Crear instancia independiente de auth bot (no singleton)
  const authBot = new SOIAuthBot();

  try {
    // Login como el usuario
    const credentials: SOIUserCredentials = {
      tipoDocumento: request.tipoDocumento,
      documento: request.documento,
      password: request.soiPassword,
    };

    await authBot.loginAsUser(credentials);
    const page = authBot.getPage();

    if (!page) {
      return {
        success: false,
        message: 'No se pudo obtener página después del login',
        error: 'PAGE_NOT_AVAILABLE',
      };
    }

    // Navegar a "Crear Planilla en Línea" (flujo correcto para independientes)
    logger.info('Navigating to Crear Planilla en Línea');
    await page.goto(SOI_SELECTORS.URLS.CREAR_PLANILLA_EN_LINEA, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Usar el bot de crear planilla con el flujo completo de 4 pasos
    const { crearPlanillaSOI } = await import('./crear-planilla.bot');

    // Preparar datos para el bot de crear planilla
    const planillaData = {
      userId: request.documento,
      periodo: {
        mes: request.periodoMes,
        anio: request.periodoAno,
      },
      aportante: {
        tipoAportante: '02' as const, // Independiente
        claseAportante: 'I',
        naturalezaJuridica: 'PRIVADA',
        formaPresentacion: 'ÚNICO',
      },
      cotizantes: [{
        identificacion: {
          tipoDocumento: request.tipoDocumento,
          numeroDocumento: request.documento,
        },
        nombres: {
          primerNombre: request.primerNombre || '',
          primerApellido: request.primerApellido || '',
        },
        clasificacion: {
          tipoCotizante: '3' as const, // Independiente
          subTipoCotizante: '', // Vacío para independientes
        },
        ubicacion: {
          departamento: request.departamento || '11', // Bogotá por defecto
          municipio: request.municipio || '001',
        },
        seguridadSocial: {
          salarioBasico: request.ibc,
          pension: {
            administradora: { codigo: request.afpCodigo || '' },
            // Días cotizados: usar valor proporcionado, o calcular según el mes del periodo
            diasCotizados: request.diasCotizados || getDaysInMonth(request.periodoMes, request.periodoAno),
            ibc: request.ibc,
          },
          salud: {
            administradora: { codigo: request.epsCodigo || '' },
            diasCotizados: request.diasCotizados || getDaysInMonth(request.periodoMes, request.periodoAno),
            ibc: request.ibc,
          },
        },
      }],
    };

    logger.info('Calculated days for period', {
      mes: request.periodoMes,
      ano: request.periodoAno,
      diasCotizados: request.diasCotizados || getDaysInMonth(request.periodoMes, request.periodoAno),
    });

    // Ejecutar creación de planilla
    const result = await crearPlanillaSOI(page, planillaData as any, {
      takeScreenshots: true,
      screenshotPrefix: 'soi-liquidacion',
    });

    logger.info('User planilla liquidation completed', {
      documento: request.documento,
      success: result.success,
      numeroPlanilla: result.numeroPlanilla,
    });

    return {
      success: result.success,
      numeroPlanilla: result.numeroPlanilla,
      valorSalud: result.desglose?.salud,
      valorPension: result.desglose?.pension,
      valorArl: result.desglose?.arl,
      valorTotal: result.valorTotal,
      estado: result.success ? 'LIQUIDADA' : 'ERROR',
      message: result.success ? 'Planilla liquidada exitosamente' : (result.error || 'Error desconocido'),
      error: result.success ? undefined : result.error,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error in user planilla liquidation', {
      documento: request.documento,
      error: errorMsg,
    });

    return {
      success: false,
      estado: 'ERROR',
      message: 'Error al liquidar planilla',
      error: errorMsg,
    };
  } finally {
    // Siempre cerrar la sesión
    await authBot.close();
  }
}

/**
 * Versión del bot de liquidación que usa una página existente
 * Para uso con sesiones de usuario específicas
 */
class SOILiquidacionBotWithPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async liquidarPlanillaEnSesion(data: SOILiquidacionData): Promise<SOILiquidacionResult> {
    try {
      // Navegar a gestionar planillas
      await this.navegarAGestionPlanillas();

      // Verificar si ya existe planilla para el periodo
      const existingPlanilla = await this.buscarPlanillaExistente(
        data.mes,
        data.ano,
        data.numeroDocumento
      );

      if (existingPlanilla) {
        logger.info('Planilla already exists', { numeroPlanilla: existingPlanilla });
        return {
          success: true,
          numeroPlanilla: existingPlanilla,
          message: 'Planilla ya existe para este periodo',
        };
      }

      // Crear nueva planilla
      return await this.crearNuevaPlanilla(data);
    } catch (error) {
      logger.error('Error in liquidation session', { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  private async navegarAGestionPlanillas(): Promise<void> {
    await this.page.goto(SOI_SELECTORS.URLS.GESTIONAR_PLANILLAS, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await this.page.waitForTimeout(1000);
  }

  private async buscarPlanillaExistente(
    mes: number,
    ano: number,
    documento: string
  ): Promise<string | null> {
    try {
      await this.selectPeriodo(mes, ano);
      await this.clickButton(SOI_SELECTORS.PLANILLAS.BTN_BUSCAR);
      await this.page.waitForTimeout(2000);

      const planilla = await this.page.evaluate((doc) => {
        const rows = document.querySelectorAll('table tbody tr');
        for (const row of rows) {
          const text = row.textContent || '';
          if (text.includes(doc)) {
            const cells = row.querySelectorAll('td');
            for (const cell of cells) {
              const content = cell.textContent?.trim() || '';
              if (/^\d{10,}$/.test(content)) {
                return content;
              }
            }
          }
        }
        return null;
      }, documento);

      return planilla;
    } catch {
      return null;
    }
  }

  private async crearNuevaPlanilla(data: SOILiquidacionData): Promise<SOILiquidacionResult> {
    try {
      await this.clickButton(SOI_SELECTORS.PLANILLAS.BTN_NUEVA_PLANILLA);
      await this.page.waitForTimeout(2000);

      await this.llenarDatosLiquidacion(data);

      await this.clickButton(SOI_SELECTORS.LIQUIDACION.BTN_CALCULAR);
      await this.page.waitForTimeout(2000);

      const valores = await this.obtenerValoresCalculados();

      await this.clickButton(SOI_SELECTORS.LIQUIDACION.BTN_LIQUIDAR);
      await this.page.waitForTimeout(3000);

      const numeroPlanilla = await this.obtenerNumeroPlanilla();

      return {
        success: true,
        numeroPlanilla,
        ...valores,
        message: 'Planilla liquidada exitosamente',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al crear planilla',
      };
    }
  }

  private async llenarDatosLiquidacion(data: SOILiquidacionData): Promise<void> {
    if (data.tipoCotizante) {
      await this.selectOption(SOI_SELECTORS.LIQUIDACION.TIPO_COTIZANTE, data.tipoCotizante);
    }
    if (data.subtipoCotizante) {
      await this.selectOption(SOI_SELECTORS.LIQUIDACION.SUBTIPO_COTIZANTE, data.subtipoCotizante);
    }
    await this.fillInput(SOI_SELECTORS.LIQUIDACION.IBC, data.ibc.toString());

    const dias = data.diasSalud || 30;
    await this.fillInput(SOI_SELECTORS.LIQUIDACION.DIAS_SALUD, dias.toString());
    await this.fillInput(SOI_SELECTORS.LIQUIDACION.DIAS_PENSION, (data.diasPension || dias).toString());
    await this.fillInput(SOI_SELECTORS.LIQUIDACION.DIAS_ARL, (data.diasArl || dias).toString());
  }

  private async obtenerValoresCalculados(): Promise<{
    valorSalud?: number;
    valorPension?: number;
    valorArl?: number;
    valorTotal?: number;
  }> {
    // Obtener valores uno por uno para evitar problemas de esbuild con __name
    const valorSalud = await this.getNumericValueFromPage('[id*="valorSalud"]');
    const valorPension = await this.getNumericValueFromPage('[id*="valorPension"]');
    const valorArl = await this.getNumericValueFromPage('[id*="valorArl"]');
    const valorTotal = await this.getNumericValueFromPage('[id*="valorTotal"]');
    return { valorSalud, valorPension, valorArl, valorTotal };
  }

  /**
   * Helper para obtener valor numérico - evita __name de esbuild
   */
  private async getNumericValueFromPage(selector: string): Promise<number | undefined> {
    return this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.replace(/[^0-9]/g, '') || '0';
        return parseInt(text, 10) || undefined;
      }
      return undefined;
    }, selector);
  }

  private async obtenerNumeroPlanilla(): Promise<string | undefined> {
    return this.page.evaluate(() => {
      const bodyText = document.body.innerText;
      const match = bodyText.match(/planilla[:\s]*(\d{10,})/i);
      if (match) return match[1];
      return undefined;
    });
  }

  private async selectPeriodo(mes: number, ano: number): Promise<void> {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    await this.selectOption(SOI_SELECTORS.PLANILLAS.PERIODO_MES, meses[mes - 1] || mes.toString());
    await this.selectOption(SOI_SELECTORS.PLANILLAS.PERIODO_ANO, ano.toString());
  }

  private async selectOption(selector: string, value: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        const element = await this.page.$(sel.trim());
        if (element) {
          await this.page.evaluate(
            (s, v) => {
              const select = document.querySelector(s) as HTMLSelectElement;
              if (select) {
                const options = Array.from(select.options);
                const option = options.find(
                  (opt) =>
                    opt.value.toLowerCase().includes(v.toLowerCase()) ||
                    opt.text.toLowerCase().includes(v.toLowerCase())
                );
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            },
            sel.trim(),
            value
          );
          break;
        }
      }
      await this.page.waitForTimeout(300);
    } catch {
      // Ignore errors
    }
  }

  private async fillInput(selector: string, value: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        const element = await this.page.$(sel.trim());
        if (element) {
          await this.page.click(sel.trim(), { clickCount: 3 });
          await this.page.type(sel.trim(), value, { delay: 30 });
          await this.page.waitForTimeout(200);
          return;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  private async clickButton(selector: string): Promise<void> {
    try {
      const selectors = selector.split(', ');
      for (const sel of selectors) {
        const element = await this.page.$(sel.trim());
        if (element) {
          await element.click();
          return;
        }
      }
    } catch {
      // Ignore errors
    }
  }
}
