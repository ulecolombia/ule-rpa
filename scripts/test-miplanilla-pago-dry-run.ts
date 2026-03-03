/**
 * Mi Planilla PAGO - DRY RUN TEST
 *
 * Este script prueba el flujo de pago PSE sin hacer el pago real.
 * Se detiene ANTES de hacer click en "Continuar con el pago".
 *
 * Flujo:
 * 1. Login
 * 2. Navegar a "Planillas disponibles para pago"
 * 3. Identificar planilla pendiente
 * 4. Click "Paga aquí"
 * 5. Analizar resumen de pago
 * 6. Seleccionar PSE como medio de pago
 * 7. Identificar formulario de banco
 * 8. STOP - No continuar al banco
 */

import { config } from '../src/utils/config';
import { BrowserManager } from '../src/bots/utils/browser';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';

// Credenciales de prueba
const TEST_CREDENTIALS = {
  usuario: 'CC1047484978',
  password: process.env.MIPLANILLA_TEST_PASSWORD || 'TestPassword123!',
};

async function main() {
  console.log(`
═══════════════════════════════════════════════════════════════
   MI PLANILLA PAGO PSE - DRY RUN TEST
═══════════════════════════════════════════════════════════════

Este script probará el flujo de pago PSE.
Se detendrá ANTES de redirigir al banco.

Usuario: ${TEST_CREDENTIALS.usuario}

`);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/miplanilla-pago-test',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // ═══════════════════════════════════════════════════════════════
    // FASE 1: LOGIN
    // ═══════════════════════════════════════════════════════════════
    console.log('[FASE 1] Realizando login...');

    await page.goto(MIPLANILLA_URLS.portalIndependientes, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    // Cerrar popup si existe
    try {
      const popup = await page.$('.modal .close, button[aria-label="Close"]');
      if (popup) {
        await popup.click();
        await page.waitForTimeout(500);
      }
    } catch {}

    // Login
    await page.type('#usuario', TEST_CREDENTIALS.usuario, { delay: 50 });
    await page.type('#clave', TEST_CREDENTIALS.password, { delay: 50 });

    const loginBtn = await page.$('button.btn.btn-primary.button-cta');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.toLowerCase().includes('entrar')) {
            btn.click();
            break;
          }
        }
      });
    }

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await browserManager.takeScreenshot(page, 'pago-01-dashboard');
    console.log('  ✓ Login exitoso');

    // ═══════════════════════════════════════════════════════════════
    // FASE 2: NAVEGAR A PLANILLAS DISPONIBLES PARA PAGO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 2] Navegando a "Planillas disponibles para pago"...');

    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'pago-02-administrar-planillas');
    console.log('  ✓ En página de administrar planillas');

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: ANALIZAR PLANILLAS DISPONIBLES
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 3] Analizando planillas disponibles...');

    const planillasInfo = await page.evaluate(() => {
      const results: any[] = [];

      // Buscar todas las filas/cards de planillas
      const rows = document.querySelectorAll('tr, [class*="planilla"], [class*="card"]');

      for (const row of rows) {
        const text = row.textContent || '';

        // Buscar número de planilla
        const numMatch = text.match(/(\d{6,10})/);
        if (!numMatch) continue;

        // Buscar valor
        const valorMatch = text.match(/\$\s*([\d.,]+)/);

        // Buscar estado
        const estado = text.toLowerCase().includes('pagad') ? 'PAGADA' :
                       text.toLowerCase().includes('pendi') ? 'PENDIENTE' :
                       text.toLowerCase().includes('liquid') ? 'LIQUIDADA' : 'DESCONOCIDO';

        // Buscar botón de pagar
        const payBtn = row.querySelector('button, a');
        const hasPayButton = payBtn &&
          ((payBtn as HTMLElement).innerText?.toLowerCase().includes('pag') ||
           (payBtn as HTMLAnchorElement).href?.includes('pag'));

        results.push({
          numero: numMatch[1],
          valor: valorMatch ? valorMatch[1] : 'N/A',
          estado,
          hasPayButton,
          rowText: text.substring(0, 200),
        });
      }

      return results;
    });

    console.log(`  → Planillas encontradas: ${planillasInfo.length}`);
    if (planillasInfo.length > 0) {
      console.log('  [DEBUG] Planillas:', JSON.stringify(planillasInfo.slice(0, 3), null, 2));
    }

    // Buscar botones de pago
    const botonesInfo = await page.evaluate(() => {
      const buttons: any[] = [];
      const elements = document.querySelectorAll('button, a');

      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        const href = (el as HTMLAnchorElement).href || '';

        if (text.includes('pag') || href.includes('pag')) {
          buttons.push({
            tag: el.tagName,
            text: (el as HTMLElement).innerText?.substring(0, 50),
            href: href.substring(0, 100),
            className: el.className.substring(0, 50),
          });
        }
      }

      return buttons;
    });

    console.log('  [DEBUG] Botones de pago encontrados:', JSON.stringify(botonesInfo, null, 2));

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: BUSCAR SECCIÓN "PLANILLAS DISPONIBLES PARA PAGO"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 4] Buscando sección de planillas para pago...');

    // Buscar link en el menú lateral
    const menuLinks = await page.evaluate(() => {
      const links: any[] = [];
      const anchors = document.querySelectorAll('a');

      for (const a of anchors) {
        const text = a.innerText?.toLowerCase() || '';
        if (text.includes('disponible') || text.includes('pago') || text.includes('pagar')) {
          links.push({
            text: a.innerText,
            href: a.href,
          });
        }
      }

      return links;
    });

    console.log('  [DEBUG] Links relacionados con pago:', JSON.stringify(menuLinks, null, 2));

    // Click en "Planillas disponibles para pago" si existe
    const clickedMenu = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.innerText?.toLowerCase() || '';
        if (text.includes('disponibles para pago')) {
          link.click();
          return true;
        }
      }
      return false;
    });

    if (clickedMenu) {
      await page.waitForTimeout(3000);
      await browserManager.takeScreenshot(page, 'pago-03-planillas-disponibles');
      console.log('  ✓ Click en "Planillas disponibles para pago"');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 5: CLICK EN "PAGA AQUÍ"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 5] Buscando botón "Paga aquí"...');

    await browserManager.takeScreenshot(page, 'pago-04-before-pagar');

    // Analizar la página actual
    const pageAnalysis = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const tables = document.querySelectorAll('table');
      const cards = document.querySelectorAll('[class*="card"], [class*="planilla"]');

      return {
        hasTable: tables.length > 0,
        tableCount: tables.length,
        cardCount: cards.length,
        bodyPreview: bodyText.substring(0, 500),
        url: window.location.href,
      };
    });

    console.log('  [DEBUG] Análisis de página:');
    console.log(`    - URL: ${pageAnalysis.url}`);
    console.log(`    - Tablas: ${pageAnalysis.tableCount}`);
    console.log(`    - Cards: ${pageAnalysis.cardCount}`);

    // Intentar click en "Paga aquí"
    const clickedPagar = await page.evaluate(() => {
      // Buscar botón/link "Paga aquí"
      const elements = document.querySelectorAll('button, a');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('paga aquí') || text.includes('pagar') || text === 'paga') {
          (el as HTMLElement).click();
          return { clicked: true, text: (el as HTMLElement).innerText };
        }
      }

      // Buscar en tabla la primera fila con botón de pago
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const btn = row.querySelector('button, a');
        if (btn) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('pag')) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn as HTMLElement).innerText };
          }
        }
      }

      return { clicked: false };
    });

    if (clickedPagar.clicked) {
      console.log(`  ✓ Click en "${clickedPagar.text}"`);
      await page.waitForTimeout(3000);
      await browserManager.takeScreenshot(page, 'pago-05-resumen-planilla');
    } else {
      console.log('  ⚠ No se encontró botón "Paga aquí"');
      console.log('  → Puede que no haya planillas pendientes de pago');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 6: ANALIZAR RESUMEN DE PLANILLA (si llegamos)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 6] Analizando página actual...');

    const currentUrl = page.url();
    console.log(`  → URL actual: ${currentUrl}`);

    const resumenInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      return {
        isResumenPage: bodyText.includes('resumen') || bodyText.includes('detalle'),
        hasSelectMedio: bodyText.includes('medio de pago') || bodyText.includes('seleccionar'),
        hasPSEOption: bodyText.includes('pse'),
        hasValorTotal: bodyText.includes('total'),
        pageTitle: document.title,
      };
    });

    console.log('  [DEBUG] Resumen:', JSON.stringify(resumenInfo, null, 2));

    // ═══════════════════════════════════════════════════════════════
    // FASE 7: BUSCAR SELECCIÓN DE MEDIO DE PAGO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 7] Buscando opciones de medio de pago...');

    // Click en "Seleccionar medio de pago" si existe
    const clickedMedio = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input');
      for (const el of elements) {
        const text = (el as HTMLElement).innerText?.toLowerCase() ||
                     (el as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('seleccionar medio') || text.includes('medio de pago')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedMedio) {
      console.log('  ✓ Click en "Seleccionar medio de pago"');
      await page.waitForTimeout(2000);
      await browserManager.takeScreenshot(page, 'pago-06-medio-pago');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 8: BUSCAR FORMULARIO PSE
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 8] Buscando formulario PSE...');

    const pseFormInfo = await page.evaluate(() => {
      // Buscar radio PSE
      const radios = document.querySelectorAll('input[type="radio"]');
      let pseRadio = null;
      for (const radio of radios) {
        const label = document.querySelector(`label[for="${radio.id}"]`);
        const text = label?.textContent?.toLowerCase() || radio.getAttribute('value')?.toLowerCase() || '';
        if (text.includes('pse')) {
          pseRadio = {
            id: radio.id,
            name: (radio as HTMLInputElement).name,
            value: (radio as HTMLInputElement).value,
            labelText: label?.textContent,
          };
        }
      }

      // Buscar select de banco
      const selects = document.querySelectorAll('select');
      const selectBanco = Array.from(selects).find(s => {
        const name = s.name?.toLowerCase() || s.id?.toLowerCase() || '';
        return name.includes('banco');
      });

      // Buscar select tipo cliente
      const selectTipo = Array.from(selects).find(s => {
        const name = s.name?.toLowerCase() || s.id?.toLowerCase() || '';
        return name.includes('tipo') || name.includes('cliente');
      });

      // Buscar botón continuar
      const continueBtn = document.querySelector('button:has-text("Continuar"), input[value*="Continuar"]');

      return {
        pseRadio,
        selectBanco: selectBanco ? {
          id: selectBanco.id,
          name: selectBanco.name,
          optionsCount: selectBanco.options.length,
          firstOptions: Array.from(selectBanco.options).slice(0, 5).map(o => ({ value: o.value, text: o.text })),
        } : null,
        selectTipo: selectTipo ? {
          id: selectTipo.id,
          name: selectTipo.name,
          optionsCount: selectTipo.options.length,
        } : null,
        hasContinueBtn: !!continueBtn,
        currentUrl: window.location.href,
      };
    });

    console.log('  [DEBUG] Formulario PSE:', JSON.stringify(pseFormInfo, null, 2));
    await browserManager.takeScreenshot(page, 'pago-07-pse-form');

    // ═══════════════════════════════════════════════════════════════
    // FASE 9: SELECCIONAR PSE (si está disponible)
    // ═══════════════════════════════════════════════════════════════
    if (pseFormInfo.pseRadio) {
      console.log('\n[FASE 9] Seleccionando PSE como medio de pago...');

      await page.click(`#${pseFormInfo.pseRadio.id}`);
      await page.waitForTimeout(1000);
      await browserManager.takeScreenshot(page, 'pago-08-pse-selected');
      console.log('  ✓ PSE seleccionado');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 10: ANALIZAR SELECTORES DE BANCO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 10] Analizando opciones de banco...');

    const bancoOptions = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const name = select.name?.toLowerCase() || select.id?.toLowerCase() || '';
        if (name.includes('banco') || select.options.length > 10) {
          return {
            id: select.id,
            name: select.name,
            options: Array.from(select.options).slice(0, 20).map(o => ({
              value: o.value,
              text: o.text,
            })),
          };
        }
      }
      return null;
    });

    if (bancoOptions) {
      console.log('  [DEBUG] Select de banco:', JSON.stringify(bancoOptions, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // FIN - DRY RUN
    // ═══════════════════════════════════════════════════════════════
    console.log(`

═══════════════════════════════════════════════════════════════
   ⚠️  DRY RUN COMPLETADO - NO SE REALIZÓ EL PAGO
═══════════════════════════════════════════════════════════════

El flujo de pago se exploró hasta identificar el formulario PSE.
NO se hizo click en "Continuar con el pago".

Revisa los screenshots en: ./screenshots/

Esperando 30 segundos para inspección visual...
(Puedes cerrar el navegador manualmente o esperar)

`);

    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error en dry-run:', error);
  } finally {
    console.log('✓ Cerrando navegador...');
    await browserManager.close();
  }
}

main().catch(console.error);
