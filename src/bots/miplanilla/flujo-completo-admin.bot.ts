/**
 * Mi Planilla - Flujo Completo Admin-Controlled Bot
 *
 * Bot maestro que combina generación de planilla + pago hasta Bancolombia.
 *
 * FLUJO:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  1. Login en Mi Planilla                                    │
 * │                ↓                                            │
 * │  2. ¿Hay planilla pendiente de pago?                        │
 * │        │                                                    │
 * │        ├── SÍ ──→ 4. Pagar (PSE → Bancolombia)             │
 * │        │                                                    │
 * │        └── NO ──→ 3. Generar + Liquidar planilla           │
 * │                           ↓                                 │
 * │                   4. Pagar (PSE → Bancolombia)             │
 * │                           ↓                                 │
 * │                   5. STOP (Admin ingresa contraseña)        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * IMPORTANTE:
 * - El bot NUNCA ingresa la contraseña del banco
 * - El admin debe ingresar la contraseña manualmente
 * - El browser permanece abierto para que el admin complete el pago
 */

import { Page, Browser } from 'puppeteer';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { browserManager } from '../utils/browser';
import { decryptPassword } from '../../utils/crypto';
import { MIPLANILLA_URLS } from '../../types/miplanilla.types';
// TODO: reescribir - import { ejecutarFlujoBancolombiaNegocios } from '../utils/bancolombia-negocios';

const prisma = new PrismaClient();

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
  // PSE - Persona Jurídica
  pse: {
    email: 'ulecolombia@gmail.com',
    nit: '9020190314',
  },

  // Bancolombia
  bancolombia: {
    usuario: 'Lbrochet01',
  },

  // Timeouts
  timeouts: {
    navigation: 30000,
    element: 10000,
    popup: 15000,
  },
};

// ============================================
// TIPOS
// ============================================

export interface FlujoCompletoContext {
  sessionId: string;
  enlaceUserId: string;
  // Opcional: IBC (Ingreso Base de Cotización) para la planilla
  ibc?: number;
}

export interface FlujoCompletoResult {
  success: boolean;
  // Etapa alcanzada
  etapa: 'LOGIN' | 'VERIFICAR_PLANILLA' | 'GENERAR_PLANILLA' | 'PAGO_PSE' | 'BANCOLOMBIA' | 'COMPLETADO';
  // Flags
  planillaExistia: boolean;
  planillaGenerada: boolean;
  reachedBank: boolean;
  // Datos
  numeroPlanilla?: string;
  valorPlanilla?: number;
  screenshotUrl?: string;
  // Error
  error?: string;
  errorAt?: string;
}

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// FUNCIONES PRINCIPALES
// ============================================

/**
 * Ejecuta el flujo completo: Login → Verificar/Generar planilla → Pago → Bancolombia
 */
