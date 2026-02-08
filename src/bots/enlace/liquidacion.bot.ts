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

// ============================================================================
// PILA CALCULATION CONSTANTS (2025)
// ============================================================================

/**
 * Salario Mínimo Mensual Legal Vigente 2025
 */
export const SMMLV_2025 = 1423500;

/**
 * Porcentaje de aporte a Salud (12.5%)
 */
export const PORCENTAJE_SALUD = 12.5;

/**
 * Porcentaje de aporte a Pensión (16%)
 */
export const PORCENTAJE_PENSION = 16.0;

/**
 * Porcentajes ARL por nivel de riesgo
 */
export const PORCENTAJES_ARL: Record<string, number> = {
  I: 0.522,
  II: 1.044,
  III: 2.436,
  IV: 4.35,
  V: 6.96,
};

// ============================================================================
// PILA CALCULATION HELPERS
// ============================================================================

/**
 * Calculate PILA contributions based on IBC
 * @param ibc - Ingreso Base de Cotización
 * @param dias - Days worked (default: 30)
 * @param nivelRiesgoARL - ARL risk level (I-V)
 * @returns Calculated contributions
 */
export function calcularAportesPila(
  ibc: number,
  dias: number = 30,
  nivelRiesgoARL: string = 'I'
): {
  salud: number;
  pension: number;
  arl: number;
  total: number;
} {
  const factor = dias / 30;

  const salud = Math.round((ibc * (PORCENTAJE_SALUD / 100)) * factor);
  const pension = Math.round((ibc * (PORCENTAJE_PENSION / 100)) * factor);

  const porcentajeARL = PORCENTAJES_ARL[nivelRiesgoARL] || PORCENTAJES_ARL.I;
  const arl = Math.round((ibc * (porcentajeARL / 100)) * factor);

  const total = salud + pension + arl;

  return { salud, pension, arl, total };
}

/**
 * Validate PILA data before submission
 * @param pilaData - PILA data to validate
 * @returns Validation result
 */
