/**
 * Liquidation Bot for Enlace Operativo
 * Handles PILA liquidation (calculation and submission)
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { PilaData, BotResponse, EnlaceLiquidacionResult } from '../../types';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import {
  waitAndClick,
  waitAndType,
  sleep,
  elementExists,
  selectOption,
  randomDelay,
  scrollToElement,
  getTextContent,
} from '../utils/wait';
import { browserManager } from '../utils/browser';
import { BotError } from '../../utils/errors';
import { enlaceAuth } from './auth.bot';

/**
 * Liquidation Bot Class
 * Manages PILA liquidation flow in Enlace Operativo
 */
export class EnlaceLiquidacionBot {
  /**
   * Liquidate PILA for a user
   * @param numeroDocumento - User document number
   * @param pilaData - PILA calculation data
   * @returns Liquidation result with planilla number
   */
  async liquidarPila(
    numeroDocumento: string,
    pilaData: PilaData
  ): Promise<BotResponse<EnlaceLiquidacionResult>> {
    const startTime = Date.now();

    logger.info('Starting PILA liquidation in Enlace', {
      documento: numeroDocumento,
      periodo: pilaData.periodo,
      total: pilaData.total,
    });

    // Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    try {
      // 1. Navigate to Liquidación section
      logger.info('Navigating to Liquidación section');
      await this.navigateToLiquidacion(page);

      // 2. Search for user by document
      logger.info('Searching for user', { documento: numeroDocumento });
      await this.searchAndSelectUser(page, numeroDocumento);

      // 3. Fill liquidation form
      logger.info('Filling liquidation form');
      await this.fillLiquidationForm(page, pilaData);

      // 4. Calculate totals (if calculate button exists)
      logger.info('Calculating contribution totals');
      await this.calculateTotals(page);

      // 5. Submit liquidation
      logger.info('Submitting liquidation');
      await this.submitLiquidation(page);

      // 6. Verify success and extract planilla number
      logger.info('Verifying liquidation success');
      const liquidationResult = await this.verifyLiquidationSuccess(page, pilaData);

      logger.info('✅ PILA liquidation completed successfully', {
        documento: numeroDocumento,
        numeroPlanilla: liquidationResult.numeroPlanilla,
        total: liquidationResult.total,
      });

      return {
        success: true,
        data: liquidationResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('❌ PILA liquidation failed', {
        error,
        documento: numeroDocumento,
        periodo: pilaData.periodo,
      });

      const screenshot = await browserManager.takeScreenshot(page, 'liquidacion-error');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown liquidation error',
        screenshot,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Navigate to Liquidación section
   */
  private async navigateToLiquidacion(page: Page): Promise<void> {
    try {
      // Try clicking menu item first
      const menuItemExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_ITEM);
      const menuItemAltExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_ITEM_ALT);

      if (menuItemExists) {
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_ITEM);
        await sleep(1000);
      } else if (menuItemAltExists) {
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_ITEM_ALT);
        await sleep(1000);
      } else {
        // Navigate directly to URL
        logger.debug('Menu item not found, navigating to URL');
        await page.goto(URL_PATTERNS.LIQUIDACION, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      await randomDelay(1000, 2000);
      await browserManager.takeScreenshot(page, 'liquidacion-section');
    } catch (error) {
      throw new BotError('Failed to navigate to Liquidación section');
    }
  }

  /**
   * Search for user and select them for liquidation
   */
  private async searchAndSelectUser(page: Page, numeroDocumento: string): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-user-search');

      // Wait for search input
      const searchInputExists = await elementExists(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE);
      if (!searchInputExists) {
        logger.warn('Search input not found, user might already be selected');
        return;
      }

      // Fill search input
      logger.debug('Filling search input', { documento: numeroDocumento });
      await waitAndType(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE, numeroDocumento, {
        clear: true,
        delay: 100,
      });
      await randomDelay(500, 1000);

      // Press Enter or wait for results
      await page.keyboard.press('Enter');
      await sleep(2000);

      await browserManager.takeScreenshot(page, 'user-search-results');

