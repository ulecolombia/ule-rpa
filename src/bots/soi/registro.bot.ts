/**
 * SOI Registration Bot
 * Maneja el registro de nuevos usuarios aportantes independientes en SOI
 *
 * Flujo V2 para crear cuenta SOI para usuarios ULE:
 * 1. Navega directamente a la página de auto-registro de independientes
 * 2. Paso 1: Llena datos personales (documento, nombres)
 * 3. Paso 2: Llena datos de contacto (ubicación, teléfono, email ULE)
 * 4. Acepta términos y finaliza registro
 * 5. SOI envía email de activación a pagos.ule@gmail.com
 * 6. RPA lee el email, hace click en "Activar mi cuenta"
 * 7. RPA crea la contraseña en SOI y la guarda encriptada
 *
 * NOTA: El usuario crea su contraseña al activar la cuenta.
 * El RPA automatiza todo el proceso incluyendo lectura del email.
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { getSOIAuthBot, SOIAuthBot } from './auth.bot';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import {
  SOIUserRegistration,
  SOIAccountCreationResult,
  ULE_SOI_CONFIG,
  generateRandomPhone,
} from '../../types/soi.types';

/**
 * @deprecated Use crearCuentaSOI() for independent registration
 * Datos para el flujo legacy de admin de empresa
 */
export interface SOIUserData {
  // Información Básica
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  departamento: string;
  municipio: string;
  telefono?: string;
  extension?: string;
  celular?: string;
  correo?: string;
  enviarSMS?: boolean;

  // Información de Autorización
  rolSOI?: string;
  rolPCSS?: string;
  activo?: boolean;
}

export interface SOIRegistrationResult {
  success: boolean;
  userId?: string;
  usuarioId?: string;
  message: string;
  userData?: SOIUserData;
  alreadyExists?: boolean;
  warnings?: string[];
  error?: string;
}

export class SOIRegistroBot {
  private authBot: SOIAuthBot;

  constructor() {
    this.authBot = getSOIAuthBot();
  }