export function validarDatosPila(pilaData: PilaData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validar período
  if (!pilaData.periodo) {
    errors.push('Período es requerido');
  } else if (!/^\d{4}-\d{2}$/.test(pilaData.periodo)) {
    errors.push('Período debe tener formato YYYY-MM');
  }

  // Validar IBC
  if (!pilaData.ibc || pilaData.ibc <= 0) {
    errors.push('IBC debe ser mayor que 0');
  } else if (pilaData.ibc < SMMLV_2025) {
    errors.push(`IBC no puede ser menor que 1 SMMLV (${SMMLV_2025})`);
  }

  // Validar días cotizados
  if (pilaData.diasCotizados && (pilaData.diasCotizados < 1 || pilaData.diasCotizados > 30)) {
    errors.push('Días cotizados debe estar entre 1 y 30');
  }

  // Validar nivel de riesgo ARL
  if (pilaData.nivelRiesgoARL && !PORCENTAJES_ARL[pilaData.nivelRiesgoARL]) {
    errors.push('Nivel de riesgo ARL inválido (debe ser I, II, III, IV o V)');
  }

  // Validar montos de aportes
  if (pilaData.salud && pilaData.salud < 0) {
    errors.push('Salud debe ser mayor o igual que 0');
  }
  if (pilaData.pension && pilaData.pension < 0) {
    errors.push('Pensión debe ser mayor o igual que 0');
  }
  if (pilaData.arl && pilaData.arl < 0) {
    errors.push('ARL debe ser mayor o igual que 0');
  }
  if (pilaData.total && pilaData.total <= 0) {
    errors.push('Total debe ser mayor que 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify if a field was automatically calculated
 * @param page - Puppeteer page
 * @param selector - Field selector
 * @returns True if field has a non-zero value
 */
async function verificarCalculoAutomatico(page: Page, selector: string): Promise<boolean> {
  try {
    const hasValue = await page.$eval(selector, (el) => {
      const input = el as any;
      const value = input.value || '';
      return value !== '' && value !== '0' && parseFloat(value) > 0;
    });

    return hasValue;
  } catch (error) {
    logger.debug('Could not verify automatic calculation', { selector, error });
    return false;
  }
}

/**
 * Verify if a field is readonly or disabled
 * @param page - Puppeteer page
 * @param selector - Field selector
 * @returns True if field is readonly or disabled
 */
async function esFieldReadonly(page: Page, selector: string): Promise<boolean> {
  try {
    const isReadonly = await page.$eval(selector, (el) => {
      const input = el as any;
      return input.readOnly || input.disabled;
    });

    return isReadonly;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// FORM FILLING FUNCTIONS
// ============================================================================

/**
 * Fill PILA liquidation form
 * Handles both automatic and manual calculation forms
 *
 * @param context - Liquidation context
 * @param pilaData - PILA data to fill
 */
export async function llenarFormularioPila(
  context: LiquidacionContext,
  pilaData: PilaData
): Promise<void> {
  const { page } = context;

  logger.info('Starting to fill PILA liquidation form', {
    numeroDocumento: context.numeroDocumento,
    periodo: pilaData.periodo,
    ibc: pilaData.ibc,
    total: pilaData.total,
  });

  // Validate PILA data
  const validation = validarDatosPila(pilaData);
  if (!validation.valid) {
    const errorMsg = `Invalid PILA data: ${validation.errors.join(', ')}`;
    logger.error(errorMsg, { errors: validation.errors });
    throw new BotError(errorMsg);
  }

  try {
    await browserManager.takeScreenshot(page, 'liquidacion-form-before-fill');

    // 1. Fill PERÍODO (mes y año)
    await fillPeriodo(page, pilaData.periodo);

    // 2. Fill DÍAS COTIZADOS
    await fillDiasCotizados(page, pilaData.diasCotizados || 30);

    // 3. Fill INGRESO BASE and IBC
    await fillIngresoBaseIBC(page, pilaData);

    // 4. Fill SALUD
    await fillSalud(page, pilaData.salud);

    // 5. Fill PENSIÓN
    await fillPension(page, pilaData.pension);

    // 6. Fill ARL
    await fillARL(page, pilaData);

    // 7. Verify TOTAL
    await verifyTotal(page, pilaData.total);

    // 8. Screenshot after filling
    await browserManager.takeScreenshot(page, 'liquidacion-form-filled');

    logger.info('✅ PILA form filled successfully', {
      numeroDocumento: context.numeroDocumento,
      periodo: pilaData.periodo,
    });
  } catch (error) {
    logger.error('❌ Error filling PILA form', {
      error,
      numeroDocumento: context.numeroDocumento,
      periodo: pilaData.periodo,
    });
    await browserManager.takeScreenshot(page, 'liquidacion-fill-error');
    throw new BotError('Failed to fill PILA form');
  }
}

/**
 * Fill período field (mes and año)
 */
async function fillPeriodo(page: Page, periodo: string): Promise<void> {
  try {
    const [anio, mes] = periodo.split('-'); // "2026-02" -> ["2026", "02"]

    logger.info('Setting período', { mes, anio });

    // Check if there's a single período input
    const periodoInputExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.PERIODO);

    if (periodoInputExists) {
      logger.debug('Using single período input');
      await waitAndType(page, SELECTORS.LIQUIDACION.FORM.PERIODO, periodo, {
        clear: true,
        delay: 100,
      });
      await sleep(500);
      return;
    }

    // Check for separate MES and ANIO fields
    const mesExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.MES);
    const anioExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ANIO);

    if (mesExists) {
      logger.debug('Selecting mes');

      // Check if it's a select or input
      const isSelect = await page.$eval(
        SELECTORS.LIQUIDACION.FORM.MES,
        (el) => el.tagName === 'SELECT'
      );

      if (isSelect) {
        // Try to select by value
        await page.select(SELECTORS.LIQUIDACION.FORM.MES, mes).catch(async () => {
          // If that fails, try to select by visible text
          await page.evaluate(
            (selector, mesValue) => {
              const select = document.querySelector(selector) as any;
              if (select) {
                const options = Array.from(select.options) as any[];
                const option = options.find((opt: any) => opt.text.includes(mesValue));
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            },
            SELECTORS.LIQUIDACION.FORM.MES,
            mes
          );
        });
      } else {
        // It's an input
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.MES, mes, {
          clear: true,
          delay: 80,
        });
      }

      await sleep(500);
    }

    if (anioExists) {
      logger.debug('Setting año');

      const isSelect = await page.$eval(
        SELECTORS.LIQUIDACION.FORM.ANIO,
        (el) => el.tagName === 'SELECT'
      );

      if (isSelect) {
        await page.select(SELECTORS.LIQUIDACION.FORM.ANIO, anio).catch(async () => {
          await page.evaluate(
            (selector, anioValue) => {
              const select = document.querySelector(selector) as any;
              if (select) {
                const options = Array.from(select.options) as any[];
                const option = options.find((opt: any) => opt.text.includes(anioValue));
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            },
            SELECTORS.LIQUIDACION.FORM.ANIO,
            anio
          );
        });
      } else {
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.ANIO, anio, {
          clear: true,
          delay: 80,
        });
      }

      await sleep(500);
    }

    logger.debug('✅ Período set successfully');
  } catch (error) {
    logger.error('Error setting período', { error, periodo });
    throw error;
  }
}

/**
 * Fill días cotizados field
 */
async function fillDiasCotizados(page: Page, dias: number): Promise<void> {
  try {
    logger.info('Setting días cotizados', { dias });

    const diasExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.DIAS_COTIZADOS);

    if (!diasExists) {
      logger.debug('Días cotizados field not found, skipping');
      return;
    }

    // Check if readonly
    const isReadonly = await esFieldReadonly(page, SELECTORS.LIQUIDACION.FORM.DIAS_COTIZADOS);
    if (isReadonly) {
      logger.debug('Días cotizados field is readonly, skipping');
      return;
    }

    await waitAndType(page, SELECTORS.LIQUIDACION.FORM.DIAS_COTIZADOS, String(dias), {
      clear: true,
      delay: 80,
    });

    await sleep(500);
    logger.debug('✅ Días cotizados set successfully');
  } catch (error) {
    logger.error('Error setting días cotizados', { error, dias });
    throw error;
  }
}

/**
 * Fill ingreso base and IBC fields
 */
async function fillIngresoBaseIBC(page: Page, pilaData: PilaData): Promise<void> {
  try {
    logger.info('Setting ingreso base and IBC', {
      ingresoBase: pilaData.ingresoBase,
      ibc: pilaData.ibc,
    });

    // Check for INGRESO_BASE field
    const ingresoBaseExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.INGRESO_BASE);

    if (ingresoBaseExists) {
      logger.debug('Setting ingreso base');

      await waitAndType(
        page,
        SELECTORS.LIQUIDACION.FORM.INGRESO_BASE,
        String(pilaData.ingresoBase || pilaData.ibc),
        { clear: true, delay: 100 }
      );

      await sleep(1000);

      // Check if IBC was calculated automatically
      const ibcExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.IBC_INPUT);

      if (ibcExists) {
        const ibcCalculated = await verificarCalculoAutomatico(
          page,
          SELECTORS.LIQUIDACION.FORM.IBC_INPUT
        );

        if (!ibcCalculated) {
          logger.debug('IBC not calculated automatically, setting manually');
          await waitAndType(page, SELECTORS.LIQUIDACION.FORM.IBC_INPUT, String(pilaData.ibc), {
            clear: true,
            delay: 100,
          });
          await sleep(500);
        } else {
          logger.debug('IBC calculated automatically');
        }
      }
    } else {
      // No ingreso base field, just set IBC
      logger.debug('Setting IBC directly');

      const ibcExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.IBC_INPUT);

      if (ibcExists) {
        await waitAndType(page, SELECTORS.LIQUIDACION.FORM.IBC_INPUT, String(pilaData.ibc), {
          clear: true,
          delay: 100,
        });
        await sleep(1000);
      } else {
        // Try alternative IBC selector
        const ibcAltExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.IBC);
        if (ibcAltExists) {
          await waitAndType(page, SELECTORS.LIQUIDACION.FORM.IBC, String(pilaData.ibc), {
            clear: true,
            delay: 100,
          });
          await sleep(1000);
        }
      }
    }

    logger.debug('✅ Ingreso base / IBC set successfully');
  } catch (error) {
    logger.error('Error setting ingreso base / IBC', { error, pilaData });
    throw error;
  }
}

