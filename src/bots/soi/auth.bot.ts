/**
 * SOI Authentication Bot
 * Maneja el login y autenticación en el portal SOI
 *
 * Soporta dos modos:
 * 1. Admin Mode: Credenciales fijas desde config (para operaciones internas)
 * 2. User Mode: Credenciales dinámicas de cualquier usuario SOI
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { BotError } from '../utils/errors';
import {
  SOICredentialsValidationResult,
  TipoDocumento,
} from '../../types/soi.types';

// Credenciales legacy para compatibilidad
export interface SOICredentials {
  empresaTipoDoc: string;
  empresaNumeroDoc: string;
  usuarioTipoDoc: string;
  usuarioNumeroDoc: string;
  password: string;
}

// Credenciales simplificadas para usuarios independientes
export interface SOIUserCredentials {
  tipoDocumento: TipoDocumento;
  documento: string;
  password: string;
}

export interface SOISession {
  isAuthenticated: boolean;
  userName?: string;
  tipoDocumento?: string;
  documento?: string;
  lastLogin?: Date;
  cookies?: string;
}

export class SOIAuthBot {
  private browserManager: BrowserManager;
  private page: Page | null = null;
  private session: SOISession = { isAuthenticated: false };

  constructor() {
    this.browserManager = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/soi',
    });
  }

  /**
   * Inicializa el navegador y obtiene una página
   */
  async initialize(): Promise<Page> {
    if (!this.page) {
      await this.browserManager.launch();
      this.page = await this.browserManager.newPage();
    }
    return this.page;
  }

  /**
   * Login en SOI para INDEPENDIENTES (flujo simplificado sin empresa)
   */
  async login(credentials?: SOICredentials): Promise<SOISession> {
    const creds = credentials || this.getDefaultCredentials();

    logger.info('Starting SOI authentication (Independientes)', {
      usuarioDoc: creds.usuarioNumeroDoc,
    });

    const page = await this.initialize();

    try {
      // Navegar a la página de login de INDEPENDIENTES
      logger.info('Navigating to SOI Independientes login page');
      await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await this.browserManager.takeScreenshot(page, 'soi-login-page');

      // Esperar a que cargue el formulario
      await page.waitForSelector('form', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Para independientes, solo necesitamos: Usuario + Clave
      // Selectores específicos para el formulario de independientes
      logger.info('Filling user document info');

      // Tipo de documento (select)
      const tipoDocSelector = 'select[name="tipoIdUsuario"], #tipoIdUsuario';
      try {
        await page.waitForSelector(tipoDocSelector, { timeout: 5000 });
        await this.selectDocumentType(page, tipoDocSelector, creds.usuarioTipoDoc);
        logger.info('Document type selected');
      } catch (error) {
        logger.warn('Could not select document type, trying to proceed');
      }

      // Número de documento (input)
      const numeroDocSelector = 'input[name="numeroIdUsuario"], #idNumeroIdentificacionUsuario';
      try {
        await page.waitForSelector(numeroDocSelector, { timeout: 5000 });
        await this.fillInput(page, numeroDocSelector, creds.usuarioNumeroDoc);
        logger.info('Document number filled');
      } catch (error) {
        throw new BotError('Could not find document number input', 'SOI_AUTH');
      }

      // Contraseña (input)
      logger.info('Filling password');
      const passwordSelector = 'input[name="claveUsuario"], #idClaveUsuario';
      try {
        await page.waitForSelector(passwordSelector, { timeout: 5000 });
        await this.fillInput(page, passwordSelector, creds.password);
        logger.info('Password filled');
      } catch (error) {
        throw new BotError('Could not find password input', 'SOI_AUTH');
      }

      await this.browserManager.takeScreenshot(page, 'soi-before-login');

      // Click en el botón de ingresar
      logger.info('Clicking login button');
      await this.clickSubmitButton(page);

      // Esperar navegación o mensaje de error
      await this.waitForLoginResult(page);

      // Verificar si el login fue exitoso
      const isLoggedIn = await this.checkLoginSuccess(page);

      if (!isLoggedIn) {
        const errorMessage = await this.getErrorMessage(page);
        await this.browserManager.takeScreenshot(page, 'soi-login-error');
        throw new BotError(`SOI login failed: ${errorMessage}`, 'SOI_AUTH');
      }

      // Obtener nombre del usuario logueado
      const userName = await this.getLoggedUserName(page);

      await this.browserManager.takeScreenshot(page, 'soi-login-success');

      this.session = {
        isAuthenticated: true,
        userName,
        lastLogin: new Date(),
      };

      logger.info('SOI authentication successful', { userName });

      return this.session;
    } catch (error) {
      logger.error('SOI authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.browserManager.takeScreenshot(page, 'soi-auth-error');
      throw error;
    }
  }

  /**
   * Login dinámico con credenciales de cualquier usuario independiente
   * Para operaciones en nombre del usuario
   */
  async loginAsUser(credentials: SOIUserCredentials): Promise<SOISession> {
    logger.info('Starting SOI user authentication', {
      tipoDoc: credentials.tipoDocumento,
      documento: credentials.documento,
    });

    const page = await this.initialize();

    try {
      // Navegar a la página de login de INDEPENDIENTES
      await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await this.browserManager.takeScreenshot(page, 'soi-user-login-page');

      // Esperar formulario
      await page.waitForSelector('form', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Tipo de documento
      const tipoDocSelector = 'select[name="tipoIdUsuario"], #tipoIdUsuario';
      try {
        await page.waitForSelector(tipoDocSelector, { timeout: 5000 });
        await this.selectDocumentType(page, tipoDocSelector, credentials.tipoDocumento);
        logger.info('User document type selected');
      } catch {
        logger.warn('Could not select user document type');
      }

      // Número de documento
      const numeroDocSelector = 'input[name="numeroIdUsuario"], #idNumeroIdentificacionUsuario';
      await page.waitForSelector(numeroDocSelector, { timeout: 5000 });
      await this.fillInput(page, numeroDocSelector, credentials.documento);
      logger.info('User document number filled');

      // Contraseña
      const passwordSelector = 'input[name="claveUsuario"], #idClaveUsuario';
      await page.waitForSelector(passwordSelector, { timeout: 5000 });
      await this.fillInput(page, passwordSelector, credentials.password);
      logger.info('User password filled');

      await this.browserManager.takeScreenshot(page, 'soi-user-before-login');

      // Click login
      await this.clickSubmitButton(page);

      // Esperar resultado
      await this.waitForLoginResult(page);

      // Verificar resultado
      const isLoggedIn = await this.checkLoginSuccess(page);

      if (!isLoggedIn) {
        const errorMessage = await this.getErrorMessage(page);
        await this.browserManager.takeScreenshot(page, 'soi-user-login-error');
        throw new BotError(`SOI user login failed: ${errorMessage}`, 'SOI_AUTH');
      }

      const userName = await this.getLoggedUserName(page);

      await this.browserManager.takeScreenshot(page, 'soi-user-login-success');

      this.session = {
        isAuthenticated: true,
        userName,
        tipoDocumento: credentials.tipoDocumento,
        documento: credentials.documento,
        lastLogin: new Date(),
      };

      logger.info('SOI user authentication successful', {
        userName,
        documento: credentials.documento,
      });

      return this.session;
    } catch (error) {
      logger.error('SOI user authentication failed', {
        documento: credentials.documento,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.browserManager.takeScreenshot(page, 'soi-user-auth-error');
      throw error;
    }
  }

  /**
   * Valida credenciales de un usuario sin mantener la sesión
   * Para verificar si un usuario tiene cuenta SOI válida
   *
   * @param credentials - Credenciales a validar (documento + password)
   * @returns Resultado de la validación
   */
  async validateCredentials(
    credentials: SOIUserCredentials
  ): Promise<SOICredentialsValidationResult> {
    logger.info('Validating SOI credentials', {
      tipoDoc: credentials.tipoDocumento,
      documento: credentials.documento,
    });

    // Crear instancia nueva de browser para no interferir con sesiones existentes
    const tempBrowser = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/soi-temp',
    });

    let page: Page | null = null;

    try {
      await tempBrowser.launch();
      page = await tempBrowser.newPage();

      // Navegar a login de independientes
      await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await tempBrowser.takeScreenshot(page, 'soi-validate-login-page');

      // Esperar formulario
      await page.waitForSelector('form', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Llenar tipo de documento
      const tipoDocSelector = 'select[name="tipoIdUsuario"], #tipoIdUsuario';
      try {
        await page.waitForSelector(tipoDocSelector, { timeout: 5000 });
        await this.selectDocumentType(page, tipoDocSelector, credentials.tipoDocumento);
      } catch {
        logger.warn('Could not select document type during validation');
      }

      // Llenar número de documento
      const numeroDocSelector = 'input[name="numeroIdUsuario"], #idNumeroIdentificacionUsuario';
      await page.waitForSelector(numeroDocSelector, { timeout: 5000 });
      await this.fillInput(page, numeroDocSelector, credentials.documento);

      // Llenar contraseña
      const passwordSelector = 'input[name="claveUsuario"], #idClaveUsuario';
      await page.waitForSelector(passwordSelector, { timeout: 5000 });
      await this.fillInput(page, passwordSelector, credentials.password);

      await tempBrowser.takeScreenshot(page, 'soi-validate-before-submit');

      // Click login
      await this.clickSubmitButton(page);

      // Esperar resultado
      await this.waitForLoginResult(page);

      // Verificar si el login fue exitoso
      const isLoggedIn = await this.checkLoginSuccess(page);

      if (!isLoggedIn) {
        const errorMessage = await this.getErrorMessage(page);
        await tempBrowser.takeScreenshot(page, 'soi-validate-failed');

        logger.info('SOI credentials validation failed', {
          documento: credentials.documento,
          error: errorMessage,
        });

        return {
          valid: false,
          message: errorMessage,
          error: errorMessage,
        };
      }

      // Obtener nombre del usuario
      const userName = await this.getLoggedUserName(page);

      await tempBrowser.takeScreenshot(page, 'soi-validate-success');

      logger.info('SOI credentials validated successfully', {
        documento: credentials.documento,
        userName,
      });

      return {
        valid: true,
        userName,
        accountType: 'INDEPENDIENTE',
        message: 'Credenciales válidas',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error validating SOI credentials', {
        documento: credentials.documento,
        error: errorMsg,
      });

      if (page) {
        await tempBrowser.takeScreenshot(page, 'soi-validate-error');
      }

      return {
        valid: false,
        message: 'Error al validar credenciales',
        error: errorMsg,
      };
    } finally {
      // Siempre cerrar el browser temporal
      await tempBrowser.close();
    }
  }

  /**
   * Selecciona el tipo de documento en un selector
   */
  private async selectDocumentType(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });

      // Mapear valores comunes
      const valueMap: Record<string, string> = {
        CC: 'C.C.',
        'C.C.': 'C.C.',
        CE: 'C.E.',
        'C.E.': 'C.E.',
        NIT: 'NIT',
        TI: 'T.I.',
        PA: 'PA',
      };

      const mappedValue = valueMap[value] || value;

      // Intentar seleccionar por valor o texto
      await page.evaluate(
        (sel, val) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          if (select) {
            // Buscar opción por valor o texto
            const options = Array.from(select.options);
            const option = options.find(
              (opt) =>
                opt.value === val ||
                opt.text.includes(val) ||
                opt.text === val
            );
            if (option) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        },
        selector,
        mappedValue
      );

      await page.waitForTimeout(300);
    } catch (error) {
      logger.warn('Could not select document type', { selector, value });
    }
  }

  /**
   * Llena un campo de input
   */
  private async fillInput(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector, { clickCount: 3 }); // Seleccionar todo
      await page.type(selector, value, { delay: 50 });
      await page.waitForTimeout(200);
    } catch (error) {
      logger.warn('Could not fill input', { selector });
      throw new BotError(`Failed to fill input: ${selector}`, 'SOI_AUTH');
    }
  }

  /**
   * Click en el botón de submit
   */
  private async clickSubmitButton(page: Page): Promise<void> {
    // Buscar el botón de submit - priorizar el botón de independientes
    const buttonSelectors = [
      '#botonIngresarIndp',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([disabled])',
      'input[value="Ingresar"]',
    ];

    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          // Verificar si el botón está habilitado
          const isDisabled = await page.evaluate(
            (el) => {
              const btn = el as HTMLButtonElement;
              return btn.disabled || btn.classList.contains('disabled');
            },
            button
          );

          if (!isDisabled) {
            logger.info('Clicking submit button', { selector });
            await button.click();
            return;
          } else {
            logger.warn('Submit button is disabled', { selector });
          }
        }
      } catch {
        continue;
      }
    }

    // Si no encontramos botón, intentar submit del formulario
    logger.warn('No enabled submit button found, trying form submit');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.submit();
    });
  }

  /**
   * Espera el resultado del login
   */
  private async waitForLoginResult(page: Page): Promise<void> {
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
        page.waitForSelector('.alert-danger, .error, .mensaje-error', {
          timeout: 30000,
        }),
        page.waitForSelector('.user-info, .usuario-logueado', {
          timeout: 30000,
        }),
      ]);
    } catch {
      // Timeout es aceptable, verificaremos el estado manualmente
    }
    await page.waitForTimeout(2000);
  }

  /**
   * Verifica si el login fue exitoso
   */
  private async checkLoginSuccess(page: Page): Promise<boolean> {
    const currentUrl = page.url();

    // Primero verificar si hay mensaje de error visible en la página
    const errorCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';

      // Buscar mensajes de error comunes de SOI
      const errorPatterns = [
        'Error',
        'SEG-', // Códigos de error de seguridad SOI
        'Cuenta de usuario se encuentra deshabilitada',
        'Usuario o contraseña incorrecta',
        'Usuario o clave incorrecta',
        'no existe',
        'credenciales inválidas',
        'credenciales incorrectas',
        'acceso denegado',
        'intente nuevamente',
      ];

      for (const pattern of errorPatterns) {
        if (bodyText.includes(pattern)) {
          return { hasError: true, errorText: pattern };
        }
      }

      // También buscar elementos de error específicos
      const errorElements = document.querySelectorAll(
        '.alert-danger, .error, .mensaje-error, [class*="error"], [class*="Error"]'
      );

      for (const el of errorElements) {
        const text = el.textContent?.trim();
        if (text && text.length > 0) {
          return { hasError: true, errorText: text };
        }
      }

      return { hasError: false, errorText: null };
    });

    if (errorCheck.hasError) {
      logger.info('Login error detected', { errorText: errorCheck.errorText });
      return false;
    }

    // Si seguimos en la página de login (index.do o similar), probablemente falló
    if (currentUrl.includes('index.do') || currentUrl.includes('login')) {
      // Ya verificamos errores arriba, pero si seguimos en login sin error visible,
      // puede que simplemente no se haya enviado el formulario
      return false;
    }

    // Verificar si hay elementos que indican sesión activa
    const isLoggedIn = await page.evaluate(() => {
      // Buscar indicadores de sesión activa
      const userInfo = document.querySelector(
        '.user-info, .usuario-logueado, [class*="userName"]'
      );
      const logoutLink = document.querySelector('a[href*="logout"]');
      const salirButton = Array.from(document.querySelectorAll('button, a')).find(
        el => el.textContent?.toLowerCase().includes('salir')
      );
      const mainMenu = document.querySelector(
        '.menu-principal, .menu-aportante, nav'
      );
      // Verificar si estamos en la página de inicio (dashboard)
      const isDashboard = window.location.href.includes('inicio.do');

      return !!(userInfo || logoutLink || salirButton || mainMenu || isDashboard);
    });

    return isLoggedIn;
  }

  /**
   * Obtiene el mensaje de error si existe
   */
  private async getErrorMessage(page: Page): Promise<string> {
    const errorMessage = await page.evaluate(() => {
      // Buscar elementos de error específicos de SOI
      const errorSelectors = [
        '.alert-danger',
        '.error',
        '.mensaje-error',
        '.alert',
        '[class*="error"]',
        '[class*="Error"]',
      ];

      for (const selector of errorSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 500) {
              return text;
            }
          }
        } catch {
          continue;
        }
      }

      // Buscar texto de error en el body
      const bodyText = document.body.innerText || '';
      const errorPatterns = [
        /SEG-\d+:\s*[^\n]+/i,
        /Error[:\s]+[^\n]+/i,
        /Usuario o (contraseña|clave) incorrecta/i,
        /Cuenta.*deshabilitada/i,
        /no existe/i,
      ];

      for (const pattern of errorPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          return match[0].trim();
        }
      }

      return 'Credenciales inválidas o error de autenticación';
    });
    return errorMessage;
  }

  /**
   * Obtiene el nombre del usuario logueado
   */
  private async getLoggedUserName(page: Page): Promise<string> {
    const userName = await page.evaluate(() => {
      const userElement = document.querySelector(
        '.user-info, .usuario-logueado, [class*="userName"]'
      );
      return userElement?.textContent?.trim() || 'Unknown';
    });
    return userName;
  }

  /**
   * Obtiene las credenciales por defecto desde la configuración
   */
  private getDefaultCredentials(): SOICredentials {
    return {
      empresaTipoDoc: config.soi?.admin?.empresaTipoDoc || 'CC',
      empresaNumeroDoc: config.soi?.admin?.empresaNumeroDoc || '',
      usuarioTipoDoc: config.soi?.admin?.usuarioTipoDoc || 'CC',
      usuarioNumeroDoc: config.soi?.admin?.usuarioNumeroDoc || '',
      password: config.soi?.admin?.password || '',
    };
  }

  /**
   * Verifica si la sesión sigue activa
   */
  async isSessionValid(): Promise<boolean> {
    if (!this.session.isAuthenticated || !this.page) {
      return false;
    }

    try {
      // Verificar si hay indicador de sesión expirada
      const isExpired = await this.page.evaluate(() => {
        const expiredIndicator = document.querySelector(
          '.session-expired, :has-text("sesión ha expirado")'
        );
        return !!expiredIndicator;
      });

      if (isExpired) {
        this.session.isAuthenticated = false;
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Asegura que haya una sesión autenticada válida
   */
  async ensureAuthenticated(credentials?: SOICredentials): Promise<Page> {
    const isValid = await this.isSessionValid();

    if (!isValid) {
      logger.info('Session expired or invalid, re-authenticating');
      await this.login(credentials);
    }

    return this.page!;
  }

  /**
   * Obtiene la página actual
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Obtiene la sesión actual
   */
  getSession(): SOISession {
    return this.session;
  }

  /**
   * Cierra el navegador
   */
  async close(): Promise<void> {
    await this.browserManager.close();
    this.page = null;
    this.session = { isAuthenticated: false };
  }
}

// Singleton para reutilizar la sesión
let soiAuthBotInstance: SOIAuthBot | null = null;

export function getSOIAuthBot(): SOIAuthBot {
  if (!soiAuthBotInstance) {
    soiAuthBotInstance = new SOIAuthBot();
  }
  return soiAuthBotInstance;
}

export async function resetSOIAuthBot(): Promise<void> {
  if (soiAuthBotInstance) {
    await soiAuthBotInstance.close();
    soiAuthBotInstance = null;
  }
}
