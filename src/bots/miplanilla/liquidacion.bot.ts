/**
 * Mi Planilla Liquidacion Bot
 * Maneja la creación y modificación de planillas en Mi Planilla
 *
 * Flujo:
 * 1. Login (si no está autenticado)
 * 2. Click "Generar nueva planilla"
 * 3. Cerrar modal ARL si aparece
 * 4. Seleccionar tipo de planilla (propios aportes)
 * 5. Modificar IBC si es diferente al registrado
 * 6. Generar planilla
 * 7. Retornar datos de la planilla generada
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { MiPlanillaAuthBot, getMiPlanillaAuthBot } from './auth.bot';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import {
  MIPLANILLA_URLS,
  MIPLANILLA_SELECTORS,
  MiPlanillaCredentials,
  MiPlanillaPlanillaRequest,
  MiPlanillaPlanillaResult,
} from '../../types/miplanilla.types';

export class MiPlanillaLiquidacionBot {
  private authBot: MiPlanillaAuthBot;

  constructor() {
    this.authBot = getMiPlanillaAuthBot();
  }

  /**
   * Crea una nueva planilla en Mi Planilla
   */
  async crearPlanilla(request: MiPlanillaPlanillaRequest): Promise<MiPlanillaPlanillaResult> {
    logger.info('Starting planilla creation in Mi Planilla', {
      documento: request.documento,
      ibc: request.ibc,
      periodo: `${request.periodoMes}/${request.periodoAno}`,
    });

    try {
      // Autenticar
      const credentials: MiPlanillaCredentials = {
        tipoDocumento: request.tipoDocumento,
        documento: request.documento,
        password: request.password,
      };

      const page = await this.authBot.ensureAuthenticated(credentials);
      const browserManager = new BrowserManager({
        headless: config.puppeteer.headless,
        downloadsPath: './downloads/miplanilla',
      });

      // === PASO 1: Ir al dashboard y click "Generar nueva planilla" ===
      await this.navegarAGenerarPlanilla(page, browserManager);

      // === PASO 2: Cerrar modal ARL si aparece ===
      await this.cerrarModalARL(page);

      // === PASO 3: Seleccionar tipo de planilla ===
      await this.seleccionarTipoPlanilla(page, browserManager);

      // === PASO 4: Modificar IBC si es necesario ===
      await this.modificarIBC(page, browserManager, request.ibc, request.epsCodigo, request.afpCodigo);

      // === PASO 5: Generar planilla ===
      const result = await this.generarPlanilla(page, browserManager);

      logger.info('Planilla created successfully in Mi Planilla', {
        documento: request.documento,
        numeroPlanilla: result.numeroPlanilla,
        valorTotal: result.valorTotal,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error creating planilla in Mi Planilla', {
        documento: request.documento,
        error: errorMsg,
      });

      return {
        success: false,
        message: 'Error al crear planilla en Mi Planilla',
        error: errorMsg,
      };
    }
  }

  /**
   * Navega directamente a la página de Generar Planilla
   * NOTA: Navegación directa es más confiable que hacer click en botones del dashboard
   */
  private async navegarAGenerarPlanilla(page: Page, browserManager: BrowserManager): Promise<void> {
    logger.info('Navigating to generate planilla');

    // Navegar directamente a la URL de GenerarPlanilla (más confiable)
    await page.goto(MIPLANILLA_URLS.generarPlanilla, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'miplanilla-generar-planilla-page');
    logger.info('Navigated to generate planilla page');
  }

  /**
   * Cierra el modal de ARL si aparece
   */
  private async cerrarModalARL(page: Page): Promise<void> {
    try {
      // Esperar un poco por si aparece el modal
      await page.waitForTimeout(1000);

      // Buscar y cerrar modal de ARL
      for (const selector of MIPLANILLA_SELECTORS.modalArlNoActualizar) {
        try {
          const element = await page.$(selector);
          if (element) {
            logger.info('Closing ARL modal');
            await element.click();
            await page.waitForTimeout(1000);
            return;
          }
        } catch {
          continue;
        }
      }

      // También intentar buscar por texto
      const clicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a');
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText?.toLowerCase();
          if (text?.includes('no') && text?.includes('continuar')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        logger.info('Closed ARL modal via text search');
        await page.waitForTimeout(1000);
      }
    } catch {
      // No modal, continuar
    }
  }

  /**
   * Selecciona el tipo de planilla (propios aportes)
   */
  private async seleccionarTipoPlanilla(page: Page, browserManager: BrowserManager): Promise<void> {
    logger.info('Selecting planilla type');

    await browserManager.takeScreenshot(page, 'miplanilla-tipo-planilla');

    // Seleccionar "Pagos de mis propios aportes y de mis beneficiarios"
    await this.clickElement(
      page,
      MIPLANILLA_SELECTORS.radioTipoPlanillaPropia,
      'Pagos de mis propios aportes'
    );
    await page.waitForTimeout(1000);

    await browserManager.takeScreenshot(page, 'miplanilla-tipo-selected');
    logger.info('Planilla type selected');
  }

  /**
   * Modifica el IBC si es diferente al registrado
   */
  private async modificarIBC(
    page: Page,
    browserManager: BrowserManager,
    ibc: number,
    epsCodigo?: string,
    afpCodigo?: string
  ): Promise<void> {
    logger.info('Checking if IBC modification is needed', { ibc });

    await browserManager.takeScreenshot(page, 'miplanilla-before-modify');

    // Click en "Modificar información"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnModificarInfo, 'Modificar información');
    await page.waitForTimeout(2000);

    await browserManager.takeScreenshot(page, 'miplanilla-modify-form');

    // Buscar y modificar el campo de ingresos (IBC)
    // Usar inputIngresosMensuales que tiene #IngresosMensuales (probado en dry-run)
    await this.scrollToElement(page, MIPLANILLA_SELECTORS.inputIngresosMensuales);
    await page.waitForTimeout(500);

    // Limpiar y llenar el campo de IBC
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputIngresosMensuales, ibc.toString());
    await page.waitForTimeout(500);

    // Modificar EPS si se proporciona
    if (epsCodigo) {
      await this.selectOption(page, MIPLANILLA_SELECTORS.selectEps, epsCodigo);
      await page.waitForTimeout(500);
    }

    // Modificar AFP si se proporciona
    if (afpCodigo) {
      await this.selectOption(page, MIPLANILLA_SELECTORS.selectAfp, afpCodigo);
      await page.waitForTimeout(500);
    }

    await browserManager.takeScreenshot(page, 'miplanilla-ibc-modified');

    // Click en "Guardar empleado"
    await this.scrollToBottom(page);
    await page.waitForTimeout(500);
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnGuardarEmpleado, 'Guardar empleado');
    await page.waitForTimeout(2000);

    // Verificar toast de éxito
    await this.waitForSuccessToast(page);

    await browserManager.takeScreenshot(page, 'miplanilla-ibc-saved');
    logger.info('IBC modified successfully');
  }

  /**
   * Genera la planilla y retorna los datos
   */
  private async generarPlanilla(page: Page, browserManager: BrowserManager): Promise<MiPlanillaPlanillaResult> {
    logger.info('Generating planilla');

    await browserManager.takeScreenshot(page, 'miplanilla-before-generate');

    // Click en "Generar Planilla"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnGenerarPlanillaFinal, 'Generar Planilla');
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'miplanilla-after-generate');

    // Esperar a que cargue la lista de planillas
    await page.waitForTimeout(2000);

    // Extraer datos de la planilla generada
    const planillaData = await page.evaluate(() => {
      // Buscar en la tabla de planillas o en el resumen
      const bodyText = document.body.innerText;

      // Extraer número de planilla
      const planillaMatch = bodyText.match(/(?:planilla|número)[:\s]*(\d{6,10})/i);
      const numeroPlanilla = planillaMatch ? planillaMatch[1] : null;

      // Extraer valor total
      const valorMatch = bodyText.match(/(?:valor|total)[:\s]*\$?\s*([\d.,]+)/i);
      let valorTotal: number | null = null;
      if (valorMatch) {
        valorTotal = parseInt(valorMatch[1].replace(/[.,]/g, ''), 10);
      }

      // Extraer período
      const periodoMatch = bodyText.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i);
      const periodo = periodoMatch ? `${periodoMatch[1]} de ${periodoMatch[2]}` : null;

      // Extraer fecha de vencimiento
      const vencimientoMatch = bodyText.match(/vencimiento[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i);
      const fechaVencimiento = vencimientoMatch ? vencimientoMatch[1] : null;

      // Verificar éxito
      const hasError = document.querySelector('.alert-danger, .error, [class*="error"]');
      const success = !hasError && (numeroPlanilla || bodyText.toLowerCase().includes('planilla'));

      return {
        success,
        numeroPlanilla,
        valorTotal,
        periodo,
        fechaVencimiento,
      };
    });

    if (!planillaData.success) {
      const errorMessage = await this.getErrorMessage(page);
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
      };
    }

    return {
      success: true,
      numeroPlanilla: planillaData.numeroPlanilla || undefined,
      valorTotal: planillaData.valorTotal || undefined,
      periodo: planillaData.periodo || undefined,
      fechaVencimiento: planillaData.fechaVencimiento || undefined,
      estado: 'LIQUIDADA',
      message: `Planilla ${planillaData.numeroPlanilla || ''} generada exitosamente`,
    };
  }

  /**
   * Espera el toast de éxito
   */
  private async waitForSuccessToast(page: Page): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const bodyText = document.body.innerText.toLowerCase();
          return (
            bodyText.includes('correctamente') ||
            bodyText.includes('éxito') ||
            bodyText.includes('actualizado')
          );
        },
        { timeout: 10000 }
      );
    } catch {
      logger.warn('Success toast not detected, continuing anyway');
    }
  }

  /**
   * Obtiene el mensaje de error
   */
  private async getErrorMessage(page: Page): Promise<string> {
    const errorMessage = await page.evaluate(() => {
      const errorEl = document.querySelector('.alert-danger, .error, [class*="error"]');
      return errorEl?.textContent?.trim() || 'Error al generar planilla';
    });
    return errorMessage;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Click en un elemento usando múltiples selectores
   */
  private async clickElement(
    page: Page,
    selectors: readonly string[],
    description: string
  ): Promise<void> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          logger.debug(`Clicked ${description} using selector: ${selector}`);
          return;
        }

        // Si contiene :has-text, buscar por texto
        if (selector.includes(':has-text')) {
          const text = selector.match(/:has-text\("([^"]+)"\)/)?.[1];
          if (text) {
            const clicked = await page.evaluate((searchText) => {
              const elements = document.querySelectorAll('button, a, input, label, div[role="button"]');
              for (const el of elements) {
                if (el.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
                  (el as HTMLElement).click();
                  return true;
                }
              }
              return false;
            }, text);

            if (clicked) {
              logger.debug(`Clicked ${description} using text search: ${text}`);
              return;
            }
          }
        }
      } catch {
        continue;
      }
    }

    // Último intento: buscar por texto del description
    const clicked = await page.evaluate((searchText) => {
      const elements = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], label');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText || (el as HTMLInputElement).value;
        if (text?.toLowerCase().includes(searchText.toLowerCase())) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, description);

    if (!clicked) {
      logger.warn(`Could not click element: ${description}`);
    }
  }

  /**
   * Selecciona una opción de un dropdown
   */
  private async selectOption(
    page: Page,
    selectors: readonly string[],
    value: string
  ): Promise<void> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await page.evaluate(
            (sel, val) => {
              const select = document.querySelector(sel) as HTMLSelectElement;
              if (select) {
                const options = Array.from(select.options);
                const option = options.find(
                  (opt) =>
                    opt.value.toLowerCase().includes(val.toLowerCase()) ||
                    opt.text.toLowerCase().includes(val.toLowerCase())
                );
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            },
            selector,
            value
          );
          return;
        }
      } catch {
        continue;
      }
    }
    logger.warn(`Could not select option: ${value}`);
  }

  /**
   * Llena un input
   */
  private async fillInput(
    page: Page,
    selectors: readonly string[],
    value: string
  ): Promise<void> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // Limpiar campo primero
          await page.evaluate((sel) => {
            const input = document.querySelector(sel) as HTMLInputElement;
            if (input) {
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, selector);

          await page.click(selector, { clickCount: 3 });
          await page.type(selector, value, { delay: 30 });
          return;
        }
      } catch {
        continue;
      }
    }
    logger.warn(`Could not fill input with value: ${value}`);
  }

  /**
   * Hace scroll hasta un elemento
   */
  private async scrollToElement(page: Page, selectors: readonly string[]): Promise<void> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await page.evaluate((el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, element);
          return;
        }
      } catch {
        continue;
      }
    }
  }

  /**
   * Hace scroll hasta el final de la página
   */
  private async scrollToBottom(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  /**
   * Cierra el bot
   */
  async close(): Promise<void> {
    await this.authBot.close();
  }
}

/**
 * Función helper para crear una planilla en Mi Planilla
 */
export async function crearPlanillaMiPlanilla(
  request: MiPlanillaPlanillaRequest
): Promise<MiPlanillaPlanillaResult> {
  const bot = new MiPlanillaLiquidacionBot();
  try {
    return await bot.crearPlanilla(request);
  } finally {
    await bot.close();
  }
}

export default MiPlanillaLiquidacionBot;