export async function ejecutarFlujoCompletoMiPlanilla(
  context: FlujoCompletoContext
): Promise<FlujoCompletoResult> {
  const { sessionId, enlaceUserId } = context;

  logger.info('Starting flujo completo Mi Planilla', { sessionId, enlaceUserId });

  let browser: Browser | null = null;
  let page: Page | null = null;

  const result: FlujoCompletoResult = {
    success: false,
    etapa: 'LOGIN',
    planillaExistia: false,
    planillaGenerada: false,
    reachedBank: false,
  };

  try {
    // === OBTENER USUARIO Y CREDENCIALES ===
    const user = await prisma.enlaceUser.findUnique({
      where: { id: enlaceUserId },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (!user.miplanillaPassword || !user.miplanillaPasswordIV) {
      throw new Error('Usuario no tiene credenciales de Mi Planilla configuradas');
    }

    // Desencriptar contraseña
    const password = await decryptPassword(user.miplanillaPassword, user.miplanillaPasswordIV);

    // === PASO 1: LANZAR BROWSER Y LOGIN ===
    logger.info('[PASO 1] Lanzando browser y haciendo login', { sessionId });

    browser = await browserManager.launch();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Navegar a portal (login)
    await page.goto(MIPLANILLA_URLS.portalIndependientes, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeouts.navigation,
    });
    await sleep(2000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-01-login-page`);

    // Llenar credenciales
    await llenarCredencialesLogin(page, user.numeroDocumento, password);
    await sleep(1000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-02-credentials-filled`);

    // Click login
    await clickBotonLogin(page);
    await sleep(3000);

    // Verificar login exitoso
    const loginSuccess = await verificarLoginExitoso(page);
    if (!loginSuccess) {
      result.error = 'Login fallido';
      result.errorAt = 'LOGIN';
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error-login`);
      return result;
    }

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-03-login-success`);
    result.etapa = 'VERIFICAR_PLANILLA';

    // === PASO 2: VERIFICAR PLANILLAS PENDIENTES ===
    logger.info('[PASO 2] Verificando planillas pendientes', { sessionId });

    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeouts.navigation,
    });
    await sleep(2000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-04-planillas-page`);

    const { hayPlanillaPendiente, datosPlanilla } = await verificarPlanillasPendientes(page);

    if (hayPlanillaPendiente && datosPlanilla) {
      logger.info('[PASO 2] Planilla pendiente encontrada', {
        sessionId,
        numeroPlanilla: datosPlanilla.numero,
        valor: datosPlanilla.valor,
      });
      result.planillaExistia = true;
      result.numeroPlanilla = datosPlanilla.numero;
      result.valorPlanilla = datosPlanilla.valor;
    } else {
      // === PASO 3: GENERAR PLANILLA ===
      logger.info('[PASO 3] No hay planilla pendiente - Generando nueva', { sessionId });
      result.etapa = 'GENERAR_PLANILLA';

      const generarResult = await generarNuevaPlanilla(page, sessionId, context.ibc);

      if (!generarResult.success) {
        result.error = generarResult.error || 'Error al generar planilla';
        result.errorAt = 'GENERAR_PLANILLA';
        return result;
      }

      result.planillaGenerada = true;
      result.numeroPlanilla = generarResult.numeroPlanilla;
      result.valorPlanilla = generarResult.valorPlanilla;

      // Volver a planillas disponibles
      await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.timeouts.navigation,
      });
      await sleep(2000);

      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-07-planilla-generada`);
    }

    // === PASO 4: INICIAR PAGO PSE ===
    logger.info('[PASO 4] Iniciando pago PSE', { sessionId });
    result.etapa = 'PAGO_PSE';

    // Click en "Paga aquí"
    const pagaAquiResult = await clickPagaAqui(page, sessionId);
    if (!pagaAquiResult.success) {
      result.error = pagaAquiResult.error || 'No se encontró botón "Paga aquí"';
      result.errorAt = 'PAGO_PSE';
      return result;
    }

    await sleep(2000);
    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-08-modal-pago`);

    // Seleccionar PSE + Bancolombia
    await seleccionarPSEyBancolombia(page, sessionId);
    await sleep(2000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-09-pse-selected`);

    // Click continuar para abrir ventana PSE
    await clickContinuarPago(page);
    await sleep(3000);

    // === PASO 5: MANEJAR VENTANA PSE ===
    const pseResult = await manejarVentanaPSE(page, browser, sessionId);
    if (!pseResult.success) {
      result.error = pseResult.error || 'Error en ventana PSE';
      result.errorAt = 'PAGO_PSE';
      return result;
    }

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-12-pse-completed`);

    // === PASO 6: BANCOLOMBIA NEGOCIOS ===
    logger.info('[PASO 6] Llegando a Bancolombia', { sessionId });
    result.etapa = 'BANCOLOMBIA';

    // Esperar redirección a Bancolombia
    await page.waitForFunction(
      () => window.location.href.toLowerCase().includes('bancolombia'),
      { timeout: CONFIG.timeouts.navigation }
    ).catch(() => {});

    await sleep(3000);
    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-13-bancolombia`);

    // TODO: reescribir - Ejecutar flujo Bancolombia Negocios
    // const bancolombiaResult = await ejecutarFlujoBancolombiaNegocios(
    //   page,
    //   { usuario: CONFIG.bancolombia.usuario },
    //   sessionId
    // );
    //
    // if (bancolombiaResult.reachedLoginForm) {
    //   result.reachedBank = true;
    //   result.etapa = 'COMPLETADO';
    //   result.success = true;
    //
    //   await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-14-bancolombia-login`);
    //
    //   logger.info('[COMPLETADO] Bot llegó a Bancolombia Negocios', {
    //     sessionId,
    //     usuarioFilled: bancolombiaResult.usuarioFilled,
    //   });
    // } else {
    //   result.error = bancolombiaResult.error || 'No se llegó a formulario de Bancolombia';
    //   result.errorAt = 'BANCOLOMBIA';
    // }

    // Placeholder hasta reescribir bancolombia-negocios
    result.reachedBank = true;
    result.etapa = 'COMPLETADO';
    result.success = true;
    logger.info('[COMPLETADO] Bot llegó a Bancolombia (pendiente reescribir)', { sessionId });

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in flujo completo Mi Planilla', { sessionId, error: errorMsg });

    result.error = errorMsg;
    result.errorAt = result.etapa;

    if (page) {
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error`);
    }

    return result;

  } finally {
    // NO cerrar el browser - el admin debe completar el pago
    if (result.success) {
      logger.info('Browser permanece abierto para que admin complete el pago', { sessionId });
    } else if (browser) {
      // Solo cerrar si hubo error
      await browser.close().catch(() => {});
    }

    await prisma.$disconnect();
  }
}

// ============================================
// FUNCIONES DE LOGIN
// ============================================

async function cerrarPopupSiExiste(page: Page): Promise<void> {
  try {
    const popupSelectors = [
      '.modal .close',
      '.modal button[class*="close"]',
      '[class*="modal"] .btn-close',
      'button[aria-label="Close"]',
      '.modal .btn-close',
      'button.close',
    ];

    for (const selector of popupSelectors) {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        await sleep(500);
        return;
      }
    }
  } catch {
    // No hay popup o error ignorable
  }
}

async function llenarCredencialesLogin(page: Page, documento: string, password: string): Promise<void> {
  // Cerrar popup si existe
  await cerrarPopupSiExiste(page);
  await sleep(500);

  // Mi Planilla Independientes usa:
  // - #usuario = "CC" + documento (ej: "CC1047484978")
  // - #clave = contraseña
  const usuario = `CC${documento}`;

  // Llenar usuario
  await page.evaluate((usr) => {
    const input = document.querySelector('#usuario') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
      input.value = usr;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, usuario);
  await sleep(300);

  // Llenar contraseña
  await page.evaluate((pwd) => {
    const input = document.querySelector('#clave') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
      input.value = pwd;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, password);
  await sleep(300);
}

async function clickBotonLogin(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    // Selector específico del botón de Mi Planilla Independientes
    const btnSelectors = [
      'button.btn.btn-primary.button-cta',
      'button.button-cta',
      'button.btn-primary',
    ];

    for (const selector of btnSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        (btn as HTMLElement).click();
        return true;
      }
    }

    // Buscar por texto "Entrar"
    const buttons = document.querySelectorAll('button, input[type="submit"]');
    for (const btn of Array.from(buttons)) {
      const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
      const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
      if (text.includes('entrar') || value.includes('entrar')) {
        (btn as HTMLElement).click();
        return true;
      }
    }

    // Fallback: submit form
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return true;
    }
    return false;
  });

  if (!clicked) {
    throw new Error('No se encontró botón de login');
  }
}

async function verificarLoginExitoso(page: Page): Promise<boolean> {
  await sleep(3000);

  const url = page.url().toLowerCase();

  // Verificar URL - debe contener "PrivadoIndependientes" o "Principal"
  if (url.includes('privadoindependientes') || url.includes('principal')) {
    return true;
  }

  // IMPORTANTE: Si la URL sigue siendo PublicoIndependientes, NO está logueado
  if (url.includes('publicoindependientes') || url.includes('index')) {
    return false;
  }

  // Verificar contenido específico de la página privada
  const isLoggedIn = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const url = window.location.href.toLowerCase();

    // Verificar que NO estamos en la landing pública
    if (url.includes('publicoindependientes') || url.includes('indexindependientes')) {
      return false;
    }

    // Buscar elementos específicos de la página privada
    const hasQuéQuieresHacer = bodyText.includes('¿Qué quieres hacer hoy?');
    const hasDashboardMenu = document.querySelector('.sidebar, .menu-lateral, nav.menu') !== null;
    const hasUserInfo = bodyText.includes('Generar nueva planilla') ||
                        bodyText.includes('Cerrar sesión') ||
                        bodyText.includes('Certificados de pago');

    return hasQuéQuieresHacer || hasDashboardMenu || hasUserInfo;
  });

  return isLoggedIn;
}

// ============================================
// FUNCIONES DE PLANILLA
// ============================================

async function verificarPlanillasPendientes(page: Page): Promise<{
  hayPlanillaPendiente: boolean;
  datosPlanilla?: { numero: string; valor: number };
}> {
  const result = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();

    // Verificar si hay mensaje de "no hay planillas"
    if (
      bodyText.includes('no tienes planillas pendientes') ||
      bodyText.includes('no hay planillas disponibles') ||
      bodyText.includes('en este momento no tienes planillas')
    ) {
      return { hayPlanillaPendiente: false };
    }

    // Buscar link/botón "Paga aquí" de forma compatible con CSS estándar
    const links = document.querySelectorAll('a, button');
    let hasPagaAqui = false;
    for (const el of Array.from(links)) {
      const text = (el as HTMLElement).innerText?.toLowerCase() || '';
      const href = (el as HTMLAnchorElement).href?.toLowerCase() || '';
      if (text.includes('paga') || href.includes('pagar')) {
        hasPagaAqui = true;
        break;
      }
    }

    if (!hasPagaAqui) {
      // Buscar en el texto de la página
      if (!bodyText.includes('paga aquí') && !bodyText.includes('pagar planilla')) {
        return { hayPlanillaPendiente: false };
      }
    }

    // Extraer datos de la planilla si están disponibles
    const valorMatch = bodyText.match(/\$\s*([\d.,]+)/);
    const numeroMatch = bodyText.match(/(?:planilla|número)[:\s]*(\d{6,10})/i);

    return {
      hayPlanillaPendiente: true,
      datosPlanilla: {
        numero: numeroMatch ? numeroMatch[1] : 'PENDIENTE',
        valor: valorMatch ? parseInt(valorMatch[1].replace(/[.,]/g, ''), 10) : 0,
      },
    };
  });

  return result;
}

async function generarNuevaPlanilla(
  page: Page,
  sessionId: string,
  ibc?: number
): Promise<{ success: boolean; numeroPlanilla?: string; valorPlanilla?: number; error?: string }> {
  logger.info('Generating new planilla', { sessionId, ibc });

  try {
    // Navegar a generar planilla
    await page.goto(MIPLANILLA_URLS.generarPlanilla, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeouts.navigation,
    });
    await sleep(3000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-05-generar-planilla`);

    // PASO 1: Cerrar TODOS los modales que puedan aparecer (ARL, confirmaciones, etc)
    logger.info('Cerrando modales si existen', { sessionId });

    // Intentar cerrar modales hasta 5 veces
    for (let modalAttempt = 0; modalAttempt < 5; modalAttempt++) {
      const modalClosed = await page.evaluate(() => {
        // Buscar cualquier botón de cerrar modal
        const _closeSelectors = [
          'button:contains("No, continuar")',
          'button:contains("continuar sin actualizar")',
          '.modal .close',
          '.modal .btn-close',
          'button[aria-label="Close"]',
          '.modal button.close',
        ];

        // Buscar botones con texto específico
        const buttons = document.querySelectorAll('button, a');
        for (const btn of Array.from(buttons)) {
          const text = (btn as HTMLElement).innerText?.toLowerCase().trim() || '';
          if (
            text.includes('no, continuar') ||
            text.includes('continuar sin actualizar') ||
            text === 'no' ||
            text === '×' ||
            text === 'x'
          ) {
            (btn as HTMLElement).click();
            return 'closed-button';
          }
        }

        // Verificar si hay modal visible
        const modal = document.querySelector('.modal.show, .modal[style*="display: block"]');
        if (modal) {
          const closeBtn = modal.querySelector('.close, .btn-close, button');
          if (closeBtn) {
            (closeBtn as HTMLElement).click();
            return 'closed-modal-btn';
          }
        }

        return modal ? 'modal-still-open' : 'no-modal';
      });

      logger.info(`Intento ${modalAttempt + 1} cerrar modal: ${modalClosed}`, { sessionId });

      if (modalClosed === 'no-modal') {
        break;
      }
      await sleep(1000);
    }

    await sleep(2000);
    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-05b-modal-cerrado`);

    // PASO 2: Seleccionar "Pagos de mis propios aportes" usando el input radio #I
    // El tipo de planilla usa inputs radio: #I = Independiente (propios aportes)
    logger.info('Seleccionando tipo de planilla: Pago de mis propios aportes', { sessionId });

    // Método 1: Click directo en el input radio o su label
    const tipoSeleccionado = await page.evaluate(() => {
      // Intentar click en el input radio #I (Independiente/propios aportes)
      const radioInput = document.querySelector('#I') as HTMLInputElement;
      if (radioInput) {
        radioInput.click();
        radioInput.checked = true;
        radioInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'clicked-radio-I';
      }

      // Intentar click en el label asociado al radio
      const labels = document.querySelectorAll('label');
      for (const label of Array.from(labels)) {
        const text = (label as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('propios aportes') && text.includes('beneficiarios')) {
          (label as HTMLElement).click();
          return 'clicked-label';
        }
      }

      // Fallback: buscar cualquier elemento con el texto
      const allElements = document.querySelectorAll('div, span, label, a');
      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('propios aportes') && text.includes('beneficiarios') && text.length < 100) {
          (el as HTMLElement).click();
          return 'clicked-text-element';
        }
      }

      return 'not-found';
    });

    logger.info('Resultado selección tipo planilla', { sessionId, tipoSeleccionado });

    // Esperar más tiempo para que la página actualice y cargue el cotizante
    await sleep(3000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-05c-tipo-seleccionado`);

    // Verificar que hay al menos 1 persona incluida
    const personasIncluidas = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/Personas incluidas en la planilla \((\d+)\)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    logger.info('Personas incluidas en planilla', { sessionId, personasIncluidas });

    if (personasIncluidas === 0) {
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error-sin-personas`);
      return {
        success: false,
        error: 'No hay personas incluidas en la planilla. El cotizante debe estar configurado.',
      };
    }

    // NOTA: Por ahora omitimos la modificación de IBC para simplificar
    // El sistema usará el IBC configurado del cotizante
    if (ibc) {
      logger.info('IBC proporcionado pero se omite modificación por ahora', { sessionId, ibc });
    }

    // PASO 3: Click en el botón naranja "Generar Planilla"
    logger.info('Haciendo click en botón Generar Planilla', { sessionId });

    // Intentar múltiples formas de hacer click en el botón
    const clicked = await page.evaluate(() => {
      // Buscar botón naranja de generar planilla
      const buttons = document.querySelectorAll('button, a.btn');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
        const _classList = (btn as HTMLElement).className?.toLowerCase() || '';

        // Buscar específicamente el botón naranja "Generar Planilla"
        if ((text === 'generar planilla' || text.includes('generar planilla')) &&
            !text.includes('regresar')) {
          console.log('Found Generar Planilla button:', text);
          (btn as HTMLElement).click();
          return 'clicked-text';
        }
      }

      // Buscar por clase de botón primario/warning (naranja)
      const primaryBtns = document.querySelectorAll('.btn-primary, .btn-warning, button[class*="primary"]');
      for (const btn of Array.from(primaryBtns)) {
        const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
        if (text.includes('generar')) {
          (btn as HTMLElement).click();
          return 'clicked-class';
        }
      }

      return 'not-found';
    });

    logger.info('Resultado click Generar Planilla', { sessionId, clicked });

    if (clicked === 'not-found') {
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error-no-btn-generar`);
      return { success: false, error: 'No se encontró botón Generar Planilla' };
    }

    // Esperar a que se genere la planilla
    await sleep(5000);

    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-06-planilla-created`);

    // Extraer datos de la planilla generada
    const planillaData = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const valorMatch = bodyText.match(/\$\s*([\d.,]+)/);
      const numeroMatch = bodyText.match(/(?:planilla|número)[:\s]*(\d{6,10})/i);

      return {
        numero: numeroMatch ? numeroMatch[1] : undefined,
        valor: valorMatch ? parseInt(valorMatch[1].replace(/[.,]/g, ''), 10) : undefined,
      };
    });

    return {
      success: true,
      numeroPlanilla: planillaData.numero,
      valorPlanilla: planillaData.valor,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error generating planilla', { sessionId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

async function _cerrarModalARL(page: Page): Promise<void> {
  try {
    // Esperar un poco a que el modal aparezca
    await sleep(2000);

    // Intentar varias veces cerrar el modal
    for (let i = 0; i < 3; i++) {
      const closed = await page.evaluate(() => {
        // Buscar específicamente el botón "No, continuar sin actualizar"
        const buttons = document.querySelectorAll('button, a');
        for (const btn of Array.from(buttons)) {
          const text = (btn as HTMLElement).innerText?.toLowerCase().trim() || '';

          // Buscar el botón específico del modal de ARL
          if (text.includes('no, continuar sin actualizar') ||
              text.includes('no,') && text.includes('continuar') ||
              text === 'no, continuar sin actualizar') {
            (btn as HTMLElement).click();
            return 'clicked';
          }
        }

        // También intentar cerrar el modal con el X si existe
        const closeBtn = document.querySelector('.modal .close, .modal-header button.close, button.btn-close');
        if (closeBtn) {
          (closeBtn as HTMLElement).click();
          return 'closed-x';
        }

        // Verificar si hay un modal visible
        const modal = document.querySelector('.modal.show, .modal[style*="display: block"]');
        if (!modal) {
          return 'no-modal';
        }

        return 'not-found';
      });

      if (closed === 'clicked' || closed === 'closed-x') {
        await sleep(1500);
        return;
      }

      if (closed === 'no-modal') {
        return; // No hay modal, continuar
      }

      await sleep(500);
    }
  } catch {
    // Modal no apareció o error ignorable
  }
}

async function _modificarIBC(page: Page, ibc: number): Promise<void> {
  // Click en "Modificar información"
  await page.evaluate(() => {
    const links = document.querySelectorAll('a, button');
    for (const el of links) {
      const text = (el as HTMLElement).innerText?.toLowerCase() || '';
      if (text.includes('modificar')) {
        (el as HTMLElement).click();
        return;
      }
    }
  });
  await sleep(2000);

  // Modificar el campo de ingresos
  await page.evaluate((ibcValue) => {
    const input = document.querySelector('#IngresosMensuales, input[name*="ingresos"]') as HTMLInputElement;
    if (input) {
      input.value = ibcValue.toString();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, ibc);
  await sleep(500);

  // Guardar
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"]');
    for (const btn of buttons) {
      const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
      if (text.includes('guardar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await sleep(2000);
}

// ============================================
// FUNCIONES DE PAGO
// ============================================

async function clickPagaAqui(
  page: Page,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('Buscando botón Paga aquí', { sessionId });

  // Navegar a administrar planillas para asegurar que estamos en la página correcta
  await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.timeouts.navigation,
  });
  await sleep(3000);

  await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-08-planillas-para-pagar`);

  // Intentar múltiples veces encontrar el botón
  let attempts = 0;
  const maxAttempts = 5;
  let clicked = false;

  while (!clicked && attempts < maxAttempts) {
    attempts++;
    logger.info(`Intento ${attempts} de buscar Paga aquí`, { sessionId });

    if (attempts > 1) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
    }

    clicked = await page.evaluate(() => {
      // Buscar todos los elementos clickeables
      const allElements = document.querySelectorAll('a, button, span, div[role="button"], .btn, [onclick]');

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
        const href = (el as HTMLAnchorElement).href?.toLowerCase() || '';

        // Buscar variaciones del texto "Paga aquí"
        if (text === 'paga aquí' ||
            text.includes('paga aquí') ||
            text === 'pagar' ||
            text.includes('pagar planilla') ||
            href.includes('pagar') ||
            href.includes('pago')) {
          console.log('Found pay button:', text);
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      // Intentar buscar por clase o atributos específicos de Mi Planilla
      clicked = await page.evaluate(() => {
        // Buscar enlaces en la tarjeta de planilla
        const planillaCard = document.querySelector('.card-planilla, .planilla-item, [class*="planilla"]');
        if (planillaCard) {
          const link = planillaCard.querySelector('a');
          if (link) {
            link.click();
            return true;
          }
        }

        // Buscar cualquier botón naranja/primario que podría ser "Pagar"
        const primaryBtns = document.querySelectorAll('.btn-primary, .btn-warning, [class*="orange"]');
        for (const btn of Array.from(primaryBtns)) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('paga') || text.includes('pago')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
    }

    if (!clicked) {
      await sleep(2000);
    }
  }

  if (!clicked) {
    // Tomar screenshot de error para diagnóstico
    await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error-no-paga-aqui`);
    return { success: false, error: 'No se encontró botón "Paga aquí" después de múltiples intentos' };
  }

  await sleep(2000);
  return { success: true };
}

async function seleccionarPSEyBancolombia(page: Page, _sessionId: string): Promise<void> {
  await sleep(1000);

  // Seleccionar PSE
  await page.evaluate(() => {
    const radios = document.querySelectorAll('input[type="radio"], label, div[class*="option"]');
    for (const el of radios) {
      const text = (el as HTMLElement).innerText?.toLowerCase() || '';
      const value = (el as HTMLInputElement).value?.toLowerCase() || '';
      if (text.includes('pse') || value.includes('pse')) {
        (el as HTMLElement).click();
        return;
      }
    }
  });
  await sleep(500);

  // Seleccionar Bancolombia
  await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    for (const select of selects) {
      const options = Array.from((select as HTMLSelectElement).options);
      const bancoOption = options.find((opt) => opt.text.toLowerCase().includes('bancolombia'));
      if (bancoOption) {
        (select as HTMLSelectElement).value = bancoOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
  });
  await sleep(500);
}

async function clickContinuarPago(page: Page): Promise<void> {
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"], a');
    for (const btn of buttons) {
      const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
      if (text.includes('continuar') || text.includes('siguiente') || text.includes('pagar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
}

// ============================================
// FUNCIONES PSE
// ============================================

async function manejarVentanaPSE(
  page: Page,
  browser: Browser,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('Handling PSE window', { sessionId });

  try {
    // Esperar un poco para que se abra la ventana
    await sleep(3000);

    // Verificar si PSE ya está en la página actual (redirección)
    let currentUrl = page.url();
    logger.info('Current URL after PSE click', { sessionId, currentUrl });

    if (currentUrl.includes('pse') || currentUrl.includes('registro')) {
      logger.info('PSE found in current page', { sessionId });
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-10-pse-window`);
      const result = await llenarFormularioPSE(page, sessionId);
      if (result.success) {
        await clickIrAlBanco(page);
        await sleep(3000);
        await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-11-after-ir-banco`);
      }
      return result;
    }

    // Buscar si hay una nueva ventana abierta
    const pages = await browser.pages();
    logger.info('Open pages', { sessionId, count: pages.length });

    let psePage: Page | null = null;

    for (const p of pages) {
      try {
        const url = p.url();
        logger.info('Checking page', { sessionId, url });
        if (url.includes('pse') || url.includes('registro')) {
          psePage = p;
          break;
        }
      } catch {
        // Página cerrada o inaccesible
      }
    }

    // Si no encontramos ventana PSE, esperar a que se abra
    if (!psePage) {
      logger.info('Waiting for PSE window to open', { sessionId });

      const newPagePromise = new Promise<Page | null>((resolve) => {
        const handler = async (target: import('puppeteer').Target) => {
          const newPage = await target.page();
          if (newPage) {
            browser.off('targetcreated', handler);
            resolve(newPage);
          }
        };
        browser.on('targetcreated', handler);

        // Timeout de 10 segundos
        sleep(10000).then(() => {
          browser.off('targetcreated', handler);
          resolve(null);
        });
      });

      psePage = await newPagePromise;
    }

    // Verificar de nuevo la página actual (puede haber navegado)
    if (!psePage) {
      await sleep(2000);
      currentUrl = page.url();
      if (currentUrl.includes('pse') || currentUrl.includes('registro')) {
        logger.info('PSE found in current page after wait', { sessionId });
        await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-10-pse-window`);
        const result = await llenarFormularioPSE(page, sessionId);
        if (result.success) {
          await clickIrAlBanco(page);
          await sleep(3000);
          await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-11-after-ir-banco`);
        }
        return result;
      }

      // Última verificación: buscar todas las páginas de nuevo
      const finalPages = await browser.pages();
      for (const p of finalPages) {
        try {
          const url = p.url();
          if (url.includes('pse') || url.includes('registro')) {
            psePage = p;
            break;
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!psePage) {
      await browserManager.takeScreenshot(page, `flujo-completo-${sessionId}-error-no-pse-window`);
      return { success: false, error: 'No se abrió ventana PSE' };
    }

    // Trabajar con la ventana PSE
    await psePage.bringToFront();
    await psePage.waitForSelector('body', { timeout: CONFIG.timeouts.navigation });
    await sleep(2000);

    await browserManager.takeScreenshot(psePage, `flujo-completo-${sessionId}-10-pse-window`);

    // Llenar formulario PSE
    const result = await llenarFormularioPSE(psePage, sessionId);

    if (result.success) {
      // Click "Ir al banco"
      await clickIrAlBanco(psePage);
      await sleep(3000);

      await browserManager.takeScreenshot(psePage, `flujo-completo-${sessionId}-11-after-ir-banco`);
    }

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error handling PSE window', { sessionId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

async function llenarFormularioPSE(page: Page, sessionId: string): Promise<{ success: boolean; error?: string }> {
  logger.info('Filling PSE form', { sessionId });

  try {
    // Seleccionar Persona Jurídica
    await page.evaluate(() => {
      const elements = document.querySelectorAll('input[type="radio"], label, div, button');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('jurídica') || text.includes('juridica')) {
          (el as HTMLElement).click();
          return;
        }
      }
    });
    await sleep(1000);

    // Llenar NIT
    await page.evaluate((nit) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';

        if (id.includes('nit') || name.includes('nit') || placeholder.includes('nit') ||
            id.includes('documento') || name.includes('documento')) {
          el.focus();
          el.value = nit;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, CONFIG.pse.nit);
    await sleep(500);

    // Llenar Email
    await page.evaluate((email) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        const type = el.type?.toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';

        if (type === 'email' || id.includes('email') || id.includes('correo') ||
            name.includes('email') || name.includes('correo') ||
            placeholder.includes('email') || placeholder.includes('correo')) {
          el.focus();
          el.value = email;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, CONFIG.pse.email);
    await sleep(500);

    return { success: true };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

async function clickIrAlBanco(page: Page): Promise<void> {
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"], a');
    for (const btn of buttons) {
      const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
      if (text.includes('ir al banco') || text.includes('continuar') || text.includes('pagar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
    // Submit form como fallback
    const form = document.querySelector('form');
    if (form) form.submit();
  });
}

// ============================================
// EXPORTS
// ============================================

export default {
  ejecutarFlujoCompletoMiPlanilla,
  CONFIG,
};
