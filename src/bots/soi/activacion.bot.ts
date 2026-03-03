/**
 * SOI Account Activation Bot
 *
 * Automatiza la activación de cuentas SOI:
 * 1. Navega al link de activación desde el email
 * 2. Completa el formulario de creación de contraseña
 * 3. Guarda las credenciales encriptadas
 *
 * Flujo completo:
 * - Gmail Reader encuentra email de activación
 * - Este bot navega al link de activación
 * - Llena la contraseña (generada automáticamente)
 * - Devuelve la contraseña para guardar en BD
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../utils/browser';
import { createLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { generateSecurePassword } from '../../utils/crypto';

const logger = createLogger({ service: 'soi-activacion-bot' });

// Selectores para el formulario de activación
const ACTIVATION_SELECTORS = {
  // Campos de contraseña
  PASSWORD_INPUT: 'input[type="password"][name*="password"], input[type="password"][name*="contrasena"], input[type="password"][name*="clave"]',
  PASSWORD_CONFIRM: 'input[type="password"][name*="confirm"], input[type="password"][name*="repetir"], input[type="password"][name*="verifica"]',

  // Botón de envío
  SUBMIT_BUTTON: 'button[type="submit"], input[type="submit"], button:contains("Guardar"), button:contains("Crear"), button:contains("Activar")',

  // Mensajes
  SUCCESS_MESSAGE: '.success, .alert-success, .exito, [class*="success"]',
  ERROR_MESSAGE: '.error, .alert-danger, .alert-error, [class*="error"]',

  // Alternativos específicos de SOI (basados en patrones comunes)
  SOI_PASSWORD_FIELD: '#password, #contrasena, #clave, input[id*="password"], input[id*="contrasena"]',
  SOI_CONFIRM_FIELD: '#confirmPassword, #confirmarContrasena, #confirmar, input[id*="confirm"], input[id*="repetir"]',
  SOI_SUBMIT: 'button.btn-primary, input.btn-primary, button[class*="submit"], .btn-enviar',
};

/**
 * Resultado de la activación de cuenta
 */
export interface ActivationResult {
  success: boolean;
  accountActivated: boolean;
  generatedPassword?: string;  // Contraseña generada (en texto plano, para encriptar después)
  message: string;
  error?: string;
  screenshotPath?: string;
}

/**
 * Datos necesarios para activar una cuenta
 */
export interface ActivationData {
  activationLink: string;
  numeroDocumento: string;
  nombreCompleto?: string;
  // Si se proporciona password, usa esa; si no, genera una
  customPassword?: string;
}

/**
 * Bot para activar cuentas SOI
 */
export class SOIActivacionBot {
  private browserManager: BrowserManager;
  private page: Page | null = null;

  constructor() {
    this.browserManager = new BrowserManager({
      headless: config.puppeteer.headless,
      downloadsPath: './downloads/soi-activacion',
    });
  }

