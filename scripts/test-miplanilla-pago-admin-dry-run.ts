/**
 * Test Dry Run: Mi Planilla Pago Admin-Controlled Bot - COMPLETO
 *
 * Prueba TODO el flujo desde login hasta Bancolombia Negocios:
 * 1. Login en Mi Planilla
 * 2. Navegar a planillas pendientes
 * 3. Click "Paga aquí"
 * 4. Seleccionar PSE + Bancolombia
 * 5. Manejar ventana PSE
 * 6. Llenar formulario PSE (NIT + Email)
 * 7. Ir al banco
 * 8. Seleccionar Bancolombia Negocios
 * 9. Llenar usuario (Lbrochet01)
 * 10. STOP - Admin toma control
 *
 * Este script crea la PagoAdminSession necesaria antes de ejecutar el bot.
 *
 * Uso: npx tsx scripts/test-miplanilla-pago-admin-dry-run.ts
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Page, Browser } from 'puppeteer';
import { BrowserManager } from '../src/bots/utils/browser';
import { decryptPassword } from '../src/utils/crypto';
import {
  ejecutarFlujoBancolombiaNegocios,
  detectarPaginaSeleccionTipo,
  getBancolombiaPageInfo,
} from '../src/bots/utils/bancolombia-negocios';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';

const prisma = new PrismaClient();

// ============================================
// CONFIGURACIÓN
// ============================================

const PSE_CONFIG = {
  email: 'ulecolombia@gmail.com',
  nit: '9020190314',
};

const BANCOLOMBIA_CONFIG = {
  usuario: 'Lbrochet01',
};

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(step: string, message: string, data?: any) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${step}] ${message}`, data ? JSON.stringify(data) : '');
}

// ============================================
// PASO 1: AUTENTICACIÓN
// ============================================

async function paso1_autenticar(
  page: Page,
  browserMgr: BrowserManager,
  credentials: { usuario: string; password: string }
): Promise<boolean> {
  log('PASO 1', 'Autenticando en Mi Planilla...');

  try {
    await page.goto(MIPLANILLA_URLS.portalIndependientes, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(3000);

    await browserMgr.takeScreenshot(page, 'dry-run-01-login-page');

    // Cerrar popup si existe
    await page.evaluate(() => {
      const closeButtons = document.querySelectorAll('.modal .close, button[aria-label="Close"], .btn-close');
      for (const btn of closeButtons) {
        try { (btn as HTMLElement).click(); } catch {}
      }
    });
    await sleep(500);

    // Llenar credenciales
    await page.type('#usuario', credentials.usuario, { delay: 50 });
    await page.type('#clave', credentials.password, { delay: 50 });

    await browserMgr.takeScreenshot(page, 'dry-run-02-credentials-filled');

    // Click login
    const loginBtn = await page.$('button.btn.btn-primary.button-cta');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.toLowerCase().includes('entrar')) {
            btn.click();
            return;
          }
        }
      });
    }

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await sleep(3000);

    // Verificar login exitoso
    const currentUrl = page.url();
    const isLoggedIn = currentUrl.includes('Principal') || currentUrl.includes('Privado');

    await browserMgr.takeScreenshot(page, 'dry-run-03-after-login');

    if (isLoggedIn) {
      log('PASO 1', '✅ Login exitoso', { url: currentUrl });
      return true;
    } else {
      log('PASO 1', '❌ Login fallido', { url: currentUrl });
      return false;
    }
  } catch (error) {
    log('PASO 1', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 2: NAVEGAR A PLANILLAS Y CLICK PAGAR
// ============================================

async function paso2_navegarYClickPagar(
  page: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 2', 'Navegando a planillas y buscando "Paga aquí"...');

  try {
    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(3000);

    await browserMgr.takeScreenshot(page, 'dry-run-04-planillas-page');

    // Verificar si hay planillas pendientes
    const pageContent = await page.evaluate(() => document.body.innerText);

    if (pageContent.includes('no tienes planillas pendientes')) {
      log('PASO 2', '⚠️ No hay planillas pendientes para pago');

      // Intentar ir a "Generar nueva planilla" o buscar alternativa
      const hasGenerarBtn = await page.evaluate(() => {
        const btns = document.querySelectorAll('*');
        for (const btn of btns) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('generar') && text.includes('planilla')) {
            return true;
          }
        }
        return false;
      });

      if (hasGenerarBtn) {
        log('PASO 2', 'ℹ️ Se puede generar una nueva planilla');
      }

      return false; // No podemos continuar sin planilla
    }

    // Buscar botón "Paga aquí" - SOLO este estado permite pago directo
    // IMPORTANTE: "Pendiente de confirmación" abre modal de EDICIÓN, NO de pago
    log('PASO 2', 'Buscando botón "Paga aquí"...');

    // Primero, scroll y encontrar el botón
    const buttonFound = await page.evaluate(() => {
      // SOLO buscar "Paga aquí" - NO "Pendiente de confirmación"
      const targetTexts = ['paga aquí', 'paga aqui'];

      // Buscar específicamente button o <a> con clase btn o cualquier link
      const selectors = [
        'button',
        'a.btn',
        'a[class*="btn"]',
        'a[class*="button"]',
        'a[class*="pagar"]',
        'a', // También buscar links normales para "Pendiente de confirmación"
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
          // Verificar si el texto coincide con alguno de los textos objetivo
          if (targetTexts.some(target => text === target || text.includes(target))) {
            // Hacer scroll al elemento
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return {
              found: true,
              tagName: el.tagName,
              className: el.className,
              text: (el as HTMLElement).innerText?.trim(),
              matchedText: targetTexts.find(t => text.includes(t)),
            };
          }
        }
      }
      return { found: false };
    });

    log('PASO 2', 'Resultado búsqueda botón:', buttonFound);

    if (!buttonFound.found) {
      log('PASO 2', '❌ No se encontró botón "Paga aquí"');
      return false;
    }

    await sleep(1000);
    const urlBefore = page.url();

    // Usar XPath de Puppeteer para hacer click en el elemento EXACTO
    // Esto es más confiable que page.evaluate
    try {
      // XPath que busca SOLO "Paga aquí"
      const xpathQuery = `
        .//button[contains(translate(normalize-space(.), "PAGAAQUÍ", "pagaaquí"), "paga aquí")] |
        .//a[contains(@class, "btn")][contains(translate(normalize-space(.), "PAGAAQUÍ", "pagaaquí"), "paga aquí")] |
        .//*[contains(translate(normalize-space(.), "PAGAAQUÍ", "pagaaquí"), "paga aquí")]
      `.replace(/\n/g, '').trim();

      const [button] = await page.$$(`xpath/${xpathQuery}`);

      if (button) {
        log('PASO 2', 'Botón encontrado via XPath, haciendo click con coordenadas del mouse...');

        // Obtener coordenadas reales del botón
        const box = await button.boundingBox();
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          log('PASO 2', `Coordenadas del botón: x=${x.toFixed(0)}, y=${y.toFixed(0)}`);

          // Click real con el mouse
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
            page.mouse.click(x, y),
          ]);
        } else {
          log('PASO 2', '⚠️ No se pudo obtener boundingBox, usando click directo...');
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
            button.click(),
          ]);
        }
      } else {
        // Fallback: click via evaluate pero en elemento específico
        log('PASO 2', 'Fallback: click via evaluate...');
        await page.evaluate(() => {
          // SOLO buscar "Paga aquí"
          const targetTexts = ['paga aquí', 'paga aqui'];
          const allElements = document.querySelectorAll('button, a.btn, a[class*="btn"], a');
          for (const el of Array.from(allElements)) {
            const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
            if (targetTexts.some(target => text === target || text.includes(target))) {
              (el as HTMLElement).click();
              return;
            }
          }
        });

        // Esperar navegación
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
      }

      await sleep(3000);
      const urlAfter = page.url();

      await browserMgr.takeScreenshot(page, 'dry-run-05-after-pagar-click');

      // Verificar si hubo navegación o cambio de contenido
      if (urlAfter !== urlBefore) {
        log('PASO 2', '✅ Click en "Paga aquí" exitoso - navegación detectada', { from: urlBefore, to: urlAfter });
        return true;
      }

      // Verificar si el contenido cambió (puede ser un modal o cambio dinámico)
      const pageContent = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (pageContent.includes('medio de pago') || pageContent.includes('pse') || pageContent.includes('selecciona')) {
        log('PASO 2', '✅ Click en "Paga aquí" exitoso - contenido de pago detectado');
        return true;
      }

      log('PASO 2', '⚠️ Click realizado pero no hubo cambio de navegación');
      return false;

    } catch (err) {
      log('PASO 2', '❌ Error al hacer click:', (err as Error).message);
      return false;
    }
  } catch (error) {
    log('PASO 2', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 2B: GENERAR PLANILLA (cuando no hay pendientes)
// ============================================

async function paso2b_generarPlanilla(
  page: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 2B', 'No hay planillas pendientes - Generando nueva planilla...');

  try {
    // Navegar a Generar Planilla
    await page.goto(MIPLANILLA_URLS.generarPlanilla, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(3000);

    await browserMgr.takeScreenshot(page, 'dry-run-04b-generar-planilla-page');

    // Cerrar modal ARL - esperar que aparezca y cerrarlo
    log('PASO 2B', 'Cerrando modal ARL...');
    await sleep(2000); // Dar tiempo para que aparezca el modal

    // Click específico en "No, continuar sin actualizar" - múltiples intentos
    for (let i = 0; i < 5; i++) {
      const modalClosed = await page.evaluate(() => {
        // Buscar específicamente el botón outline "No, continuar sin actualizar"
        const buttons = document.querySelectorAll('button');
        for (const btn of Array.from(buttons)) {
          const text = (btn as HTMLElement).innerText?.trim() || '';
          // El botón tiene texto "No, continuar sin actualizar"
          if (text.toLowerCase().includes('continuar sin actualizar')) {
            (btn as HTMLElement).click();
            return { clicked: true, button: text };
          }
        }

        // También intentar con links
        const links = document.querySelectorAll('a');
        for (const link of Array.from(links)) {
          const text = (link as HTMLElement).innerText?.trim() || '';
          if (text.toLowerCase().includes('continuar sin actualizar')) {
            (link as HTMLElement).click();
            return { clicked: true, button: text };
          }
        }

        // Buscar botón X de cerrar en el modal
        const closeX = document.querySelector('.modal .close, button.close, .btn-close');
        if (closeX) {
          (closeX as HTMLElement).click();
          return { clicked: true, button: 'X-close' };
        }

        // Verificar si hay modal visible
        const modalVisible = document.querySelector('.modal.show, .modal[style*="display: block"]');
        return { clicked: false, modalVisible: !!modalVisible };
      });

      log('PASO 2B', `Intento ${i + 1} cerrar modal:`, modalClosed);

      // Verificar si el modal se cerró
      await sleep(1500);

      const isModalGone = await page.evaluate(() => {
        const modal = document.querySelector('.modal.show, .modal[style*="display: block"]');
        const backdrop = document.querySelector('.modal-backdrop');
        return !modal && !backdrop;
      });

      if (isModalGone) {
        log('PASO 2B', '✅ Modal cerrado exitosamente');
        break;
      }

      // Si el modal sigue ahí, presionar Escape
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    await sleep(2000);
    await browserMgr.takeScreenshot(page, 'dry-run-04b2-modal-cerrado');

    // Seleccionar tipo "Pagos de mis propios aportes" usando input radio #I
    const tipoSelected = await page.evaluate(() => {
      // Método 1: Click en input radio #I
      const radioInput = document.querySelector('#I') as HTMLInputElement;
      if (radioInput) {
        radioInput.click();
        radioInput.checked = true;
        radioInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'clicked-radio-I';
      }

      // Fallback: Click en label con texto
      const labels = document.querySelectorAll('label');
      for (const label of Array.from(labels)) {
        const text = (label as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('propios aportes') && text.includes('beneficiarios')) {
          (label as HTMLElement).click();
          return 'clicked-label';
        }
      }
      return 'not-found';
    });

    log('PASO 2B', `Tipo de planilla seleccionado: ${tipoSelected}`);
    await sleep(3000);

    await browserMgr.takeScreenshot(page, 'dry-run-04c-tipo-seleccionado');

    // Verificar que el cotizante apareció (Personas incluidas: 1)
    const personasIncluidas = await page.evaluate(() => {
      const match = document.body.innerText.match(/Personas incluidas[^(]*\((\d+)\)/i);
      return match ? parseInt(match[1], 10) : 0;
    });

    log('PASO 2B', `Personas incluidas: ${personasIncluidas}`);

    if (personasIncluidas === 0) {
      log('PASO 2B', '❌ No se agregó el cotizante');
      return false;
    }

    // Click en "Generar Planilla" - IMPORTANTE: hacer scroll primero
    log('PASO 2B', 'Buscando y haciendo scroll al botón Generar Planilla...');

    // Scroll hacia abajo para asegurar que el botón sea visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);

    // Hacer scroll específico al botón y click
    const generarClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        // Buscar botón "Generar Planilla" pero NO "Generar planilla aportes FSP" ni enlaces del menú
        if (text.trim() === 'generar planilla' ||
            (text.includes('generar planilla') && !text.includes('automática') && !text.includes('fsp') && !text.includes('aportes'))) {
          // Verificar que sea un botón real (no un enlace del menú)
          const tagName = btn.tagName.toLowerCase();
          const classes = btn.className?.toLowerCase() || '';
          const isButton = tagName === 'button' || classes.includes('btn');

          if (isButton) {
            // Scroll al botón para hacerlo visible
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { found: true, scrolled: true, text: (btn as HTMLElement).innerText?.trim() };
          }
        }
      }
      return { found: false };
    });

    log('PASO 2B', `Botón encontrado:`, generarClicked);

    if (!generarClicked.found) {
      log('PASO 2B', '❌ No se encontró botón Generar Planilla');
      return false;
    }

    await sleep(1500);
    await browserMgr.takeScreenshot(page, 'dry-run-04c2-antes-click-generar');

    // Ahora hacer click usando Puppeteer directamente (más confiable)
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.toLowerCase().trim() || '';
        if (text === 'generar planilla') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      log('PASO 2B', '⚠️ Click fallback - intentando con selector...');
      // Fallback: intentar con page.click
      try {
        await page.click('button.btn-primary:not(.btn-outline)');
      } catch {
        log('PASO 2B', '❌ No se pudo hacer click en el botón');
        return false;
      }
    }

    log('PASO 2B', '✅ Click en Generar Planilla realizado');

    // Esperar navegación o cambio de página
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
      sleep(10000)
    ]).catch(() => {});

    await sleep(3000);
    await browserMgr.takeScreenshot(page, 'dry-run-04d-planilla-generada');

    // Verificar que estamos en la página de la planilla o pago
    const currentUrl = page.url();
    const pageContent = await page.evaluate(() => document.body.innerText);

    if (
      currentUrl.includes('ResumenPlanilla') ||
      currentUrl.includes('AdministrarPlanillas') ||
      pageContent.includes('Paga aquí') ||
      pageContent.includes('Pendiente de confirmación') ||
      pageContent.includes('planilla generada')
    ) {
      log('PASO 2B', '✅ Planilla generada exitosamente');
      return true;
    }

    log('PASO 2B', '⚠️ Planilla posiblemente generada', { url: currentUrl });
    return true;
  } catch (error) {
    log('PASO 2B', '❌ Error', { error: (error as Error).message });
    await browserMgr.takeScreenshot(page, 'dry-run-04e-error');
    return false;
  }
}

// ============================================
// PASO 3: SELECCIONAR PSE Y CONTINUAR
// ============================================

async function paso3_seleccionarPSE(
  page: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 3', 'Seleccionando PSE como medio de pago...');

  try {
    const currentUrl = page.url();
    await browserMgr.takeScreenshot(page, 'dry-run-06-payment-selection');

    // Si estamos en ResumenPlanilla, primero navegar a medios de pago
    if (currentUrl.includes('ResumenPlanilla')) {
      log('PASO 3', 'Estamos en ResumenPlanilla, buscando botón de pago...');

      const clickedResumen = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a');
        for (const btn of btns) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('seleccionar medio') || text.includes('pagar') || text.includes('paga aquí') || text.includes('pendiente de confirmación')) {
            (btn as HTMLElement).click();
            return text;
          }
        }
        return null;
      });

      if (clickedResumen) {
        log('PASO 3', `Click en: "${clickedResumen}"`);
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
        await sleep(2000);
        await browserMgr.takeScreenshot(page, 'dry-run-06b-after-resumen-click');
      }
    }

    // Ahora debemos estar en la página de "Medios de pago"
    // PASO 3A: Click en la TARJETA de PSE para seleccionarla
    log('PASO 3', 'Buscando y clickeando tarjeta PSE...');

    const pseCardClicked = await page.evaluate(() => {
      // Buscar por texto "Pago por PSE" o la imagen PSE
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        // Buscar el contenedor que tiene "Pago por PSE"
        if (text === 'Pago por PSE' || text.includes('Pago por PSE')) {
          // Buscar el contenedor clickeable (card)
          let card = el.parentElement;
          for (let i = 0; i < 5 && card; i++) {
            const rect = card.getBoundingClientRect();
            // La card tiene un tamaño específico
            if (rect.width > 150 && rect.height > 80 && rect.width < 500) {
              (card as HTMLElement).click();
              return { clicked: true, method: 'text-parent' };
            }
            card = card.parentElement;
          }
        }
      }

      // Fallback: buscar imagen PSE
      const images = document.querySelectorAll('img');
      for (const img of images) {
        const src = (img as HTMLImageElement).src?.toLowerCase() || '';
        const alt = (img as HTMLImageElement).alt?.toLowerCase() || '';
        if (src.includes('pse') || alt.includes('pse')) {
          let card = img.parentElement;
          for (let i = 0; i < 5 && card; i++) {
            const rect = card.getBoundingClientRect();
            if (rect.width > 150 && rect.height > 80) {
              (card as HTMLElement).click();
              return { clicked: true, method: 'img-parent' };
            }
            card = card.parentElement;
          }
          // Si no encontró card, click directo en imagen
          img.click();
          return { clicked: true, method: 'img-direct' };
        }
      }
      return { clicked: false };
    });

    log('PASO 3', 'Resultado click tarjeta PSE:', pseCardClicked);
    await sleep(1500);
    await browserMgr.takeScreenshot(page, 'dry-run-07-pse-card-clicked');

    // PASO 3B: Click en botón "Seleccionar medio de pago" para CONTINUAR
    log('PASO 3', 'Buscando botón "Seleccionar medio de pago"...');

    const urlBefore = page.url();

    // Usar XPath nativo para encontrar el botón naranja
    const [seleccionarBtn] = await page.$$('xpath/.//button[contains(normalize-space(.), "Seleccionar medio de pago")] | .//a[contains(normalize-space(.), "Seleccionar medio de pago")]');

    if (seleccionarBtn) {
      log('PASO 3', 'Botón encontrado via XPath, haciendo click con coordenadas...');
      const box = await seleccionarBtn.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        log('PASO 3', `Coordenadas: x=${x.toFixed(0)}, y=${y.toFixed(0)}`);
        await page.mouse.click(x, y);
      } else {
        await seleccionarBtn.click();
      }
    } else {
      // Fallback: buscar por evaluate
      log('PASO 3', 'XPath no encontró, usando evaluate...');
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a');
        for (const btn of btns) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('seleccionar medio de pago')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
    }

    // Esperar navegación o modal de confirmación
    await sleep(2000);
    await browserMgr.takeScreenshot(page, 'dry-run-07b-after-seleccionar-click');

    // Verificar si ya navegamos a la página PSE
    let urlAfterSelect = page.url();
    log('PASO 3', `URL después de click: ${urlAfterSelect}`);

    // Si estamos en pse/go.aspx, ya navegamos correctamente
    if (urlAfterSelect.includes('pse/go.aspx') || urlAfterSelect.includes('pse.com.co')) {
      log('PASO 3', '✅ Ya estamos en página PSE');
    } else {
      // PASO 3C: Buscar modal de confirmación ESPECÍFICO de pago
      log('PASO 3', 'Buscando modal de confirmación de pago...');

      // Verificar si hay un modal visible con los botones de confirmación
      const modalInfo = await page.evaluate(() => {
        // Buscar modales activos/visibles
        const modals = document.querySelectorAll('.modal.show, .modal.in, [role="dialog"]:not([style*="display: none"])');

        for (const modal of Array.from(modals)) {
          const modalText = (modal as HTMLElement).innerText?.toLowerCase() || '';
          // Verificar que es el modal correcto (debe contener texto sobre el pago)
          if (modalText.includes('continuar con el pago') ||
              modalText.includes('confirmar') ||
              modalText.includes('planilla')) {
            // Buscar el botón de confirmar dentro del modal
            const buttons = modal.querySelectorAll('button');
            for (const btn of Array.from(buttons)) {
              const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
              if (text.includes('continuar') && !text.includes('no')) {
                (btn as HTMLElement).click();
                return {
                  found: true,
                  clicked: true,
                  text: (btn as HTMLElement).innerText?.trim(),
                  modalText: modalText.slice(0, 200)
                };
              }
            }
            return { found: true, clicked: false, modalText: modalText.slice(0, 200) };
          }
        }

        // Fallback: buscar botón específico fuera de modal
        const allButtons = document.querySelectorAll('button.btn-primary, button.btn-success');
        for (const btn of Array.from(allButtons)) {
          const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
          const isVisible = (btn as HTMLElement).offsetParent !== null;
          // Solo hacer click si es visible y tiene el texto exacto correcto
          if (isVisible && text === 'si, continuar con el pago') {
            (btn as HTMLElement).click();
            return { found: false, clicked: true, text: (btn as HTMLElement).innerText?.trim() };
          }
        }

        return { found: false, clicked: false };
      });

      log('PASO 3', 'Resultado búsqueda modal:', modalInfo);

      if (modalInfo.clicked) {
        log('PASO 3', `✅ Click en modal confirmación: "${modalInfo.text}"`);
        // Esperar que el modal se cierre
        await sleep(2000);

        await browserMgr.takeScreenshot(page, 'dry-run-07c-after-modal-click');

        // PASO 3D: Después del modal, la tarjeta PSE se deselecciona
        // Hay que volver a seleccionarla antes de hacer el segundo click
        log('PASO 3', 'Modal cerrado - RE-SELECCIONANDO tarjeta PSE (método mejorado)...');

        // Método mejorado: buscar la estructura exacta de la tarjeta y hacer click con Puppeteer
        const pseReselected = await page.evaluate(() => {
          // 1. Primero buscar input radio/checkbox oculto dentro de la tarjeta PSE
          const radios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
          for (const radio of radios) {
            const parent = radio.closest('div, label') as HTMLElement;
            if (parent) {
              const text = parent.innerText?.toLowerCase() || '';
              const id = (radio as HTMLInputElement).id?.toLowerCase() || '';
              const name = (radio as HTMLInputElement).name?.toLowerCase() || '';
              const value = (radio as HTMLInputElement).value?.toLowerCase() || '';
              if (text.includes('pse') || id.includes('pse') || name.includes('pse') || value.includes('pse')) {
                (radio as HTMLInputElement).click();
                (radio as HTMLInputElement).checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('input', { bubbles: true }));
                return { clicked: true, method: 'radio-input', id: (radio as HTMLInputElement).id };
              }
            }
          }

          // 2. Buscar label o div con clase activa/seleccionada que contenga PSE
          const labels = document.querySelectorAll('label, div[class*="card"], div[class*="option"], div[class*="payment"]');
          for (const label of labels) {
            const text = (label as HTMLElement).innerText?.trim() || '';
            if (text.includes('Pago por PSE') || text === 'Pago por PSE') {
              // Buscar el elemento clickeable (probablemente tiene un data-* o onclick)
              const clickable = label.querySelector('[onclick], [data-value], [data-id]') || label;
              (clickable as HTMLElement).click();
              // Disparar eventos
              clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return { clicked: true, method: 'label-click', classes: (label as HTMLElement).className };
            }
          }

          // 3. Buscar imagen PSE y hacer click en su contenedor
          const images = document.querySelectorAll('img');
          for (const img of images) {
            const src = (img as HTMLImageElement).src?.toLowerCase() || '';
            const alt = (img as HTMLImageElement).alt?.toLowerCase() || '';
            if (src.includes('pse') || alt.includes('pse')) {
              // Buscar contenedor con onclick o clickeable
              let container = img.parentElement;
              for (let i = 0; i < 6 && container; i++) {
                const hasOnClick = container.hasAttribute('onclick') || container.getAttribute('ng-click') || container.getAttribute('@click');
                const rect = container.getBoundingClientRect();
                const isCardSize = rect.width > 150 && rect.height > 80 && rect.width < 500;

                if (hasOnClick || (isCardSize && container.className.includes('card'))) {
                  container.click();
                  container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  return { clicked: true, method: 'img-container-onclick', classes: container.className };
                }
                container = container.parentElement;
              }
              // Si no encontramos onclick, buscar el contenedor card más cercano
              container = img.closest('div[class*="card"], div[class*="option"], div[class*="panel"], div[class*="col"]');
              if (container) {
                container.click();
                return { clicked: true, method: 'img-closest-card' };
              }
            }
          }

          return { clicked: false, method: 'none' };
        });

        log('PASO 3', 'Resultado re-selección PSE:', pseReselected);
        await sleep(1000);

        // Verificar si la tarjeta PSE quedó seleccionada (buscar borde naranja o clase activa)
        const isSelected = await page.evaluate(() => {
          // Buscar elementos con borde naranja, clase active, selected, checked
          const elements = document.querySelectorAll('*');
          for (const el of elements) {
            const text = (el as HTMLElement).innerText?.trim() || '';
            if (text.includes('Pago por PSE')) {
              // Buscar hacia arriba hasta encontrar el contenedor con estilo de selección
              let parent = el as HTMLElement;
              for (let i = 0; i < 6 && parent; i++) {
                const style = window.getComputedStyle(parent);
                const borderColor = style.borderColor;
                const classes = parent.className || '';
                // Naranja típico de Mi Planilla: rgb(234, 107, 41) o similar
                const hasOrangeBorder = borderColor.includes('234') || borderColor.includes('orange') ||
                                       borderColor.includes('ea6b29') || style.borderWidth !== '0px';
                const hasActiveClass = classes.includes('active') || classes.includes('selected') ||
                                      classes.includes('checked') || classes.includes('focus');
                if (hasOrangeBorder || hasActiveClass) {
                  return { selected: true, borderColor, classes };
                }
                parent = parent.parentElement as HTMLElement;
              }
            }
          }
          return { selected: false };
        });

        log('PASO 3', 'Verificación selección PSE:', isSelected);

        // Si no está seleccionado, intentar click nativo de Puppeteer en la imagen PSE
        if (!isSelected.selected) {
          log('PASO 3', 'Intentando click nativo de Puppeteer en imagen PSE...');
          try {
            // Buscar imagen PSE con XPath y hacer click nativo
            const [pseImg] = await page.$$('xpath/.//img[contains(@src, "pse") or contains(@src, "PSE") or contains(@alt, "pse") or contains(@alt, "PSE")]');
            if (pseImg) {
              const box = await pseImg.boundingBox();
              if (box) {
                // Click en el centro de la imagen
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                log('PASO 3', '✅ Click nativo en imagen PSE realizado');
                await sleep(1000);
              }
            }
          } catch (e) {
            log('PASO 3', 'Click nativo falló:', (e as Error).message);
          }
        }

        await sleep(500);
        await browserMgr.takeScreenshot(page, 'dry-run-07c2-pse-reselected');

        // Ahora sí hacer SEGUNDO CLICK en "Seleccionar medio de pago"
        log('PASO 3', 'Haciendo SEGUNDO click en "Seleccionar medio de pago"...');

        // Buscar y hacer click en el botón naranja nuevamente
        const [seleccionarBtn2] = await page.$$('xpath/.//button[contains(normalize-space(.), "Seleccionar medio de pago")] | .//a[contains(normalize-space(.), "Seleccionar medio de pago")]');

        if (seleccionarBtn2) {
          log('PASO 3', 'Segundo botón encontrado, haciendo click con espera de navegación...');
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
            seleccionarBtn2.click(),
          ]);
        } else {
          // Fallback: buscar por evaluate
          log('PASO 3', 'Segundo botón no encontrado via XPath, usando evaluate...');
          await page.evaluate(() => {
            const btns = document.querySelectorAll('button, a');
            for (const btn of btns) {
              const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
              if (text.includes('seleccionar medio de pago')) {
                (btn as HTMLElement).click();
                return;
              }
            }
          });
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
        }

        await sleep(2000);

      } else if (!modalInfo.found) {
        log('PASO 3', 'No se encontró modal - esperando navegación...');
        // Quizás la navegación está en progreso
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
      }
    }

    await sleep(2000);
    const urlAfter = page.url();
    await browserMgr.takeScreenshot(page, 'dry-run-07d-after-second-click');

    // Verificar que navegamos
    if (urlAfter !== urlBefore) {
      log('PASO 3', '✅ PSE seleccionado y navegación exitosa', { from: urlBefore, to: urlAfter });
      return true;
    }

    // Verificar si apareció contenido de PSE (formulario o selects)
    const hasNewContent = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('tipo de cliente') ||
             text.includes('persona jurídica') ||
             text.includes('seleccione su banco') ||
             text.includes('entidad financiera') ||
             text.includes('pse.com.co');
    });

    if (hasNewContent) {
      log('PASO 3', '✅ PSE seleccionado - contenido de formulario PSE detectado');
      return true;
    }

    log('PASO 3', '⚠️ Click realizado pero no se detectó cambio');
    return pseCardClicked.clicked;
  } catch (error) {
    log('PASO 3', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 4: SELECCIONAR TIPO Y BANCO
// ============================================

async function paso4_seleccionarTipoYBanco(
  page: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 4', 'Seleccionando Persona Jurídica + Bancolombia...');

  try {
    await browserMgr.takeScreenshot(page, 'dry-run-08-before-selects');

    // Analizar qué hay en la página
    const pageAnalysis = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      const selectInfo = Array.from(selects).map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).map(o => o.text).slice(0, 10),
        optionCount: s.options.length
      }));

      // Buscar también divs que pueden ser dropdowns (React/Angular)
      const dropdowns = document.querySelectorAll('[role="combobox"], [role="listbox"], .dropdown, .select-wrapper');
      const dropdownInfo = Array.from(dropdowns).map(d => ({
        class: d.className,
        text: (d as HTMLElement).innerText?.slice(0, 100)
      }));

      return {
        url: window.location.href,
        selectCount: selects.length,
        selects: selectInfo,
        dropdownCount: dropdowns.length,
        dropdowns: dropdownInfo,
        bodyText: document.body.innerText.slice(0, 1000)
      };
    });

    log('PASO 4', 'Análisis de página:', pageAnalysis);

    // Si no hay selects, puede que estemos en la página de PSE (registro.pse.com.co)
    if (pageAnalysis.selectCount === 0) {
      log('PASO 4', 'No hay selects nativos - verificando si estamos en PSE...');

      // Verificar si estamos en PSE
      if (page.url().includes('pse.com.co')) {
        log('PASO 4', '✅ Ya estamos en PSE - selects estarán ahí');
        return true;
      }

      // Esperar un poco más por si los selects cargan dinámicamente
      await sleep(3000);
      await browserMgr.takeScreenshot(page, 'dry-run-08b-waiting-for-selects');
    }

    // Seleccionar "Persona Jurídica"
    log('PASO 4', 'Buscando dropdown de tipo de persona...');
    const juridicaSelected = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const opt = options.find(o =>
          o.text.toLowerCase().includes('jurídica') ||
          o.text.toLowerCase().includes('juridica') ||
          o.text.toLowerCase().includes('empresa')
        );
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          return { selected: true, value: opt.text };
        }
      }
      return { selected: false };
    });

    log('PASO 4', 'Resultado Persona Jurídica:', juridicaSelected);
    await sleep(2000);

    // Seleccionar "Bancolombia"
    log('PASO 4', 'Buscando dropdown de banco...');
    const bancoSelected = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        // Buscar Bancolombia específicamente
        const opt = options.find(o => {
          const text = o.text.toLowerCase();
          return text.includes('bancolombia') && !text.includes('banco de bogota');
        });
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          return { selected: true, value: opt.text };
        }
      }
      return { selected: false };
    });

    log('PASO 4', 'Resultado Bancolombia:', bancoSelected);
    await sleep(1500);

    await browserMgr.takeScreenshot(page, 'dry-run-09-selects-filled');

    const success = juridicaSelected.selected && bancoSelected.selected;
    log('PASO 4', success ? '✅ Tipo y banco seleccionados' : '⚠️ Selección parcial',
      { juridica: juridicaSelected, banco: bancoSelected });

    return success;
  } catch (error) {
    log('PASO 4', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 5: CLICK LOGO PSE Y MANEJAR VENTANA
// ============================================

async function paso5_clickLogoPSE(
  page: Page,
  browser: Browser,
  browserMgr: BrowserManager
): Promise<Page | null> {
  log('PASO 5', 'Click en logo PSE y esperando POPUP...');

  try {
    // Análisis de la página actual
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasForm: !!document.querySelector('form'),
        forms: Array.from(document.querySelectorAll('form')).map(f => ({
          action: f.action,
          method: f.method,
          target: f.target
        })),
        hasPseImages: Array.from(document.querySelectorAll('img')).filter(i =>
          (i as HTMLImageElement).src?.toLowerCase().includes('pse')
        ).length,
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"]')).map(b =>
          (b as HTMLElement).innerText?.slice(0, 50) || (b as HTMLInputElement).value
        ),
        bodyText: document.body.innerText.slice(0, 500)
      };
    });

    log('PASO 5', 'Info de página:', pageInfo);
    await browserMgr.takeScreenshot(page, 'dry-run-10-before-pse-click');

    // Verificar si ya estamos en PSE
    if (page.url().includes('pse.com.co')) {
      log('PASO 5', '✅ Ya estamos en PSE', { url: page.url() });
      return page;
    }

    // Scroll para ver el botón/logo
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1000);

    // ============================================
    // MÉTODO MEJORADO: Usar targetcreated para capturar popup
    // ============================================
    log('PASO 5', 'Configurando listener para popup...');

    let newPopup: Page | null = null;

    // Guardar páginas actuales antes del click
    const pagesBefore = await browser.pages();
    const pagesBeforeCount = pagesBefore.length;
    log('PASO 5', `Páginas antes del click: ${pagesBeforeCount}`);

    // Promise que resuelve cuando se detecta una nueva página
    const popupPromise = new Promise<Page | null>((resolve) => {
      const timeout = setTimeout(async () => {
        log('PASO 5', 'Timeout esperando popup (20s) - buscando en browser.pages()...');
        // Fallback: buscar nueva página en browser.pages()
        const pagesAfter = await browser.pages();
        if (pagesAfter.length > pagesBeforeCount) {
          const newPage = pagesAfter[pagesAfter.length - 1];
          log('PASO 5', 'Popup encontrado via browser.pages() después de timeout');
          resolve(newPage);
        } else {
          resolve(null);
        }
      }, 20000);

      const handler = async (target: any) => {
        if (target.type() === 'page') {
          const targetUrl = target.url();
          log('PASO 5', 'Nuevo target detectado:', targetUrl);
          clearTimeout(timeout);
          browser.off('targetcreated', handler);

          // Esperar más tiempo para que el frame se inicialice completamente
          // Error: "Requesting main frame too early!" ocurre si accedemos muy pronto
          log('PASO 5', 'Esperando 5 segundos para que el popup se inicialice...');
          await new Promise(r => setTimeout(r, 5000));

          // MÉTODO ALTERNATIVO: Usar browser.pages() en lugar de target.page()
          // Esto es más confiable y evita el error "Requesting main frame too early!"
          try {
            const allPages = await browser.pages();
            log('PASO 5', `Total páginas después del click: ${allPages.length}`);

            // Buscar la página que coincide con PSE (registro.pse.com.co)
            // IMPORTANTE: Buscar PRIMERO registro.pse.com.co - esa es la página REAL de PSE
            let popupPage: Page | null = null;

            // 1. PRIORITARIO: Buscar registro.pse.com.co (formulario PSE real)
            for (const p of allPages) {
              const pUrl = p.url();
              if (pUrl.includes('registro.pse.com.co') || pUrl.includes('pse.com.co/PSE')) {
                popupPage = p;
                log('PASO 5', 'Popup PSE REAL encontrado (registro.pse.com.co):', pUrl);
                break;
              }
            }

            // 2. Si no encontramos PSE real, buscar página intermedia (puede que necesite más tiempo)
            if (!popupPage) {
              for (const p of allPages) {
                const pUrl = p.url();
                // Página intermedia de Mi Planilla (99000Responsive)
                if ((pUrl.includes('99000') || pUrl.includes('Responsive')) && !pUrl.includes('go.aspx')) {
                  // Esta es página intermedia - esperar a que redirija
                  log('PASO 5', 'Página intermedia encontrada, esperando redirección a PSE:', pUrl);
                  popupPage = p;
                  break;
                }
              }
            }

            // Segundo intento: buscar por URL exacta del target
            if (!popupPage) {
              for (const p of allPages) {
                const pUrl = p.url();
                if (pUrl === targetUrl) {
                  popupPage = p;
                  log('PASO 5', 'Popup encontrado por URL exacta:', pUrl);
                  break;
                }
              }
            }

            // Si no encontramos por URL, tomar la última página (la más nueva)
            if (!popupPage && allPages.length > pagesBeforeCount) {
              popupPage = allPages[allPages.length - 1];
              log('PASO 5', 'Usando última página como popup:', popupPage.url());
            }

            if (popupPage) {
              // Esperar a que la página cargue contenido
              await popupPage.waitForSelector('body', { timeout: 10000 }).catch(() => {});
              log('PASO 5', 'Popup page obtenida exitosamente via browser.pages()');
              resolve(popupPage);
            } else {
              log('PASO 5', 'No se encontró popup en browser.pages()');
              resolve(null);
            }
          } catch (pageError) {
            log('PASO 5', 'Error buscando popup en browser.pages():', (pageError as Error).message);
            resolve(null);
          }
        }
      };

      browser.on('targetcreated', handler);
    });

    // Buscar y hacer click en el BOTÓN DE SUBMIT del formulario PSE
    // IMPORTANTE: Usar page.click() de Puppeteer para generar click REAL (isTrusted: true)
    // Los eventos sintéticos con dispatchEvent tienen isTrusted: false y pueden ser detectados
    log('PASO 5', 'Haciendo click REAL con page.click() en el botón PSE...');

    // Primero, identificar el selector del botón PSE
    const buttonInfo = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        // Buscar input type="image" dentro del form
        const imageInput = form.querySelector('input[type="image"]') as HTMLInputElement;
        if (imageInput) {
          return {
            found: true,
            selector: 'form input[type="image"]',
            src: imageInput.src?.slice(0, 100) || '',
            formAction: form.action,
            formTarget: form.target
          };
        }

        // Si no hay input type="image", buscar submit normal
        const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
        if (submitBtn) {
          return {
            found: true,
            selector: 'form input[type="submit"], form button[type="submit"]',
            formAction: form.action,
            formTarget: form.target
          };
        }
      }

      // Buscar cualquier input type="image"
      const imageInputs = document.querySelectorAll('input[type="image"]');
      if (imageInputs.length > 0) {
        return {
          found: true,
          selector: 'input[type="image"]',
          src: (imageInputs[0] as HTMLInputElement).src?.slice(0, 100) || '',
        };
      }

      return { found: false };
    });

    log('PASO 5', 'Información del botón PSE:', buttonInfo);

    let clickResult: { clicked: boolean; method: string; error?: string } = { clicked: false, method: 'none' };

    if (buttonInfo.found && buttonInfo.selector) {
      try {
        // Usar page.click() que genera un click REAL con isTrusted: true
        // Esto es crucial porque los sitios pueden detectar eventos sintéticos
        await page.click(buttonInfo.selector);
        clickResult = { clicked: true, method: 'page.click()-real' };
        log('PASO 5', '✅ Click REAL ejecutado con page.click()');
      } catch (clickError) {
        log('PASO 5', '⚠️ Error con page.click(), intentando alternativa:', (clickError as Error).message);

        // Fallback: intentar con page.$eval y click nativo
        try {
          await page.$eval(buttonInfo.selector, (el: Element) => {
            (el as HTMLElement).click();
          });
          clickResult = { clicked: true, method: 'element.click()-fallback' };
        } catch (fallbackError) {
          clickResult = { clicked: false, method: 'failed', error: (fallbackError as Error).message };
        }
      }
    } else {
      log('PASO 5', '❌ No se encontró el botón PSE para hacer click');
    }

    log('PASO 5', 'Resultado click:', clickResult);

    // Esperar el popup
    log('PASO 5', 'Esperando popup...');
    newPopup = await popupPromise;

    // Si capturamos el popup, esperar a que cargue
    if (newPopup) {
      log('PASO 5', '✅ Popup capturado via targetcreated!');

      // Esperar a que el popup cargue completamente
      try {
        await newPopup.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      } catch {
        // Puede que ya haya cargado
      }

      await sleep(2000);
      const popupUrl = newPopup.url();
      log('PASO 5', 'URL del popup:', popupUrl);

      await newPopup.bringToFront();
      await browserMgr.takeScreenshot(newPopup, 'dry-run-11-pse-popup');

      // Verificar que es PSE
      if (popupUrl.includes('pse.com.co') || popupUrl.includes('registro.pse')) {
        log('PASO 5', '✅ Popup PSE encontrado', { url: popupUrl });
        return newPopup;
      }

      // Aunque no sea exactamente pse.com.co, puede ser una página intermedia
      log('PASO 5', '✅ Popup encontrado (verificar si es PSE)', { url: popupUrl });
      return newPopup;
    }

    await sleep(3000);

    // Buscar ventana PSE - fallback si targetcreated no funcionó
    let pseWindow: Page | null = null;

    // Primero verificar si la página actual navegó a PSE
    try {
      const currentUrl = page.url();
      log('PASO 5', `URL actual después de click: ${currentUrl}`);

      if (currentUrl.includes('registro.pse.com.co') || currentUrl.includes('pse.com.co')) {
        log('PASO 5', '✅ Ya estamos en PSE (misma ventana)', { url: currentUrl });
        await browserMgr.takeScreenshot(page, 'dry-run-11-pse-same-window');
        return page;
      }
    } catch (urlError) {
      log('PASO 5', 'Error obteniendo URL actual (página navegando):', (urlError as Error).message);
      await sleep(3000);
    }

    // Buscar entre todas las páginas del browser
    const allPages = await browser.pages();
    log('PASO 5', `Páginas totales: ${allPages.length}`);

    for (const p of allPages) {
      try {
        const url = p.url();
        log('PASO 5', `Verificando página: ${url}`);
        if (url.includes('registro.pse.com.co') || url.includes('pse.com.co')) {
          pseWindow = p;
          break;
        }
      } catch (pageError) {
        log('PASO 5', 'Página no disponible (navegando)');
      }
    }

    // Si no encontramos PSE, esperar más y reintentar
    if (!pseWindow) {
      log('PASO 5', 'Esperando ventana PSE (10 intentos de 2s)...');

      for (let i = 0; i < 10; i++) {
        await sleep(2000);

        // Verificar página actual
        try {
          const currentUrl = page.url();
          if (currentUrl.includes('registro.pse.com.co') || currentUrl.includes('pse.com.co')) {
            log('PASO 5', '✅ PSE detectado en ventana actual', { url: currentUrl });
            await browserMgr.takeScreenshot(page, 'dry-run-11-pse-same-window');
            return page;
          }
        } catch {
          // Ignorar
        }

        // Buscar en otras páginas
        try {
          const pages = await browser.pages();
          for (const p of pages) {
            try {
              const url = p.url();
              if (url.includes('registro.pse.com.co') || url.includes('pse.com.co')) {
                pseWindow = p;
                log('PASO 5', `Intento ${i + 1}: PSE encontrado en otra página`);
                break;
              }
            } catch {
              // Ignorar
            }
          }
        } catch {
          // Ignorar
        }

        if (pseWindow) break;
      }
    }

    if (pseWindow) {
      await pseWindow.bringToFront();
      await sleep(2000);
      await browserMgr.takeScreenshot(pseWindow, 'dry-run-11-pse-window');
      log('PASO 5', '✅ Ventana PSE encontrada', { url: pseWindow.url() });
      return pseWindow;
    }

    // Último intento: verificar si la página navegó
    try {
      await sleep(3000);
      const finalUrl = page.url();
      log('PASO 5', `URL final: ${finalUrl}`);
      if (finalUrl.includes('pse.com.co')) {
        await browserMgr.takeScreenshot(page, 'dry-run-11-pse-final');
        return page;
      }
    } catch {
      // Ignorar
    }

    // Screenshot del estado final para debug
    await browserMgr.takeScreenshot(page, 'dry-run-10b-no-pse-found').catch(() => {});

    log('PASO 5', '❌ No se encontró ventana PSE - verificar si el popup fue bloqueado');
    return null;
  } catch (error) {
    log('PASO 5', '❌ Error', { error: (error as Error).message });
    return null;
  }
}

// ============================================
// PASO 6: LLENAR FORMULARIO PSE
// ============================================

async function paso6_llenarFormularioPSE(
  pseWindow: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 6', 'Llenando formulario PSE (Persona Jurídica)...');

  try {
    // Click tab "Jurídica"
    await pseWindow.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
        if (text === 'jurídica' || text === 'juridica') {
          (el as HTMLElement).click();
          return;
        }
      }
    });
    await sleep(1500);

    await browserMgr.takeScreenshot(pseWindow, 'dry-run-12-pse-juridica-tab');

    // Click "Soy un usuario registrado"
    await pseWindow.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('soy un usuario registrado')) {
          (el as HTMLElement).click();
          return;
        }
      }
    });
    await sleep(1000);

    // Llenar NIT (solo campos visibles)
    const nitFilled = await pseWindow.evaluate((nit) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        if (el.offsetParent === null) continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';

        if (id.includes('nit') || name.includes('nit') || placeholder.includes('nit')) {
          el.value = nit;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, PSE_CONFIG.nit);

    // Llenar Email (solo campos visibles)
    const emailFilled = await pseWindow.evaluate((email) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        if (el.offsetParent === null) continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';

        if (id.includes('email') || id.includes('correo') || id.includes('mail') ||
            name.includes('email') || name.includes('correo') ||
            placeholder.includes('email') || placeholder.includes('correo')) {
          el.value = email;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, PSE_CONFIG.email);

    await sleep(1000);
    await browserMgr.takeScreenshot(pseWindow, 'dry-run-13-pse-form-filled');

    log('PASO 6', nitFilled && emailFilled ? '✅ Formulario PSE llenado' : '⚠️ Llenado parcial',
      { nit: nitFilled, email: emailFilled });

    return nitFilled && emailFilled;
  } catch (error) {
    log('PASO 6', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 7: CLICK "IR AL BANCO"
// ============================================

async function paso7_irAlBanco(
  pseWindow: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 7', 'Click en "Ir al Banco"...');

  try {
    await browserMgr.takeScreenshot(pseWindow, 'dry-run-14-before-ir-al-banco');

    // Click "Ir al Banco"
    await pseWindow.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
      for (const btn of btns) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() ||
                    (btn as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('ir al banco') || text.includes('continuar')) {
          if (!text.includes('regresar') && !text.includes('cancelar')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      }
    });

    await pseWindow.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await sleep(5000);

    const currentUrl = pseWindow.url();
    await browserMgr.takeScreenshot(pseWindow, 'dry-run-15-after-ir-al-banco');

    if (currentUrl.toLowerCase().includes('bancolombia')) {
      log('PASO 7', '✅ Llegamos a Bancolombia', { url: currentUrl });
      return true;
    } else {
      log('PASO 7', '⚠️ No llegamos a Bancolombia', { url: currentUrl });
      return false;
    }
  } catch (error) {
    log('PASO 7', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// PASO 8: BANCOLOMBIA NEGOCIOS + USUARIO
// ============================================

async function paso8_bancolombiaNegocios(
  page: Page,
  browserMgr: BrowserManager
): Promise<boolean> {
  log('PASO 8', 'Ejecutando flujo Bancolombia Negocios...');

  try {
    // Verificar página de selección de tipo
    const isSelectionPage = await detectarPaginaSeleccionTipo(page);
    log('PASO 8', `Página de selección: ${isSelectionPage}`);

    await browserMgr.takeScreenshot(page, 'dry-run-16-bancolombia-page');

    // Usar utilidad compartida
    const result = await ejecutarFlujoBancolombiaNegocios(
      page,
      { usuario: BANCOLOMBIA_CONFIG.usuario },
      'dry-run-test'
    );

    await browserMgr.takeScreenshot(page, 'dry-run-17-bancolombia-user-filled');

    if (result.success && result.usuarioFilled) {
      log('PASO 8', '✅ Usuario Bancolombia llenado', {
        usuario: BANCOLOMBIA_CONFIG.usuario,
        url: result.currentUrl
      });
      return true;
    } else {
      log('PASO 8', '⚠️ Flujo Bancolombia parcial', result);
      return false;
    }
  } catch (error) {
    log('PASO 8', '❌ Error', { error: (error as Error).message });
    return false;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('DRY RUN: Mi Planilla Pago Admin-Controlled Bot - TEST COMPLETO');
  console.log('='.repeat(70) + '\n');

  const sessionId = `dry-run-${uuidv4().slice(0, 8)}`;
  const browserMgr = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/dry-run',
  });

  let browser: Browser | undefined;
  let page: Page | undefined;

  const results: Record<string, boolean | string> = {};

  try {
    // ================================
    // SETUP: Buscar usuario
    // ================================
    log('SETUP', 'Buscando usuario con credenciales Mi Planilla...');

    const user = await prisma.enlaceUser.findFirst({
      where: {
        miplanillaPassword: { not: null },
        miplanillaPasswordIV: { not: null },
      },
    });

    if (!user) {
      console.log('\n❌ No hay usuario con credenciales Mi Planilla');
      console.log('   Ejecuta: npx tsx scripts/setup-miplanilla-user.ts\n');
      return;
    }

    log('SETUP', `Usuario: ${user.nombre} (${user.tipoDocumento}${user.numeroDocumento})`);

    // Desencriptar password
    const password = await decryptPassword(user.miplanillaPassword!, user.miplanillaPasswordIV!);
    const usuario = `CC${user.numeroDocumento}`;

    // ================================
    // LANZAR BROWSER
    // ================================
    log('BROWSER', 'Lanzando navegador...');
    await browserMgr.launch();
    page = await browserMgr.newPage();
    browser = page.browser();

    if (!browser) {
      throw new Error('No se pudo obtener referencia al browser');
    }

    log('BROWSER', '✅ Navegador lanzado');

    // ================================
    // EJECUTAR PASOS
    // ================================

    // PASO 1: Login
    results['paso1_login'] = await paso1_autenticar(page, browserMgr, { usuario, password });

    if (!results['paso1_login']) {
      throw new Error('Login fallido - no se puede continuar');
    }

    // PASO 2: Navegar y click pagar
    results['paso2_navegarYPagar'] = await paso2_navegarYClickPagar(page, browserMgr);

    if (!results['paso2_navegarYPagar']) {
      // No hay planilla pendiente - GENERAR UNA NUEVA
      log('PASO 2B', 'No hay planilla pendiente - generando nueva...');
      results['paso2b_generarPlanilla'] = await paso2b_generarPlanilla(page, browserMgr);

      if (!results['paso2b_generarPlanilla']) {
        log('SKIP', 'No se pudo generar planilla - deteniendo');
        results['paso3_pse'] = 'SKIPPED - No planilla';
        results['paso4_tipoYBanco'] = 'SKIPPED - No planilla';
        results['paso5_ventanaPSE'] = 'SKIPPED - No planilla';
        results['paso6_formularioPSE'] = 'SKIPPED - No planilla';
        results['paso7_irAlBanco'] = 'SKIPPED - No planilla';
        results['paso8_bancolombia'] = 'SKIPPED - No planilla';
      } else {
        // Planilla generada - ahora hay que buscar "Paga aquí" en la nueva página
        log('PASO 2C', 'Planilla generada - buscando opción de pago...');

        // Esperar más para que la planilla se procese
        await sleep(3000);

        // Verificar URL actual - puede que ya estemos en ResumenPlanilla
        const currentUrl = page.url();
        log('PASO 2C', `URL después de generar: ${currentUrl}`);
        await browserMgr.takeScreenshot(page, 'dry-run-04e-despues-generar');

        // Si estamos en ResumenPlanilla, buscar opción de pago directamente
        let pagarClicked = false;

        if (currentUrl.includes('ResumenPlanilla') || currentUrl.includes('Resumen')) {
          log('PASO 2C', 'Estamos en ResumenPlanilla - buscando opción de pago...');

          // Buscar "Seleccionar medio de pago", "Pagar", etc
          pagarClicked = await page.evaluate(() => {
            const options = ['seleccionar medio', 'pagar', 'paga aquí', 'realizar pago'];
            const allElements = document.querySelectorAll('button, a, div[role="button"]');
            for (const el of allElements) {
              const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
              for (const opt of options) {
                if (text.includes(opt)) {
                  (el as HTMLElement).click();
                  return true;
                }
              }
            }
            return false;
          });

          if (pagarClicked) {
            await sleep(2000);
            await browserMgr.takeScreenshot(page, 'dry-run-05-after-pagar-click');
            log('PASO 2C', '✅ Click en opción de pago exitoso desde Resumen');
            results['paso2_navegarYPagar'] = true;
          }
        }

        // Si no encontramos pago en Resumen, navegar a Administrar Planillas
        if (!pagarClicked) {
          log('PASO 2C', 'Navegando a Administrar Planillas para buscar pago...');

          // POLLING: Esperar a que la planilla termine de generarse
          const MAX_POLLING_ATTEMPTS = 20; // máximo 20 intentos (aprox 2 minutos)
          let pollingAttempt = 0;
          let planillaReady = false;

          while (pollingAttempt < MAX_POLLING_ATTEMPTS && !planillaReady) {
            pollingAttempt++;
            log('PASO 2C', `Polling intento ${pollingAttempt}/${MAX_POLLING_ATTEMPTS}...`);

            await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
              waitUntil: 'networkidle0',
              timeout: 60000,
            });
            await sleep(3000);

            // Verificar estado de planillas y buscar botones clickables
            const status = await page.evaluate(() => {
              const text = document.body.innerText.toLowerCase();
              const enProceso = text.includes('en proceso de generación') || text.includes('en proceso de generacion');

              // Buscar botones clickables
              const buttons = document.querySelectorAll('a.btn, a[class*="btn"], button');
              let pagaAquiButton = false;
              let pendienteConfirmacionButton = false;

              for (const btn of Array.from(buttons)) {
                const btnText = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
                if (btnText === 'paga aquí' || btnText === 'paga aqui') {
                  pagaAquiButton = true;
                }
                if (btnText.includes('pendiente') && btnText.includes('confirmación') ||
                    btnText.includes('pendiente') && btnText.includes('confirmacion')) {
                  pendienteConfirmacionButton = true;
                }
              }

              return { enProceso, pagaAqui: pagaAquiButton, pendienteConfirmacion: pendienteConfirmacionButton };
            });

            log('PASO 2C', `Estado planilla: ${JSON.stringify(status)}`);

            // Si hay "Paga aquí", listo para pagar
            if (status.pagaAqui) {
              log('PASO 2C', '✅ Planilla lista para pagar - hay botón "Paga aquí" clickable!');
              planillaReady = true;
            }
            // Si hay "Pendiente de confirmación", hacer click para confirmar primero
            else if (status.pendienteConfirmacion) {
              log('PASO 2C', '🔄 Planilla en "Pendiente de confirmación" - clickeando para confirmar...');

              await browserMgr.takeScreenshot(page, 'dry-run-04g-antes-confirmar');

              // Click en el botón "Pendiente de confirmación" usando dispatchEvent
              const clicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('a.btn, a[class*="btn"], button');
                for (const btn of Array.from(buttons)) {
                  const btnText = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
                  if (btnText.includes('pendiente') && (btnText.includes('confirmación') || btnText.includes('confirmacion'))) {
                    (btn as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const clickEvent = new MouseEvent('click', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                    });
                    btn.dispatchEvent(clickEvent);
                    return true;
                  }
                }
                return false;
              });

              if (clicked) {
                log('PASO 2C', '✅ Click en "Pendiente de confirmación" realizado');
                await sleep(3000);
                await browserMgr.takeScreenshot(page, 'dry-run-04h-despues-confirmar');

                // Verificar si ahora hay "Paga aquí" o si navegó a otra página
                const urlAfterConfirm = page.url();
                log('PASO 2C', `URL después de confirmar: ${urlAfterConfirm}`);

                // Si estamos en ResumenPlanilla, la confirmación funcionó
                if (urlAfterConfirm.includes('Resumen') || urlAfterConfirm.includes('resumen')) {
                  log('PASO 2C', '✅ Navegó a página de resumen - planilla confirmada');
                  planillaReady = true;
                } else {
                  // Recargar administrar planillas para ver si ahora tiene "Paga aquí"
                  log('PASO 2C', 'Recargando Administrar Planillas para verificar estado...');
                }
              } else {
                log('PASO 2C', '⚠️ No se pudo hacer click en "Pendiente de confirmación"');
                await sleep(6000);
              }
            }
            else if (status.enProceso) {
              log('PASO 2C', '⏳ Planilla en proceso de generación, esperando 6s...');
              await sleep(6000);
            } else {
              log('PASO 2C', '⚠️ Estado desconocido - esperando 6s más...');
              await sleep(6000);
            }
          }

          if (!planillaReady) {
            log('PASO 2C', '❌ Timeout esperando generación de planilla');
          }

          await browserMgr.takeScreenshot(page, 'dry-run-04f-administrar-planillas');

          // Buscar el botón "Paga aquí" - SOLO este permite pago directo
          log('PASO 2C', 'Buscando botón "Paga aquí" en la tabla de planillas...');

          // Primero, encontrar y hacer scroll al botón - INCLUYENDO EL HREF
          const buttonInfo = await page.evaluate(() => {
            // SOLO buscar "Paga aquí" - NO "Pendiente de confirmación"
            const targetTexts = ['paga aquí', 'paga aqui'];

            // Buscar específicamente botones o links
            const buttons = document.querySelectorAll('button, a.btn, a[class*="btn"], a');
            for (const btn of Array.from(buttons)) {
              const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
              if (targetTexts.some(target => text === target || text.includes(target))) {
                (btn as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Extraer href si es un <a>
                const href = btn.tagName === 'A' ? (btn as HTMLAnchorElement).href : null;
                return {
                  found: true,
                  text: (btn as HTMLElement).innerText?.trim(),
                  tagName: btn.tagName,
                  className: btn.className,
                  matchedText: targetTexts.find(t => text.includes(t)),
                  href: href,
                };
              }
            }
            return { found: false, href: null };
          });

          log('PASO 2C', 'Botón encontrado:', buttonInfo);

          if (buttonInfo.found) {
            await sleep(1000);

            // Capturar URL actual antes del click
            const urlBefore = page.url();

            try {
              // ESTRATEGIA: Si hay href válido, navegar directamente
              if (buttonInfo.href && buttonInfo.href.startsWith('http')) {
                log('PASO 2C', `✅ Href encontrado: ${buttonInfo.href}`);
                log('PASO 2C', 'Navegando directamente con page.goto()...');
                await page.goto(buttonInfo.href, { waitUntil: 'networkidle0', timeout: 30000 });
              } else {
                // Fallback: Click con evaluate que dispara el evento manualmente
                log('PASO 2C', 'No hay href válido, usando click con dispatchEvent...');
                await page.evaluate(() => {
                  const targetTexts = ['paga aquí', 'paga aqui'];
                  const buttons = document.querySelectorAll('button, a.btn, a[class*="btn"], a');
                  for (const btn of Array.from(buttons)) {
                    const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
                    if (targetTexts.some(target => text === target || text.includes(target))) {
                      // Disparar evento de click nativo
                      const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                      });
                      btn.dispatchEvent(clickEvent);
                      return;
                    }
                  }
                });
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
              }

              await sleep(3000);
              const urlAfter = page.url();

              await browserMgr.takeScreenshot(page, 'dry-run-05-after-pagar-click');

              if (urlAfter !== urlBefore) {
                log('PASO 2C', '✅ Navegación exitosa', { from: urlBefore, to: urlAfter });
                pagarClicked = true;
                results['paso2_navegarYPagar'] = true;
              } else {
                log('PASO 2C', '⚠️ URL no cambió, verificando contenido de página...');

                  // Verificar si apareció un modal o cambió el contenido
                  const pageChanged = await page.evaluate(() => {
                    // Buscar elementos de selección de medio de pago
                    const text = document.body.innerText.toLowerCase();
                    return text.includes('seleccionar medio') ||
                           text.includes('medio de pago') ||
                           text.includes('pse') ||
                           text.includes('tarjeta');
                  });

                  if (pageChanged) {
                    log('PASO 2C', '✅ Contenido cambió a selección de medio de pago');
                    pagarClicked = true;
                    results['paso2_navegarYPagar'] = true;
                  } else {
                    log('PASO 2C', '❌ Click no navegó ni cambió contenido');
                  }
                }
            } catch (err) {
              log('PASO 2C', '❌ Error al hacer click:', (err as Error).message);
            }
          } else {
            log('PASO 2C', '❌ No se encontró botón "Paga aquí" - la planilla puede estar en estado "Pendiente de confirmación" que requiere confirmación primero');
          }
        }

        if (!pagarClicked) {
          // Última opción: verificar si hay planilla recién generada
          const pageContent = await page.evaluate(() => document.body.innerText);
          log('PASO 2C', '⚠️ No se encontró opción de pago después de generar');
          log('PASO 2C', `Contenido de página: ${pageContent.substring(0, 500)}...`);
          results['paso3_pse'] = 'SKIPPED - No botón pagar';
          results['paso4_tipoYBanco'] = 'SKIPPED - No botón pagar';
          results['paso5_ventanaPSE'] = 'SKIPPED - No botón pagar';
          results['paso6_formularioPSE'] = 'SKIPPED - No botón pagar';
          results['paso7_irAlBanco'] = 'SKIPPED - No botón pagar';
          results['paso8_bancolombia'] = 'SKIPPED - No botón pagar';
        }
      }
    }

    // Continuar con el flujo de pago si tenemos planilla
    if (results['paso2_navegarYPagar'] === true) {
      // PASO 3: Seleccionar PSE
      results['paso3_pse'] = await paso3_seleccionarPSE(page, browserMgr);

      // PASO 4: Seleccionar tipo y banco
      results['paso4_tipoYBanco'] = await paso4_seleccionarTipoYBanco(page, browserMgr);

      // PASO 5: Click logo PSE
      const pseWindow = await paso5_clickLogoPSE(page, browser, browserMgr);
      results['paso5_ventanaPSE'] = pseWindow !== null;

      if (pseWindow) {
        // PASO 6: Llenar formulario PSE
        results['paso6_formularioPSE'] = await paso6_llenarFormularioPSE(pseWindow, browserMgr);

        // PASO 7: Ir al banco
        results['paso7_irAlBanco'] = await paso7_irAlBanco(pseWindow, browserMgr);

        if (results['paso7_irAlBanco']) {
          // PASO 8: Bancolombia Negocios
          results['paso8_bancolombia'] = await paso8_bancolombiaNegocios(pseWindow, browserMgr);
        } else {
          results['paso8_bancolombia'] = 'SKIPPED - No llegó a Bancolombia';
        }
      } else {
        results['paso6_formularioPSE'] = 'SKIPPED - No ventana PSE';
        results['paso7_irAlBanco'] = 'SKIPPED - No ventana PSE';
        results['paso8_bancolombia'] = 'SKIPPED - No ventana PSE';
      }
    }

    // ================================
    // RESUMEN
    // ================================
    console.log('\n' + '='.repeat(70));
    console.log('RESUMEN DEL DRY RUN');
    console.log('='.repeat(70) + '\n');

    const pasos = [
      { key: 'paso1_login', name: 'Login Mi Planilla' },
      { key: 'paso2_navegarYPagar', name: 'Navegar + Click Pagar' },
      { key: 'paso2b_generarPlanilla', name: 'Generar Planilla (si necesario)' },
      { key: 'paso3_pse', name: 'Seleccionar PSE' },
      { key: 'paso4_tipoYBanco', name: 'Persona Jurídica + Bancolombia' },
      { key: 'paso5_ventanaPSE', name: 'Ventana PSE' },
      { key: 'paso6_formularioPSE', name: 'Formulario PSE (NIT + Email)' },
      { key: 'paso7_irAlBanco', name: 'Ir al Banco' },
      { key: 'paso8_bancolombia', name: 'Bancolombia Negocios + Usuario' },
    ];

    for (const paso of pasos) {
      const result = results[paso.key];
      let status = '';
      if (result === true) status = '✅';
      else if (result === false) status = '❌';
      else if (typeof result === 'string' && result.includes('SKIPPED')) status = '⏭️';
      else status = '❓';

      console.log(`${status} ${paso.name}: ${result}`);
    }

    console.log('\n📸 Screenshots guardados en: screenshots/dry-run-*.png');

    // Configuración usada
    console.log('\n📋 Configuración:');
    console.log(`   PSE NIT: ${PSE_CONFIG.nit}`);
    console.log(`   PSE Email: ${PSE_CONFIG.email}`);
    console.log(`   Bancolombia Usuario: ${BANCOLOMBIA_CONFIG.usuario}`);

    console.log('\n' + '='.repeat(70));
    console.log('El navegador permanece abierto para inspección manual');
    console.log('Presiona Ctrl+C para cerrar');
    console.log('='.repeat(70) + '\n');

    // Mantener abierto para inspección
    await new Promise(() => {}); // Never resolves

  } catch (error) {
    console.error('\n❌ Error en dry run:', (error as Error).message);

    if (page && !page.isClosed()) {
      await browserMgr.takeScreenshot(page, 'dry-run-error');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