      // Click select button if it exists
      const selectButtonExists = await elementExists(page, SELECTORS.LIQUIDACION.SELECCIONAR_APORTANTE);
      if (selectButtonExists) {
        logger.debug('Selecting user');
        await waitAndClick(page, SELECTORS.LIQUIDACION.SELECCIONAR_APORTANTE);
        await sleep(1000);
        await browserManager.takeScreenshot(page, 'user-selected');
      } else {
        logger.debug('Select button not found, proceeding (user might be auto-selected)');
      }
    } catch (error) {
      throw new BotError('Failed to search and select user');
    }
  }

  /**
   * Fill liquidation form with PILA data
   */
  private async fillLiquidationForm(page: Page, pilaData: PilaData): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'liquidation-form-before-fill');

      // 1. Periodo (could be split into Mes/Año or single input)
      await this.fillPeriodo(page, pilaData.periodo);

      // 2. IBC (Ingreso Base de Cotización)
      logger.debug('Entering IBC', { ibc: pilaData.ibc });
      const ibcExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.IBC);
      const ingresoBaseExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.INGRESO_BASE);

      if (ibcExists) {
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.IBC, pilaData.ibc.toString(), {
          clear: true,
          delay: 100,
        });
      } else if (ingresoBaseExists) {
        await waitAndType(
          page,
          SELECTORS.LIQUIDACION.FORM.INGRESO_BASE,
          pilaData.ibc.toString(),
          { clear: true, delay: 100 }
        );
      }
      await randomDelay(300, 500);

      // 3. Días cotizados
      logger.debug('Entering días cotizados', { dias: pilaData.diasCotizados });
      const diasExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.DIAS_COTIZADOS);
      if (diasExists) {
        await waitAndType(
          page,
          SELECTORS.LIQUIDACION.FORM.DIAS_COTIZADOS,
          pilaData.diasCotizados.toString(),
          { clear: true, delay: 80 }
        );
        await randomDelay(300, 500);
      }

      // 4. Nivel de riesgo ARL
      logger.debug('Selecting nivel de riesgo ARL', { nivel: pilaData.nivelRiesgoARL });
      const nivelRiesgoExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.NIVEL_RIESGO_ARL);
      if (nivelRiesgoExists) {
        await selectOption(page, SELECTORS.LIQUIDACION.FORM.NIVEL_RIESGO_ARL, pilaData.nivelRiesgoARL);
        await randomDelay(500, 800);
      }

      // 5. Valores de aportes (Salud, Pensión, ARL)
      // Note: These might be calculated automatically after entering IBC
      // But we'll try to fill them if inputs exist
      await this.fillAporteValues(page, pilaData);

      await browserManager.takeScreenshot(page, 'liquidation-form-after-fill');
      logger.info('✅ Liquidation form filled successfully');
    } catch (error) {
      logger.error('Error filling liquidation form', { error });
      await browserManager.takeScreenshot(page, 'liquidation-form-fill-error');
      throw new BotError('Failed to fill liquidation form');
    }
  }

  /**
   * Fill periodo field (could be single input or split Mes/Año)
   */
  private async fillPeriodo(page: Page, periodo: string): Promise<void> {
    try {
      // Parse periodo "YYYY-MM" -> { mes: "MM", ano: "YYYY" }
      const [ano, mes] = periodo.split('-');

      logger.debug('Entering periodo', { periodo, mes, ano });

      // Check if there's a single periodo input
      const periodoExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.PERIODO);
      if (periodoExists) {
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.PERIODO, periodo, {
          clear: true,
          delay: 100,
        });
        await randomDelay(300, 500);
        return;
      }

      // Check for split Mes/Año inputs
      const mesExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.MES);
      const anoExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ANO);

      if (mesExists && anoExists) {
        // Select mes (could be dropdown)
        const isSelect = await page.$eval(
          SELECTORS.LIQUIDACION.FORM.MES,
          (el) => el.tagName === 'SELECT'
        );

        if (isSelect) {
          await selectOption(page, SELECTORS.LIQUIDACION.FORM.MES, mes);
        } else {
          await waitAndType(page, SELECTORS.LIQUIDACION.FORM.MES, mes, {
            clear: true,
            delay: 80,
          });
        }
        await randomDelay(200, 400);

        // Enter año
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.ANO, ano, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }
    } catch (error) {
      logger.warn('Error filling periodo', { error });
    }
  }

  /**
   * Fill aporte values (Salud, Pensión, ARL)
   */
  private async fillAporteValues(page: Page, pilaData: PilaData): Promise<void> {
    try {
      // Salud
      const saludExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.SALUD);
      if (saludExists) {
        // Check if field is readonly (might be auto-calculated)
        const isReadonly = await page.$eval(
          SELECTORS.LIQUIDACION.FORM.SALUD,
          (el: any) => el.readOnly || el.disabled
        );

        if (!isReadonly) {
          logger.debug('Entering Salud value', { salud: pilaData.salud });
          await waitAndType(page, SELECTORS.LIQUIDACION.FORM.SALUD, pilaData.salud.toString(), {
            clear: true,
            delay: 80,
          });
          await randomDelay(200, 400);
        } else {
          logger.debug('Salud field is readonly, skipping');
        }
      }

      // Pensión
      const pensionExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.PENSION);
      if (pensionExists) {
        const isReadonly = await page.$eval(
          SELECTORS.LIQUIDACION.FORM.PENSION,
          (el: any) => el.readOnly || el.disabled
        );

        if (!isReadonly) {
          logger.debug('Entering Pensión value', { pension: pilaData.pension });
          await waitAndType(
            page,
            SELECTORS.LIQUIDACION.FORM.PENSION,
            pilaData.pension.toString(),
            { clear: true, delay: 80 }
          );
          await randomDelay(200, 400);
        } else {
          logger.debug('Pensión field is readonly, skipping');
        }
      }

      // ARL
      const arlExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ARL);
      if (arlExists) {
        const isReadonly = await page.$eval(
          SELECTORS.LIQUIDACION.FORM.ARL,
          (el: any) => el.readOnly || el.disabled
        );

        if (!isReadonly) {
          logger.debug('Entering ARL value', { arl: pilaData.arl });
          await waitAndType(page, SELECTORS.LIQUIDACION.FORM.ARL, pilaData.arl.toString(), {
            clear: true,
            delay: 80,
          });
          await randomDelay(200, 400);
        } else {
          logger.debug('ARL field is readonly, skipping');
        }
      }
    } catch (error) {
      logger.warn('Error filling aporte values', { error });
    }
  }

  /**
   * Click calculate button (if exists)
   */
  private async calculateTotals(page: Page): Promise<void> {
    try {
      const calculateButtonExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.CALCULAR);
      if (calculateButtonExists) {
        logger.debug('Clicking calculate button');
        await browserManager.takeScreenshot(page, 'before-calculate');

        await waitAndClick(page, SELECTORS.LIQUIDACION.FORM.CALCULAR);
        await sleep(2000);

        await browserManager.takeScreenshot(page, 'after-calculate');
        logger.debug('Calculation completed');
      } else {
        logger.debug('Calculate button not found, totals might be auto-calculated');
      }
    } catch (error) {
      logger.warn('Error clicking calculate button', { error });
    }
  }

  /**
   * Submit liquidation form
   */
  private async submitLiquidation(page: Page): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-liquidation-submit');

      // Try multiple submit button selectors
      const submitSelectors = [
        SELECTORS.LIQUIDACION.FORM.LIQUIDAR,
        SELECTORS.LIQUIDACION.FORM.GENERAR_PLANILLA,
      ];

      let buttonClicked = false;

      for (const selector of submitSelectors) {
        const buttonExists = await elementExists(page, selector);
        if (buttonExists) {
          logger.debug('Clicking submit button', { selector });
          await scrollToElement(page, selector);
          await randomDelay(500, 1000);
          await waitAndClick(page, selector);
          buttonClicked = true;
          break;
        }
      }

      if (!buttonClicked) {
        throw new BotError('Submit button not found');
      }

      // Wait for submission
      logger.info('Waiting for liquidation submission...');
      await sleep(3000);

      await browserManager.takeScreenshot(page, 'after-liquidation-submit');
    } catch (error) {
      throw new BotError('Failed to submit liquidation');
    }
  }

  /**
   * Verify liquidation success and extract planilla data
   */
  private async verifyLiquidationSuccess(
    page: Page,
    pilaData: PilaData
  ): Promise<EnlaceLiquidacionResult> {
    try {
      // Check for success message
      const successExists = await elementExists(page, SELECTORS.COMMON.ALERT_SUCCESS);
      const toastSuccessExists = await elementExists(page, SELECTORS.COMMON.TOAST_SUCCESS);

      if (successExists || toastSuccessExists) {
        logger.info('✅ Success message detected');
      }

      // Check for error message
      const errorExists = await elementExists(page, SELECTORS.COMMON.ALERT_ERROR);
      const toastErrorExists = await elementExists(page, SELECTORS.COMMON.TOAST_ERROR);

      if (errorExists || toastErrorExists) {
        const errorSelector = errorExists
          ? SELECTORS.COMMON.ALERT_ERROR
          : SELECTORS.COMMON.TOAST_ERROR;

        const errorText = await page.$eval(errorSelector, (el) => el.textContent || '');

        logger.error('❌ Error message detected', { error: errorText });
        await browserManager.takeScreenshot(page, 'liquidacion-error-message');

        throw new BotError(`Liquidation failed: ${errorText}`);
      }

      // Wait for result section
      await sleep(2000);

      // Extract planilla number
      const numeroPlanilla = await this.extractNumeroPlanilla(page);

      // Extract fecha limite
      const fechaLimite = await this.extractFechaLimite(page);

      await browserManager.takeScreenshot(page, 'liquidacion-success');

      return {
        liquidated: true,
        numeroPlanilla,
        total: pilaData.total,
        fechaLimite,
      };
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      throw new BotError('Failed to verify liquidation success');
    }
  }

  /**
   * Extract numero de planilla from page
   */
  private async extractNumeroPlanilla(page: Page): Promise<string | undefined> {
    try {
      // Try primary selector
      const numeroPlanillaExists = await elementExists(page, SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA);
      if (numeroPlanillaExists) {
        const numero = await getTextContent(page, SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA);
        if (numero) {
          logger.info('Extracted numero de planilla', { numero });
          return numero;
        }
      }

      // Try alternative selector
      const altExists = await elementExists(page, SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA_ALT);
      if (altExists) {
        const numero = await getTextContent(page, SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA_ALT);
        if (numero) {
          logger.info('Extracted numero de planilla (alt)', { numero });
          return numero;
        }
      }

      // Try to find in page text
      const pageText = await page.evaluate(() => document.body.innerText);
      const planillaMatch = pageText.match(/planilla[:\s#]*(\d+)/i);
      if (planillaMatch) {
        logger.info('Extracted numero de planilla from text', { numero: planillaMatch[1] });
        return planillaMatch[1];
      }

      logger.warn('Could not extract numero de planilla');
      return undefined;
    } catch (error) {
      logger.warn('Error extracting numero de planilla', { error });
      return undefined;
    }
  }

  /**
   * Extract fecha limite from page
   */
  private async extractFechaLimite(page: Page): Promise<Date | undefined> {
    try {
      const fechaLimiteExists = await elementExists(page, SELECTORS.LIQUIDACION.RESULT.FECHA_LIMITE);
      if (fechaLimiteExists) {
        const fechaStr = await getTextContent(page, SELECTORS.LIQUIDACION.RESULT.FECHA_LIMITE);
        if (fechaStr) {
          const fecha = new Date(fechaStr);
          if (!isNaN(fecha.getTime())) {
            logger.info('Extracted fecha limite', { fecha });
            return fecha;
          }
        }
      }

      // Default: 7 days from now
      const defaultFecha = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      logger.debug('Using default fecha limite (7 days)', { fecha: defaultFecha });
      return defaultFecha;
    } catch (error) {
      logger.warn('Error extracting fecha limite', { error });
      return undefined;
    }
  }
}

/**
 * Singleton instance
 */
export const enlaceLiquidacion = new EnlaceLiquidacionBot();

/**
 * Quick function for liquidating PILA
 */
export async function liquidarPilaEnlace(
  numeroDocumento: string,
  pilaData: PilaData
): Promise<BotResponse<EnlaceLiquidacionResult>> {
  return enlaceLiquidacion.liquidarPila(numeroDocumento, pilaData);
}
