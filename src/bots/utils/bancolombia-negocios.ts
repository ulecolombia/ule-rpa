/**
 * Bancolombia Negocios - Utilidad Compartida
 *
 * Maneja el flujo de login en Bancolombia Negocios después de PSE.
 * Usado por tanto SOI como Mi Planilla.
 *
 * Flujo:
 * 1. Detectar página de selección de tipo (Personas/Empresas/Negocios)
 * 2. Click en "Bancolombia Negocios"
 * 3. Llenar usuario
 * 4. STOP - Notificar a ULE admin
 *
 * NOTA: La contraseña NUNCA se ingresa por el bot - el admin la ingresa manualmente.
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { browserManager } from './browser';

// ============================================
// INTERFACES
// ============================================

export interface BancolombiaCredentials {
  usuario: string;
  // La contraseña NO se guarda aquí - el admin la ingresa manualmente
}

export interface BancolombiaLoginResult {
  success: boolean;
  reachedLoginForm: boolean;
  usuarioFilled: boolean;
  currentUrl: string;
  screenshotUrl?: string;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

const BANCOLOMBIA_CONFIG = {
  // Timeouts
  navigationTimeout: 30000,
  elementTimeout: 10000,

  // URLs patterns
  urlPatterns: {
    botonBancolombia: 'botonbancolombia',
    sucursalVirtual: 'sucursalvirtual',
    bancolombia: 'bancolombia.com',
  },

  // Default credentials
  defaultUsuario: 'Lbrochet01',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica si estamos en la página de selección de tipo de Bancolombia
 */
export async function detectarPaginaSeleccionTipo(page: Page): Promise<boolean> {
  try {
    const url = page.url().toLowerCase();

    // Verificar URL
    if (!url.includes('bancolombia')) {
      return false;
    }

    // Verificar contenido - buscar las 3 opciones
    const hasOptions = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Debe tener las 3 opciones de Bancolombia
      const hasPersonas = bodyText.includes('bancolombia personas');
      const hasEmpresas = bodyText.includes('bancolombia empresas');
      const hasNegocios = bodyText.includes('bancolombia negocios');

      return hasPersonas && hasEmpresas && hasNegocios;
    });

    return hasOptions;
  } catch (error) {
    return false;
  }
}

/**
 * Hace click en "Bancolombia Negocios"
 * IMPORTANTE: Usa page.click() para generar clicks REALES con isTrusted: true
 */
