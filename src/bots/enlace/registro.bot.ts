/**
 * Registration Bot for Enlace Operativo
 * Handles registration of new users (aportantes) in the system
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { UserData, BotResponse, EnlaceRegistroResult } from '../../types';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import {
  waitAndClick,
  waitAndType,
  sleep,
  elementExists,
  selectOption,
  randomDelay,
  scrollToElement,
} from '../utils/wait';
import { browserManager } from '../utils/browser';
import { BotError } from '../../utils/errors';
import { enlaceAuth } from './auth.bot';
import { usuarioExisteEnlace } from './search.bot';

/**
 * Registration Bot Class
 * Manages user registration flow in Enlace Operativo
 */
export class EnlaceRegistroBot {
  /**
   * Register a new user in Enlace Operativo
   * @param userData - Complete user information from ULE
   * @returns Registration result with enlaceUserId
   */
  async registrarUsuario(userData: UserData): Promise<BotResponse<EnlaceRegistroResult>> {
    const startTime = Date.now();

    logger.info('Starting user registration in Enlace', {
      documento: userData.numeroDocumento,
      nombre: userData.nombre,
    });

    // Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    try {
      // 1. Check if user already exists
      logger.info('Checking if user already exists');
      const yaExiste = await usuarioExisteEnlace(page, userData.numeroDocumento);

      if (yaExiste) {
        logger.warn('User already exists in Enlace, skipping registration', {
          documento: userData.numeroDocumento,
        });

        return {
          success: true,
          data: {
            registered: false,
            error: 'User already exists in Enlace',
          },
          duration: Date.now() - startTime,
        };
      }

      // 2. Navigate to Aportantes section
      logger.info('Navigating to Aportantes section');
      await this.navigateToAportantes(page);

      // 3. Click "Add new aportante" button
      logger.info('Opening registration form');
      await this.openRegistrationForm(page);

      // 4. Fill registration form
      logger.info('Filling registration form');
      await this.fillRegistrationForm(page, userData);

      // 5. Submit form
      logger.info('Submitting registration form');
      await this.submitRegistrationForm(page);

      // 6. Verify success
      logger.info('Verifying registration success');
      const registrationResult = await this.verifyRegistrationSuccess(page, userData);

      logger.info('✅ User registration completed successfully', {
        documento: userData.numeroDocumento,
        enlaceUserId: registrationResult.enlaceUserId,
      });

      return {
        success: true,
        data: registrationResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('❌ User registration failed', {
        error,
        documento: userData.numeroDocumento,
      });

      const screenshot = await browserManager.takeScreenshot(page, 'registro-error');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown registration error',
        screenshot,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Navigate to Aportantes section
   */
  private async navigateToAportantes(page: Page): Promise<void> {
    try {
      // Try clicking menu item first
      const menuItemExists = await elementExists(page, SELECTORS.APORTANTES.MENU_ITEM);
      if (menuItemExists) {
        await waitAndClick(page, SELECTORS.APORTANTES.MENU_ITEM);
        await sleep(1000);
      } else {
        // Navigate directly to URL
        logger.debug('Menu item not found, navigating to URL');
        await page.goto(URL_PATTERNS.APORTANTES, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      await randomDelay(1000, 2000);
      await browserManager.takeScreenshot(page, 'aportantes-section');
    } catch (error) {
      throw new BotError('Failed to navigate to Aportantes section');
    }
  }

  /**
   * Open registration form by clicking "Add" button
   */
  private async openRegistrationForm(page: Page): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-add-button');

      // Try multiple possible button selectors
      const addButtonSelectors = [
        SELECTORS.APORTANTES.AGREGAR_APORTANTE,
        SELECTORS.APORTANTES.NUEVO_APORTANTE,
        SELECTORS.APORTANTES.AGREGAR_BUTTON,
      ];

      let buttonClicked = false;

      for (const selector of addButtonSelectors) {
        const buttonExists = await elementExists(page, selector);
        if (buttonExists) {
          logger.debug('Clicking add button', { selector });
          await waitAndClick(page, selector);
          buttonClicked = true;
          break;
        }
      }

      if (!buttonClicked) {
        throw new BotError('Add aportante button not found');
      }

      // Wait for form to appear
      await sleep(2000);
      await browserManager.takeScreenshot(page, 'registration-form-opened');

      // Verify form is visible
      const formVisible = await elementExists(page, SELECTORS.APORTANTES.FORM.NUMERO_DOC);
      if (!formVisible) {
        throw new BotError('Registration form did not appear');
      }

      logger.debug('Registration form opened successfully');
    } catch (error) {
      throw new BotError('Failed to open registration form');
    }
  }

  /**
   * Fill registration form with user data
   */
  private async fillRegistrationForm(page: Page, userData: UserData): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'form-before-fill');

      // 1. Tipo de documento
      logger.debug('Selecting document type', { tipo: userData.tipoDocumento });
      const tipoDocExists = await elementExists(page, SELECTORS.APORTANTES.FORM.TIPO_DOC);
      if (tipoDocExists) {
        await selectOption(page, SELECTORS.APORTANTES.FORM.TIPO_DOC, userData.tipoDocumento);
        await randomDelay(300, 500);
      }

      // 2. Número de documento
      logger.debug('Entering document number');
      await waitAndType(
        page,
        SELECTORS.APORTANTES.FORM.NUMERO_DOC,
        userData.numeroDocumento,
        { clear: true, delay: 100 }
      );
      await randomDelay(300, 500);

      // 3. Handle name fields (could be single "nombre" or split into primer/segundo nombre/apellido)
      await this.fillNameFields(page, userData);

      // 4. Email
      logger.debug('Entering email');
      const emailExists = await elementExists(page, SELECTORS.APORTANTES.FORM.EMAIL);
      if (emailExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.EMAIL, userData.email, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }

      // 5. Teléfono
      logger.debug('Entering phone');
      const telefonoExists = await elementExists(page, SELECTORS.APORTANTES.FORM.TELEFONO);
      const celularExists = await elementExists(page, SELECTORS.APORTANTES.FORM.CELULAR);

      if (telefonoExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.TELEFONO, userData.telefono, {
          clear: true,
          delay: 80,
        });
      } else if (celularExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.CELULAR, userData.telefono, {
          clear: true,
          delay: 80,
        });
      }
      await randomDelay(300, 500);

      // 6. Dirección
      logger.debug('Entering address');
      const direccionExists = await elementExists(page, SELECTORS.APORTANTES.FORM.DIRECCION);
      if (direccionExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.DIRECCION, userData.direccion, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }

      // 7. Ciudad
      logger.debug('Entering city');
      const ciudadExists = await elementExists(page, SELECTORS.APORTANTES.FORM.CIUDAD);
      if (ciudadExists) {
        // Could be input or select - check element type
        const isSelect = await page.$eval(
          SELECTORS.APORTANTES.FORM.CIUDAD,
          (el) => el.tagName === 'SELECT'
        );

        if (isSelect) {
          // Try to select by text or value
          await page.evaluate(
            (selector, city) => {
              const select = document.querySelector(selector) as HTMLSelectElement;
              if (select) {
                // Try to find option by text
                const options = Array.from(select.options);
                const option = options.find((opt) =>
                  opt.text.toLowerCase().includes(city.toLowerCase())
                );
                if (option) {
                  select.value = option.value;
                }
              }
            },
            SELECTORS.APORTANTES.FORM.CIUDAD,
            userData.ciudad
          );
        } else {
          // It's an input field
          await waitAndType(page, SELECTORS.APORTANTES.FORM.CIUDAD, userData.ciudad, {
            clear: true,
            delay: 80,
          });
        }
        await randomDelay(300, 500);
      }

      // 8. EPS (Salud)
      logger.debug('Selecting EPS', { eps: userData.eps });
      const epsExists = await elementExists(page, SELECTORS.APORTANTES.FORM.EPS);
      if (epsExists) {
        await this.selectByPartialMatch(page, SELECTORS.APORTANTES.FORM.EPS, userData.eps);
        await randomDelay(500, 800);
      }

      // 9. Pensión
      logger.debug('Selecting Pension', { pension: userData.pension });
      const pensionExists = await elementExists(page, SELECTORS.APORTANTES.FORM.PENSION);
      const afpExists = await elementExists(page, SELECTORS.APORTANTES.FORM.AFP);

      if (pensionExists) {
        await this.selectByPartialMatch(
          page,
          SELECTORS.APORTANTES.FORM.PENSION,
          userData.pension
        );
      } else if (afpExists) {
        await this.selectByPartialMatch(page, SELECTORS.APORTANTES.FORM.AFP, userData.pension);
      }
      await randomDelay(500, 800);

      // 10. ARL
      logger.debug('Selecting ARL', { arl: userData.arl });
      const arlExists = await elementExists(page, SELECTORS.APORTANTES.FORM.ARL);
      if (arlExists) {
        await this.selectByPartialMatch(page, SELECTORS.APORTANTES.FORM.ARL, userData.arl);
        await randomDelay(500, 800);
      }

      // 11. Caja de Compensación (if exists)
      const cajaExists = await elementExists(page, SELECTORS.APORTANTES.FORM.CAJA_COMPENSACION);
      if (cajaExists) {
        logger.debug('Caja de compensación field found, skipping (optional)');
        // Usually optional, skip for now
      }

      await browserManager.takeScreenshot(page, 'form-after-fill');
      logger.info('✅ Form filled successfully');
    } catch (error) {
      logger.error('Error filling registration form', { error });
      await browserManager.takeScreenshot(page, 'form-fill-error');
      throw new BotError('Failed to fill registration form');
    }
  }

  /**
   * Handle name fields (could be single or split)
   */
  private async fillNameFields(page: Page, userData: UserData): Promise<void> {
    // Check if form has split name fields
    const primerNombreExists = await elementExists(page, SELECTORS.APORTANTES.FORM.PRIMER_NOMBRE);

    if (primerNombreExists) {
      // Split name into parts
      const nameParts = this.splitFullName(userData.nombre);

      logger.debug('Entering split name fields', nameParts);

      // Primer Nombre
      await waitAndType(
        page,
        SELECTORS.APORTANTES.FORM.PRIMER_NOMBRE,
        nameParts.primerNombre,
        { clear: true, delay: 80 }
      );
      await randomDelay(200, 400);

      // Segundo Nombre (optional)
      const segundoNombreExists = await elementExists(
        page,
        SELECTORS.APORTANTES.FORM.SEGUNDO_NOMBRE
      );
      if (segundoNombreExists && nameParts.segundoNombre) {
        await waitAndType(
          page,
          SELECTORS.APORTANTES.FORM.SEGUNDO_NOMBRE,
          nameParts.segundoNombre,
          { clear: true, delay: 80 }
        );
        await randomDelay(200, 400);
      }

      // Primer Apellido
      await waitAndType(
        page,
        SELECTORS.APORTANTES.FORM.PRIMER_APELLIDO,
        nameParts.primerApellido,
        { clear: true, delay: 80 }
      );
      await randomDelay(200, 400);

      // Segundo Apellido (optional)
      const segundoApellidoExists = await elementExists(
        page,
        SELECTORS.APORTANTES.FORM.SEGUNDO_APELLIDO
      );
      if (segundoApellidoExists && nameParts.segundoApellido) {
        await waitAndType(
          page,
          SELECTORS.APORTANTES.FORM.SEGUNDO_APELLIDO,
          nameParts.segundoApellido,
          { clear: true, delay: 80 }
        );
        await randomDelay(200, 400);
      }
    } else {
      // Single name field
      const nombreExists = await elementExists(page, SELECTORS.APORTANTES.FORM.NOMBRE);
      if (nombreExists) {
        logger.debug('Entering full name in single field');
        await waitAndType(page, SELECTORS.APORTANTES.FORM.NOMBRE, userData.nombre, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }
    }
  }

  /**
   * Split full name into parts
   * Format: "Primer Nombre Segundo Nombre Primer Apellido Segundo Apellido"
   */
  private splitFullName(fullName: string): {
    primerNombre: string;
    segundoNombre?: string;
    primerApellido: string;
    segundoApellido?: string;
  } {
    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 2) {
      // "Nombre Apellido"
      return {
        primerNombre: parts[0],
        primerApellido: parts[1],
      };
    } else if (parts.length === 3) {
      // "Nombre Apellido1 Apellido2" or "Nombre1 Nombre2 Apellido"
      return {
        primerNombre: parts[0],
        primerApellido: parts[1],
        segundoApellido: parts[2],
      };
    } else if (parts.length >= 4) {
      // "Nombre1 Nombre2 Apellido1 Apellido2"
      return {
        primerNombre: parts[0],
        segundoNombre: parts[1],
        primerApellido: parts[2],
        segundoApellido: parts.slice(3).join(' '), // Join remaining parts
      };
    } else {
      // Single name
      return {
        primerNombre: fullName,
        primerApellido: fullName,
      };
    }
  }

  /**
   * Select option by partial text match (useful for long option names)
   */
  private async selectByPartialMatch(
    page: Page,
    selector: string,
    partialText: string
  ): Promise<void> {
    try {
      await page.evaluate(
        (sel, text) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          if (!select) return;

          const options = Array.from(select.options);
          const normalizedText = text.toLowerCase().trim();

          // Try exact match first
          let option = options.find((opt) => opt.text.toLowerCase().trim() === normalizedText);

          // Try partial match
          if (!option) {
            option = options.find((opt) => opt.text.toLowerCase().includes(normalizedText));
          }

          // Try value match
          if (!option) {
            option = options.find((opt) => opt.value.toLowerCase().includes(normalizedText));
          }

          if (option) {
            select.value = option.value;
            // Trigger change event
            select.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            console.warn(`No option found matching: ${text}`);
          }
        },
        selector,
        partialText
      );
    } catch (error) {
      logger.warn('Error selecting option by partial match', { selector, partialText, error });
    }
  }

  /**
   * Submit registration form
   */
  private async submitRegistrationForm(page: Page): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-submit');

      // Try multiple submit button selectors
      const submitSelectors = [
        SELECTORS.APORTANTES.FORM.GUARDAR_TEXT,
        SELECTORS.APORTANTES.FORM.GUARDAR,
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

      // Wait for form submission
      logger.info('Waiting for form submission...');
      await sleep(3000);

      await browserManager.takeScreenshot(page, 'after-submit');
    } catch (error) {
      throw new BotError('Failed to submit registration form');
    }
  }

  /**
   * Verify registration success
   */
  private async verifyRegistrationSuccess(
    page: Page,
    userData: UserData
  ): Promise<EnlaceRegistroResult> {
    try {
      // Check for success message
      const successExists = await elementExists(page, SELECTORS.COMMON.ALERT_SUCCESS);
      const toastSuccessExists = await elementExists(page, SELECTORS.COMMON.TOAST_SUCCESS);

      if (successExists || toastSuccessExists) {
        logger.info('✅ Success message detected');

        // Wait a bit for any navigation
        await sleep(2000);

        // Try to extract enlaceUserId (implementation depends on actual UI)
        const enlaceUserId = await this.extractEnlaceUserId(page, userData);

        await browserManager.takeScreenshot(page, 'registration-success');

        return {
          registered: true,
          enlaceUserId,
        };
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
        await browserManager.takeScreenshot(page, 'registration-error-message');

        throw new BotError(`Registration failed: ${errorText}`);
      }

      // No clear success or error - check if we're back on the list
      await sleep(2000);
      const currentUrl = page.url();

      if (currentUrl.includes('aportantes') || currentUrl.includes('administrar')) {
        logger.info('Redirected to aportantes list - assuming success');

        const enlaceUserId = await this.extractEnlaceUserId(page, userData);

        return {
          registered: true,
          enlaceUserId,
        };
      }

      // Uncertain result
      logger.warn('Cannot determine registration result clearly');
      await browserManager.takeScreenshot(page, 'registration-uncertain');

      return {
        registered: true, // Assume success if no error
        warnings: ['Could not verify registration success clearly'],
      };
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      throw new BotError('Failed to verify registration success');
    }
  }

  /**
   * Extract enlaceUserId after successful registration
   * This is highly dependent on the actual UI - may need adjustment
   */
  private async extractEnlaceUserId(page: Page, userData: UserData): Promise<string | undefined> {
    try {
      // Strategy 1: Search for the user we just created
      logger.debug('Attempting to extract enlaceUserId by searching for user');

      const searchInputExists = await elementExists(page, SELECTORS.APORTANTES.BUSCAR_INPUT);
      if (searchInputExists) {
        await waitAndType(
          page,
          SELECTORS.APORTANTES.BUSCAR_INPUT,
          userData.numeroDocumento,
          { clear: true }
        );
        await page.keyboard.press('Enter');
        await sleep(2000);

        // Try to extract from table row
        const rowExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.ROW);
        if (rowExists) {
          const userId = await page.$eval(
            SELECTORS.APORTANTES.RESULTS.ROW,
            (el) => el.getAttribute('data-user-id') || el.getAttribute('data-id')
          );

          if (userId) {
            logger.info('Extracted enlaceUserId from table', { userId });
            return userId;
          }
        }
      }

      // Strategy 2: Check URL for ID
      const url = page.url();
      const idMatch = url.match(/id[=/](\d+)/i);
      if (idMatch) {
        logger.info('Extracted enlaceUserId from URL', { userId: idMatch[1] });
        return idMatch[1];
      }

      logger.debug('Could not extract enlaceUserId');
      return undefined;
    } catch (error) {
      logger.warn('Error extracting enlaceUserId', { error });
      return undefined;
    }
  }
}

/**
 * Singleton instance
 */
export const enlaceRegistro = new EnlaceRegistroBot();

/**
 * Quick function for registering a user
 */
export async function registrarUsuarioEnlace(
  userData: UserData
): Promise<BotResponse<EnlaceRegistroResult>> {
  return enlaceRegistro.registrarUsuario(userData);
}
