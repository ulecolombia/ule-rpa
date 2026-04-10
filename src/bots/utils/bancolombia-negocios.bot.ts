/**
 * Bancolombia Negocios Bot - Modulo compartido
 *
 * Maneja la navegacion en la pagina de Bancolombia PSE hasta el campo de clave.
 * Este modulo es usado tanto por SOI como por Mi Planilla.
 *
 * FLUJO:
 * 1. Detectar que estamos en botonbancolombia.apps.bancolombia.com
 * 2. Click en "Bancolombia Negocios" (tercera opcion)
 * 3. Esperar pagina autenticacion.apps.bancolombia.com
 * 4. Verificar/ingresar usuario Lbrochet01
 * 5. Click Continuar
 * 6. Detectar campo de clave input[type="password"]
 * 7. Tomar screenshot
 * 8. Retornar { success: true, estado: 'ESPERANDO_CLAVE', screenshotPath }
 *
 * IMPORTANTE: Este bot NUNCA ingresa la clave. El admin lo hace manualmente.
 */

import { Page, Browser } from 'puppeteer';
import { logger } from '../../utils/logger';
import { browserManager } from './browser';

// ============================================
// CONFIGURACION
// ============================================

const CONFIG = {
  usuario: process.env.BANCOLOMBIA_USUARIO || 'Lbrochet01',
  timeouts: {
    navigation: 30000,
    element: 10000,
    poll: 2000,
    maxRetries: 10,
  },
  urls: {
    botonBancolombia: 'botonbancolombia.apps.bancolombia.com',
    autenticacion: 'autenticacion.apps.bancolombia.com',
    login: 'login.bancolombia',
    sucursalVirtual: 'sucursalvirtual',
  },
};

// ============================================
// TIPOS
// ============================================

export type BancolombiaEstado = 'ESPERANDO_CLAVE' | 'EN_BANCO' | 'ERROR';

