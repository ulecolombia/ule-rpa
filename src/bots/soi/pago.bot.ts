/**
 * SOI Payment Bot
 * Maneja el flujo completo de pago de planillas PILA en SOI via PSE
 *
 * Flujo descubierto (2026-02-21):
 * 1. Dashboard → Click en img[src*="pagar.png"] (botón $ en tabla)
 * 2. Página detalle planilla → Scroll → Click en img[src*="pse"]
 * 3. Diálogo "Advertencia" → Click botón "Sí"
 * 4. Formulario PSE:
 *    - codTipoEntidad → JURIDICA
 *    - codEntidadFinanciera → BANCOLOMBIA
 * 5. Click botón "Pagar" → Redirige al banco
 */

import { Page } from 'puppeteer';
import { getSOIAuthBot, SOIAuthBot } from './auth.bot';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import { BotError } from '../utils/errors';

export interface SOIPagoData {
  // Planilla a pagar
  numeroPlanilla: string;
  valorTotal: number;

  // Datos PSE (opcional - usa ULE por defecto)
  pse?: {
    tipoPersona?: 'Natural' | 'Jurídica';
    tipoDocumento?: string;
    numeroDocumento?: string;
    email?: string;
    banco?: string;
  };
}

export interface SOIPagoResult {
  success: boolean;
  numeroPlanilla: string;
  valorTotal: number;
  estadoPago: 'PENDIENTE' | 'EN_PROCESO' | 'PAGADA' | 'RECHAZADA' | 'ERROR';
  transaccionId?: string;
  urlBanco?: string;
  fechaPago?: Date;
  comprobante?: string;
  message: string;
  error?: string;
  awaitingBankRedirect?: boolean;
}

export class SOIPagoBot {
  private authBot: SOIAuthBot;

  constructor() {
    this.authBot = getSOIAuthBot();
  }