  /**
   * Activa una cuenta SOI usando el link del email
   */
  async activarCuenta(data: ActivationData): Promise<ActivationResult> {
    logger.info('Starting SOI account activation', {
      documento: data.numeroDocumento,
      link: data.activationLink.substring(0, 50) + '...',
    });

    try {
      // Iniciar navegador
      await this.browserManager.launch();
      this.page = await this.browserManager.newPage();

      // Navegar al link de activación
      logger.info('Navigating to activation link');
      await this.page.goto(data.activationLink, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await this.browserManager.takeScreenshot(this.page, `activacion-${data.numeroDocumento}-01-landing`);

      // Esperar a que cargue el formulario
      await this.sleep(2000);

      // Verificar si ya está activada o hay error
      const pageContent = await this.page.content();
      if (pageContent.includes('ya ha sido activada') || pageContent.includes('cuenta activa')) {
        logger.info('Account already activated');
        return {
          success: true,
          accountActivated: true,
          message: 'La cuenta ya estaba activada previamente',
        };
      }

      if (pageContent.includes('enlace no válido') || pageContent.includes('enlace expirado') || pageContent.includes('link inválido')) {
        logger.error('Activation link is invalid or expired');
        return {
          success: false,
          accountActivated: false,
          message: 'El enlace de activación no es válido o ha expirado',
          error: 'LINK_INVALIDO',
        };
      }

      // Generar o usar contraseña proporcionada
      const password = data.customPassword || generateSecurePassword();
      logger.info('Using password for activation', { passwordLength: password.length });

      // Buscar y llenar campos de contraseña
      const passwordFilled = await this.fillPasswordFields(password);
      if (!passwordFilled) {
        await this.browserManager.takeScreenshot(this.page, `activacion-${data.numeroDocumento}-error-campos`);
        return {
          success: false,
          accountActivated: false,
          message: 'No se encontraron los campos de contraseña en el formulario',
          error: 'CAMPOS_NO_ENCONTRADOS',
        };
      }

      await this.browserManager.takeScreenshot(this.page, `activacion-${data.numeroDocumento}-02-filled`);

      // Hacer click en el botón de envío
      const submitted = await this.clickSubmitButton();
      if (!submitted) {
        return {
          success: false,
          accountActivated: false,
          message: 'No se pudo encontrar o hacer click en el botón de envío',
          error: 'BOTON_NO_ENCONTRADO',
        };
      }

      // Esperar respuesta
      await this.sleep(3000);

      // Verificar resultado
      const result = await this.verifyActivationResult();

      await this.browserManager.takeScreenshot(this.page, `activacion-${data.numeroDocumento}-03-result`);

      if (result.success) {
        logger.info('Account activation successful', { documento: data.numeroDocumento });
        return {
          success: true,
          accountActivated: true,
          generatedPassword: password,
          message: 'Cuenta activada exitosamente',
        };
      } else {
        logger.error('Account activation failed', { error: result.error });
        return {
          success: false,
          accountActivated: false,
          message: result.message || 'Error al activar la cuenta',
          error: result.error,
        };
      }
    } catch (error) {
      logger.error('Unexpected error during activation', { error });

      if (this.page) {
        await this.browserManager.takeScreenshot(this.page, `activacion-${data.numeroDocumento}-error`);
      }

      return {
        success: false,
        accountActivated: false,
        message: 'Error inesperado durante la activación',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      await this.close();
    }
  }

  /**
   * Llena los campos de contraseña en el formulario
   */
  private async fillPasswordFields(password: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Buscar campo de contraseña principal
      const passwordSelector = await this.findSelector([
        ACTIVATION_SELECTORS.SOI_PASSWORD_FIELD,
        ACTIVATION_SELECTORS.PASSWORD_INPUT,
        'input[type="password"]:first-of-type',
      ]);

      if (!passwordSelector) {
        logger.error('Password field not found');
        return false;
      }

      // Limpiar y llenar campo de contraseña
      await this.page.click(passwordSelector, { clickCount: 3 });
      await this.page.type(passwordSelector, password, { delay: 50 });
      logger.info('Password field filled');

      // Buscar campo de confirmación
      const confirmSelector = await this.findSelector([
        ACTIVATION_SELECTORS.SOI_CONFIRM_FIELD,
        ACTIVATION_SELECTORS.PASSWORD_CONFIRM,
        'input[type="password"]:nth-of-type(2)',
        'input[type="password"]:last-of-type',
      ]);

      if (confirmSelector && confirmSelector !== passwordSelector) {
        await this.page.click(confirmSelector, { clickCount: 3 });
        await this.page.type(confirmSelector, password, { delay: 50 });
        logger.info('Confirmation field filled');
      } else {
        // Puede que solo haya un campo de contraseña
        logger.info('No confirmation field found (might be single field)');
      }

      return true;
    } catch (error) {
      logger.error('Error filling password fields', { error });
      return false;
    }
  }

  /**
   * Busca el primer selector que exista en la página
   */
  private async findSelector(selectors: string[]): Promise<string | null> {
    if (!this.page) return null;

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          return selector;
        }
      } catch {
        // Continuar con el siguiente
      }
    }

    return null;
  }

  /**
   * Hace click en el botón de envío del formulario
   */
  private async clickSubmitButton(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Buscar botón por múltiples estrategias
      const buttonSelectors = [
        ACTIVATION_SELECTORS.SOI_SUBMIT,
        ACTIVATION_SELECTORS.SUBMIT_BUTTON,
        'button[type="submit"]',
        'input[type="submit"]',
        'button.btn-success',
        '.btn-primary',
      ];

      for (const selector of buttonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            // Verificar que sea visible y esté habilitado
            const isVisible = await this.page.evaluate(
              (sel) => {
                const el = document.querySelector(sel) as HTMLButtonElement;
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
              },
              selector
            );

            if (isVisible) {
              await this.page.click(selector);
              logger.info('Submit button clicked', { selector });
              return true;
            }
          }
        } catch {
          // Continuar
        }
      }

      // Intento alternativo: buscar por texto
      const clickedByText = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const targetTexts = ['guardar', 'crear', 'activar', 'enviar', 'confirmar', 'aceptar'];

        for (const btn of buttons) {
          const text = (btn.textContent || (btn as HTMLInputElement).value || '').toLowerCase();
          if (targetTexts.some(t => text.includes(t))) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clickedByText) {
        logger.info('Submit button clicked by text search');
        return true;
      }

      logger.error('Could not find submit button');
      return false;
    } catch (error) {
      logger.error('Error clicking submit button', { error });
      return false;
    }
  }

  /**
   * Verifica el resultado de la activación
   */
  private async verifyActivationResult(): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'No page available' };
    }

    try {
      const pageContent = await this.page.content();
      const bodyText = await this.page.evaluate(() => document.body.innerText);

      // Verificar éxito
      const successPatterns = [
        'cuenta activada',
        'activación exitosa',
        'contraseña creada',
        'password creada',
        'registro exitoso',
        'cuenta creada',
        'bienvenido',
        'iniciar sesión',
        'ya puedes ingresar',
      ];

      for (const pattern of successPatterns) {
        if (bodyText.toLowerCase().includes(pattern)) {
          return { success: true, message: `Patrón de éxito encontrado: ${pattern}` };
        }
      }

      // Verificar errores
      const errorPatterns = [
        { pattern: 'contraseña debe', error: 'PASSWORD_REQUIREMENTS' },
        { pattern: 'contraseñas no coinciden', error: 'PASSWORD_MISMATCH' },
        { pattern: 'enlace expirado', error: 'LINK_EXPIRED' },
        { pattern: 'enlace inválido', error: 'LINK_INVALID' },
        { pattern: 'error', error: 'GENERAL_ERROR' },
        { pattern: 'ya existe', error: 'ACCOUNT_EXISTS' },
      ];

      for (const { pattern, error } of errorPatterns) {
        if (bodyText.toLowerCase().includes(pattern)) {
          return { success: false, message: `Error detectado: ${pattern}`, error };
        }
      }

      // Si llegamos a una página de login, probablemente fue exitoso
      if (pageContent.includes('login') || pageContent.includes('iniciar sesión') || bodyText.toLowerCase().includes('usuario')) {
        return { success: true, message: 'Redirigido a página de login (activación exitosa)' };
      }

      // No se pudo determinar el resultado
      return { success: false, error: 'UNKNOWN_RESULT', message: 'No se pudo determinar el resultado de la activación' };
    } catch (error) {
      logger.error('Error verifying activation result', { error });
      return { success: false, error: 'VERIFICATION_ERROR' };
    }
  }

  /**
   * Cierra el navegador
   */
  async close(): Promise<void> {
    try {
      await this.browserManager.close();
      this.page = null;
    } catch (error) {
      logger.error('Error closing browser', { error });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Función helper para activar una cuenta SOI
 */
export async function activarCuentaSOI(data: ActivationData): Promise<ActivationResult> {
  const bot = new SOIActivacionBot();
  return bot.activarCuenta(data);
}

export default SOIActivacionBot;