/**
 * Fill salud field
 */
async function fillSalud(page: Page, salud: number): Promise<void> {
  try {
    logger.info('Setting salud', { salud });

    const saludExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.SALUD_INPUT);

    if (!saludExists) {
      logger.debug('Salud field not found, trying alternative');

      const saludAltExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.SALUD);
      if (!saludAltExists) {
        logger.warn('Salud field not found');
        return;
      }
    }

    const selector = (await elementExists(page, SELECTORS.LIQUIDACION.FORM.SALUD_INPUT))
      ? SELECTORS.LIQUIDACION.FORM.SALUD_INPUT
      : SELECTORS.LIQUIDACION.FORM.SALUD;

    // Check if readonly or auto-calculated
    const isReadonly = await esFieldReadonly(page, selector);
    if (isReadonly) {
      logger.debug('Salud field is readonly (auto-calculated)');
      return;
    }

    const saludCalculated = await verificarCalculoAutomatico(page, selector);

    if (saludCalculated) {
      logger.debug('Salud already calculated automatically');
      return;
    }

    logger.debug('Setting salud manually');
    await waitAndType(page, selector, String(salud), {
      clear: true,
      delay: 80,
    });

    await sleep(500);
    logger.debug('✅ Salud set successfully');
  } catch (error) {
    logger.error('Error setting salud', { error, salud });
    throw error;
  }
}

/**
 * Fill pensión field
 */