export async function clickBancolombiaNegocios(
  page: Page,
  sessionId?: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('Clicking Bancolombia Negocios option (using REAL click)', { sessionId });

  try {
    // Paso 1: Identificar el selector del card de Bancolombia Negocios
    // IMPORTANTE: Distinguir entre:
    // - "Bancolombia Empresas" - tiene "Sucursal Virtual Empresas"
    // - "Bancolombia Negocios" - tiene "Sucursal Virtual Negocios"
    const cardInfo = await page.evaluate(() => {
      // Buscar todos los elementos clickeables
      const allElements = document.querySelectorAll('div, a, button, li');
      let bestMatch: { selector: string; index: number; tagName: string } | null = null;

      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        const tagName = el.tagName.toLowerCase();

        // CLAVE: Buscar específicamente "Bancolombia Negocios" CON "Sucursal Virtual Negocios"
        // Esto excluye "Bancolombia Empresas" que tiene "Sucursal Virtual Empresas"
        const hasNegociosTitle = text.includes('Bancolombia Negocios');
        const hasSucursalNegocios = text.toLowerCase().includes('sucursal virtual negocios');
        const hasNuevoCanalNegocios = text.toLowerCase().includes('cambiaste al nuevo canal');

        if (hasNegociosTitle && (hasSucursalNegocios || hasNuevoCanalNegocios)) {
          const rect = el.getBoundingClientRect();

          // Debe ser un elemento de tamaño razonable (un card)
          if (rect.width > 100 && rect.height > 50 && rect.width < 600) {
            // Verificar que NO es el card de Empresas (no debe tener "Sucursal Virtual Empresas")
            if (text.toLowerCase().includes('sucursal virtual empresas')) {
              continue; // Este es Empresas, seguir buscando
            }

            // Generar un selector único
            if (el.id) {
              bestMatch = { selector: `#${el.id}`, index: 0, tagName };
            } else {
              // Asignar un data attribute temporal para identificarlo
              el.setAttribute('data-bancolombia-negocios', 'true');
              bestMatch = { selector: '[data-bancolombia-negocios="true"]', index: 0, tagName };
            }
            break;
          }
        }
      }

      // Fallback más específico: buscar cards que tengan EXACTAMENTE "Negocios" y "Sucursal Virtual Negocios"
      if (!bestMatch) {
        const cards = document.querySelectorAll('div, a, button, li');
        for (const card of cards) {
          const cardText = (card as HTMLElement).innerText?.toLowerCase() || '';

          // Debe tener "negocios" Y "sucursal virtual negocios" (no "empresas")
          if (cardText.includes('bancolombia negocios') &&
              cardText.includes('sucursal virtual negocios') &&
              !cardText.includes('sucursal virtual empresas')) {
            const rect = card.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50 && rect.width < 600) {
              card.setAttribute('data-bancolombia-negocios', 'true');
              bestMatch = { selector: '[data-bancolombia-negocios="true"]', index: 0, tagName: card.tagName.toLowerCase() };
              break;
            }
          }
        }
      }

      return bestMatch;
    });

    logger.info('Bancolombia Negocios card info', { sessionId, cardInfo });

    if (!cardInfo || !cardInfo.selector) {
      // Intentar XPath como fallback
      logger.info('Trying XPath fallback for Bancolombia Negocios', { sessionId });

      const xpathResult = await page.evaluate(() => {
        const xpath = "//div[contains(text(), 'Bancolombia Negocios')] | //*[contains(text(), 'Bancolombia Negocios')]";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue as HTMLElement;

        if (node) {
          // Marcar el elemento para poder hacer click
          node.setAttribute('data-bancolombia-negocios-xpath', 'true');
          return { found: true, tagName: node.tagName };
        }
        return { found: false };
      });

      if (xpathResult.found) {
        try {
          await page.click('[data-bancolombia-negocios-xpath="true"]');
          logger.info('Clicked Bancolombia Negocios via XPath', { sessionId });
          return { success: true };
        } catch (xpathError) {
          logger.warn('XPath click failed', { sessionId, error: (xpathError as Error).message });
        }
      }

      return { success: false, error: 'Could not find Bancolombia Negocios card' };
    }

    // Paso 2: Usar page.click() para hacer un click REAL con isTrusted: true
    try {
      await page.click(cardInfo.selector);
      logger.info('Clicked Bancolombia Negocios with page.click() (REAL click)', {
        sessionId,
        selector: cardInfo.selector,
        tagName: cardInfo.tagName,
      });
      return { success: true };
    } catch (clickError) {
      // Fallback: intentar con evaluate click nativo
      logger.warn('page.click() failed, trying native click', { sessionId, error: (clickError as Error).message });

      const fallbackClick = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (el) {
          (el as HTMLElement).click();
          return true;
        }
        return false;
      }, cardInfo.selector);

      if (fallbackClick) {
        logger.info('Clicked Bancolombia Negocios via fallback native click', { sessionId });
        return { success: true };
      }

      return { success: false, error: `Click failed: ${(clickError as Error).message}` };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error clicking Bancolombia Negocios', { sessionId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Detecta si estamos en la página de bienvenida de Bancolombia Negocios
 * Esta página aparece después de ingresar el usuario y tiene botones "Volver" y "Continuar"
 */
export async function detectarPaginaBienvenida(page: Page): Promise<boolean> {
  try {
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Buscar indicadores de la página de bienvenida
      const hasBienvenida = bodyText.includes('te damos la bienvenida');
      const hasSucursalVirtual = bodyText.includes('sucursal virtual negocios');
      const hasContinuar = bodyText.includes('continuar');

      return hasBienvenida && hasSucursalVirtual && hasContinuar;
    });

    return result;
  } catch (error) {
    return false;
  }
}

/**
 * Hace click en el botón "Continuar" en la página de bienvenida
 * IMPORTANTE: Usa page.click() para generar clicks REALES con isTrusted: true
 */
export async function clickContinuarBienvenida(
  page: Page,
  sessionId?: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('Clicking Continuar button on welcome page', { sessionId });

  try {
    // Buscar el botón "Continuar"
    const buttonInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');

      for (const btn of buttons) {
        const el = btn as HTMLElement;
        const text = el.innerText?.trim().toLowerCase() || '';
        const value = (el as HTMLInputElement).value?.toLowerCase() || '';

        if (text === 'continuar' || value === 'continuar') {
          // Marcar el botón para poder hacer click
          el.setAttribute('data-bancolombia-continuar', 'true');
          return { found: true, selector: '[data-bancolombia-continuar="true"]' };
        }
      }

      return { found: false };
    });

    if (!buttonInfo.found || !buttonInfo.selector) {
      return { success: false, error: 'Could not find Continuar button' };
    }

    // Click con page.click() para REAL click
    await page.click(buttonInfo.selector);

    logger.info('Clicked Continuar button with page.click() (REAL click)', { sessionId });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error clicking Continuar button', { sessionId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Llena el campo de usuario en Bancolombia Negocios
 * IMPORTANTE: Usa page.type() para generar keystrokes REALES
 */