export interface BancolombiaResult {
  success: boolean;
  estado: BancolombiaEstado;
  urlBanco?: string;
  screenshotPath?: string;
  error?: string;
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

async function takeScreenshot(page: Page, name: string): Promise<string> {
  try {
    return await browserManager.takeScreenshot(page, `bancolombia_${name}`);
  } catch {
    return '';
  }
}

// ============================================
// FUNCION PRINCIPAL
// ============================================

/**
 * Navega por la pagina de Bancolombia PSE hasta el campo de clave.
 *
 * @param page - Pagina de Puppeteer (ya en dominio de Bancolombia)
 * @param _browser - Browser de Puppeteer (para posibles popups)
 * @returns Resultado con estado y screenshot
 */
export async function navegarBancolombiaNegocios(
  page: Page,
  _browser: Browser
): Promise<BancolombiaResult> {
  let lastScreenshot = '';
  let urlBanco = page.url();

  try {
    logger.info('='.repeat(60));
    logger.info('BANCOLOMBIA NEGOCIOS: Iniciando navegacion');
    logger.info('='.repeat(60));
    logger.info(`URL actual: ${urlBanco}`);

    // ========================================================================
    // PASO 1: SELECCIONAR BANCOLOMBIA NEGOCIOS
    // ========================================================================
    // La pagina de Bancolombia PSE tiene 3 opciones:
    // 1. Sucursal Virtual Personas
    // 2. Sucursal Virtual Empresas
    // 3. Bancolombia Negocios (esta es la que queremos)
    logger.info('[BANCOLOMBIA PASO 1] Buscando opcion Bancolombia Negocios...');

    await page.waitForTimeout(3000); // Esperar que cargue la pagina

    // Buscar y hacer click en "Bancolombia Negocios" (tercera opcion)
    const clickedNegocios = await page.evaluate(() => {
      // Buscar todos los elementos clickeables que contengan el texto
      const elements = document.querySelectorAll(
        'a, button, div[role="button"], div.option, .card, li'
      );
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        // Buscar "Negocios" o "Bancolombia Negocios"
        if (
          text.toLowerCase().includes('negocios') ||
          text.toLowerCase().includes('sucursal negocios')
        ) {
          (el as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      // Fallback: buscar por indice (tercera opcion)
      const options = document.querySelectorAll(
        '.card, .option, li.option, div[class*="option"]'
      );
      if (options.length >= 3) {
        (options[2] as HTMLElement).click();
        return { clicked: true, text: 'Tercera opcion (indice 2)' };
      }
      return { clicked: false, text: '' };
    });

    if (clickedNegocios.clicked) {
      logger.info(`[BANCOLOMBIA PASO 1] Click en: ${clickedNegocios.text}`);
    } else {
      logger.warn('[BANCOLOMBIA PASO 1] No se encontro opcion Negocios');
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(3000);
    await takeScreenshot(page, 'paso1_negocios');

    // ========================================================================
    // PASO 2: ESPERAR PAGINA DE AUTENTICACION
    // ========================================================================
    logger.info('[BANCOLOMBIA PASO 2] Esperando pagina de autenticacion...');

    let enAutenticacion = false;
    for (let i = 0; i < CONFIG.timeouts.maxRetries; i++) {
      const url = page.url();
      if (
        url.includes(CONFIG.urls.autenticacion) ||
        url.includes(CONFIG.urls.login) ||
        url.includes(CONFIG.urls.sucursalVirtual)
      ) {
        enAutenticacion = true;
        break;
      }
      await page.waitForTimeout(CONFIG.timeouts.poll);
    }

    if (!enAutenticacion) {
      logger.warn('[BANCOLOMBIA PASO 2] No se llego a pagina de autenticacion');
      await takeScreenshot(page, 'paso2_no_auth');
    }

    urlBanco = page.url();
    logger.info(`[BANCOLOMBIA PASO 2] URL autenticacion: ${urlBanco}`);
    await takeScreenshot(page, 'paso2_auth');

    // ========================================================================
    // PASO 3: INGRESAR USUARIO
    // ========================================================================
    logger.info('[BANCOLOMBIA PASO 3] Buscando campo de usuario...');

    const inputUsuario = await page.$(
      'input[type="text"], input[name*="user"], input[id*="user"], input[placeholder*="usuario"]'
    );

    if (inputUsuario) {
      // Verificar si el campo ya tiene valor
      const valorActual = await page.evaluate(
        (el) => (el as HTMLInputElement).value,
        inputUsuario
      );

      if (!valorActual || valorActual.trim() === '') {
        // Campo vacio, ingresar usuario
        logger.info(`[BANCOLOMBIA PASO 3] Ingresando usuario: ${CONFIG.usuario}`);
        await inputUsuario.click({ clickCount: 3 });
        await inputUsuario.type(CONFIG.usuario, { delay: 50 });
      } else {
        logger.info(`[BANCOLOMBIA PASO 3] Usuario ya presente: ${valorActual}`);
      }

      await page.waitForTimeout(1000);
      await takeScreenshot(page, 'paso3_usuario');

      // Click en Continuar
      const clickedContinuar = await page.evaluate(() => {
        const buttons = document.querySelectorAll(
          'button, input[type="submit"], a.btn'
        );
        for (const btn of buttons) {
          const text =
            btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
          if (
            text.toLowerCase().includes('continuar') ||
            text.toLowerCase().includes('siguiente') ||
            text.toLowerCase().includes('ingresar')
          ) {
            (btn as HTMLElement).click();
            return { clicked: true, text };
          }
        }
        return { clicked: false, text: '' };
      });

      if (clickedContinuar.clicked) {
        logger.info(`[BANCOLOMBIA PASO 3] Click en: ${clickedContinuar.text}`);
      } else {
        logger.warn('[BANCOLOMBIA PASO 3] No se encontro boton Continuar');
      }

      await page.waitForTimeout(3000);
    } else {
      logger.warn('[BANCOLOMBIA PASO 3] No se encontro campo de usuario');
    }

    // ========================================================================
    // PASO 4: ESPERAR CAMPO DE CLAVE Y DETENER BOT
    // ========================================================================
    logger.info('[BANCOLOMBIA PASO 4] Esperando campo de clave...');

    let campoClaveEncontrado = false;
    for (let i = 0; i < CONFIG.timeouts.maxRetries; i++) {
      const hayPassword = await page.evaluate(() => {
        const pwdInput = document.querySelector('input[type="password"]');
        return !!pwdInput;
      });

      if (hayPassword) {
        campoClaveEncontrado = true;
        logger.info('[BANCOLOMBIA PASO 4] Campo de clave detectado');
        break;
      }

      await page.waitForTimeout(CONFIG.timeouts.poll);
    }

    urlBanco = page.url();
    lastScreenshot = await takeScreenshot(page, 'esperando_clave');

    logger.info('='.repeat(60));
    if (campoClaveEncontrado) {
      logger.info('BANCOLOMBIA: ESPERANDO CLAVE');
    } else {
      logger.info('BANCOLOMBIA: EN BANCO (sin deteccion de campo clave)');
    }
    logger.info('='.repeat(60));
    logger.info(`URL: ${urlBanco}`);
    logger.info(`Usuario: ${CONFIG.usuario}`);
    logger.info('BOT SE DETIENE AQUI');
    logger.info('El admin debe ingresar la clave manualmente');
    logger.info('='.repeat(60));

    return {
      success: true,
      estado: campoClaveEncontrado ? 'ESPERANDO_CLAVE' : 'EN_BANCO',
      urlBanco,
      screenshotPath: lastScreenshot,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error en navegacion Bancolombia', { error: errorMsg });

    lastScreenshot = await takeScreenshot(page, 'error');

    return {
      success: false,
      estado: 'ERROR',
      error: errorMsg,
      screenshotPath: lastScreenshot,
    };
  }
}
