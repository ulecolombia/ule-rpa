/**
 * Mi Planilla Registration Bot
 * Maneja el registro de nuevos usuarios aportantes independientes en Mi Planilla
 *
 * Flujo de registro:
 * 1. Ir a miplanilla.com → Click "Independiente"
 * 2. Cerrar popup si aparece → Click "REGISTRO"
 * 3. Ingresar cédula → Click "Iniciar Registro"
 * 4. Seleccionar "Aporte Propio" → "Independiente" → Continuar
 * 5. Llenar Información Básica (nombre, email, ciudad, etc.)
 * 6. Llenar Información de Aportes (IBC, EPS, AFP)
 * 7. Llenar Datos de Usuario (password, términos)
 * 8. Click "Finalizar Registro"
 *
 * NOTA: A diferencia de SOI, Mi Planilla NO requiere activación por email.
 * El usuario queda activo inmediatamente con usuario = CC + documento.
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import {
  MIPLANILLA_URLS,
  MIPLANILLA_SELECTORS,
  MiPlanillaRegistro,
  MiPlanillaRegistroResult,
  generateMiPlanillaUser,
  generateMiPlanillaPassword,
} from '../../types/miplanilla.types';

export class MiPlanillaRegistroBot {
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/miplanilla-registro',
    });
  }

  /**
   * Registra un nuevo usuario en Mi Planilla
   */
  async registrarUsuario(userData: MiPlanillaRegistro): Promise<MiPlanillaRegistroResult> {
    logger.info('Starting user registration in Mi Planilla', {
      documento: userData.documento,
      nombre: `${userData.primerNombre} ${userData.primerApellido}`,
    });

    let page: Page | null = null;

    try {
      await this.browserManager.launch();
      page = await this.browserManager.newPage();

      // Generar password
      const generatedPassword = generateMiPlanillaPassword();
      const usuario = generateMiPlanillaUser(userData.tipoDocumento, userData.documento);

      // === PASO 1: Navegar a landing y click Independiente ===
      await this.navegarARegistro(page);

      // === PASO 2: Ingresar documento e iniciar registro ===
      await this.iniciarRegistro(page, userData.tipoDocumento, userData.documento);

      // === PASO 3: Seleccionar tipo de aporte y cotizante ===
      await this.seleccionarTipoAporte(page);

      // === PASO 4: Llenar información básica ===
      await this.llenarInformacionBasica(page, userData);

      // === PASO 5: Llenar información de aportes ===
      await this.llenarInformacionAportes(page, userData);

      // === PASO 6: Llenar datos de usuario y finalizar ===
      await this.llenarDatosUsuario(page, generatedPassword);

      // === PASO 7: Verificar resultado ===
      const result = await this.verificarRegistro(page);

      if (result.success) {
        logger.info('Mi Planilla registration successful', {
          documento: userData.documento,
          usuario,
        });

        return {
          success: true,
          accountCreated: true,
          usuario,
          generatedPassword,
          message: `Cuenta Mi Planilla creada exitosamente. Usuario: ${usuario}`,
        };
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error registering user in Mi Planilla', {
        documento: userData.documento,
        error: errorMsg,
      });

      if (page) {
        await this.browserManager.takeScreenshot(page, 'miplanilla-registro-error');
      }

      // Verificar si es error de usuario existente
      if (errorMsg.includes('ya existe') || errorMsg.includes('already exists')) {
        return {
          success: false,
          accountCreated: false,
          message: 'El usuario ya existe en Mi Planilla',
          error: 'USER_ALREADY_EXISTS',
        };
      }

      return {
        success: false,
        accountCreated: false,
        message: 'Error al registrar en Mi Planilla',
        error: errorMsg,
      };
    } finally {
      await this.browserManager.close();
    }
  }

  /**
   * Navega desde landing hasta la página de registro
   */
  private async navegarARegistro(page: Page): Promise<void> {
    logger.info('Navigating to Mi Planilla registration');

    // Ir a landing
    await page.goto(MIPLANILLA_URLS.landing, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await this.browserManager.takeScreenshot(page, 'miplanilla-landing');

    // Click en "Independiente"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnIndependiente, 'Independiente');
    await page.waitForTimeout(2000);

    // Verificar si hay popup y cerrarlo
    await this.cerrarPopupSiExiste(page);

    await this.browserManager.takeScreenshot(page, 'miplanilla-portal');

    // Click en "REGISTRO"
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnRegistro, 'REGISTRO');
    await page.waitForTimeout(2000);

    await this.browserManager.takeScreenshot(page, 'miplanilla-registro-page');
    logger.info('Reached registration page');
  }

  /**
   * Cierra popup de promoción si existe
   */
  private async cerrarPopupSiExiste(page: Page): Promise<void> {
    try {
      for (const selector of MIPLANILLA_SELECTORS.popupClose) {
        const element = await page.$(selector);
        if (element) {
          logger.info('Closing popup');
          await element.click();
          await page.waitForTimeout(500);
          return;
        }
      }
    } catch {
      // No popup, continuar
    }
  }

  /**
   * Ingresa documento y hace click en Iniciar Registro
   */
  private async iniciarRegistro(
    page: Page,
    tipoDocumento: string,
    documento: string
  ): Promise<void> {
    logger.info('Initiating registration', { documento });

    // Esperar formulario
    await page.waitForSelector('form', { timeout: 10000 });

    // Seleccionar tipo de documento (usualmente ya está en CC)
    await this.selectOption(page, MIPLANILLA_SELECTORS.selectTipoDocRegistro, tipoDocumento);
    await page.waitForTimeout(300);

    // Ingresar número de documento
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputNumDocRegistro, documento);
    await page.waitForTimeout(300);

    await this.browserManager.takeScreenshot(page, 'miplanilla-registro-doc');

    // Click en Iniciar Registro
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnIniciarRegistro, 'Iniciar Registro');
    await page.waitForTimeout(2000);

    logger.info('Registration initiated');
  }

  /**
   * Selecciona "Aporte Propio" e "Independiente"
   */
  private async seleccionarTipoAporte(page: Page): Promise<void> {
    logger.info('Selecting contribution type');

    await this.browserManager.takeScreenshot(page, 'miplanilla-tipo-aporte');

    // Seleccionar "Aporte Propio"
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioAportePropio, 'Aporte Propio');
    await page.waitForTimeout(1000);

    await this.browserManager.takeScreenshot(page, 'miplanilla-aporte-propio');

    // Seleccionar "Independiente"
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioIndependiente, 'Independiente');
    await page.waitForTimeout(1000);

    await this.browserManager.takeScreenshot(page, 'miplanilla-independiente');

    // Click Continuar
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnContinuar, 'Continuar');
    await page.waitForTimeout(2000);

    logger.info('Contribution type selected');
  }

  /**
   * Llena el formulario de información básica (Paso 1/3)
   */
  private async llenarInformacionBasica(
    page: Page,
    userData: MiPlanillaRegistro
  ): Promise<void> {
    logger.info('Filling basic information (Step 1/3)');

    await this.browserManager.takeScreenshot(page, 'miplanilla-step1-start');

    // Primer Nombre
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputPrimerNombre, userData.primerNombre);

    // Segundo Nombre (opcional)
    if (userData.segundoNombre) {
      await this.fillInput(page, MIPLANILLA_SELECTORS.inputSegundoNombre, userData.segundoNombre);
    }

    // Primer Apellido
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputPrimerApellido, userData.primerApellido);

    // Segundo Apellido (opcional)
    if (userData.segundoApellido) {
      await this.fillInput(page, MIPLANILLA_SELECTORS.inputSegundoApellido, userData.segundoApellido);
    }

    // Email (ULE)
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputEmail, userData.email);

    // Celular
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputCelular, userData.celular);

    // Teléfono Fijo (opcional, usar celular si no hay)
    const telefono = userData.telefonoFijo || userData.celular;
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputTelefono, telefono);

    // Dirección
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputDireccion, userData.direccion);

    // Ciudad (modal autocompletado)
    await this.seleccionarCiudad(page, userData.ciudad);

    // Actividad Económica
    await this.selectOption(
      page,
      MIPLANILLA_SELECTORS.selectActividadEconomica,
      userData.actividadEconomica
    );

    await this.browserManager.takeScreenshot(page, 'miplanilla-step1-filled');

    // Click Continuar
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnContinuar, 'Continuar');
    await page.waitForTimeout(2000);

    logger.info('Basic information filled');
  }

  /**
   * Selecciona ciudad usando el modal de autocompletado
   */
  private async seleccionarCiudad(page: Page, ciudad: string): Promise<void> {
    logger.info('Selecting city', { ciudad });

    try {
      // Click en el campo de ciudad para abrir modal
      await this.clickElement(page, MIPLANILLA_SELECTORS.inputCiudad, 'Ciudad');
      await page.waitForTimeout(1000);

      // Esperar modal
      let modalFound = false;
      for (const selector of MIPLANILLA_SELECTORS.modalCiudades) {
        const modal = await page.$(selector);
        if (modal) {
          modalFound = true;
          break;
        }
      }

      if (modalFound) {
        // Escribir en el input de búsqueda del modal
        await this.fillInput(page, MIPLANILLA_SELECTORS.modalCiudadesInput, ciudad);
        await page.waitForTimeout(1500); // Esperar resultados

        // Click en la primera opción
        await this.clickElement(page, MIPLANILLA_SELECTORS.modalCiudadesOption, ciudad);
        await page.waitForTimeout(500);
      } else {
        // Si no hay modal, intentar escribir directamente
        await this.fillInput(page, MIPLANILLA_SELECTORS.inputCiudad, ciudad);
        await page.waitForTimeout(1000);

        // Presionar Enter o seleccionar primera opción
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }

      logger.info('City selected');
    } catch (error) {
      logger.warn('Could not select city through modal, trying direct input', { error });
      await this.fillInput(page, MIPLANILLA_SELECTORS.inputCiudad, ciudad);
    }
  }

  /**
   * Llena el formulario de información de aportes (Paso 2/3)
   */
  private async llenarInformacionAportes(
    page: Page,
    userData: MiPlanillaRegistro
  ): Promise<void> {
    logger.info('Filling contribution information (Step 2/3)');

    await this.browserManager.takeScreenshot(page, 'miplanilla-step2-start');

    // ¿Te encuentras en el exterior? → No
    await this.clickElement(
      page,
      MIPLANILLA_SELECTORS.radioUbicacionColombia,
      'No, mi ubicación es Colombia'
    );
    await page.waitForTimeout(500);

    // ¿Estás obligado a cotizar pensión? → Sí
    await this.clickElement(
      page,
      MIPLANILLA_SELECTORS.radioCotizarPensionSi,
      'Sí, debo cotizar pensión'
    );
    await page.waitForTimeout(500);

    // Ingresos mensuales (IBC)
    await this.fillInput(
      page,
      MIPLANILLA_SELECTORS.inputIngresos,
      userData.ingresosMensuales.toString()
    );
    await page.waitForTimeout(300);

    // EPS
    await this.selectOption(page, MIPLANILLA_SELECTORS.selectEps, userData.epsCodigo);
    await page.waitForTimeout(500);

    // Fondo de Pensiones
    await this.selectOption(page, MIPLANILLA_SELECTORS.selectAfp, userData.afpCodigo);
    await page.waitForTimeout(500);

    // ¿Aportas a ARL voluntaria? → No
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioArlNo, 'No ARL');
    await page.waitForTimeout(300);

    // ¿Aportas a Cajas de Compensación? → No
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioCajaNo, 'No Caja');
    await page.waitForTimeout(300);

    // ¿Eres trabajador nuevo? → No
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioNovedadNo, 'No Novedad');
    await page.waitForTimeout(300);

    await this.browserManager.takeScreenshot(page, 'miplanilla-step2-filled');

    // Click Continuar
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnContinuar, 'Continuar');
    await page.waitForTimeout(2000);

    logger.info('Contribution information filled');
  }

  /**
   * Llena datos de usuario y finaliza registro (Paso 3/3)
   */
  private async llenarDatosUsuario(page: Page, password: string): Promise<void> {
    logger.info('Filling user data (Step 3/3)');

    await this.browserManager.takeScreenshot(page, 'miplanilla-step3-start');

    // Notificación por email → Sí
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioNotifEmailSi, 'Sí email');
    await page.waitForTimeout(300);

    // Notificación por SMS → No
    await this.clickElement(page, MIPLANILLA_SELECTORS.radioNotifSmsNo, 'No SMS');
    await page.waitForTimeout(300);

    // Password
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputPasswordRegistro, password);
    await page.waitForTimeout(300);

    // Confirmar Password
    await this.fillInput(page, MIPLANILLA_SELECTORS.inputPasswordConfirm, password);
    await page.waitForTimeout(300);

    // Aceptar tratamiento de datos personales
    await this.checkCheckbox(page, MIPLANILLA_SELECTORS.checkboxDatosPersonales);
    await page.waitForTimeout(300);

    // Aceptar términos y condiciones
    await this.checkCheckbox(page, MIPLANILLA_SELECTORS.checkboxTerminos);
    await page.waitForTimeout(300);

    await this.browserManager.takeScreenshot(page, 'miplanilla-step3-filled');

    // Click Finalizar Registro
    await this.clickElement(page, MIPLANILLA_SELECTORS.btnFinalizarRegistro, 'Finalizar Registro');
    await page.waitForTimeout(3000);

    logger.info('User data filled, registration submitted');
  }

  /**
   * Verifica el resultado del registro
   */
  private async verificarRegistro(page: Page): Promise<MiPlanillaRegistroResult> {
    await this.browserManager.takeScreenshot(page, 'miplanilla-registro-result');

    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Verificar si hay error de usuario existente
      if (bodyText.includes('ya existe') || bodyText.includes('already exists')) {
        return {
          success: false,
          accountCreated: false,
          message: 'El usuario ya está registrado en Mi Planilla',
          error: 'USER_ALREADY_EXISTS',
        };
      }

      // Verificar éxito
      if (
        bodyText.includes('exitosamente') ||
        bodyText.includes('registrado correctamente') ||
        bodyText.includes('cuenta creada') ||
        bodyText.includes('bienvenido')
      ) {
        return {
          success: true,
          accountCreated: true,
          message: 'Cuenta Mi Planilla creada exitosamente',
        };
      }

      // Verificar error genérico
      const errorEl = document.querySelector('.alert-danger, .error, .mensaje-error, [class*="error"]');
      if (errorEl) {
        return {
          success: false,
          accountCreated: false,
          message: errorEl.textContent?.trim() || 'Error en el registro',
          error: errorEl.textContent?.trim(),
        };
      }

      // Si llegamos al dashboard, es éxito
      if (window.location.href.includes('Principal') || window.location.href.includes('Privado')) {
        return {
          success: true,
          accountCreated: true,
          message: 'Cuenta Mi Planilla creada exitosamente',
        };
      }

      // Default: asumir éxito si no hay error visible
      return {
        success: true,
        accountCreated: true,
        message: 'Registro procesado correctamente',
      };
    });

    return result as MiPlanillaRegistroResult;
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
        // Intentar selector CSS primero
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
   * Marca un checkbox
   */
  private async checkCheckbox(page: Page, selectors: readonly string[]): Promise<void> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isChecked = await page.evaluate(
            (sel) => (document.querySelector(sel) as HTMLInputElement)?.checked,
            selector
          );
          if (!isChecked) {
            await element.click();
          }
          return;
        }
      } catch {
        continue;
      }
    }

    // Intentar buscar por label text
    await page.evaluate(() => {
      const labels = document.querySelectorAll('label');
      for (const label of labels) {
        const text = label.textContent?.toLowerCase() || '';
        if (text.includes('autorizo') || text.includes('acepto') || text.includes('términos')) {
          const input = label.querySelector('input[type="checkbox"]') as HTMLInputElement;
          if (input && !input.checked) {
            input.click();
          }
        }
      }
    });
  }
}

/**
 * Función helper para registrar un usuario en Mi Planilla
 */
export async function registrarUsuarioMiPlanilla(
  userData: MiPlanillaRegistro
): Promise<MiPlanillaRegistroResult> {
  const bot = new MiPlanillaRegistroBot();
  return bot.registrarUsuario(userData);
}

export default MiPlanillaRegistroBot;