  /**
   * Registra un nuevo usuario aportante en SOI
   */
  async registrarUsuario(userData: SOIUserData): Promise<SOIRegistrationResult> {
    logger.info('Starting user registration in SOI', {
      documento: userData.numeroDocumento,
      nombre: `${userData.nombres} ${userData.apellidos}`,
    });

    try {
      // Asegurar autenticación
      const page = await this.authBot.ensureAuthenticated();

      // Verificar si el usuario ya existe
      const exists = await this.buscarUsuario(page, userData.tipoDocumento, userData.numeroDocumento);

      if (exists) {
        logger.info('User already exists in SOI', { documento: userData.numeroDocumento });
        return {
          success: true,
          message: 'Usuario ya existe en SOI',
          userData,
          alreadyExists: true,
          usuarioId: userData.numeroDocumento,
        };
      }

      // Navegar a crear usuario
      await this.navegarACrearUsuario(page);

      // Llenar formulario
      await this.llenarFormularioRegistro(page, userData);

      // Guardar usuario
      const result = await this.guardarUsuario(page);

      logger.info('User registration completed', {
        documento: userData.numeroDocumento,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Error registering user in SOI', {
        documento: userData.numeroDocumento,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Busca un usuario existente
   */
  async buscarUsuario(
    page: Page,
    tipoDoc: string,
    numeroDoc: string
  ): Promise<boolean> {
    logger.info('Searching for user in SOI', { numeroDocumento: numeroDoc });

    try {
      // Navegar a administrar usuarios
      await page.goto(SOI_SELECTORS.URLS.ADMINISTRAR_USUARIOS, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await page.waitForTimeout(1000);

      // Seleccionar tipo de documento
      await this.selectOption(page, SOI_SELECTORS.ADMIN_USUARIOS.TIPO_DOC_BUSQUEDA, tipoDoc);

      // Ingresar número de documento
      await this.fillInput(page, SOI_SELECTORS.ADMIN_USUARIOS.NUMERO_DOC_BUSQUEDA, numeroDoc);

      // Click en buscar
      await this.clickButton(page, SOI_SELECTORS.ADMIN_USUARIOS.BTN_BUSCAR);

      await page.waitForTimeout(2000);

      // Verificar si hay resultados
      const hasResults = await page.evaluate(() => {
        const table = document.querySelector('table tbody tr');
        // Buscar mensaje de "no encontrado" por texto en lugar de selector inválido
        const bodyText = document.body.innerText.toLowerCase();
        const noResults = bodyText.includes('no se encontraron') || bodyText.includes('sin resultados');
        return !!table && !noResults;
      });

      return hasResults;
    } catch (error) {
      logger.warn('Error searching user', { error });
      return false;
    }
  }

  /**
   * Navega a la página de crear usuario
   */
  private async navegarACrearUsuario(page: Page): Promise<void> {
    logger.info('Navigating to create user page');

    // Primero ir a administrar usuarios
    await page.goto(SOI_SELECTORS.URLS.ADMINISTRAR_USUARIOS, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(1000);

    // Click en crear usuario
    await this.clickButton(page, SOI_SELECTORS.ADMIN_USUARIOS.BTN_CREAR_USUARIO);

    await page.waitForTimeout(2000);

    // Verificar que estamos en la página correcta
    const currentUrl = page.url();
    if (!currentUrl.includes('CrearAportante') && !currentUrl.includes('irCrearAportante')) {
      // Intentar navegar directamente
      await page.goto(SOI_SELECTORS.URLS.CREAR_USUARIO, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
    }

    await page.waitForSelector('form', { timeout: 10000 });
    logger.info('Create user page loaded');
  }

  /**
   * Llena el formulario de registro
   */
  private async llenarFormularioRegistro(
    page: Page,
    userData: SOIUserData
  ): Promise<void> {
    logger.info('Filling registration form');

    const screenshot = async (name: string) => {
      try {
        await page.screenshot({ path: `screenshots/soi-${name}.png`, fullPage: true });
      } catch {}
    };

    // === INFORMACIÓN BÁSICA ===

    // Tipo de documento
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.TIPO_DOCUMENTO,
      this.mapTipoDocumento(userData.tipoDocumento)
    );

    // Número de documento
    await this.fillInput(
      page,
      SOI_SELECTORS.CREAR_USUARIO.NUMERO_DOCUMENTO,
      userData.numeroDocumento
    );

    // Nombres
    await this.fillInput(
      page,
      SOI_SELECTORS.CREAR_USUARIO.NOMBRES,
      userData.nombres
    );

    // Apellidos
    await this.fillInput(
      page,
      SOI_SELECTORS.CREAR_USUARIO.APELLIDOS,
      userData.apellidos
    );

    // Departamento
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.DEPARTAMENTO,
      userData.departamento
    );

    // Esperar a que carguen los municipios
    await page.waitForTimeout(1000);

    // Municipio
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.MUNICIPIO,
      userData.municipio
    );

    // Teléfono (opcional)
    if (userData.telefono) {
      await this.fillInput(
        page,
        SOI_SELECTORS.CREAR_USUARIO.TELEFONO,
        userData.telefono
      );
    }

    // Extensión (opcional)
    if (userData.extension) {
      await this.fillInput(
        page,
        SOI_SELECTORS.CREAR_USUARIO.EXTENSION,
        userData.extension
      );
    }

    // Celular (opcional)
    if (userData.celular) {
      await this.fillInput(
        page,
        SOI_SELECTORS.CREAR_USUARIO.CELULAR,
        userData.celular
      );
    }

    // Correo (opcional)
    if (userData.correo) {
      await this.fillInput(
        page,
        SOI_SELECTORS.CREAR_USUARIO.CORREO,
        userData.correo
      );
    }

    // Checkbox SMS
    if (userData.enviarSMS) {
      await this.checkCheckbox(page, SOI_SELECTORS.CREAR_USUARIO.SMS_CHECKBOX);
    }

    await screenshot('form-basic-info');

    // === INFORMACIÓN DE AUTORIZACIÓN ===

    // Rol SOI - permite liquidar, pagar y consultar
    const rolSOI = userData.rolSOI || 'LIQUIDADOR, PAGADOR, CONSULTA Y SOPORTES APORTANTE';
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.ROL_SOI,
      rolSOI
    );

    // Rol PCSS - permisos para Planilla Centralizada
    const rolPCSS = userData.rolPCSS || 'PC-LIQUIDADOR, PAGADOR, CONSULTA Y SOPORTES APORTANTE';
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.ROL_PCSS,
      rolPCSS
    );

    // Activo
    const activo = userData.activo !== false ? 'Si' : 'No';
    await this.selectOption(
      page,
      SOI_SELECTORS.CREAR_USUARIO.ACTIVO,
      activo
    );

    await screenshot('form-complete');

    logger.info('Registration form filled');
  }

  /**
   * Guarda el usuario
   */
  private async guardarUsuario(page: Page): Promise<SOIRegistrationResult> {
    logger.info('Saving user');

    try {
      // Click en guardar
      await this.clickButton(page, SOI_SELECTORS.CREAR_USUARIO.BTN_GUARDAR);

      await page.waitForTimeout(3000);

      // Verificar resultado
      const result = await page.evaluate(() => {
        // Buscar mensaje de éxito (sin usar :has-text que no es válido en CSS)
        const successMsg = document.querySelector('.alert-success, .mensaje-exito');
        const bodyText = document.body.innerText.toLowerCase();
        const hasSuccessText = bodyText.includes('exitosamente') || bodyText.includes('creado correctamente');
        const errorMsg = document.querySelector('.alert-danger, .mensaje-error, .error');

        if (successMsg || hasSuccessText) {
          return {
            success: true,
            message: successMsg?.textContent?.trim() || 'Usuario creado exitosamente',
          };
        }

        if (errorMsg) {
          return {
            success: false,
            message: errorMsg.textContent?.trim() || 'Error al crear usuario',
          };
        }

        return {
          success: true,
          message: 'Usuario procesado',
        };
      });

      await page.screenshot({ path: 'screenshots/soi-save-result.png', fullPage: true });

      return result;
    } catch (error) {
      logger.error('Error saving user', { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Mapea el tipo de documento al formato de SOI
   */
  private mapTipoDocumento(tipo: string): string {
    const map: Record<string, string> = {
      CC: 'C.C.',
      'C.C.': 'C.C.',
      CE: 'C.E.',
      'C.E.': 'C.E.',
      NIT: 'NIT',
      TI: 'T.I.',
      'T.I.': 'T.I.',
      PA: 'PA',
      CD: 'CD',
    };
    return map[tipo.toUpperCase()] || tipo;
  }

  /**
   * Selecciona una opción en un selector
   */
  private async selectOption(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
    try {
      // Esperar selector
      await page.waitForSelector(selector, { timeout: 5000 });

      // Intentar múltiples selectores (pueden ser diferentes formatos)
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
            break;
          }
        } catch {
          continue;
        }
      }

      await page.waitForTimeout(300);
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
      logger.warn('Could not fill input', { selector, value });
    }
  }

  /**
   * Marca un checkbox
   */
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
    } catch (error) {
      logger.warn('Could not check checkbox', { selector });
    }
  }

  /**
   * Click en un botón
   */
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

      // Si no encontramos el botón, buscar por texto
      await page.evaluate((sel) => {
        const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value;
          if (text && sel.toLowerCase().includes(text.toLowerCase())) {
            (btn as HTMLElement).click();
            return;
          }
        }
      }, selector);
    } catch (error) {
      logger.warn('Could not click button', { selector });
    }
  }
}