async function fillPension(page: Page, pension: number): Promise<void> {
  try {
    logger.info('Setting pensión', { pension });

    const pensionExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.PENSION_INPUT);

    if (!pensionExists) {
      logger.debug('Pensión field not found, trying alternative');

      const pensionAltExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.PENSION);
      if (!pensionAltExists) {
        logger.warn('Pensión field not found');
        return;
      }
    }

    const selector = (await elementExists(page, SELECTORS.LIQUIDACION.FORM.PENSION_INPUT))
      ? SELECTORS.LIQUIDACION.FORM.PENSION_INPUT
      : SELECTORS.LIQUIDACION.FORM.PENSION;

    // Check if readonly or auto-calculated
    const isReadonly = await esFieldReadonly(page, selector);
    if (isReadonly) {
      logger.debug('Pensión field is readonly (auto-calculated)');
      return;
    }

    const pensionCalculated = await verificarCalculoAutomatico(page, selector);

    if (pensionCalculated) {
      logger.debug('Pensión already calculated automatically');
      return;
    }

    logger.debug('Setting pensión manually');
    await waitAndType(page, selector, String(pension), {
      clear: true,
      delay: 80,
    });

    await sleep(500);
    logger.debug('✅ Pensión set successfully');
  } catch (error) {
    logger.error('Error setting pensión', { error, pension });
    throw error;
  }
}

/**
 * Fill ARL field and nivel de riesgo
 */
async function fillARL(page: Page, pilaData: PilaData): Promise<void> {
  try {
    logger.info('Setting ARL', {
      arl: pilaData.arl,
      nivelRiesgo: pilaData.nivelRiesgoARL,
    });

    // First, set nivel de riesgo if selector exists
    const nivelRiesgoExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ARL_NIVEL_RIESGO);

    if (nivelRiesgoExists && pilaData.nivelRiesgoARL) {
      logger.debug('Setting nivel de riesgo ARL', { nivel: pilaData.nivelRiesgoARL });

      await page.select(SELECTORS.LIQUIDACION.FORM.ARL_NIVEL_RIESGO, pilaData.nivelRiesgoARL).catch(
        async () => {
          // Try alternative: select by text
          await page.evaluate(
            (selector, nivel) => {
              const select = document.querySelector(selector) as any;
              if (select) {
                const options = Array.from(select.options) as any[];
                const option = options.find(
                  (opt: any) => opt.text.includes(nivel) || opt.value === nivel
                );
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            },
            SELECTORS.LIQUIDACION.FORM.ARL_NIVEL_RIESGO,
            pilaData.nivelRiesgoARL
          );
        }
      );

      await sleep(1000);
    }

    // Now set ARL value
    const arlExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ARL_INPUT);

    if (!arlExists) {
      logger.debug('ARL field not found, trying alternative');

      const arlAltExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.ARL);
      if (!arlAltExists) {
        logger.warn('ARL field not found');
        return;
      }
    }

    const selector = (await elementExists(page, SELECTORS.LIQUIDACION.FORM.ARL_INPUT))
      ? SELECTORS.LIQUIDACION.FORM.ARL_INPUT
      : SELECTORS.LIQUIDACION.FORM.ARL;

    // Check if readonly or auto-calculated
    const isReadonly = await esFieldReadonly(page, selector);
    if (isReadonly) {
      logger.debug('ARL field is readonly (auto-calculated)');
      return;
    }

    const arlCalculated = await verificarCalculoAutomatico(page, selector);

    if (arlCalculated) {
      logger.debug('ARL already calculated automatically');
      return;
    }

    logger.debug('Setting ARL manually');
    await waitAndType(page, selector, String(pilaData.arl), {
      clear: true,
      delay: 80,
    });

    await sleep(500);
    logger.debug('✅ ARL set successfully');
  } catch (error) {
    logger.error('Error setting ARL', { error, pilaData });
    throw error;
  }
}

/**
 * Verify total calculation
 */
async function verifyTotal(page: Page, expectedTotal: number): Promise<void> {
  try {
    logger.info('Verifying total calculation', { expectedTotal });

    // Try multiple selectors for total
    const totalSelectors = [
      SELECTORS.LIQUIDACION.FORM.TOTAL_DISPLAY,
      SELECTORS.LIQUIDACION.FORM.TOTAL,
      SELECTORS.LIQUIDACION.RESULTADO.VALOR_TOTAL,
    ];

    let totalText = '';
    let selectorUsed = '';

    for (const selector of totalSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        totalText = await page
          .$eval(selector, (el) => (el as any).textContent || (el as any).value || '')
          .catch(() => '');

        if (totalText) {
          selectorUsed = selector;
          break;
        }
      }
    }

    if (!totalText) {
      logger.warn('Could not find total display');
      return;
    }

    // Extract number from text (remove currency symbols, commas, etc.)
    const totalCalculated = parseInt(totalText.replace(/\D/g, ''), 10);

    if (isNaN(totalCalculated)) {
      logger.warn('Could not parse total value', { totalText });
      return;
    }

    logger.info('Total calculated by Enlace', {
      expected: expectedTotal,
      calculated: totalCalculated,
      selector: selectorUsed,
    });

    // Verify with tolerance (±100 for rounding differences)
    const difference = Math.abs(totalCalculated - expectedTotal);

    if (difference > 100) {
      logger.warn('⚠️  Total mismatch detected', {
        expected: expectedTotal,
        calculated: totalCalculated,
        difference,
        percentage: ((difference / expectedTotal) * 100).toFixed(2) + '%',
      });
      // Don't throw - this might be acceptable
    } else {
      logger.info('✅ Total verified successfully', {
        expected: expectedTotal,
        calculated: totalCalculated,
        difference,
      });
    }
  } catch (error) {
    logger.warn('Error verifying total', { error, expectedTotal });
    // Don't throw - verification is optional
  }
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

