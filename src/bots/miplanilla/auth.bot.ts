/**
 * Mi Planilla Authentication Bot
 * Maneja el login y autenticación en el portal Mi Planilla
 *
 * Login: Usuario = CC + documento (ej: CC1047484978)
 * A diferencia de SOI, el usuario es siempre CC + número de documento
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { BotError } from '../utils/errors';
import {
  MIPLANILLA_URLS,
  MIPLANILLA_SELECTORS,
  MiPlanillaCredentials,
  MiPlanillaAuthResult,
  generateMiPlanillaUser,
} from '../../types/miplanilla.types';

export interface MiPlanillaSession {
  isAuthenticated: boolean;
  userName?: string;
  tipoDocumento?: string;
  documento?: string;
  lastLogin?: Date;
}

export class MiPlanillaAuthBot {
  private browserManager: BrowserManager;
  private page: Page | null = null;
  private session: MiPlanillaSession = { isAuthenticated: false };

  constructor() {
    this.browserManager = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/miplanilla',
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
   * Login en Mi Planilla con credenciales de usuario
   */
  async login(credentials: MiPlanillaCredentials): Promise<MiPlanillaSession> {
    const usuario = generateMiPlanillaUser(credentials.tipoDocumento, credentials.documento);

    logger.info('Starting Mi Planilla authentication', {
      usuario,
      documento: credentials.documento,
    });

    const page = await this.initialize();

    try {
      // Navegar a la página de login
      // NOTA: Usar domcontentloaded en lugar de networkidle0 (timeout frecuente)
      logger.info('Navigating to Mi Planilla login page');
      await page.goto(MIPLANILLA_URLS.portalIndependientes, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3000); // Esperar que cargue completamente

      await this.browserManager.takeScreenshot(page, 'miplanilla-login-page');

      // Cerrar popup si existe
      await this.cerrarPopupSiExiste(page);

      // El formulario de login NO tiene select de tipo documento
      // El campo #usuario acepta directamente CC1047484978
      logger.info('Filling user credentials', { usuario });

      // Usuario (CC + documento) en #usuario
      await this.fillInput(
        page,
        MIPLANILLA_SELECTORS.inputNumDocLogin,
        usuario // CC1047484978
      );
      await page.waitForTimeout(300);

      // Contraseña en #clave
      await this.fillInput(
        page,
        MIPLANILLA_SELECTORS.inputPasswordLogin,
        credentials.password
      );
      await page.waitForTimeout(300);

      await this.browserManager.takeScreenshot(page, 'miplanilla-before-login');

      // Click en el botón de ingresar
      logger.info('Clicking login button');
      await this.clickLoginButton(page);

      // Esperar resultado (aumentar tiempo de espera)
      await this.waitForLoginResult(page);

      // Verificar si el login fue exitoso
      const isLoggedIn = await this.checkLoginSuccess(page);

      if (!isLoggedIn) {
        const errorMessage = await this.getErrorMessage(page);
        await this.browserManager.takeScreenshot(page, 'miplanilla-login-error');
        throw new BotError(`Mi Planilla login failed: ${errorMessage}`, 'MIPLANILLA_AUTH');
      }

      // Obtener nombre del usuario logueado
      const userName = await this.getLoggedUserName(page);

      await this.browserManager.takeScreenshot(page, 'miplanilla-login-success');

      this.session = {
        isAuthenticated: true,
        userName,
        tipoDocumento: credentials.tipoDocumento,
        documento: credentials.documento,
        lastLogin: new Date(),
      };

      logger.info('Mi Planilla authentication successful', { userName });

      return this.session;
    } catch (error) {
      logger.error('Mi Planilla authentication failed', {
        documento: credentials.documento,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.browserManager.takeScreenshot(page, 'miplanilla-auth-error');
      throw error;
    }
  }

  /**
   * Valida credenciales sin mantener la sesión
   */
  async validateCredentials(credentials: MiPlanillaCredentials): Promise<MiPlanillaAuthResult> {
    const usuario = generateMiPlanillaUser(credentials.tipoDocumento, credentials.documento);

    logger.info('Validating Mi Planilla credentials', {
      usuario,
      documento: credentials.documento,
    });

    // Crear instancia nueva de browser para no interferir con sesiones existentes
    const tempBrowser = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/miplanilla-temp',
    });

    let page: Page | null = null;

    try {
      await tempBrowser.launch();
      page = await tempBrowser.newPage();

      // Navegar a login (usar domcontentloaded en lugar de networkidle0)
      await page.goto(MIPLANILLA_URLS.portalIndependientes, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      await tempBrowser.takeScreenshot(page, 'miplanilla-validate-login-page');

      // Cerrar popup si existe
      await this.cerrarPopupSiExiste(page);

      // Llenar credenciales (no hay select de tipo doc, el usuario incluye CC)
      await this.fillInput(page, MIPLANILLA_SELECTORS.inputNumDocLogin, usuario);
      await this.fillInput(page, MIPLANILLA_SELECTORS.inputPasswordLogin, credentials.password);

      await tempBrowser.takeScreenshot(page, 'miplanilla-validate-before-submit');

      // Click login
      await this.clickLoginButton(page);

      // Esperar resultado
      await this.waitForLoginResult(page);

      // Verificar resultado
      const isLoggedIn = await this.checkLoginSuccess(page);

      if (!isLoggedIn) {
        const errorMessage = await this.getErrorMessage(page);
        await tempBrowser.takeScreenshot(page, 'miplanilla-validate-failed');

        logger.info('Mi Planilla credentials validation failed', {
          documento: credentials.documento,
          error: errorMessage,
        });

        return {
          success: false,
          loggedIn: false,
          message: errorMessage,
          error: errorMessage,
        };
      }

      const userName = await this.getLoggedUserName(page);

      await tempBrowser.takeScreenshot(page, 'miplanilla-validate-success');

      logger.info('Mi Planilla credentials validated successfully', {
        documento: credentials.documento,
        userName,
      });

      return {
        success: true,
        loggedIn: true,
        nombreUsuario: userName,
        message: 'Credenciales válidas',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error validating Mi Planilla credentials', {
        documento: credentials.documento,
        error: errorMsg,
      });

      if (page) {
        await tempBrowser.takeScreenshot(page, 'miplanilla-validate-error');
      }

      return {
        success: false,
        loggedIn: false,
        message: 'Error al validar credenciales',
        error: errorMsg,
      };
    } finally {
      await tempBrowser.close();
    }
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
   * Llena un campo de input
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
          await page.type(selector, value, { delay: 50 });
          return;
        }
      } catch {
        continue;
      }
    }
    throw new BotError('Could not find input field', 'MIPLANILLA_AUTH');
  }

  /**
   * Click en el botón de login
   */
  private async clickLoginButton(page: Page): Promise<void> {
    // Intentar con selectores específicos
    for (const selector of MIPLANILLA_SELECTORS.btnEntrar) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          return;
        }
      } catch {
        continue;
      }
    }

    // Si contiene :has-text, buscar por texto
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], a');
      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value;
        if (text?.toLowerCase().includes('entrar') || text?.toLowerCase().includes('ingresar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      // Intentar submit del formulario
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.submit();
      });
    }
  }

  /**
   * Espera el resultado del login
   */
  private async waitForLoginResult(page: Page): Promise<void> {
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
        page.waitForSelector('.alert-danger, .error, [class*="error"]', {
          timeout: 30000,
        }),
        page.waitForSelector('[class*="Principal"], [class*="dashboard"]', {
          timeout: 30000,
        }),
      ]);
    } catch {
      // Timeout es aceptable
    }
    await page.waitForTimeout(2000);
  }

  /**
   * Verifica si el login fue exitoso
   */
  private async checkLoginSuccess(page: Page): Promise<boolean> {
    const currentUrl = page.url();

    // Verificar si hay mensaje de error
    const hasError = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const errorPatterns = [
        'error',
        'incorrecta',
        'inválida',
        'no existe',
        'credenciales',
        'intente nuevamente',
        'usuario o clave',
      ];

      for (const pattern of errorPatterns) {
        if (bodyText.includes(pattern)) {
          return true;
        }
      }

      const errorEl = document.querySelector('.alert-danger, .error, [class*="error"]');
      return !!errorEl?.textContent?.trim();
    });

    if (hasError) {
      return false;
    }

    // Verificar si estamos en el dashboard
    if (currentUrl.includes('Principal') || currentUrl.includes('Privado')) {
      return true;
    }

    // Verificar indicadores de sesión activa
    const isLoggedIn = await page.evaluate(() => {
      const userInfo = document.querySelector(
        '.user-info, [class*="usuario"], [class*="bienvenido"]'
      );
      const logoutLink = document.querySelector('a[href*="logout"], a[href*="salir"]');
      const mainMenu = document.querySelector('.menu, nav, [class*="sidebar"]');
      const dashboardContent = document.querySelector(
        '[class*="dashboard"], [class*="planilla"]'
      );

      return !!(userInfo || logoutLink || mainMenu || dashboardContent);
    });

    return isLoggedIn;
  }

  /**
   * Obtiene el mensaje de error
   */
  private async getErrorMessage(page: Page): Promise<string> {
    const errorMessage = await page.evaluate(() => {
      const errorSelectors = [
        '.alert-danger',
        '.error',
        '.mensaje-error',
        '[class*="error"]',
      ];

      for (const selector of errorSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      return 'Usuario o contraseña incorrecta';
    });
    return errorMessage;
  }

  /**
   * Obtiene el nombre del usuario logueado
   */
  private async getLoggedUserName(page: Page): Promise<string> {
    const userName = await page.evaluate(() => {
      const selectors = [
        '.user-info',
        '[class*="usuario"]',
        '[class*="bienvenido"]',
        '.nombre-usuario',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      return 'Usuario';
    });
    return userName;
  }

  /**
   * Verifica si la sesión sigue activa
   */
  async isSessionValid(): Promise<boolean> {
    if (!this.session.isAuthenticated || !this.page) {
      return false;
    }

    try {
      const currentUrl = this.page.url();

      // Si estamos en la página de login, la sesión expiró
      if (currentUrl.includes('Index') || currentUrl.includes('login')) {
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
  async ensureAuthenticated(credentials: MiPlanillaCredentials): Promise<Page> {
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
  getSession(): MiPlanillaSession {
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
let miPlanillaAuthBotInstance: MiPlanillaAuthBot | null = null;

export function getMiPlanillaAuthBot(): MiPlanillaAuthBot {
  if (!miPlanillaAuthBotInstance) {
    miPlanillaAuthBotInstance = new MiPlanillaAuthBot();
  }
  return miPlanillaAuthBotInstance;
}

export async function resetMiPlanillaAuthBot(): Promise<void> {
  if (miPlanillaAuthBotInstance) {
    await miPlanillaAuthBotInstance.close();
    miPlanillaAuthBotInstance = null;
  }
}

export default MiPlanillaAuthBot;
