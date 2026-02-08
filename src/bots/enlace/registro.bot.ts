/**
 * Registration Bot for Enlace Operativo
 * Handles registration of new users (aportantes) in the system
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { enlaceAuth } from './auth.bot';
import { buscarUsuario } from './search.bot';
import { waitAndType, waitAndClick, sleep, elementExists, randomDelay } from '../utils/wait';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import { browserManager } from '../utils/browser';
import { config } from '../../utils/config';
import { UserData } from '../../types';
import { BotError } from '../../utils/errors';

/**
 * Registration result interface
 */
export interface RegistroResult {
  success: boolean;
  enlaceUserId?: string;
  alreadyExists?: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validate user data before registration
 */
function validateUserData(userData: UserData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!userData.numeroDocumento || userData.numeroDocumento.trim().length === 0) {
    errors.push('numeroDocumento is required');
  }

  if (!userData.nombre || userData.nombre.trim().length === 0) {
    errors.push('nombre is required');
  }

  if (!userData.tipoDocumento) {
    errors.push('tipoDocumento is required');
  }

  // Validate documento length
  if (userData.numeroDocumento && userData.numeroDocumento.length < 6) {
    errors.push('numeroDocumento must be at least 6 characters');
  }

  // Validate email format (basic)
  if (userData.email && !userData.email.includes('@')) {
    errors.push('email format is invalid');
  }