export async function llenarUsuarioBancolombia(
  page: Page,
  usuario: string,
  sessionId?: string
): Promise<{ success: boolean; fieldId?: string; error?: string }> {
  logger.info('Filling Bancolombia username (using REAL keystrokes)', { sessionId, usuario });

  try {
    // Paso 1: Identificar el campo de usuario y marcarlo con un selector
    const fieldInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type]), input[type="number"]');

      for (const input of inputs) {
        const el = input as HTMLInputElement;

        // Solo campos visibles
        if (el.offsetParent === null) continue;
        if (el.type === 'password' || el.type === 'hidden') continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        const autocomplete = el.autocomplete?.toLowerCase() || '';

        // Buscar campo de usuario/documento
        const isUserField =
          id.includes('user') || id.includes('usuario') || id.includes('document') ||
          name.includes('user') || name.includes('usuario') || name.includes('document') ||
          placeholder.includes('user') || placeholder.includes('usuario') ||
          placeholder.includes('document') || placeholder.includes('ingres') ||
          ariaLabel.includes('user') || ariaLabel.includes('usuario') ||
          autocomplete.includes('username');

        if (isUserField) {
          // Marcar el campo para poder usar page.type()
          el.setAttribute('data-bancolombia-user-field', 'true');
          return { found: true, selector: '[data-bancolombia-user-field="true"]', fieldId: id || name || 'user-field' };
        }
      }

      // Fallback: buscar el primer input visible de texto
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        if (el.offsetParent === null) continue;
        if (el.type === 'password' || el.type === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) {
          el.setAttribute('data-bancolombia-user-field', 'true');
          return { found: true, selector: '[data-bancolombia-user-field="true"]', fieldId: 'first-visible-input' };
        }
      }

      return { found: false };
    });

    logger.info('Username field info', { sessionId, fieldInfo });

    if (!fieldInfo.found || !fieldInfo.selector) {
      return { success: false, error: 'Could not find username field' };
    }

    // Paso 2: Limpiar el campo y escribir con page.type() para keystrokes REALES
    try {
      // Hacer click en el campo para enfocarlo
      await page.click(fieldInfo.selector);
      await sleep(300);

      // Limpiar el campo si tiene algo
      await page.evaluate((selector) => {
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el) {
          el.value = '';
          el.focus();
        }
      }, fieldInfo.selector);

      // Escribir con page.type() que genera keystrokes REALES
      await page.type(fieldInfo.selector, usuario, { delay: 50 });

      logger.info('Username filled with page.type() (REAL keystrokes)', {
        sessionId,
        fieldId: fieldInfo.fieldId,
        usuario,
      });

      return { success: true, fieldId: fieldInfo.fieldId };
    } catch (typeError) {
      // Fallback: usar value directo si page.type() falla
      logger.warn('page.type() failed, trying direct value assignment', { sessionId, error: (typeError as Error).message });

      const fallbackResult = await page.evaluate((selector, usr) => {
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el) {
          el.focus();
          el.value = usr;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, fieldInfo.selector, usuario);

      if (fallbackResult) {
        logger.info('Username filled via fallback', { sessionId, fieldId: fieldInfo.fieldId });
        return { success: true, fieldId: fieldInfo.fieldId };
      }

      return { success: false, error: `Type failed: ${(typeError as Error).message}` };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error filling Bancolombia username', { sessionId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Ejecuta el flujo completo de Bancolombia Negocios hasta el formulario de login
 */
export async function ejecutarFlujoBancolombiaNegocios(
  page: Page,
  credentials: BancolombiaCredentials,
  sessionId?: string
): Promise<BancolombiaLoginResult> {
  logger.info('Starting Bancolombia Negocios flow', { sessionId });

  try {
    // Esperar a que cargue la página
    await sleep(2000);

    // Verificar que estamos en Bancolombia
    const currentUrl = page.url();
    if (!currentUrl.toLowerCase().includes('bancolombia')) {
      return {
        success: false,
        reachedLoginForm: false,
        usuarioFilled: false,
        currentUrl,
        error: 'Not on Bancolombia page',
      };
    }

    // Tomar screenshot inicial
    await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-initial`);

    // Detectar si estamos en página de selección de tipo
    const isSelectionPage = await detectarPaginaSeleccionTipo(page);

    if (isSelectionPage) {
      logger.info('On Bancolombia type selection page', { sessionId });

      // Click en Bancolombia Negocios
      const clickResult = await clickBancolombiaNegocios(page, sessionId);

      if (!clickResult.success) {
        await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-click-failed`);
        return {
          success: false,
          reachedLoginForm: false,
          usuarioFilled: false,
          currentUrl: page.url(),
          error: clickResult.error,
        };
      }

      // Esperar navegación a página de login
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: BANCOLOMBIA_CONFIG.navigationTimeout }).catch(() => {});
      await sleep(2000);
    }

    await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-login-page`);

    // Llenar usuario
    const fillResult = await llenarUsuarioBancolombia(page, credentials.usuario, sessionId);

    await sleep(1000);
    await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-user-filled`);

    // Verificar si estamos en página de bienvenida (después de llenar usuario)
    // y hacer click en "Continuar" si es el caso
    const isWelcomePage = await detectarPaginaBienvenida(page);

    let continuarClicked = false;
    if (isWelcomePage) {
      logger.info('Welcome page detected, clicking Continuar', { sessionId });

      await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-welcome-page`);

      const continuarResult = await clickContinuarBienvenida(page, sessionId);
      continuarClicked = continuarResult.success;

      if (continuarResult.success) {
        // Esperar navegación después del click en Continuar
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: BANCOLOMBIA_CONFIG.navigationTimeout }).catch(() => {});
        await sleep(2000);
        await browserManager.takeScreenshot(page, `bancolombia-negocios-${sessionId || 'unknown'}-after-continuar`);
      } else {
        logger.warn('Failed to click Continuar', { sessionId, error: continuarResult.error });
      }
    }

    const finalUrl = page.url();

    logger.info('Bancolombia Negocios flow completed', {
      sessionId,
      reachedLoginForm: true,
      usuarioFilled: fillResult.success,
      continuarClicked,
      currentUrl: finalUrl,
    });

    return {
      success: true,
      reachedLoginForm: true,
      usuarioFilled: fillResult.success,
      currentUrl: finalUrl,
      error: fillResult.success ? undefined : fillResult.error,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in Bancolombia Negocios flow', { sessionId, error: errorMsg });

    return {
      success: false,
      reachedLoginForm: false,
      usuarioFilled: false,
      currentUrl: page.url(),
      error: errorMsg,
    };
  }
}

/**
 * Detecta si estamos en la página de login de Bancolombia (después de seleccionar tipo)
 */
export async function detectarPaginaLoginBancolombia(page: Page): Promise<boolean> {
  try {
    const url = page.url().toLowerCase();

    if (!url.includes('bancolombia')) {
      return false;
    }

    // Verificar que hay campo de usuario/password
    const hasLoginForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      let hasUserField = false;
      let hasPasswordField = false;

      for (const input of inputs) {
        const el = input as HTMLInputElement;
        const type = el.type?.toLowerCase() || '';

        if (type === 'password') {
          hasPasswordField = true;
        }
        if (type === 'text' || type === '' || type === 'number') {
          if (el.offsetParent !== null) {
            hasUserField = true;
          }
        }
      }

      return hasUserField || hasPasswordField;
    });

    return hasLoginForm;
  } catch (error) {
    return false;
  }
}

/**
 * Obtiene información de la página actual de Bancolombia
 */
export async function getBancolombiaPageInfo(page: Page): Promise<{
  url: string;
  title: string;
  isBancolombia: boolean;
  isSelectionPage: boolean;
  isLoginPage: boolean;
  hasUserField: boolean;
  hasPasswordField: boolean;
}> {
  const url = page.url();
  const title = await page.title();

  const pageInfo = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const inputs = document.querySelectorAll('input');

    let hasUserField = false;
    let hasPasswordField = false;

    for (const input of inputs) {
      const el = input as HTMLInputElement;
      if (el.type === 'password' && el.offsetParent !== null) {
        hasPasswordField = true;
      }
      if ((el.type === 'text' || el.type === '' || el.type === 'number') && el.offsetParent !== null) {
        hasUserField = true;
      }
    }

    // Detectar página de selección
    const hasPersonas = bodyText.includes('bancolombia personas');
    const hasEmpresas = bodyText.includes('bancolombia empresas');
    const hasNegocios = bodyText.includes('bancolombia negocios');
    const isSelectionPage = hasPersonas && hasEmpresas && hasNegocios;

    return {
      hasUserField,
      hasPasswordField,
      isSelectionPage,
    };
  });

  return {
    url,
    title,
    isBancolombia: url.toLowerCase().includes('bancolombia'),
    isSelectionPage: pageInfo.isSelectionPage,
    isLoginPage: pageInfo.hasUserField || pageInfo.hasPasswordField,
    hasUserField: pageInfo.hasUserField,
    hasPasswordField: pageInfo.hasPasswordField,
  };
}

export default {
  ejecutarFlujoBancolombiaNegocios,
  clickBancolombiaNegocios,
  llenarUsuarioBancolombia,
  detectarPaginaSeleccionTipo,
  detectarPaginaLoginBancolombia,
  detectarPaginaBienvenida,
  clickContinuarBienvenida,
  getBancolombiaPageInfo,
  BANCOLOMBIA_CONFIG,
};