// ============================================================================
// CONFIRMATION AND PSE NAVIGATION
// ============================================================================

/**
 * Extended liquidation result with PSE navigation info
 */
export interface LiquidacionResultExtended {
  success: boolean;
  numeroPlanilla?: string;
  valorTotal?: number;
  fechaLimite?: Date;
  estadoPago: 'PENDIENTE' | 'EN_PROCESO';
  urlPSE?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Confirm PILA liquidation and navigate to PSE payment page
 * This function:
 * 1. Clicks "Calcular" button to validate form
 * 2. Clicks "Confirmar" or "Generar planilla"
 * 3. Waits for success message
 * 4. Extracts planilla number and fecha límite
 * 5. Navigates to PSE page (but STOPS before payment)
 *
 * @param context - Liquidation context
 * @param pilaData - PILA data (used for validation)
 * @returns Liquidation result with planilla info and PSE URL
 */
export async function confirmarLiquidacion(
  context: LiquidacionContext,
  pilaData: PilaData
): Promise<LiquidacionResultExtended> {
  const { page, numeroDocumento } = context;

  logger.info('Starting liquidation confirmation', {
    numeroDocumento,
    periodo: pilaData.periodo,
    total: pilaData.total,
  });

  const warnings: string[] = [];

  try {
    await browserManager.takeScreenshot(page, 'before-confirmation');

    // Step 1: Click "Calcular" button if exists (to validate form)
    await clickCalcularButton(page);

    // Step 2: Click "Confirmar" or "Generar planilla" button
    await clickConfirmarButton(page);

    // Step 3: Wait for success message
    await waitForSuccessMessage(page);

    logger.info('✅ Liquidation confirmed successfully');
    await browserManager.takeScreenshot(page, 'liquidacion-confirmed');

    // Step 4: Extract planilla number
    const numeroPlanilla = await extractNumeroPlanilla(page);

    if (!numeroPlanilla) {
      warnings.push('Could not extract planilla number from page');
      logger.warn('⚠️  Planilla number not found');
    } else {
      logger.info('Extracted planilla number', { numeroPlanilla });
    }

    // Step 5: Extract fecha límite
    const fechaLimite = await extractFechaLimitePago(page);

    if (!fechaLimite) {
      warnings.push('Could not extract fecha límite from page');
      logger.warn('⚠️  Fecha límite not found, using default (10 days)');
    } else {
      logger.info('Extracted fecha límite', { fechaLimite });
    }

    // Step 6: Navigate to PSE (but STOP before payment)
    logger.info('Navigating to PSE payment page (will STOP before payment)');
    const urlPSE = await navegarAPSE(page);

    if (!urlPSE) {
      warnings.push('Could not navigate to PSE automatically');
    }

    return {
      success: true,
      numeroPlanilla,
      valorTotal: pilaData.total,
      fechaLimite: fechaLimite || getDefaultFechaLimite(),
      estadoPago: 'PENDIENTE',
      urlPSE,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error('❌ Error confirming liquidation', {
      error,
      numeroDocumento,
      periodo: pilaData.periodo,
    });

    await browserManager.takeScreenshot(page, 'liquidacion-confirm-error');

    return {
      success: false,
      valorTotal: pilaData.total,
      estadoPago: 'PENDIENTE',
      error: error instanceof Error ? error.message : 'Unknown error during confirmation',
    };
  }
}

/**
 * Click "Calcular" button to validate form
 */
async function clickCalcularButton(page: Page): Promise<void> {
  try {
    const calcularExists = await elementExists(page, SELECTORS.LIQUIDACION.FORM.CALCULAR);

    if (!calcularExists) {
      logger.debug('Calcular button not found, skipping validation step');
      return;
    }

    logger.info('Clicking "Calcular" button to validate form');
    await waitAndClick(page, SELECTORS.LIQUIDACION.FORM.CALCULAR);
    await sleep(2000);

    await browserManager.takeScreenshot(page, 'after-calcular');

    // Wait for validation result (error or success message)
    try {
      await page.waitForFunction(
        () => {
          const errorMsg = document.querySelector('.error, .alert-danger, .text-danger') as any;
          const successMsg = document.querySelector('.success, .alert-success, .text-success') as any;
          return (errorMsg && errorMsg.textContent) || (successMsg && successMsg.textContent);
        },
        { timeout: 10000 }
      );
    } catch (e) {
      logger.debug('No validation message appeared, continuing');
    }

    // Check for error messages
    const errorMsg = await page
      .evaluate(() => {
        const error = document.querySelector('.error, .alert-danger, .text-danger') as any;
        return error?.textContent?.trim() || null;
      })
      .catch(() => null);

    if (errorMsg) {
      logger.error('Validation error from Enlace', { errorMsg });
      await browserManager.takeScreenshot(page, 'liquidacion-validation-error');
      throw new BotError(`Form validation error: ${errorMsg}`);
    }

    logger.debug('✅ Form validated successfully');
  } catch (error) {
    if (error instanceof BotError) {
      throw error;
    }
    logger.warn('Error during calcular step', { error });
    // Don't throw - this step is optional
  }
}

/**
 * Click "Confirmar" or "Generar planilla" button
 */
async function clickConfirmarButton(page: Page): Promise<void> {
  try {
    logger.info('Looking for Confirmar/Generar button');

    // Try multiple button selectors
    const buttonSelectors = [
      SELECTORS.LIQUIDACION.FORM.CONFIRMAR,
      SELECTORS.LIQUIDACION.FORM.GENERAR,
      SELECTORS.LIQUIDACION.FORM.GENERAR_PLANILLA,
      SELECTORS.LIQUIDACION.FORM.LIQUIDAR,
      SELECTORS.LIQUIDACION.FORM.VALIDAR,
    ];

    let buttonClicked = false;

    for (const selector of buttonSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        logger.info('Found confirmation button', { selector });
        await scrollToElement(page, selector);
        await randomDelay(500, 1000);
        await waitAndClick(page, selector);
        buttonClicked = true;
        logger.info('✅ Clicked confirmation button');
        break;
      }
    }

    if (!buttonClicked) {
      throw new BotError('Could not find Confirmar/Generar button');
    }

    // Wait for processing
    await sleep(3000);
    await browserManager.takeScreenshot(page, 'after-confirmar');
  } catch (error) {
    logger.error('Error clicking confirmation button', { error });
    await browserManager.takeScreenshot(page, 'confirmar-button-error');
    throw error;
  }
}

/**
 * Wait for success message after confirmation
 */
async function waitForSuccessMessage(page: Page): Promise<void> {
  try {
    logger.info('Waiting for success message');

    // Try multiple success message selectors
    const successSelectors = [
      SELECTORS.LIQUIDACION.RESULTADO.MENSAJE_EXITO,
      SELECTORS.COMMON.ALERT_SUCCESS,
      SELECTORS.COMMON.TOAST_SUCCESS,
      '.success',
      '.alert-success',
      '.mensaje-exito',
    ];

    let foundSuccess = false;

    for (const selector of successSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        foundSuccess = true;
        logger.info('Success message found', { selector });
        break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!foundSuccess) {
      logger.warn('No success message found with known selectors, checking for errors');

      // Check if there's an error message instead
      const errorExists = await elementExists(page, SELECTORS.COMMON.ALERT_ERROR);

      if (errorExists) {
        const errorText = await page.$eval(
          SELECTORS.COMMON.ALERT_ERROR,
          (el) => (el as any).textContent || ''
        );
        throw new BotError(`Liquidation failed: ${errorText}`);
      }

      // No success message but also no error - assume success
      logger.warn('No success/error message found, assuming success based on page state');
    }

    logger.debug('✅ Success message confirmed');
  } catch (error) {
    if (error instanceof BotError) {
      throw error;
    }
    logger.error('Error waiting for success message', { error });
    throw new BotError('Failed to confirm liquidation success');
  }
}

/**
 * Extract numero de planilla from page
 */
async function extractNumeroPlanilla(page: Page): Promise<string | undefined> {
  try {
    logger.info('Extracting numero de planilla');

    // Try multiple strategies
    const selectors = [
      SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA,
      SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA_DATA,
      SELECTORS.LIQUIDACION.RESULTADO.NUMERO_PLANILLA_CLASS,
      SELECTORS.LIQUIDACION.RESULT.NUMERO_PLANILLA,
      '[data-planilla]',
      '.numero-planilla',
    ];

    for (const selector of selectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        const numero = await page
          .$eval(selector, (el) => (el as any).textContent?.trim() || (el as any).value || '')
          .catch(() => '');

        if (numero && numero !== '0') {
          logger.info('Found planilla number', { numero, selector });
          return numero;
        }
      }
    }

    // Try regex pattern in page text
    const numeroPlanilla = await page
      .evaluate(() => {
        const text = document.body.innerText;
        // Matches: "Planilla No: 12345" or "Planilla 12345" or similar
        const match = text.match(/Planilla\s+(?:No[.:]?|N[°º]|#)?\s*(\d+)/i);
        return match ? match[1] : null;
      })
      .catch(() => null);

    if (numeroPlanilla) {
      logger.info('Found planilla number in text', { numeroPlanilla });
      return numeroPlanilla;
    }

    logger.warn('Could not extract planilla number');
    return undefined;
  } catch (error) {
    logger.warn('Error extracting planilla number', { error });
    return undefined;
  }
}

/**
 * Extract fecha límite de pago from page
 */
async function extractFechaLimitePago(page: Page): Promise<Date | undefined> {
  try {
    logger.info('Extracting fecha límite de pago');

    const selectors = [
      SELECTORS.LIQUIDACION.RESULTADO.FECHA_LIMITE,
      SELECTORS.LIQUIDACION.RESULTADO.FECHA_LIMITE_CLASS,
      SELECTORS.LIQUIDACION.RESULT.FECHA_LIMITE,
      '[data-fecha-limite]',
      '.fecha-limite',
    ];

    for (const selector of selectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        const fechaText = await page
          .$eval(selector, (el) => (el as any).textContent?.trim() || '')
          .catch(() => '');

        if (fechaText) {
          const fecha = parseFechaLimite(fechaText);
          if (fecha) {
            logger.info('Found fecha límite', { fecha, selector });
            return fecha;
          }
        }
      }
    }

    // Try to find date in page text
    const fechaFromText = await page
      .evaluate(() => {
        const text = document.body.innerText;
        // Look for patterns like "Fecha límite: DD/MM/YYYY"
        const match = text.match(/fecha\s+l[ií]mite.*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
        return match ? match[1] : null;
      })
      .catch(() => null);

    if (fechaFromText) {
      const fecha = parseFechaLimite(fechaFromText);
      if (fecha) {
        logger.info('Found fecha límite in text', { fecha });
        return fecha;
      }
    }

    logger.warn('Could not extract fecha límite');
    return undefined;
  } catch (error) {
    logger.warn('Error extracting fecha límite', { error });
    return undefined;
  }
}

/**
 * Parse fecha límite from text
 */
function parseFechaLimite(text: string): Date | undefined {
  try {
    // Try DD/MM/YYYY format
    let match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      const [, dia, mes, anio] = match;
      const fecha = new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
      if (!isNaN(fecha.getTime())) {
        return fecha;
      }
    }

    // Try YYYY-MM-DD format
    match = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
      const [, anio, mes, dia] = match;
      const fecha = new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
      if (!isNaN(fecha.getTime())) {
        return fecha;
      }
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Get default fecha límite (10 business days from now)
 */
function getDefaultFechaLimite(): Date {
  const fecha = new Date();
  let diasAgregados = 0;

  while (diasAgregados < 10) {
    fecha.setDate(fecha.getDate() + 1);

    // Skip weekends
    const diaSemana = fecha.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasAgregados++;
    }
  }

  return fecha;
}

/**
 * Navigate to PSE payment page (but STOP before completing payment)
 * This is Phase 3 requirement: navigate TO PSE but don't process payment
 *
 * @param page - Puppeteer page
 * @returns PSE URL if successfully navigated
 */
async function navegarAPSE(page: Page): Promise<string | undefined> {
  logger.info('Starting navigation to PSE (will STOP before payment)');

  try {
    await browserManager.takeScreenshot(page, 'before-pse-navigation');

    // Step 1: Look for "Pagar" button
    await clickPagarButton(page);

    // Step 2: Select PSE payment method
    await selectPSEPaymentMethod(page);

    // Step 3: Click "Pagar con PSE" or "Continuar"
    await clickPagarConPSEButton(page);

    // Step 4: Wait for PSE page/iframe to appear
    await waitForPSEPage(page);

    const currentUrl = page.url();

    logger.info('✅ Reached PSE page - STOPPING HERE (payment is Phase 8)', {
      url: currentUrl,
    });

    await browserManager.takeScreenshot(page, 'liquidacion-pse-reached');

    return currentUrl;
  } catch (error) {
    logger.warn('⚠️  Could not navigate to PSE automatically', { error });
    await browserManager.takeScreenshot(page, 'liquidacion-pse-error');

    // Don't throw - planilla is already liquidated
    // PSE navigation is optional enhancement
    return undefined;
  }
}

/**
 * Click "Pagar" button
 */
async function clickPagarButton(page: Page): Promise<void> {
  const pagarSelectors = [
    SELECTORS.LIQUIDACION.PSE.BOTON_PAGAR,
    'button:has-text("Pagar")',
    'a:has-text("Pagar")',
  ];

  for (const selector of pagarSelectors) {
    const exists = await elementExists(page, selector);
    if (exists) {
      logger.debug('Clicking "Pagar" button', { selector });
      await waitAndClick(page, selector);
      await sleep(2000);
      await browserManager.takeScreenshot(page, 'after-pagar-click');
      return;
    }
  }

  logger.debug('No "Pagar" button found, might already be on payment page');
}

/**
 * Select PSE payment method
 */
async function selectPSEPaymentMethod(page: Page): Promise<void> {
  const pseSelectors = [
    SELECTORS.LIQUIDACION.PSE.SELECCIONAR_PSE,
    SELECTORS.LIQUIDACION.PSE.RADIO_PSE,
    'input[type="radio"][value="PSE"]',
    'input[type="radio"][name="payment-method"][value="pse"]',
  ];

  for (const selector of pseSelectors) {
    const exists = await elementExists(page, selector);
    if (exists) {
      logger.debug('Selecting PSE payment method', { selector });
      await waitAndClick(page, selector);
      await sleep(1000);
      await browserManager.takeScreenshot(page, 'pse-method-selected');
      return;
    }
  }

  logger.debug('No PSE radio button found, might be auto-selected');
}

/**
 * Click "Pagar con PSE" button
 */
async function clickPagarConPSEButton(page: Page): Promise<void> {
  const pagarPSESelectors = [
    SELECTORS.LIQUIDACION.PSE.BOTON_PAGAR_PSE,
    SELECTORS.LIQUIDACION.PSE.CONTINUAR_PAGO,
    'button:has-text("Pagar con PSE")',
    'button:has-text("Continuar")',
    'button:has-text("Siguiente")',
  ];

  for (const selector of pagarPSESelectors) {
    const exists = await elementExists(page, selector);
    if (exists) {
      logger.debug('Clicking "Pagar con PSE" button', { selector });
      await waitAndClick(page, selector);
      await sleep(3000);
      await browserManager.takeScreenshot(page, 'after-pagar-pse-click');
      return;
    }
  }

  logger.debug('No "Pagar con PSE" button found');
}

/**
 * Wait for PSE page/iframe to appear
 */
async function waitForPSEPage(page: Page): Promise<void> {
  logger.info('Waiting for PSE page/iframe to appear');

  try {
    await page.waitForFunction(
      () => {
        // Check for PSE iframe
        const iframe = document.querySelector(
          'iframe[name*="pse"], iframe[src*="pse"], iframe[id*="pse"]'
        ) as any;

        // Check if URL contains PSE
        const urlContainsPSE = window.location.href.toLowerCase().includes('pse');

        // Check for PSE-related elements
        const pseElement = document.querySelector('[class*="pse"], [id*="pse"]') as any;

        return iframe || urlContainsPSE || pseElement;
      },
      { timeout: 15000 }
    );

    logger.info('✅ PSE page/iframe detected');
  } catch (error) {
    logger.warn('Could not detect PSE page with automatic checks');
    // Don't throw - we might already be there
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
   * Updated to use new llenarFormularioPila function
   */
  private async fillLiquidationForm(page: Page, pilaData: PilaData): Promise<void> {
    try {
      // Use new modular fill function
      const context: LiquidacionContext = {
        page,
        numeroDocumento: '', // Not needed for form filling
      };

      await llenarFormularioPila(context, pilaData);

      logger.info('✅ Liquidation form filled successfully (via new function)');
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
 * Uses bot class for compatibility with existing code
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

/**
 * Complete PILA liquidation with confirmation and PSE navigation
 * This is the NEW recommended flow that uses all new helper functions
 *
 * Flow:
 * 1. Navigate to liquidation and select user
 * 2. Select liquidation type (Planilla en línea)
 * 3. Fill PILA form with validation
 * 4. Confirm liquidation and extract planilla number
 * 5. Navigate to PSE (but STOP before payment)
 *
 * @param numeroDocumento - User document number
 * @param pilaData - PILA calculation data
 * @returns Extended liquidation result with PSE info
 */
export async function liquidarPilaConConfirmacion(
  numeroDocumento: string,
  pilaData: PilaData
): Promise<LiquidacionResultExtended> {
  logger.info('Starting complete PILA liquidation process with confirmation', {
    numeroDocumento,
    periodo: pilaData.periodo,
    total: pilaData.total,
  });

  try {
    // Step 1: Navigate to liquidation and select user
    logger.info('📍 Step 1/4: Navigating to liquidation');
    const context = await navegarALiquidacion(numeroDocumento);

    // Step 2: Select liquidation type (Planilla en línea)
    logger.info('📝 Step 2/4: Selecting liquidation type');
    await seleccionarTipoLiquidacion(context);

    // Step 3: Fill PILA form
    logger.info('✍️  Step 3/4: Filling PILA form');
    await llenarFormularioPila(context, pilaData);

    // Step 4: Confirm liquidation and navigate to PSE
    logger.info('✅ Step 4/4: Confirming liquidation and navigating to PSE');
    const result = await confirmarLiquidacion(context, pilaData);

    logger.info('🎉 PILA liquidation process completed successfully', {
      success: result.success,
      numeroPlanilla: result.numeroPlanilla,
      urlPSE: result.urlPSE,
    });

    return result;
  } catch (error) {
    logger.error('❌ PILA liquidation process failed', {
      error,
      numeroDocumento,
      periodo: pilaData.periodo,
    });

    return {
      success: false,
      valorTotal: pilaData.total,
      estadoPago: 'PENDIENTE',
      error: error instanceof Error ? error.message : 'Unknown error in liquidation process',
    };
  }
}