/**
 * Función helper para registrar un usuario en SOI
 */
export async function registrarUsuarioSOI(
  userData: SOIUserData
): Promise<SOIRegistrationResult> {
  const bot = new SOIRegistroBot();
  return bot.registrarUsuario(userData);
}

/**
 * Crea una cuenta SOI para un usuario de ULE (flujo de auto-registro V2)
 * Usa los datos fijos de ULE (email, celular)
 *
 * IMPORTANTE: SOI envía un email de activación a pagos.ule@gmail.com
 * El RPA debe leer el email, hacer click en "Activar mi cuenta" y crear la contraseña.
 *
 * @param userData - Datos del usuario (documento, nombres, ubicación)
 * @returns Resultado del registro (sin password - ver email)
 */
export async function crearCuentaSOI(
  userData: SOIUserRegistration
): Promise<SOIAccountCreationResult> {
  logger.info('Creating SOI account for ULE user (auto-registro V2)', {
    documento: userData.documento,
    nombre: `${userData.nombres} ${userData.apellidos}`,
  });

  const browserManager = new BrowserManager({
    headless: config.puppeteer.headless,
    downloadsPath: './downloads/soi-registro',
  });

  let page: Page | null = null;

  try {
    await browserManager.launch();
    page = await browserManager.newPage();

    // Navegar a la página de registro de independientes
    logger.info('Navigating to SOI registration page');
    await page.goto(SOI_SELECTORS.URLS.REGISTRO_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await browserManager.takeScreenshot(page, 'soi-registro-step1');

    // Esperar a que cargue el formulario
    await page.waitForSelector(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO, {
      timeout: 10000,
    });

    // === PASO 1: DATOS PERSONALES ===
    logger.info('Filling Step 1: Personal Data');

    // Tipo de documento
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO, mapTipoDocumento(userData.tipoDocumento));
    await page.waitForTimeout(300);

    // Número de documento
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NUMERO_DOCUMENTO, userData.documento);
    await page.waitForTimeout(300);

    // Nombres
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NOMBRES, userData.nombres);
    await page.waitForTimeout(300);

    // Apellidos
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.APELLIDOS, userData.apellidos);
    await page.waitForTimeout(500);

    await browserManager.takeScreenshot(page, 'soi-registro-step1-filled');

    // Click en Siguiente (esperar a que se habilite)
    await page.waitForFunction(
      (selector: string) => {
        const btn = document.querySelector(selector) as HTMLButtonElement;
        return btn && !btn.classList.contains('btn-disabled');
      },
      { timeout: 5000 },
      SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE
    );

    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE);
    await page.waitForTimeout(1000);

    // === PASO 2: DATOS DE CONTACTO ===
    logger.info('Filling Step 2: Contact Data');

    await browserManager.takeScreenshot(page, 'soi-registro-step2');

    // Esperar que aparezcan los campos del paso 2
    await page.waitForSelector(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DEPARTAMENTO, {
      visible: true,
      timeout: 10000,
    });

    // Departamento
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DEPARTAMENTO, userData.departamento);
    await page.waitForTimeout(1000); // Esperar carga de municipios

    // Municipio
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.MUNICIPIO, userData.municipio);
    await page.waitForTimeout(300);

    // Dirección (usar una genérica si no se provee)
    const direccion = 'Calle Principal';
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DIRECCION, direccion);
    await page.waitForTimeout(300);

    // Teléfono (random)
    const telefono = generateRandomPhone();
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TELEFONO, telefono);
    await page.waitForTimeout(300);

    // Celular (ULE)
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CELULAR, ULE_SOI_CONFIG.celular);
    await page.waitForTimeout(300);

    // Email (ULE - donde llegarán las passwords)
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CORREO, ULE_SOI_CONFIG.email);
    await page.waitForTimeout(300);

    // Cómo nos conociste
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.COMO_NOS_CONOCISTE, 'Búsqueda en web');
    await page.waitForTimeout(300);

    await browserManager.takeScreenshot(page, 'soi-registro-step2-filled');

    // Aceptar términos y condiciones
    const checkbox = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CHECKBOX_TERMINOS);
    if (checkbox) {
      const isChecked = await page.evaluate(
        (sel: string) => (document.querySelector(sel) as HTMLInputElement)?.checked,
        SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CHECKBOX_TERMINOS
      );
      if (!isChecked) {
        await checkbox.click();
        await page.waitForTimeout(300);
      }
    }

    // Esperar a que se habilite el botón Finalizar
    await page.waitForFunction(
      (selector: string) => {
        const btn = document.querySelector(selector) as HTMLButtonElement;
        return btn && !btn.classList.contains('btn-disabled');
      },
      { timeout: 5000 },
      SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_FINALIZAR
    );

    await browserManager.takeScreenshot(page, 'soi-registro-before-submit');

    // Click en Finalizar
    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_FINALIZAR);
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'soi-registro-result');

    // Verificar resultado
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Verificar si hay error de usuario existente
      if (bodyText.includes('ya existe') || bodyText.includes('already exists')) {
        return {
          success: true,
          alreadyExists: true,
          message: 'El usuario ya está registrado en SOI',
        };
      }

      // Verificar éxito
      if (
        bodyText.includes('exitosamente') ||
        bodyText.includes('registrado correctamente') ||
        bodyText.includes('cuenta creada') ||
        bodyText.includes('enviado al correo')
      ) {
        return {
          success: true,
          alreadyExists: false,
          message: 'Cuenta creada exitosamente. La contraseña fue enviada al email.',
        };
      }

      // Verificar error
      const errorEl = document.querySelector('.alert-danger, .error, .mensaje-error');
      if (errorEl) {
        return {
          success: false,
          alreadyExists: false,
          message: errorEl.textContent?.trim() || 'Error en el registro',
        };
      }

      // Default: asumir éxito si no hay error visible
      return {
        success: true,
        alreadyExists: false,
        message: 'Registro procesado. Verificar email para obtener contraseña.',
      };
    });

    if (result.alreadyExists) {
      logger.info('SOI user already exists', { documento: userData.documento });
      return {
        success: true,
        accountCreated: false,
        message: 'El usuario ya tiene cuenta en SOI. Debe proporcionar su password existente.',
      };
    }

    if (!result.success) {
      logger.error('SOI registration failed', {
        documento: userData.documento,
        error: result.message,
      });
      return {
        success: false,
        accountCreated: false,
        message: result.message,
        error: result.message,
      };
    }

    // Cuenta creada exitosamente
    logger.info('SOI account created successfully', {
      documento: userData.documento,
      message: result.message,
    });

    return {
      success: true,
      accountCreated: true,
      // NOTA: La password fue enviada al email, no la tenemos aquí
      message: `Cuenta SOI creada. La contraseña fue enviada a ${ULE_SOI_CONFIG.email}. Revisa el email y proporciona la contraseña al usuario.`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error creating SOI account', {
      documento: userData.documento,
      error: errorMsg,
    });

    if (page) {
      await browserManager.takeScreenshot(page, 'soi-registro-error');
    }

    return {
      success: false,
      accountCreated: false,
      message: 'Error al crear cuenta SOI',
      error: errorMsg,
    };
  } finally {
    await browserManager.close();
  }
}

// Helper functions
async function selectOption(page: Page, selector: string, value: string): Promise<void> {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.evaluate(
      (sel: string, val: string) => {
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
  } catch (error) {
    logger.warn('Could not select option', { selector, value });
  }
}

async function fillInput(page: Page, selector: string, value: string): Promise<void> {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value, { delay: 30 });
  } catch (error) {
    logger.warn('Could not fill input', { selector });
  }
}

function mapTipoDocumento(tipo: string): string {
  const map: Record<string, string> = {
    CC: 'Cédula de ciudadanía',
    'C.C.': 'Cédula de ciudadanía',
    CE: 'Cédula de extranjería',
    'C.E.': 'Cédula de extranjería',
    PA: 'Pasaporte',
    TI: 'Tarjeta de identidad',
    'T.I.': 'Tarjeta de identidad',
  };
  return map[tipo.toUpperCase()] || tipo;
}