  /**
   * Procesa el pago de una planilla PILA via PSE
   * Flujo real descubierto: Dashboard → pagar.png → PSE → Advertencia "Sí" → Formulario → Pagar
   */
  async pagarPlanilla(data: SOIPagoData): Promise<SOIPagoResult> {
    logger.info('Starting SOI payment process', {
      numeroPlanilla: data.numeroPlanilla,
      valorTotal: data.valorTotal,
    });

    try {
      // Asegurar autenticación
      const page = await this.authBot.ensureAuthenticated();

      // PASO 1: Ir al Dashboard y buscar botón Pagar de la planilla
      logger.info('Step 1: Navigating to dashboard and finding payment button');
      await page.goto(SOI_SELECTORS.URLS.BASE + '/inicio.do', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      await page.waitForTimeout(2000);
      await this.takeScreenshot(page, 'pago-01-dashboard');

      // Click en imagen pagar.png (botón $ en la tabla de planillas)
      const pagarImg = await page.$('img[src*="pagar.png"]');
      if (!pagarImg) {
        // Fallback: buscar por onclick
        const clicked = await page.evaluate(() => {
          const imgs = document.querySelectorAll('img[onclick*="inicioPagoPlanillas"]');
          if (imgs.length > 0) {
            (imgs[0] as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!clicked) {
          return {
            success: false,
            numeroPlanilla: data.numeroPlanilla,
            valorTotal: data.valorTotal,
            estadoPago: 'ERROR',
            message: 'No se encontró botón de pago en el dashboard',
            error: 'PAGAR_BUTTON_NOT_FOUND',
          };
        }
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
          pagarImg.click(),
        ]);
      }

      await page.waitForTimeout(2000);
      await this.takeScreenshot(page, 'pago-02-detalle-planilla');
      logger.info('Navigated to payment detail page', { url: page.url() });

      // PASO 2: En la página de detalle, scroll y click en imagen PSE
      logger.info('Step 2: Clicking PSE payment option');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      const pseImg = await page.$('img[src*="pse"]');
      if (pseImg) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
          pseImg.click(),
        ]);
      } else {
        // Fallback: buscar imagen PSE en todo el DOM
        await page.evaluate(() => {
          const imgs = document.querySelectorAll('img');
          for (const img of imgs) {
            if ((img as HTMLImageElement).src.toLowerCase().includes('pse')) {
              (img.closest('a') || img as HTMLElement).click();
              return;
            }
          }
        });
        await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
      }

      await page.waitForTimeout(2000);
      await this.takeScreenshot(page, 'pago-03-despues-pse');

      // PASO 3: Manejar diálogo de Advertencia → Click "Sí"
      logger.info('Step 3: Handling warning dialog');
      const hayAdvertencia = await page.evaluate(() => {
        const texto = document.body.innerText;
        return texto.includes('Advertencia') && texto.includes('Desea continuar');
      });

      if (hayAdvertencia) {
        logger.info('Warning dialog detected, clicking "Sí"');
        await page.evaluate(() => {
          // Buscar botón "Sí" o "Si"
          const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
          for (const btn of buttons) {
            const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').trim().toLowerCase();
            if (texto === 'sí' || texto === 'si' || texto === 'yes') {
              (btn as HTMLElement).click();
              return;
            }
          }
          // Buscar por value exacto
          const inputs = document.querySelectorAll('input[value="Si"], input[value="Sí"], input[value="SI"]');
          if (inputs.length > 0) {
            (inputs[0] as HTMLElement).click();
          }
        });

        await page.waitForTimeout(3000);
        await this.takeScreenshot(page, 'pago-04-despues-si');
      }

      // PASO 4: Llenar formulario PSE
      logger.info('Step 4: Filling PSE form');
      await page.waitForTimeout(2000);

      // Configurar datos PSE (ULE por defecto)
      const tipoAportante = data.pse?.tipoPersona === 'Natural' ? 'NATURAL' : 'JURIDICA';
      const banco = data.pse?.banco || SOI_SELECTORS.PSE_ULE.BANCO_DEFAULT;

      // Seleccionar Tipo de Aportante (JURIDICA para ULE)
      await page.evaluate((tipo) => {
        const select = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
        if (select) {
          const option = Array.from(select.options).find(o =>
            o.value.toUpperCase() === tipo || o.text.toUpperCase() === tipo
          );
          if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, tipoAportante);
      await page.waitForTimeout(500);

      // Seleccionar Entidad Financiera (banco)
      await page.evaluate((bancoNombre) => {
        const select = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
        if (select) {
          const option = Array.from(select.options).find(o =>
            o.text.toUpperCase().includes(bancoNombre.toUpperCase())
          );
          if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, banco);
      await page.waitForTimeout(500);

      await this.takeScreenshot(page, 'pago-05-formulario-lleno');

      // Verificar que los campos se llenaron correctamente
      const formData = await page.evaluate(() => {
        const tipoSelect = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
        const bancoSelect = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
        return {
          tipoAportante: tipoSelect?.options[tipoSelect.selectedIndex]?.text || 'N/A',
          banco: bancoSelect?.options[bancoSelect.selectedIndex]?.text || 'N/A',
        };
      });

      logger.info('PSE form filled', formData);

      // PASO 5: Click en botón "Pagar" para ir a página PSE (registro.pse.com.co)
      logger.info('Step 5: Clicking Pagar button');

      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
        for (const inp of inputs) {
          const value = (inp as HTMLInputElement).value || (inp as HTMLElement).innerText || '';
          if (value.toLowerCase().includes('pagar')) {
            (inp as HTMLElement).click();
            return;
          }
        }
      });

      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      await this.takeScreenshot(page, 'pago-06-pagina-pse');

      const urlDespuesPagar = page.url();
      logger.info('After Pagar click', { url: urlDespuesPagar });

      // PASO 6: Página PSE (registro.pse.com.co) - Ingresar NIT y Email de ULE
      if (urlDespuesPagar.includes('pse.com.co')) {
        logger.info('Step 6: On PSE page - filling ULE data');

        // Click en tab "Jurídica" si no está seleccionado
        await page.evaluate(() => {
          const tabs = document.querySelectorAll('[role="tab"], button, a');
          for (const tab of tabs) {
            const text = (tab as HTMLElement).innerText || '';
            if (text.toLowerCase().includes('jurídica') || text.toLowerCase().includes('juridica')) {
              (tab as HTMLElement).click();
              return;
            }
          }
        });
        await page.waitForTimeout(1000);

        // Ingresar NIT
        const nitULE = data.pse?.numeroDocumento || SOI_SELECTORS.PSE_ULE.NUMERO_DOCUMENTO;
        const nitInput = await page.$('input[placeholder*="NIT"], input[name*="nit"], input[id*="nit"]');
        if (nitInput) {
          await nitInput.click({ clickCount: 3 });
          await nitInput.type(nitULE, { delay: 50 });
        } else {
          await page.evaluate((nit) => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
            for (const inp of inputs) {
              const placeholder = (inp as HTMLInputElement).placeholder?.toLowerCase() || '';
              const label = inp.closest('div, label')?.textContent?.toLowerCase() || '';
              if (placeholder.includes('nit') || label.includes('nit')) {
                (inp as HTMLInputElement).value = nit;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return;
              }
            }
          }, nitULE);
        }
        await page.waitForTimeout(500);

        // Ingresar Email
        const emailULE = data.pse?.email || SOI_SELECTORS.PSE_ULE.EMAIL;
        const emailInput = await page.$('input[placeholder*="mail"], input[type="email"], input[name*="email"], input[name*="correo"]');
        if (emailInput) {
          await emailInput.click({ clickCount: 3 });
          await emailInput.type(emailULE, { delay: 50 });
        } else {
          await page.evaluate((email) => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');
            for (const inp of inputs) {
              const placeholder = (inp as HTMLInputElement).placeholder?.toLowerCase() || '';
              const label = inp.closest('div, label')?.textContent?.toLowerCase() || '';
              if (placeholder.includes('mail') || placeholder.includes('correo') || label.includes('correo')) {
                (inp as HTMLInputElement).value = email;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return;
              }
            }
          }, emailULE);
        }

        await page.waitForTimeout(1000);
        await this.takeScreenshot(page, 'pago-07-pse-datos-llenos');

        // PASO 7: Click en "Ir al Banco"
        logger.info('Step 7: Clicking "Ir al Banco"');

        const [irAlBancoBtn] = await page.$x("//button[contains(., 'Ir al Banco')] | //a[contains(., 'Ir al Banco')]");
        if (irAlBancoBtn) {
          await page.evaluate((el) => (el as Element).scrollIntoView({ behavior: 'smooth', block: 'center' }), irAlBancoBtn);
          await page.waitForTimeout(500);

          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
            (irAlBancoBtn as any).click(),
          ]);
        } else {
          // Fallback
          await page.evaluate(() => {
            const elements = document.querySelectorAll('button, input[type="submit"], a');
            for (const el of elements) {
              const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || '').toLowerCase();
              if (text.includes('ir al banco')) {
                (el as HTMLElement).click();
                return;
              }
            }
          });
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
        }

        await page.waitForTimeout(5000);
        await this.takeScreenshot(page, 'pago-08-bancolombia');

        const urlBanco = page.url();
        logger.info('Redirected to bank', { url: urlBanco });

        // PASO 8: En Bancolombia, click en "Bancolombia Negocios"
        if (urlBanco.includes('bancolombia')) {
          logger.info('Step 8: Clicking "Bancolombia Negocios"');

          await page.waitForTimeout(2000);

          const [negociosBtn] = await page.$x("//*[contains(text(), 'Bancolombia Negocios')]/ancestor::*[self::button or self::a or self::div[@role='button'] or contains(@class, 'card')]");
          if (negociosBtn) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
              (negociosBtn as any).click(),
            ]);
          } else {
            // Fallback: buscar por texto
            await page.evaluate(() => {
              const elements = document.querySelectorAll('div, button, a, span');
              for (const el of elements) {
                const text = (el as HTMLElement).innerText || '';
                if (text.includes('Bancolombia Negocios')) {
                  const clickable = el.closest('button') || el.closest('a') || el.closest('[role="button"]') || el;
                  (clickable as HTMLElement).click();
                  return;
                }
              }
            });
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
          }

          await page.waitForTimeout(3000);
          await this.takeScreenshot(page, 'pago-09-bancolombia-negocios');

          const urlFinal = page.url();
          logger.info('Final URL after Bancolombia Negocios', { url: urlFinal });

          return {
            success: true,
            numeroPlanilla: data.numeroPlanilla,
            valorTotal: data.valorTotal,
            estadoPago: 'EN_PROCESO',
            urlBanco: urlFinal,
            message: `Redirigido a Bancolombia Negocios - Tipo: ${formData.tipoAportante}, Banco: ${formData.banco}`,
            awaitingBankRedirect: true,
          };
        }

        return {
          success: true,
          numeroPlanilla: data.numeroPlanilla,
          valorTotal: data.valorTotal,
          estadoPago: 'EN_PROCESO',
          urlBanco,
          message: `Redirigido al banco - Tipo: ${formData.tipoAportante}, Banco: ${formData.banco}`,
          awaitingBankRedirect: true,
        };
      }

      // Si no llegamos a PSE, retornamos el estado actual
      return {
        success: true,
        numeroPlanilla: data.numeroPlanilla,
        valorTotal: data.valorTotal,
        estadoPago: 'EN_PROCESO',
        urlBanco: urlDespuesPagar,
        message: `Formulario PSE procesado - Tipo: ${formData.tipoAportante}, Banco: ${formData.banco}`,
        awaitingBankRedirect: true,
      };

    } catch (error) {
      logger.error('Error in SOI payment process', {
        numeroPlanilla: data.numeroPlanilla,
        error: error instanceof Error ? error.message : String(error),
      });

      const page = this.authBot.getPage();
      if (page) {
        await page.screenshot({
          path: `screenshots/soi-pago-error-${Date.now()}.png`,
          fullPage: true,
        });
      }

      return {
        success: false,
        numeroPlanilla: data.numeroPlanilla,
        valorTotal: data.valorTotal,
        estadoPago: 'ERROR',
        message: error instanceof Error ? error.message : 'Error desconocido',
        error: 'PAYMENT_ERROR',
      };
    }
  }

  /**
   * Navega a la página de gestión de planillas usando el menú interno
   * IMPORTANTE: No usar URLs directas porque se pierde la sesión
   */
  private async navegarAGestionPlanillas(page: Page): Promise<void> {
    logger.info('Navigating to planilla management via internal menu');

    // Después del login, estamos en el dashboard con planillas disponibles
    // Verificar si ya estamos en la página correcta (tiene tabla de planillas)
    const hasPlanllaTable = await page.evaluate(() => {
      return document.querySelector('table') !== null ||
             document.querySelector('[class*="planilla"]') !== null ||
             document.body.textContent?.includes('planillas disponibles');
    });

    if (hasPlanllaTable) {
      logger.info('Already on planilla dashboard');
      await this.takeScreenshot(page, 'pago-1-dashboard');
      return;
    }

    // Si no estamos en el dashboard, buscar el menú "Gestionar Planillas"
    const menuClicked = await page.evaluate(() => {
      // Buscar en el menú lateral
      const menuItems = document.querySelectorAll('a, button, [class*="menu"]');
      for (const item of menuItems) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes('gestionar planillas') || text.includes('gestionar planilla')) {
          (item as HTMLElement).click();
          return true;
        }
      }

      // Buscar "+ planillas para pago"
      const planillasBtn = document.querySelector('button:has-text("planillas para pago"), a:has-text("planillas para pago")');
      if (planillasBtn) {
        (planillasBtn as HTMLElement).click();
        return true;
      }

      return false;
    });

    if (menuClicked) {
      await page.waitForTimeout(2000);
      logger.info('Clicked on Gestionar Planillas menu');
    }

    await this.takeScreenshot(page, 'pago-1-gestionar-planillas');
    logger.info('Planilla management page loaded');
  }

  /**
   * En el dashboard de SOI, las planillas ya están visibles
   * Solo necesitamos verificar si hay planillas disponibles para pago
   */
  private async seleccionarPlanillasEnLinea(page: Page): Promise<void> {
    logger.info('Checking available planillas for payment');

    // El dashboard ya muestra "Últimas planillas disponibles"
    // Verificar si hay el botón "+ planillas para pago"
    try {
      const masPlanllas = await this.findClickableElement(page, [
        'button:has-text("planillas para pago")',
        'a:has-text("planillas para pago")',
        '[class*="planillas-pago"]',
      ]);

      if (masPlanllas) {
        await masPlanllas.click();
        await page.waitForTimeout(2000);
        logger.info('Clicked on "+ planillas para pago"');
      }
    } catch (error) {
      logger.info('No additional planillas button found, using dashboard view');
    }

    await this.takeScreenshot(page, 'pago-2-planillas-disponibles');
  }

  /**
   * Busca una planilla y hace click en su botón "Pagar"
   * En el dashboard de SOI, cada planilla tiene un botón "Pagar" directo
   */
  private async seleccionarPlanilla(
    page: Page,
    numeroPlanilla: string
  ): Promise<boolean> {
    logger.info('Searching for planilla to pay', { numeroPlanilla });

    try {
      // Esperar a que cargue la tabla
      await page.waitForSelector('table', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Buscar la planilla y hacer click en su botón "Pagar"
      const found = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, table tr');

        for (const row of rows) {
          const rowText = row.textContent || '';

          // Verificar si esta fila contiene el número de planilla
          // O si no se especificó uno, usar la primera fila con botón pagar
          const isTargetRow = numPlanilla ? rowText.includes(numPlanilla) : true;

          if (isTargetRow) {
            // Buscar el botón "Pagar" en esta fila (puede ser un icono de $)
            const pagarBtn = row.querySelector(
              'button[title*="Pagar"], a[title*="Pagar"], ' +
              'button[class*="pagar"], a[class*="pagar"], ' +
              '[onclick*="pagar"], [onclick*="Pagar"], ' +
              'td button, td a'
            ) as HTMLElement;

            // También buscar por icono o SVG
            const icons = row.querySelectorAll('svg, i, img, button, a');
            for (const icon of icons) {
              const parent = icon.closest('td');
              if (parent) {
                const headerIndex = Array.from(row.children).indexOf(parent);
                // El botón Pagar suele estar en las últimas columnas
                if (headerIndex >= 6) {
                  (icon as HTMLElement).click();
                  return { clicked: true, planilla: numPlanilla || 'primera' };
                }
              }
            }

            if (pagarBtn) {
              pagarBtn.click();
              return { clicked: true, planilla: numPlanilla || 'primera' };
            }

            // Si no hay botón pagar, seleccionar el checkbox
            const checkbox = row.querySelector(
              'input[type="checkbox"]'
            ) as HTMLInputElement;

            if (checkbox) {
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              checkbox.click();
              return { clicked: false, selected: true, planilla: numPlanilla || 'primera' };
            }
          }
        }

        // Si no se encontró la planilla específica, intentar el primer botón pagar
        const firstPagarBtn = document.querySelector(
          'table button[title*="Pagar"], table a[title*="Pagar"], ' +
          'table [class*="pagar"], table td:last-child button'
        ) as HTMLElement;

        if (firstPagarBtn) {
          firstPagarBtn.click();
          return { clicked: true, planilla: 'primera disponible' };
        }

        return null;
      }, numeroPlanilla);

      await page.waitForTimeout(1500);
      await this.takeScreenshot(page, 'pago-3-planilla-seleccionada');

      if (found) {
        if (found.clicked) {
          logger.info('Clicked Pagar button for planilla', { planilla: found.planilla });
          return true;
        } else if (found.selected) {
          logger.info('Planilla checkbox selected', { planilla: found.planilla });
          return true;
        }
      }

      logger.warn('No planilla found or no Pagar button available');
      return false;
    } catch (error) {
      logger.error('Error selecting planilla', { error });
      return false;
    }
  }

  /**
   * Click en el botón continuar
   */
  private async clickContinuar(page: Page): Promise<void> {
    logger.info('Clicking continue button');

    const continueButton = await this.findClickableElement(page, [
      'button:has-text("Continuar")',
      'input[value="Continuar"]',
      'a:has-text("Continuar")',
      'button:has-text("Siguiente")',
      'input[value="Siguiente"]',
      '.btn-continuar',
      '.btn-primary:has-text("Continuar")',
    ]);

    if (continueButton) {
      await continueButton.click();
      await page.waitForTimeout(2000);
      logger.info('Continue button clicked');
    } else {
      throw new BotError('Could not find continue button', 'SOI_PAGO');
    }

    await this.takeScreenshot(page, 'pago-5-despues-continuar');
  }

  /**
   * Acepta términos y condiciones (marca todos los checkboxes requeridos)
   */
  private async aceptarTerminos(page: Page): Promise<void> {
    logger.info('Accepting terms and conditions');

    // Marcar todos los checkboxes disponibles
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll(
        'input[type="checkbox"]:not(:checked)'
      );

      checkboxes.forEach((checkbox) => {
        const cb = checkbox as HTMLInputElement;
        // Solo marcar si parece ser de términos/autorización
        const label = cb.closest('label')?.textContent || '';
        const name = cb.name?.toLowerCase() || '';
        const id = cb.id?.toLowerCase() || '';

        if (
          label.includes('acepto') ||
          label.includes('autorizo') ||
          label.includes('términos') ||
          label.includes('terminos') ||
          label.includes('datos') ||
          label.includes('tratamiento') ||
          name.includes('acepto') ||
          name.includes('termino') ||
          name.includes('autorizo') ||
          id.includes('acepto') ||
          id.includes('termino') ||
          id.includes('autorizo')
        ) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    await page.waitForTimeout(500);
    await this.takeScreenshot(page, 'pago-6-terminos-aceptados');

    logger.info('Terms accepted');
  }

  /**
   * Selecciona PSE como método de pago
   */
  private async seleccionarPSE(page: Page): Promise<void> {
    logger.info('Selecting PSE payment method');

    const pseButton = await this.findClickableElement(page, [
      'button:has-text("PSE")',
      'a:has-text("PSE")',
      'input[value="PSE"]',
      '[data-pago="pse"]',
      '.metodo-pago-pse',
      'label:has-text("PSE") input',
      'input[type="radio"][value*="pse" i]',
      '.btn-pse',
    ]);

    if (pseButton) {
      await pseButton.click();
      await page.waitForTimeout(1500);
      logger.info('PSE payment method selected');
    } else {
      // Intentar buscar dentro de un formulario de métodos de pago
      const selected = await page.evaluate(() => {
        // Buscar radio buttons de método de pago
        const radios = document.querySelectorAll('input[type="radio"]');
        for (const radio of radios) {
          const label =
            radio.closest('label')?.textContent ||
            document.querySelector(`label[for="${radio.id}"]`)?.textContent ||
            '';

          if (label.toLowerCase().includes('pse')) {
            (radio as HTMLInputElement).checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }

        // Buscar botones o links
        const elements = document.querySelectorAll('button, a, .btn');
        for (const el of elements) {
          if (el.textContent?.toLowerCase().includes('pse')) {
            (el as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!selected) {
        throw new BotError('Could not find PSE payment option', 'SOI_PAGO');
      }
    }

    await this.takeScreenshot(page, 'pago-7-pse-seleccionado');
  }

  /**
   * Llena el formulario de datos PSE
   */
  private async llenarFormularioPSE(
    page: Page,
    pseData?: SOIPagoData['pse']
  ): Promise<void> {
    logger.info('Filling PSE form');

    // Usar datos de ULE por defecto
    const tipoPersona = pseData?.tipoPersona || SOI_SELECTORS.PSE_ULE.TIPO_PERSONA;
    const tipoDocumento = pseData?.tipoDocumento || SOI_SELECTORS.PSE_ULE.TIPO_DOCUMENTO;
    const numeroDocumento = pseData?.numeroDocumento || SOI_SELECTORS.PSE_ULE.NUMERO_DOCUMENTO;
    const email = pseData?.email || SOI_SELECTORS.PSE_ULE.EMAIL;
    const banco = pseData?.banco || SOI_SELECTORS.PSE_ULE.BANCO_DEFAULT;

    // 1. Tipo de persona (Jurídica)
    await this.selectOption(page, SOI_SELECTORS.PAGO.SELECT_TIPO_PERSONA, tipoPersona);
    await page.waitForTimeout(500);

    // 2. Tipo de documento (NIT)
    await this.selectOption(page, SOI_SELECTORS.PAGO.SELECT_TIPO_DOC_PSE, tipoDocumento);
    await page.waitForTimeout(300);

    // 3. Número de documento (NIT ULE)
    await this.fillInput(page, SOI_SELECTORS.PAGO.INPUT_NUMERO_DOC_PSE, numeroDocumento);

    // 4. Email
    await this.fillInput(page, SOI_SELECTORS.PAGO.INPUT_EMAIL_PSE, email);

    // 5. Seleccionar banco
    await this.selectOption(page, SOI_SELECTORS.PAGO.SELECT_BANCO, banco);

    await page.waitForTimeout(500);
    await this.takeScreenshot(page, 'pago-8-formulario-pse');

    logger.info('PSE form filled', {
      tipoPersona,
      tipoDocumento,
      numeroDocumento: numeroDocumento.substring(0, 3) + '***',
      banco,
    });
  }

  /**
   * Confirma el pago PSE y obtiene la URL del banco
   */
  private async confirmarPSE(
    page: Page
  ): Promise<{
    success: boolean;
    urlBanco?: string;
    transaccionId?: string;
    error?: string;
  }> {
    logger.info('Confirming PSE payment');

    try {
      // Buscar botón de confirmar/pagar
      const confirmButton = await this.findClickableElement(page, [
        'button:has-text("Pagar")',
        'button:has-text("Confirmar")',
        'button:has-text("Ir al banco")',
        'input[value="Pagar"]',
        'input[value="Confirmar"]',
        '.btn-pagar',
        '.btn-confirmar-pse',
      ]);

      if (!confirmButton) {
        return {
          success: false,
          error: 'Could not find confirm/pay button',
        };
      }

      // Capturar la URL antes del click (para detectar redirección)
      const urlAntes = page.url();

      // Click en confirmar
      await confirmButton.click();

      // Esperar navegación o redirección
      try {
        await Promise.race([
          page.waitForNavigation({ timeout: 15000 }),
          page.waitForSelector('.mensaje-exito, .alert-success', { timeout: 15000 }),
          page.waitForSelector('.error, .alert-danger', { timeout: 15000 }),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
      } catch {
        // Timeout es aceptable
      }

      await page.waitForTimeout(2000);
      await this.takeScreenshot(page, 'pago-9-despues-confirmar');

      const currentUrl = page.url();

      // Verificar si hubo redirección a banco
      if (currentUrl !== urlAntes && !currentUrl.includes('nuevosoi.com.co')) {
        logger.info('Redirected to bank', { urlBanco: currentUrl });
        return {
          success: true,
          urlBanco: currentUrl,
        };
      }

      // Buscar información de transacción en la página
      const result = await page.evaluate(() => {
        // Buscar número de transacción
        const transaccionEl = document.querySelector(
          '[id*="transaccion"], .numero-transaccion, [class*="transaction"]'
        );
        const transaccionId = transaccionEl?.textContent?.match(/\d+/)?.[0];

        // Buscar mensaje de éxito
        const exitoEl = document.querySelector('.mensaje-exito, .alert-success');
        const hasSuccess = !!exitoEl;

        // Buscar mensaje de error
        const errorEl = document.querySelector('.mensaje-error, .alert-danger, .error');
        const errorMsg = errorEl?.textContent?.trim();

        // Buscar URL del banco (puede estar en un enlace o script)
        const bankLinks = document.querySelectorAll('a[href*="pse"], a[href*="ach"]');
        let bankUrl: string | undefined;
        bankLinks.forEach((link) => {
          const href = (link as HTMLAnchorElement).href;
          if (href && !href.includes('nuevosoi.com.co')) {
            bankUrl = href;
          }
        });

        return {
          transaccionId,
          hasSuccess,
          errorMsg,
          bankUrl,
        };
      });

      if (result.errorMsg) {
        return {
          success: false,
          error: result.errorMsg,
        };
      }

      if (result.hasSuccess || result.transaccionId || result.bankUrl) {
        return {
          success: true,
          transaccionId: result.transaccionId,
          urlBanco: result.bankUrl || currentUrl,
        };
      }

      // Si llegamos aquí, probablemente estamos en la página del banco
      // o en una página de confirmación
      return {
        success: true,
        urlBanco: currentUrl,
      };
    } catch (error) {
      logger.error('Error confirming PSE', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Ejecuta el pago PSE real (click en botón Pagar)
   * PRECAUCIÓN: Este método realiza el pago real
   */
  async ejecutarPagoPSE(page: Page): Promise<{
    success: boolean;
    urlBanco?: string;
    error?: string;
  }> {
    logger.info('Executing PSE payment (clicking Pagar button)');

    try {
      // Buscar y clickear el botón Pagar
      const pagarBtn = await page.$('input[value="Pagar"], button:has-text("Pagar")');

      if (!pagarBtn) {
        // Fallback: buscar por evaluate
        const clicked = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="submit"], button');
          for (const inp of inputs) {
            const value = (inp as HTMLInputElement).value || (inp as HTMLElement).innerText || '';
            if (value.toLowerCase().includes('pagar')) {
              (inp as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!clicked) {
          return { success: false, error: 'No se encontró botón Pagar' };
        }
      } else {
        await pagarBtn.click();
      }

      // Esperar redirección al banco
      await Promise.race([
        page.waitForNavigation({ timeout: 30000 }),
        page.waitForTimeout(10000),
      ]).catch(() => {});

      const urlActual = page.url();
      await this.takeScreenshot(page, 'pago-06-redireccion-banco');

      // Verificar si hubo redirección al banco PSE
      const esBanco = !urlActual.includes('nuevosoi.com.co');

      if (esBanco) {
        logger.info('Redirected to bank', { urlBanco: urlActual });
        return { success: true, urlBanco: urlActual };
      }

      // Verificar si hay error en la página
      const error = await page.evaluate(() => {
        const errorEl = document.querySelector('.error, .alert-danger, .mensaje-error');
        return errorEl?.textContent?.trim() || null;
      });

      if (error) {
        return { success: false, error };
      }

      return { success: true, urlBanco: urlActual };
    } catch (error) {
      logger.error('Error executing PSE payment', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error ejecutando pago',
      };
    }
  }

  /**
   * Verifica el estado de un pago
   */
  async verificarEstadoPago(
    numeroPlanilla: string
  ): Promise<{
    estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA';
    fechaPago?: Date;
    comprobante?: string;
  }> {
    logger.info('Checking payment status', { numeroPlanilla });

    const page = await this.authBot.ensureAuthenticated();

    try {
      // Navegar a soportes de pago
      await page.goto(SOI_SELECTORS.URLS.SOPORTES_PAGO || SOI_SELECTORS.URLS.CONSULTAR_PLANILLAS, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await page.waitForTimeout(1500);

      // Buscar la planilla
      const status = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr');

        for (const row of rows) {
          const rowText = row.textContent?.toLowerCase() || '';

          if (rowText.includes(numPlanilla.toLowerCase())) {
            // Detectar estado
            if (rowText.includes('pagada') || rowText.includes('aprobada')) {
              return 'PAGADA';
            }
            if (rowText.includes('rechazada') || rowText.includes('fallida')) {
              return 'RECHAZADA';
            }
            if (rowText.includes('vencida') || rowText.includes('expirada')) {
              return 'VENCIDA';
            }
            return 'PENDIENTE';
          }
        }

        return 'PENDIENTE';
      }, numeroPlanilla);

      return {
        estado: status as 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA',
      };
    } catch (error) {
      logger.error('Error checking payment status', { error });
      return { estado: 'PENDIENTE' };
    }
  }

  /**
   * Descarga el comprobante de pago
   */
  async descargarComprobante(numeroPlanilla: string): Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    error?: string;
  }> {
    logger.info('Downloading payment receipt', { numeroPlanilla });

    const page = await this.authBot.ensureAuthenticated();

    try {
      // Navegar a soportes de pago
      await page.goto(SOI_SELECTORS.URLS.SOPORTES_PAGO || SOI_SELECTORS.URLS.CONSULTAR_PLANILLAS, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await page.waitForTimeout(1500);

      // Buscar y hacer click en descargar
      const downloaded = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Buscar botón/link de descarga
            const downloadBtn = row.querySelector(
              'a:has-text("Descargar"), button:has-text("Descargar"), a[href*="download"], .btn-download'
            ) as HTMLElement;

            if (downloadBtn) {
              downloadBtn.click();
              return true;
            }
          }
        }
        return false;
      }, numeroPlanilla);

      if (!downloaded) {
        return {
          success: false,
          error: 'Could not find download button',
        };
      }

      // Esperar a que se descargue
      await page.waitForTimeout(5000);

      // TODO: Implementar captura del archivo descargado
      // Por ahora retornamos éxito si se hizo click
      return {
        success: true,
        fileName: `comprobante-${numeroPlanilla}.pdf`,
      };
    } catch (error) {
      logger.error('Error downloading receipt', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  // ========== Helper Methods ==========

  /**
   * Busca un elemento clickeable usando múltiples selectores
   */
  private async findClickableElement(
    page: Page,
    selectors: string[]
  ): Promise<any | null> {
    for (const selector of selectors) {
      try {
        // Intentar con selectores CSS normales
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate((el) => {
            const style = window.getComputedStyle(el as Element);
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0'
            );
          }, element);

          if (isVisible) {
            return element;
          }
        }
      } catch {
        // Intentar con evaluación de página para selectores tipo :has-text
        if (selector.includes(':has-text')) {
          const text = selector.match(/:has-text\("([^"]+)"\)/)?.[1];
          const tag = selector.split(':')[0] || '*';

          if (text) {
            const found = await page.evaluate(
              (tagName, searchText) => {
                const elements = document.querySelectorAll(tagName);
                for (const el of elements) {
                  if (el.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
                    return true;
                  }
                }
                return false;
              },
              tag,
              text
            );

            if (found) {
              // Retornar un objeto que simule el click
              return {
                click: async () => {
                  await page.evaluate(
                    (tagName, searchText) => {
                      const elements = document.querySelectorAll(tagName);
                      for (const el of elements) {
                        if (el.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
                          (el as HTMLElement).click();
                          break;
                        }
                      }
                    },
                    tag,
                    text
                  );
                },
              };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Selecciona una opción en un select
   */
  private async selectOption(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
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
                    return true;
                  }
                }
                return false;
              },
              sel.trim(),
              value
            );
            return;
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.warn('Could not select option', { selector, value });
    }
  }

  /**
   * Llena un input
   */
  private async fillInput(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
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
    } catch (error) {
      logger.warn('Could not fill input', { selector, value: value.substring(0, 3) + '***' });
    }
  }

  /**
   * Toma un screenshot
   */
  private async takeScreenshot(page: Page, name: string): Promise<void> {
    try {
      await page.screenshot({
        path: `screenshots/${name}.png`,
        fullPage: true,
      });
    } catch (error) {
      logger.warn('Could not take screenshot', { name });
    }
  }
}

/**
 * Función helper para pagar una planilla
 */
export async function pagarPlanillaSOI(
  data: SOIPagoData
): Promise<SOIPagoResult> {
  const bot = new SOIPagoBot();
  return bot.pagarPlanilla(data);
}

/**
 * Función helper para verificar estado de pago
 */
export async function verificarPagoSOI(numeroPlanilla: string): Promise<{
  estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA';
  fechaPago?: Date;
  comprobante?: string;
}> {
  const bot = new SOIPagoBot();
  return bot.verificarEstadoPago(numeroPlanilla);
}

/**
 * Función helper para descargar comprobante
 */
export async function descargarComprobanteSOI(numeroPlanilla: string): Promise<{
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}> {
  const bot = new SOIPagoBot();
  return bot.descargarComprobante(numeroPlanilla);
}
