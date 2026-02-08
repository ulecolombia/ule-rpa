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
import { buscarUsuario } from './search.bot';

/**
 * Context for liquidation operations
 */
export interface LiquidacionContext {
  page: Page;
  numeroDocumento: string;
  enlaceUserId?: string;
}

/**
 * Navigate to PILA Liquidation section and select user
 * This function handles different layouts and user selection methods in Enlace
 *
 * @param numeroDocumento - User document number to search for
 * @returns Context object with page and user information
 */
export async function navegarALiquidacion(numeroDocumento: string): Promise<LiquidacionContext> {
  logger.info('Navigating to PILA liquidation', { numeroDocumento });

  try {
    // 1. Verify user exists in Enlace
    logger.info('Verifying user exists in Enlace', { numeroDocumento });
    const userSearch = await buscarUsuario(numeroDocumento);

    if (!userSearch.found) {
      throw new BotError(`User not found in Enlace: ${numeroDocumento}`);
    }

    logger.info('User found in Enlace', {
      numeroDocumento,
      enlaceUserId: userSearch.enlaceUserId,
      nombre: userSearch.nombre,
    });

    // 2. Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    // 3. Navigate to generador de planillas
    logger.info('Navigating to planilla generator');
    await browserManager.takeScreenshot(page, 'before-liquidacion-nav');

    const baseUrl = process.env.ENLACE_BASE_URL || URL_PATTERNS.BASE;
    const liquidacionUrl = `${baseUrl}/generador-planillas/#/`;

    await page.goto(liquidacionUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await sleep(3000);
    await browserManager.takeScreenshot(page, 'liquidacion-page-loaded');

    // 4. Search and select user (handles multiple layouts)
    logger.info('Looking for user selector');
    await selectAportante(page, numeroDocumento);

    // 5. Verify we're on the correct page
    await browserManager.takeScreenshot(page, 'liquidacion-user-selected');

    logger.info('✅ Successfully navigated to liquidation with user selected', {
      numeroDocumento,
      enlaceUserId: userSearch.enlaceUserId,
    });

    return {
      page,
      numeroDocumento,
      enlaceUserId: userSearch.enlaceUserId,
    };
  } catch (error) {
    logger.error('❌ Error navigating to liquidation', { numeroDocumento, error });
    throw error;
  }
}

/**
 * Select aportante (user) in liquidation page
 * Handles different selection methods:
 * - Select dropdown
 * - Search input with autocomplete
 * - Direct list selection
 *
 * @param page - Puppeteer page
 * @param numeroDocumento - User document number
 */
async function selectAportante(page: Page, numeroDocumento: string): Promise<void> {
  try {
    // Strategy 1: Select dropdown
    const selectExists = await elementExists(page, SELECTORS.LIQUIDACION.SELECT_APORTANTE);

    if (selectExists) {
      logger.info('Found aportante select dropdown');
      await browserManager.takeScreenshot(page, 'liquidacion-select-found');

      // Try to select by value or text containing document number
      const selected = await page.evaluate((doc: string) => {
        const select = document.querySelector('select[name="aportante"]') as any;
        if (!select) return false;

        const options = Array.from(select.options) as any[];

        // Try to find option by text (usually contains document number)
        let matchingOption = options.find(
          (opt: any) => opt.text.includes(doc) || opt.value.includes(doc)
        );

        // If not found, try partial match
        if (!matchingOption) {
          matchingOption = options.find((opt: any) => {
            const text = opt.text.toLowerCase();
            const docLower = doc.toLowerCase();
            return text.includes(docLower);
          });
        }

        if (matchingOption) {
          select.value = matchingOption.value;
          // Trigger change event (important for React/Vue apps)
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, numeroDocumento);

      if (!selected) {
        throw new BotError(`Could not find user in aportante dropdown: ${numeroDocumento}`);
      }

      await sleep(2000);
      await browserManager.takeScreenshot(page, 'liquidacion-select-done');
      logger.info('✅ User selected via dropdown');
      return;
    }

    // Strategy 2: Search input with autocomplete
    const searchInputExists = await elementExists(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE_INPUT);

    if (searchInputExists) {
      logger.info('Found aportante search input');
      await browserManager.takeScreenshot(page, 'liquidacion-search-found');

      // Type document number
      await waitAndType(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE_INPUT, numeroDocumento, {
        clear: true,
        delay: 100,
      });

      await sleep(2000);
      await browserManager.takeScreenshot(page, 'liquidacion-search-typed');

      // Try pressing Enter first
      await page.keyboard.press('Enter');
      await sleep(1500);

      // Try to click on search result
      const clicked = await page.evaluate((doc: string) => {
        // Try multiple selectors for search results
        const resultSelectors = [
          '[data-search-result]',
          '.search-result',
          '.autocomplete-result',
          '.dropdown-item',
          'li[role="option"]',
        ];

        for (const selector of resultSelectors) {
          const results = document.querySelectorAll(selector);
          for (const result of Array.from(results)) {
            const text = (result as any).textContent || '';
            if (text.includes(doc)) {
              (result as any).click();
              return true;
            }
          }
        }
        return false;
      }, numeroDocumento);

      if (clicked) {
        await sleep(2000);
        await browserManager.takeScreenshot(page, 'liquidacion-search-selected');
        logger.info('✅ User selected via search input');
        return;
      }

      logger.warn('Could not click search result, continuing anyway');
      await sleep(1000);
      return;
    }

    // Strategy 3: Alternative search input selector
    const altSearchExists = await elementExists(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE);

    if (altSearchExists) {
      logger.info('Found alternative aportante search input');
      await waitAndType(page, SELECTORS.LIQUIDACION.BUSCAR_APORTANTE, numeroDocumento, {
        clear: true,
        delay: 100,
      });
      await sleep(2000);
      await page.keyboard.press('Enter');
      await sleep(2000);
      logger.info('✅ User searched via alternative input');
      return;
    }

    // Strategy 4: Direct selection button
    const selectButtonExists = await elementExists(page, SELECTORS.LIQUIDACION.SELECCIONAR_APORTANTE);

    if (selectButtonExists) {
      logger.info('Found select aportante button');
      await waitAndClick(page, SELECTORS.LIQUIDACION.SELECCIONAR_APORTANTE);
      await sleep(2000);
      logger.info('✅ User selected via button');
      return;
    }

    // If none of the above worked, user might already be selected
    logger.warn('No user selector found - user might be pre-selected or layout is different');
    await browserManager.takeScreenshot(page, 'liquidacion-no-selector');
  } catch (error) {
    logger.error('Error selecting aportante', { error, numeroDocumento });
    await browserManager.takeScreenshot(page, 'liquidacion-select-error');
    throw new BotError('Failed to select aportante for liquidation');
  }
}

/**
 * Select liquidation type (e.g., "Planilla en línea")
 * Some Enlace layouts require selecting the type of liquidation before showing the form
 *
 * @param context - Liquidation context
 */
export async function seleccionarTipoLiquidacion(context: LiquidacionContext): Promise<void> {
  const { page } = context;

  logger.info('Selecting liquidation type: Planilla en línea');

  try {
    await browserManager.takeScreenshot(page, 'before-tipo-liquidacion');

    // Look for "Planilla en línea" button
    const planillaEnLineaExists = await elementExists(page, SELECTORS.LIQUIDACION.PLANILLA_EN_LINEA);

    if (planillaEnLineaExists) {
      logger.info('Found "Planilla en línea" button');
      await waitAndClick(page, SELECTORS.LIQUIDACION.PLANILLA_EN_LINEA);
      await sleep(2000);
      await browserManager.takeScreenshot(page, 'planilla-en-linea-selected');
      logger.info('✅ Selected "Planilla en línea"');
    } else {
      logger.info('No liquidation type selection needed, form may already be visible');
    }

    // Wait for liquidation form to appear
    logger.info('Waiting for liquidation form to load');

    // Try multiple form field selectors
    const formSelectors = [
      SELECTORS.LIQUIDACION.FORM.MES,
      SELECTORS.LIQUIDACION.FORM.PERIODO,
      SELECTORS.LIQUIDACION.FORM.IBC,
      SELECTORS.LIQUIDACION.FORM.INGRESO_BASE,
    ];

    let formLoaded = false;
    for (const selector of formSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        formLoaded = true;
        logger.info('Liquidation form loaded', { selector });
        break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!formLoaded) {
      logger.warn('Could not detect liquidation form with known selectors');
      await browserManager.takeScreenshot(page, 'liquidacion-form-not-detected');
      // Continue anyway - form might be there with different selectors
    }

    await browserManager.takeScreenshot(page, 'liquidacion-form-ready');
    logger.info('✅ Liquidation form ready');
  } catch (error) {
    logger.error('Error selecting liquidation type', { error });
    await browserManager.takeScreenshot(page, 'liquidacion-tipo-error');
    throw new BotError('Failed to select liquidation type');
  }
}

/**
 * Liquidation Bot Class
 * Manages PILA liquidation flow in Enlace Operativo
 */
export class EnlaceLiquidacionBot {
  /**
   * Liquidate PILA for a user
   * @param numeroDocumento - User document number
   * @param pilaData - PILA calculation data
   * @param navigateToPSE - Whether to navigate to PSE payment page (default: false)
   * @returns Liquidation result with planilla number
   */
  async liquidarPila(
    numeroDocumento: string,
    pilaData: PilaData,
    navigateToPSE: boolean = false
  ): Promise<BotResponse<EnlaceLiquidacionResult>> {
    const startTime = Date.now();

    logger.info('Starting PILA liquidation in Enlace', {
      documento: numeroDocumento,
      periodo: pilaData.periodo,
      total: pilaData.total,
      navigateToPSE,
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

      // 7. Navigate to PSE if requested (Phase 3 requirement: navigate but DON'T pay)
      if (navigateToPSE) {
        logger.info('Navigating to PSE payment page (STOP before payment)');
        await this.navigateToPSEPage(page);
        logger.info('✅ Reached PSE page - STOPPED (payment is Phase 8)');
      }

      logger.info('✅ PILA liquidation completed successfully', {
        documento: numeroDocumento,
        numeroPlanilla: liquidationResult.numeroPlanilla,
        total: liquidationResult.total,
        pseReady: navigateToPSE,
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
   * Updated to use new navigation helpers
   */
  private async navigateToLiquidacion(page: Page): Promise<void> {
    try {
      // Try clicking menu item first (for in-app navigation)
      const menuLiquidarExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_LIQUIDAR);
      const menuItemExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_ITEM);
      const menuItemAltExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_ITEM_ALT);
      const menuGeneradorExists = await elementExists(page, SELECTORS.LIQUIDACION.MENU_GENERADOR);

      if (menuLiquidarExists) {
        logger.debug('Clicking "Liquidar PILA" menu item');
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_LIQUIDAR);
        await sleep(2000);
      } else if (menuGeneradorExists) {
        logger.debug('Clicking "Generador de planillas" menu item');
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_GENERADOR);
        await sleep(2000);
      } else if (menuItemExists) {
        logger.debug('Clicking liquidation menu item (primary)');
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_ITEM);
        await sleep(2000);
      } else if (menuItemAltExists) {
        logger.debug('Clicking liquidation menu item (alternative)');
        await waitAndClick(page, SELECTORS.LIQUIDACION.MENU_ITEM_ALT);
        await sleep(2000);
      } else {
        // Navigate directly to URL
        logger.debug('Menu item not found, navigating directly to URL');
        const baseUrl = process.env.ENLACE_BASE_URL || URL_PATTERNS.BASE;
        const liquidacionUrl = `${baseUrl}/generador-planillas/#/`;

        await page.goto(liquidacionUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        await sleep(2000);
      }

      await randomDelay(1000, 2000);
      await browserManager.takeScreenshot(page, 'liquidacion-section');

      logger.debug('Successfully navigated to liquidación section');
    } catch (error) {
      logger.error('Failed to navigate to Liquidación section', { error });
      await browserManager.takeScreenshot(page, 'liquidacion-nav-error');
      throw new BotError('Failed to navigate to Liquidación section');
    }
  }

  /**
   * Search for user and select them for liquidation
   * Updated to use new selectAportante helper function
   */
  private async searchAndSelectUser(page: Page, numeroDocumento: string): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-user-search');
      logger.debug('Selecting user for liquidation', { documento: numeroDocumento });

      // Use the new selectAportante helper that handles multiple layouts
      await selectAportante(page, numeroDocumento);

      await browserManager.takeScreenshot(page, 'user-selected');
      logger.debug('✅ User selected successfully');
    } catch (error) {
      logger.error('Failed to search and select user', { error, documento: numeroDocumento });
      await browserManager.takeScreenshot(page, 'user-search-error');
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
      // Try new RESULTADO selectors first
      const selectors = [
        SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA,
        SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA_DATA,
        SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA_CLASS,
        // Legacy RESULT selectors
        SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA,
        SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA_ALT,
      ];

      for (const selector of selectors) {
        const exists = await elementExists(page, selector);
        if (exists) {
          const numero = await getTextContent(page, selector);
          if (numero) {
            logger.info('Extracted numero de planilla', { numero, selector });
            return numero;
          }
        }
      }

      // Try regex selector for text pattern
      try {
        const element = await page.waitForSelector(SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA_ALT, {
          timeout: 2000,
        });
        if (element) {
          const numero = await element.evaluate((el) => el.textContent);
          if (numero) {
            const match = numero.match(/\d+/);
            if (match) {
              logger.info('Extracted numero de planilla from regex', { numero: match[0] });
              return match[0];
            }
          }
        }
      } catch (e) {
        // Continue to text search
      }

      // Try to find in page text
      const pageText = await page.evaluate(() => document.body.innerText);
      const planillaMatch = pageText.match(/planilla[:\s#Nn°o.]*(\d+)/i);
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
      // Try new RESULTADO selectors first
      const selectors = [
        SELECTORS.LIQUIDACION.RESULTADO.FECHA_LIMITE,
        SELECTORS.LIQUIDACION.RESULTADO.FECHA_LIMITE_CLASS,
        // Legacy RESULT selectors
        SELECTORS.LIQUIDACION.RESULT.FECHA_LIMITE,
      ];

      for (const selector of selectors) {
        const exists = await elementExists(page, selector);
        if (exists) {
          const fechaStr = await getTextContent(page, selector);
          if (fechaStr) {
            // Try to parse date in multiple formats
            let fecha: Date | undefined;

            // Try ISO format first
            fecha = new Date(fechaStr);

            // Try DD/MM/YYYY format
            if (isNaN(fecha.getTime())) {
              const match = fechaStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
              if (match) {
                const [, day, month, year] = match;
                fecha = new Date(`${year}-${month}-${day}`);
              }
            }

            if (!isNaN(fecha.getTime())) {
              logger.info('Extracted fecha limite', { fecha, selector });
              return fecha;
            }
          }
        }
      }

      // Default: 7 days from now (typical PILA deadline)
      const defaultFecha = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      logger.debug('Using default fecha limite (7 days)', { fecha: defaultFecha });
      return defaultFecha;
    } catch (error) {
      logger.warn('Error extracting fecha limite', { error });
      return undefined;
    }
  }

  /**
   * Navigate to PSE payment page
   * IMPORTANT: This navigates TO PSE but DOES NOT complete payment
   * Payment completion is Phase 8 (handled by ULE application)
   */
  private async navigateToPSEPage(page: Page): Promise<void> {
    try {
      logger.info('Starting navigation to PSE page');
      await browserManager.takeScreenshot(page, 'before-pse-navigation');

      // Try different PSE button selectors
      const pseSelectors = [
        SELECTORS.LIQUIDACION.PSE.BOTON_PAGAR_PSE,
        SELECTORS.LIQUIDACION.PSE.BOTON_PAGAR,
        SELECTORS.LIQUIDACION.PSE.CONTINUAR_PAGO,
      ];

      let buttonClicked = false;

      for (const selector of pseSelectors) {
        const buttonExists = await elementExists(page, selector);
        if (buttonExists) {
          logger.debug('Found PSE button', { selector });
          await scrollToElement(page, selector);
          await randomDelay(500, 1000);
          await waitAndClick(page, selector);
          buttonClicked = true;
          logger.info('Clicked PSE button');
          break;
        }
      }

      if (!buttonClicked) {
        logger.warn('PSE button not found - might already be on payment page');
        return;
      }

      // Wait for navigation/modal
      await sleep(2000);
      await browserManager.takeScreenshot(page, 'after-pse-button-click');

      // Check if PSE radio button exists (payment method selection)
      const pseRadioExists = await elementExists(page, SELECTORS.LIQUIDACION.PSE.SELECCIONAR_PSE);
      const pseRadioAltExists = await elementExists(page, SELECTORS.LIQUIDACION.PSE.RADIO_PSE);

      if (pseRadioExists || pseRadioAltExists) {
        logger.debug('Selecting PSE payment method');
        const radioSelector = pseRadioExists
          ? SELECTORS.LIQUIDACION.PSE.SELECCIONAR_PSE
          : SELECTORS.LIQUIDACION.PSE.RADIO_PSE;

        await waitAndClick(page, radioSelector);
        await sleep(1000);
        await browserManager.takeScreenshot(page, 'pse-payment-method-selected');

        // Click continue to PSE if button exists
        const continuarExists = await elementExists(page, SELECTORS.LIQUIDACION.PSE.CONTINUAR_PAGO);
        if (continuarExists) {
          logger.debug('Clicking continue to PSE');
          await waitAndClick(page, SELECTORS.LIQUIDACION.PSE.CONTINUAR_PAGO);
          await sleep(2000);
        }
      }

      // Check if PSE iframe loaded
      const iframeExists = await elementExists(page, SELECTORS.LIQUIDACION.PSE.IFRAME_PSE);
      const iframeAltExists = await elementExists(page, SELECTORS.LIQUIDACION.PSE.IFRAME_PAGOS);

      if (iframeExists || iframeAltExists) {
        logger.info('✅ PSE iframe detected - ready for payment');
        await browserManager.takeScreenshot(page, 'pse-iframe-loaded');
      } else {
        logger.info('PSE page reached (no iframe detected yet)');
        await browserManager.takeScreenshot(page, 'pse-page-reached');
      }

      logger.info('⏸️  STOPPED at PSE page - payment will be handled in Phase 8');
    } catch (error) {
      logger.error('Error navigating to PSE page', { error });
      await browserManager.takeScreenshot(page, 'pse-navigation-error');
      // Don't throw - PSE navigation is optional enhancement
      logger.warn('Continuing despite PSE navigation error');
    }
  }
}

/**
 * Singleton instance
 */
export const enlaceLiquidacion = new EnlaceLiquidacionBot();

/**
 * Quick function for liquidating PILA
 * @param numeroDocumento - User document number
 * @param pilaData - PILA calculation data
 * @param navigateToPSE - Whether to navigate to PSE page (default: false)
 */
export async function liquidarPilaEnlace(
  numeroDocumento: string,
  pilaData: PilaData,
  navigateToPSE: boolean = false
): Promise<BotResponse<EnlaceLiquidacionResult>> {
  return enlaceLiquidacion.liquidarPila(numeroDocumento, pilaData, navigateToPSE);
}

/**
 * Complete liquidation flow using new navigation functions
 * This is an alternative approach that uses the helper functions directly
 *
 * @param numeroDocumento - User document number
 * @param pilaData - PILA calculation data
 * @param navigateToPSE - Whether to navigate to PSE page
 * @returns Liquidation result
 */
export async function liquidarPilaCompleto(
  numeroDocumento: string,
  pilaData: PilaData,
  navigateToPSE: boolean = false
): Promise<BotResponse<EnlaceLiquidacionResult>> {
  const startTime = Date.now();

  logger.info('Starting complete PILA liquidation flow', {
    numeroDocumento,
    periodo: pilaData.periodo,
    total: pilaData.total,
  });

  try {
    // Step 1: Navigate to liquidation and select user
    logger.info('Step 1: Navigating to liquidation');
    const context = await navegarALiquidacion(numeroDocumento);

    // Step 2: Select liquidation type if needed
    logger.info('Step 2: Selecting liquidation type');
    await seleccionarTipoLiquidacion(context);

    // Step 3: Use the bot class to complete the rest
    logger.info('Step 3: Completing liquidation with bot');
    const result = await enlaceLiquidacion.liquidarPila(numeroDocumento, pilaData, navigateToPSE);

    logger.info('✅ Complete liquidation flow finished successfully', {
      numeroDocumento,
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logger.error('❌ Complete liquidation flow failed', {
      error,
      numeroDocumento,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in complete liquidation',
      duration: Date.now() - startTime,
    };
  }
}
