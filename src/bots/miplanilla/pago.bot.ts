/**
 * Mi Planilla Pago Bot
 * Maneja el flujo de pago PSE en Mi Planilla
 *
 * Flujo:
 * 1. Login (si no está autenticado)
 * 2. Ir a planillas disponibles para pago
 * 3. Click "Paga aquí" en la planilla
 * 4. Seleccionar medio de pago PSE
 * 5. Seleccionar banco y tipo de cliente
 * 6. Redirigir al banco (flujo PSE estándar)
 *
 * NOTA: El flujo PSE es idéntico al de SOI, reutiliza pse-session.manager.ts
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
  MiPlanillaPagoResult,
} from '../../types/miplanilla.types';

export interface MiPlanillaPagoRequest {
  // Credenciales
  tipoDocumento: string;
  documento: string;
  password: string;

  // Planilla a pagar
  numeroPlanilla: string;

  // Banco
  banco: string; // BANCOLOMBIA, etc.
  tipoCliente?: string; // Persona Natural (default)
}

export class MiPlanillaPagoBot {
  private authBot: MiPlanillaAuthBot;

  constructor() {
    this.authBot = getMiPlanillaAuthBot();
  }

  /**
   * Inicia el flujo de pago PSE para una planilla
   * Retorna cuando llega a la página del banco
   */
  async iniciarPago(request: MiPlanillaPagoRequest): Promise<{
    success: boolean;
    page?: Page;
    browserManager?: BrowserManager;
    urlBanco?: string;
    message: string;
    error?: string;
  }> {
    logger.info('Starting payment flow in Mi Planilla', {
      documento: request.documento,
      numeroPlanilla: request.numeroPlanilla,
      banco: request.banco,
    });

    const browserManager = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/miplanilla-pago',
    });

    try {
      // Autenticar
      const credentials: MiPlanillaCredentials = {
        tipoDocumento: request.tipoDocumento as any,
        documento: request.documento,
        password: request.password,
      };

      const page = await this.authBot.ensureAuthenticated(credentials);

      // === PASO 1: Ir a planillas disponibles para pago ===
      await this.navegarAPlanillasPago(page, browserManager);

      // === PASO 2: Click "Paga aquí" en la planilla ===
      await this.clickPagarPlanilla(page, browserManager, request.numeroPlanilla);

      // === PASO 3: Seleccionar medio de pago PSE ===
      await this.seleccionarMedioPago(page, browserManager);

      // === PASO 4: Seleccionar banco y continuar ===
      const urlBanco = await this.seleccionarBancoYContinuar(
        page,
        browserManager,
        request.banco,
        request.tipoCliente
      );

      logger.info('Payment flow initiated, redirected to bank', {
        numeroPlanilla: request.numeroPlanilla,
        urlBanco,
      });

      // Retornar la página para que el PSE session manager tome control
      return {
        success: true,
        page,
        browserManager,
        urlBanco,
        message: 'Flujo de pago iniciado, esperando acción en el banco',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error initiating payment in Mi Planilla', {
        documento: request.documento,
        numeroPlanilla: request.numeroPlanilla,
        error: errorMsg,
      });

      return {
        success: false,
        message: 'Error al iniciar pago en Mi Planilla',
        error: errorMsg,
      };
    }
  }

  /**
   * Flujo completo de pago (sin intervención manual)
   * Solo para casos donde no se necesita clave dinámica
   */
  async pagarPlanilla(request: MiPlanillaPagoRequest): Promise<MiPlanillaPagoResult> {
    logger.info('Starting full payment flow in Mi Planilla', {
      documento: request.documento,
      numeroPlanilla: request.numeroPlanilla,
    });

    try {
      const result = await this.iniciarPago(request);

      if (!result.success) {
        return {
          success: false,
          message: result.message,
          error: result.error,
        };
      }

      // En este punto estamos en la página del banco
      // El flujo PSE requiere intervención manual para la clave dinámica
      // Retornar que estamos esperando

      return {
        success: true,
        banco: request.banco,
        message: 'Esperando confirmación de pago en el banco',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in full payment flow', {
        documento: request.documento,
        error: errorMsg,
      });

      return {
        success: false,
        message: 'Error en el flujo de pago',
        error: errorMsg,
      };
    }
  }

  /**
   * Navega a la lista de planillas disponibles para pago
   */
  private async navegarAPlanillasPago(page: Page, browserManager: BrowserManager): Promise<void> {
    logger.info('Navigating to planillas for payment');

    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await browserManager.takeScreenshot(page, 'miplanilla-pago-planillas');
    await page.waitForTimeout(1000);

    logger.info('Reached planillas page');
  }

  /**
   * Click en "Paga aquí" de la planilla específica
   */
  private async clickPagarPlanilla(
    page: Page,
    browserManager: BrowserManager,
    numeroPlanilla: string
  ): Promise<void> {
    logger.info('Clicking pay for planilla', { numeroPlanilla });

    // Buscar la fila de la planilla y hacer click en "Paga aquí"
    const clicked = await page.evaluate((numPlanilla) => {
      // Buscar en la tabla
      const rows = document.querySelectorAll('tr, [class*="fila"], [class*="row"]');
      for (const row of rows) {
        const rowText = row.textContent || '';
        if (rowText.includes(numPlanilla)) {
          // Buscar botón de pagar en esta fila
          const payButton = row.querySelector(
            'button, a'
          ) as HTMLElement;

          // Buscar específicamente botones que digan "Paga" o "Pagar"
          const buttons = row.querySelectorAll('button, a');
          for (const btn of buttons) {
            const btnText = (btn as HTMLElement).innerText?.toLowerCase() || '';
            if (btnText.includes('paga') || btnText.includes('pagar')) {
              (btn as HTMLElement).click();
              return true;
            }
          }

          // Si no encontramos botón específico, click en el primero
          if (payButton) {
            payButton.click();
            return true;
          }
        }
      }

      // Si no encontramos por número, buscar el primer botón "Paga aquí"
      const allPayButtons = document.querySelectorAll('button, a');
      for (const btn of allPayButtons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('paga')) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      return false;
    }, numeroPlanilla);

    if (!clicked) {
      // Intentar con selectores
      await this.clickElement(page, MIPLANILLA_SELECTORS.btnPagarAqui, 'Paga aquí');
    }

    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'miplanilla-pago-resumen');

    logger.info('Clicked pay button');
  }

  /**
   * Selecciona PSE como medio de pago
   */
  private async seleccionarMedioPago(page: Page, browserManager: BrowserManager): Promise<void> {
    logger.info('Selecting PSE payment method');

    await browserManager.takeScreenshot(page, 'miplanilla-pago-medio');

    // Click en PSE
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioPSE, 'Pago por PSE');
    await page.waitForTimeout(1000);

    // Click en "Seleccionar medio de pago"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnSeleccionarMedioPago, 'Seleccionar medio de pago');
    await page.waitForTimeout(2000);

    await browserManager.takeScreenshot(page, 'miplanilla-pago-pse-selected');
    logger.info('PSE selected as payment method');
  }

  /**
   * Selecciona el banco y continúa al flujo PSE
   */
  private async seleccionarBancoYContinuar(
    page: Page,
    browserManager: BrowserManager,
    banco: string,
    tipoCliente?: string
  ): Promise<string> {
    logger.info('Selecting bank and continuing', { banco, tipoCliente });

    await browserManager.takeScreenshot(page, 'miplanilla-pago-banco-page');

    // Seleccionar tipo de cliente (default: Persona Natural)
    const tipo = tipoCliente || 'Persona Natural';
    await this.selectOption(page, MIPLANILLA_SELECTORS.selectTipoCliente, tipo);
    await page.waitForTimeout(500);

    // Seleccionar banco
    await this.selectOption(page, MIPLANILLA_SELECTORS.selectBanco, banco);
    await page.waitForTimeout(500);

    await browserManager.takeScreenshot(page, 'miplanilla-pago-banco-selected');

    // Click en "Continuar con el pago"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnContinuarPago, 'Continuar con el pago');

    // Esperar redirección al banco
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    await browserManager.takeScreenshot(page, 'miplanilla-pago-banco');

    logger.info('Redirected to bank', { url: currentUrl });

    return currentUrl;
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
              return;
            }
          }
        }
      } catch {
        continue;
      }
    }

    // Último intento por texto
    const clicked = await page.evaluate((searchText) => {
      const elements = document.querySelectorAll('button, a, input[type="submit"], label');
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
   * Cierra el bot
   */
  async close(): Promise<void> {
    await this.authBot.close();
  }
}

/**
 * Función helper para iniciar pago en Mi Planilla
 */
export async function iniciarPagoMiPlanilla(request: MiPlanillaPagoRequest) {
  const bot = new MiPlanillaPagoBot();
  return bot.iniciarPago(request);
}

export default MiPlanillaPagoBot;