  // Validate phone (basic)
  if (userData.telefono && userData.telefono.length < 7) {
    errors.push('telefono must be at least 7 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Register a new user in Enlace Operativo
 * @param userData - Complete user information
 * @returns Registration result
 */
export async function registrarUsuario(userData: UserData): Promise<RegistroResult> {
  logger.info('Starting user registration in Enlace', {
    documento: userData.numeroDocumento,
    nombre: userData.nombre,
  });

  // 1. Validate user data
  const validation = validateUserData(userData);
  if (!validation.valid) {
    logger.error('User data validation failed', { errors: validation.errors });
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }

  try {
    // 2. Check if user already exists
    logger.info('Checking if user already exists');
    const searchResult = await buscarUsuario(userData.numeroDocumento);

    if (searchResult.found) {
      logger.info('User already exists in Enlace', {
        documento: userData.numeroDocumento,
        enlaceUserId: searchResult.enlaceUserId,
      });

      return {
        success: true,
        alreadyExists: true,
        enlaceUserId: searchResult.enlaceUserId,
      };
    }

    // 3. Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    // 4. Navigate to Administrar Aportantes
    logger.info('Navigating to Administrar Aportantes');
    const enlaceBaseUrl = config.enlace?.baseUrl || URL_PATTERNS.BASE;
    const aportantesUrl = `${enlaceBaseUrl}/gestion/#/home/administrar-aportantes`;

    await page.goto(aportantesUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await sleep(2000);
    await browserManager.takeScreenshot(page, 'registro-aportantes-page');

    // 5. Click "Add new user" button
    logger.info('Looking for "Add user" button');

    // Try multiple possible selectors for the add button
    const addButtonSelectors = [
      SELECTORS.APORTANTES.AGREGAR_BUTTON,
      SELECTORS.APORTANTES.AGREGAR_APORTANTE,
      SELECTORS.APORTANTES.NUEVO_APORTANTE,
    ];

    let buttonClicked = false;
    for (const selector of addButtonSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        logger.info('Clicking add button', { selector });
        await waitAndClick(page, selector);
        buttonClicked = true;
        break;
      }
    }

    if (!buttonClicked) {
      logger.error('Add user button not found');
      await browserManager.takeScreenshot(page, 'registro-no-add-button');
      throw new BotError('Could not find "Add user" button on page');
    }

    // 6. Wait for registration form to load
    logger.info('Waiting for registration form');
    await sleep(2000);

    // Check if form appeared
    const formExists = await elementExists(page, SELECTORS.APORTANTES.FORM.NUMERO_DOC);
    if (!formExists) {
      logger.error('Registration form did not appear');
      await browserManager.takeScreenshot(page, 'registro-no-form');
      throw new BotError('Registration form did not appear');
    }

    logger.info('Registration form loaded successfully');
    await browserManager.takeScreenshot(page, 'registro-form-loaded');

    // 7. Fill registration form
    await fillRegistrationForm(page, userData);

    // 8. Screenshot before submitting
    await browserManager.takeScreenshot(page, 'registro-before-submit');

    // 9. Submit form
    logger.info('Submitting registration form');
    const submitSuccess = await submitRegistrationForm(page);

    if (!submitSuccess) {
      throw new BotError('Form submission failed or was rejected');
    }

    // 10. Wait for confirmation
    logger.info('Waiting for registration confirmation');
    await sleep(3000);
    await browserManager.takeScreenshot(page, 'registro-after-submit');

    // 11. Check for success or error messages
    const result = await checkRegistrationResult(page);

    if (!result.success) {
      await browserManager.takeScreenshot(page, 'registro-error-message');
      throw new BotError(result.error || 'Registration failed');
    }

    // 12. Verify user was created by searching for them
    logger.info('Verifying user registration');
    await sleep(2000);

    const verifyResult = await buscarUsuario(userData.numeroDocumento);

    if (!verifyResult.found) {
      logger.warn('User registered but not found in search (may need time to sync)');
      await browserManager.takeScreenshot(page, 'registro-verification-failed');

      return {
        success: true,
        alreadyExists: false,
        warnings: ['User registered but could not be found in search immediately'],
      };
    }

    logger.info('✅ User registration completed successfully', {
      documento: userData.numeroDocumento,
      enlaceUserId: verifyResult.enlaceUserId,
      nombre: verifyResult.nombre,
    });

    return {
      success: true,
      enlaceUserId: verifyResult.enlaceUserId,
      alreadyExists: false,
    };
  } catch (error) {
    logger.error('❌ Error registering user', {
      documento: userData.numeroDocumento,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fill the registration form with user data
 */
async function fillRegistrationForm(page: Page, userData: UserData): Promise<void> {
  logger.info('Filling registration form');

  try {
    // Tipo de documento
    logger.debug('Selecting document type', { tipo: userData.tipoDocumento });
    const tipoDocExists = await elementExists(page, SELECTORS.APORTANTES.FORM.TIPO_DOC);
    if (tipoDocExists) {
      await page.select(SELECTORS.APORTANTES.FORM.TIPO_DOC, userData.tipoDocumento);
      await randomDelay(300, 500);
    }

    // Número de documento
    logger.debug('Entering document number');
    await waitAndType(
      page,
      SELECTORS.APORTANTES.FORM.NUMERO_DOC,
      userData.numeroDocumento,
      { clear: true, delay: 100 }
    );
    await randomDelay(300, 500);

    // Nombre completo
    logger.debug('Entering full name');
    await waitAndType(page, SELECTORS.APORTANTES.FORM.NOMBRE, userData.nombre, {
      clear: true,
      delay: 80,
    });
    await randomDelay(300, 500);

    // Email
    if (userData.email) {
      logger.debug('Entering email');
      const emailExists = await elementExists(page, SELECTORS.APORTANTES.FORM.EMAIL);
      if (emailExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.EMAIL, userData.email, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }
    }

    // Teléfono
    if (userData.telefono) {
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
    }

    // Dirección
    if (userData.direccion) {
      logger.debug('Entering address');
      const direccionExists = await elementExists(page, SELECTORS.APORTANTES.FORM.DIRECCION);
      if (direccionExists) {
        await waitAndType(page, SELECTORS.APORTANTES.FORM.DIRECCION, userData.direccion, {
          clear: true,
          delay: 80,
        });
        await randomDelay(300, 500);
      }
    }

    // Ciudad
    if (userData.ciudad) {
      logger.debug('Entering city');
      const ciudadExists = await elementExists(page, SELECTORS.APORTANTES.FORM.CIUDAD);
      if (ciudadExists) {
        try {
          // Try as select first
          await page.select(SELECTORS.APORTANTES.FORM.CIUDAD, userData.ciudad);
        } catch {
          // If fails, try as text input
          logger.debug('City selector failed, trying as text input');
          await waitAndType(page, SELECTORS.APORTANTES.FORM.CIUDAD, userData.ciudad, {
            clear: true,
            delay: 80,
          });
        }
        await randomDelay(300, 500);
      }
    }

    // EPS
    if (userData.eps) {
      logger.debug('Selecting EPS', { eps: userData.eps });
      const epsExists = await elementExists(page, SELECTORS.APORTANTES.FORM.EPS);
      if (epsExists) {
        try {
          await page.select(SELECTORS.APORTANTES.FORM.EPS, userData.eps);
          await randomDelay(500, 800);
        } catch (error) {
          logger.warn('Could not select EPS', { error });
        }
      }
    }

    // Fondo de Pensión
    if (userData.pension) {
      logger.debug('Selecting pension fund', { pension: userData.pension });
      const pensionExists = await elementExists(page, SELECTORS.APORTANTES.FORM.PENSION);
      const afpExists = await elementExists(page, SELECTORS.APORTANTES.FORM.AFP);

      if (pensionExists) {
        try {
          await page.select(SELECTORS.APORTANTES.FORM.PENSION, userData.pension);
          await randomDelay(500, 800);
        } catch (error) {
          logger.warn('Could not select pension fund', { error });
        }
      } else if (afpExists) {
        try {
          await page.select(SELECTORS.APORTANTES.FORM.AFP, userData.pension);
          await randomDelay(500, 800);
        } catch (error) {
          logger.warn('Could not select AFP', { error });
        }
      }
    }

    // ARL
    if (userData.arl) {
      logger.debug('Selecting ARL', { arl: userData.arl });
      const arlExists = await elementExists(page, SELECTORS.APORTANTES.FORM.ARL);
      if (arlExists) {
        try {
          await page.select(SELECTORS.APORTANTES.FORM.ARL, userData.arl);
          await randomDelay(500, 800);
        } catch (error) {
          logger.warn('Could not select ARL', { error });
        }
      }
    }

    logger.info('✅ Form filled successfully');
  } catch (error) {
    logger.error('Error filling registration form', { error });
    await browserManager.takeScreenshot(page, 'registro-fill-error');
    throw new BotError('Failed to fill registration form');
  }
}

/**
 * Submit the registration form
 */
async function submitRegistrationForm(page: Page): Promise<boolean> {
  try {
    // Try multiple possible submit button selectors
    const submitSelectors = [
      SELECTORS.APORTANTES.FORM.GUARDAR,
      SELECTORS.APORTANTES.FORM.GUARDAR_TEXT,
    ];

    let buttonClicked = false;
    for (const selector of submitSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        logger.debug('Clicking submit button', { selector });
        await waitAndClick(page, selector);
        buttonClicked = true;
        break;
      }
    }

    if (!buttonClicked) {
      logger.error('Submit button not found');
      return false;
    }

    // Wait for submission to process
    await sleep(3000);

    return true;
  } catch (error) {
    logger.error('Error submitting form', { error });
    return false;
  }
}

/**
 * Check registration result (success or error messages)
 */
async function checkRegistrationResult(
  page: Page
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check for success messages
    const successSelectors = [
      SELECTORS.COMMON.ALERT_SUCCESS,
      SELECTORS.COMMON.TOAST_SUCCESS,
    ];

    for (const selector of successSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        logger.info('Success message detected');
        return { success: true };
      }
    }

    // Check for error messages
    const errorSelectors = [
      SELECTORS.COMMON.ALERT_ERROR,
      SELECTORS.COMMON.TOAST_ERROR,
      '.error',
      '.alert-danger',
      '[role="alert"]',
    ];

    for (const selector of errorSelectors) {
      const exists = await elementExists(page, selector);
      if (exists) {
        try {
          const errorText = await page.$eval(selector, (el) => el.textContent || '');
          logger.error('Error message detected', { error: errorText });
          return {
            success: false,
            error: errorText.trim() || 'Registration rejected by server',
          };
        } catch {
          return {
            success: false,
            error: 'Registration rejected by server',
          };
        }
      }
    }

    // Check page text for success indicators
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());

    if (
      pageText.includes('exitosamente') ||
      pageText.includes('éxito') ||
      pageText.includes('registrado') ||
      pageText.includes('creado')
    ) {
      logger.info('Success indicator found in page text');
      return { success: true };
    }

    // Check for error indicators in page text
    if (
      pageText.includes('error') ||
      pageText.includes('falló') ||
      pageText.includes('no se pudo')
    ) {
      logger.warn('Error indicator found in page text');
      return {
        success: false,
        error: 'Registration may have failed (error indicator in page)',
      };
    }

    // No clear success or error - assume success if we got here without throwing
    logger.warn('No clear success or error message, assuming success');
    return { success: true };
  } catch (error) {
    logger.error('Error checking registration result', { error });
    return {
      success: false,
      error: 'Could not verify registration result',
    };
  }
}

/**
 * Legacy compatibility export
 * @deprecated Use registrarUsuario() instead
 */
export async function registrarUsuarioEnlace(userData: UserData): Promise<RegistroResult> {
  return registrarUsuario(userData);
}
