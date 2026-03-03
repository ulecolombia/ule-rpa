/**
 * Mi Planilla PAGO V2 - DRY RUN TEST
 *
 * Este script prueba el flujo de pago PSE sin hacer el pago real.
 * Navega desde el dashboard para mantener la sesión activa.
 *
 * Flujo:
 * 1. Login
 * 2. Explorar dashboard y menú lateral
 * 3. Buscar planillas pendientes de pago
 * 4. Si hay planilla → explorar botón de pago
 * 5. Si no hay → generar planilla primero
 * 6. STOP - No continuar al banco
 */

import { config } from '../src/utils/config';
import { BrowserManager } from '../src/bots/utils/browser';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';

// Credenciales de prueba
const TEST_CREDENTIALS = {
  usuario: 'CC1047484978',
  password: 'Ulecolombia123',
};

async function main() {
  console.log(`
═══════════════════════════════════════════════════════════════
   MI PLANILLA PAGO PSE V2 - DRY RUN TEST
═══════════════════════════════════════════════════════════════

Este script probará el flujo de pago PSE.
Navega desde el dashboard para mantener la sesión activa.

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
    await page.waitForTimeout(3000);

    // Cerrar popup si existe
    try {
      const closeButtons = await page.$$('.modal .close, button[aria-label="Close"], .btn-close, button.close');
      for (const btn of closeButtons) {
        try {
          await btn.click();
          await page.waitForTimeout(500);
          console.log('  → Popup cerrado');
        } catch {}
      }
    } catch {}

    await browserManager.takeScreenshot(page, 'pago-v2-01-login-page');

    // Llenar credenciales
    await page.type('#usuario', TEST_CREDENTIALS.usuario, { delay: 50 });
    await page.waitForTimeout(300);
    await page.type('#clave', TEST_CREDENTIALS.password, { delay: 50 });
    await page.waitForTimeout(300);

    await browserManager.takeScreenshot(page, 'pago-v2-02-credentials-filled');

    // Click en botón de login
    const loginBtn = await page.$('button.btn.btn-primary.button-cta');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      // Buscar por texto
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

    // Esperar navegación
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Verificar si estamos logueados
    const currentUrl = page.url();
    console.log(`  → URL actual: ${currentUrl}`);

    await browserManager.takeScreenshot(page, 'pago-v2-03-after-login');

    // Verificar login exitoso
    const isLoggedIn = currentUrl.includes('Principal') ||
                       currentUrl.includes('Privado') ||
                       !currentUrl.includes('Index');

    if (!isLoggedIn) {
      console.log('  ✗ Login falló - Redirigido a:', currentUrl);

      // Verificar si hay mensaje de error
      const errorMsg = await page.evaluate(() => {
        const errorEl = document.querySelector('.alert-danger, .error, [class*="error"]');
        return errorEl?.textContent?.trim() || null;
      });

      if (errorMsg) {
        console.log(`  → Error: ${errorMsg}`);
      }

      throw new Error('Login failed');
    }

    console.log('  ✓ Login exitoso');

    // ═══════════════════════════════════════════════════════════════
    // FASE 2: EXPLORAR DASHBOARD
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 2] Explorando dashboard...');

    // Analizar estructura del dashboard
    const dashboardInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;

      // Buscar elementos del menú
      const menuItems: string[] = [];
      const menuLinks = document.querySelectorAll('nav a, .menu a, .sidebar a, [class*="menu"] a');
      menuLinks.forEach(a => {
        const text = a.textContent?.trim();
        if (text && text.length > 2 && text.length < 100) {
          menuItems.push(text);
        }
      });

      // Buscar secciones principales
      const sections: string[] = [];
      const headings = document.querySelectorAll('h1, h2, h3, h4, .card-header, [class*="titulo"]');
      headings.forEach(h => {
        const text = h.textContent?.trim();
        if (text && text.length > 2 && text.length < 100) {
          sections.push(text);
        }
      });

      // Buscar planillas visibles
      const planillaMatches = bodyText.match(/planilla[s]?\s*(\d{6,})?/gi) || [];

      return {
        menuItems: menuItems.slice(0, 20),
        sections: sections.slice(0, 10),
        planillaMentions: planillaMatches.length,
        hasPlanillasLink: bodyText.toLowerCase().includes('planillas'),
        hasPagoLink: bodyText.toLowerCase().includes('pago'),
        hasGenerarLink: bodyText.toLowerCase().includes('generar'),
      };
    });

    console.log('  [DEBUG] Dashboard info:');
    console.log(`    - Menú items: ${dashboardInfo.menuItems.length}`);
    console.log(`    - Secciones: ${dashboardInfo.sections.join(', ')}`);
    console.log(`    - Menciones de planilla: ${dashboardInfo.planillaMentions}`);

    if (dashboardInfo.menuItems.length > 0) {
      console.log('  [DEBUG] Menú:');
      dashboardInfo.menuItems.forEach(item => console.log(`    → ${item}`));
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: BUSCAR EN MENÚ LATERAL
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 3] Buscando en menú lateral...');

    // Buscar link a "Planillas" o "Planillas disponibles para pago"
    const menuClickResult = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      const targets = [
        'planillas disponibles',
        'disponibles para pago',
        'planillas pendientes',
        'administrar planillas',
        'mis planillas',
        'planillas',
      ];

      for (const target of targets) {
        for (const link of links) {
          const text = link.textContent?.toLowerCase().trim() || '';
          if (text.includes(target)) {
            // Verificar que no sea un link externo
            const href = link.getAttribute('href') || '';
            if (!href.includes('cesant') && !href.includes('voluntar')) {
              return {
                found: true,
                text: link.textContent?.trim(),
                href: href,
              };
            }
          }
        }
      }

      return { found: false };
    });

    if (menuClickResult.found) {
      console.log(`  → Encontrado: "${menuClickResult.text}"`);
      console.log(`  → Href: ${menuClickResult.href}`);

      // Click en el link
      await page.evaluate((targetText) => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent?.trim() === targetText) {
            link.click();
            return;
          }
        }
      }, menuClickResult.text);

      await page.waitForTimeout(3000);
      await browserManager.takeScreenshot(page, 'pago-v2-04-planillas-page');
      console.log('  ✓ Click en menú de planillas');
    } else {
      console.log('  → No se encontró link directo a planillas');
      console.log('  → Explorando "Planillas" en el menú...');

      // Intentar expandir menú de Planillas
      const expandResult = await page.evaluate(() => {
        const items = document.querySelectorAll('li, [class*="menu-item"], [class*="nav-item"]');
        for (const item of items) {
          const text = item.textContent?.toLowerCase() || '';
          if (text.includes('planilla')) {
            const clickable = item.querySelector('a, button, [role="button"]');
            if (clickable) {
              (clickable as HTMLElement).click();
              return { expanded: true, text: item.textContent?.trim().substring(0, 50) };
            }
          }
        }
        return { expanded: false };
      });

      if (expandResult.expanded) {
        console.log(`  → Expandido: ${expandResult.text}`);
        await page.waitForTimeout(1000);
        await browserManager.takeScreenshot(page, 'pago-v2-04b-menu-expanded');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: ANALIZAR PÁGINA DE PLANILLAS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 4] Analizando página actual...');

    const currentPageUrl = page.url();
    console.log(`  → URL: ${currentPageUrl}`);

    const pageContent = await page.evaluate(() => {
      const bodyText = document.body.innerText;

      // Buscar tabla de planillas
      const tables = document.querySelectorAll('table');
      const tableInfo: any[] = [];

      tables.forEach((table, i) => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim());
        const rowCount = table.querySelectorAll('tbody tr').length;
        tableInfo.push({ index: i, headers, rowCount });
      });

      // Buscar cards de planillas
      const cards = document.querySelectorAll('[class*="card"], [class*="planilla"]');

      // Buscar botones de pago
      const payButtons: any[] = [];
      const allButtons = document.querySelectorAll('button, a.btn, [class*="btn"]');
      allButtons.forEach(btn => {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('pag') && !text.includes('cesant') && !text.includes('voluntar')) {
          payButtons.push({
            tag: btn.tagName,
            text: (btn as HTMLElement).innerText?.substring(0, 50),
            className: btn.className.substring(0, 50),
          });
        }
      });

      // Detectar estado
      const hasNoPlanillas = bodyText.toLowerCase().includes('no tiene planillas') ||
                            bodyText.toLowerCase().includes('no hay planillas');

      return {
        tables: tableInfo,
        cardCount: cards.length,
        payButtons,
        hasNoPlanillas,
        pageTitle: document.title,
      };
    });

    console.log('  [DEBUG] Contenido de página:');
    console.log(`    - Tablas: ${pageContent.tables.length}`);
    console.log(`    - Cards: ${pageContent.cardCount}`);
    console.log(`    - Botones de pago: ${pageContent.payButtons.length}`);
    console.log(`    - Sin planillas: ${pageContent.hasNoPlanillas}`);

    if (pageContent.tables.length > 0) {
      console.log('  [DEBUG] Tablas encontradas:');
      pageContent.tables.forEach(t => {
        console.log(`    → Tabla ${t.index}: ${t.rowCount} filas, Headers: ${t.headers.join(', ')}`);
      });
    }

    if (pageContent.payButtons.length > 0) {
      console.log('  [DEBUG] Botones de pago:');
      pageContent.payButtons.forEach(b => {
        console.log(`    → ${b.tag}: "${b.text}"`);
      });
    }

    await browserManager.takeScreenshot(page, 'pago-v2-05-content-analysis');

    // ═══════════════════════════════════════════════════════════════
    // FASE 5: BUSCAR PLANILLAS PENDIENTES DE PAGO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 5] Buscando planillas pendientes de pago...');

    // Buscar en la tabla o cards planillas con estado pendiente
    const planillasInfo = await page.evaluate(() => {
      const results: any[] = [];

      // Buscar en filas de tabla
      const rows = document.querySelectorAll('tr');
      rows.forEach((row, index) => {
        const text = row.textContent || '';
        const cells = row.querySelectorAll('td');

        if (cells.length > 0) {
          // Buscar número de planilla (6+ dígitos)
          const numMatch = text.match(/(\d{6,10})/);

          // Buscar valor
          const valorMatch = text.match(/\$\s*([\d.,]+)/);

          // Buscar estado
          const estado = text.toLowerCase().includes('pagad') ? 'PAGADA' :
                        text.toLowerCase().includes('pendi') ? 'PENDIENTE' :
                        text.toLowerCase().includes('liquid') ? 'LIQUIDADA' : null;

          // Buscar botón de pagar en la fila
          const payBtn = row.querySelector('button, a');
          const hasPagar = payBtn &&
            ((payBtn as HTMLElement).innerText?.toLowerCase().includes('pag') ||
             (payBtn as HTMLAnchorElement).href?.toLowerCase().includes('pag'));

          if (numMatch || estado || hasPagar) {
            results.push({
              rowIndex: index,
              numero: numMatch?.[1],
              valor: valorMatch?.[1],
              estado,
              hasPagar,
              preview: text.substring(0, 150).replace(/\s+/g, ' '),
            });
          }
        }
      });

      return results;
    });

    console.log(`  → Planillas encontradas: ${planillasInfo.length}`);

    if (planillasInfo.length > 0) {
      console.log('  [DEBUG] Detalles:');
      planillasInfo.slice(0, 5).forEach(p => {
        console.log(`    → #${p.numero || '?'}: ${p.estado || 'DESCONOCIDO'} - $${p.valor || '?'} - Pagar: ${p.hasPagar}`);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 6: INTENTAR CLICK EN "PAGA AQUÍ" O SIMILAR
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 6] Buscando botón de pago...');

    const clickPagarResult = await page.evaluate(() => {
      // Prioridad 1: Buscar "Paga aquí" o "Pagar" directo
      const buttons = document.querySelectorAll('button, a');
      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        const href = (btn as HTMLAnchorElement).href?.toLowerCase() || '';

        // Ignorar links a cesantías o pensiones voluntarias
        if (href.includes('cesant') || href.includes('voluntar') ||
            text.includes('cesant') || text.includes('voluntar')) {
          continue;
        }

        if (text.includes('paga aquí') || text === 'pagar' || text.includes('pagar planilla')) {
          (btn as HTMLElement).click();
          return { clicked: true, text: (btn as HTMLElement).innerText };
        }
      }

      // Prioridad 2: Buscar en tabla la primera fila con botón de pago
      const rows = document.querySelectorAll('tbody tr');
      for (const row of rows) {
        const btn = row.querySelector('button, a');
        if (btn) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('pag') && !text.includes('cesant')) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn as HTMLElement).innerText, fromTable: true };
          }
        }
      }

      return { clicked: false };
    });

    if (clickPagarResult.clicked) {
      console.log(`  ✓ Click en "${clickPagarResult.text}"`);
      await page.waitForTimeout(3000);
      await browserManager.takeScreenshot(page, 'pago-v2-06-after-pagar-click');
    } else {
      console.log('  ⚠ No se encontró botón de pago directo');
      console.log('  → Puede que no haya planillas pendientes de pago');
      console.log('  → O el flujo requiere generar planilla primero');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 7: ANALIZAR PÁGINA DE PAGO (si llegamos)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 7] Analizando página actual...');

    const newUrl = page.url();
    console.log(`  → URL: ${newUrl}`);

    const pagoPageInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Buscar elementos de formulario de pago
      const selects = document.querySelectorAll('select');
      const selectsInfo: any[] = [];
      selects.forEach(s => {
        selectsInfo.push({
          id: s.id,
          name: s.name,
          optionsCount: s.options.length,
          firstOptions: Array.from(s.options).slice(0, 5).map(o => o.text),
        });
      });

      // Buscar radios (para PSE)
      const radios = document.querySelectorAll('input[type="radio"]');
      const radioInfo: any[] = [];
      radios.forEach(r => {
        const label = document.querySelector(`label[for="${r.id}"]`);
        radioInfo.push({
          id: r.id,
          name: (r as HTMLInputElement).name,
          value: (r as HTMLInputElement).value,
          label: label?.textContent?.trim(),
        });
      });

      // Buscar botones de continuar
      const continueBtns: string[] = [];
      document.querySelectorAll('button, input[type="submit"]').forEach(btn => {
        const text = (btn as HTMLElement).innerText?.toLowerCase() ||
                    (btn as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('continuar') || text.includes('pagar')) {
          continueBtns.push((btn as HTMLElement).innerText || (btn as HTMLInputElement).value);
        }
      });

      return {
        hasResumen: bodyText.includes('resumen') || bodyText.includes('detalle'),
        hasMedioPago: bodyText.includes('medio de pago'),
        hasPSE: bodyText.includes('pse'),
        hasBancoSelect: selectsInfo.some(s => s.name?.includes('banco') || s.id?.includes('banco')),
        selects: selectsInfo,
        radios: radioInfo,
        continueBtns,
        pageTitle: document.title,
      };
    });

    console.log('  [DEBUG] Página de pago:');
    console.log(`    - Es resumen: ${pagoPageInfo.hasResumen}`);
    console.log(`    - Tiene medio pago: ${pagoPageInfo.hasMedioPago}`);
    console.log(`    - Tiene PSE: ${pagoPageInfo.hasPSE}`);
    console.log(`    - Tiene select banco: ${pagoPageInfo.hasBancoSelect}`);
    console.log(`    - Selects: ${pagoPageInfo.selects.length}`);
    console.log(`    - Radios: ${pagoPageInfo.radios.length}`);

    if (pagoPageInfo.selects.length > 0) {
      console.log('  [DEBUG] Selects encontrados:');
      pagoPageInfo.selects.forEach(s => {
        console.log(`    → #${s.id || s.name}: ${s.optionsCount} opciones - ${s.firstOptions.join(', ')}`);
      });
    }

    if (pagoPageInfo.radios.length > 0) {
      console.log('  [DEBUG] Radios encontrados:');
      pagoPageInfo.radios.forEach(r => {
        console.log(`    → ${r.name}: ${r.value} - "${r.label}"`);
      });
    }

    await browserManager.takeScreenshot(page, 'pago-v2-07-pago-page');

    // ═══════════════════════════════════════════════════════════════
    // FASE 8: SELECCIONAR PSE SI ESTÁ DISPONIBLE
    // ═══════════════════════════════════════════════════════════════
    if (pagoPageInfo.hasPSE || pagoPageInfo.radios.length > 0) {
      console.log('\n[FASE 8] Intentando seleccionar PSE...');

      const pseClicked = await page.evaluate(() => {
        // Buscar radio PSE
        const radios = document.querySelectorAll('input[type="radio"]');
        for (const radio of radios) {
          const label = document.querySelector(`label[for="${radio.id}"]`);
          const labelText = label?.textContent?.toLowerCase() || '';
          const value = (radio as HTMLInputElement).value?.toLowerCase() || '';

          if (labelText.includes('pse') || value.includes('pse')) {
            (radio as HTMLInputElement).click();
            return { clicked: true, label: label?.textContent };
          }
        }

        // Buscar link/botón PSE
        const elements = document.querySelectorAll('a, button');
        for (const el of elements) {
          const text = (el as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('pse') && !text.includes('cesant')) {
            (el as HTMLElement).click();
            return { clicked: true, label: (el as HTMLElement).innerText };
          }
        }

        return { clicked: false };
      });

      if (pseClicked.clicked) {
        console.log(`  ✓ PSE seleccionado: "${pseClicked.label}"`);
        await page.waitForTimeout(2000);
        await browserManager.takeScreenshot(page, 'pago-v2-08-pse-selected');
      } else {
        console.log('  → No se encontró opción PSE para seleccionar');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 9: ANALIZAR SELECT DE BANCO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 9] Buscando select de banco...');

    const bancoSelectInfo = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');

      for (const select of selects) {
        const name = select.name?.toLowerCase() || '';
        const id = select.id?.toLowerCase() || '';

        // Buscar select de banco (más de 10 opciones generalmente)
        if (name.includes('banco') || id.includes('banco') ||
            (select.options.length > 10 &&
             Array.from(select.options).some(o =>
               o.text.toLowerCase().includes('bancolombia') ||
               o.text.toLowerCase().includes('davivienda')))) {

          return {
            found: true,
            id: select.id,
            name: select.name,
            optionsCount: select.options.length,
            options: Array.from(select.options).map(o => ({
              value: o.value,
              text: o.text,
            })),
          };
        }
      }

      return { found: false };
    });

    if (bancoSelectInfo.found) {
      console.log(`  ✓ Select de banco encontrado: #${bancoSelectInfo.id || bancoSelectInfo.name}`);
      console.log(`  → Total opciones: ${bancoSelectInfo.optionsCount}`);
      console.log('  [DEBUG] Bancos disponibles:');
      bancoSelectInfo.options?.slice(0, 15).forEach((o: any) => {
        console.log(`    → ${o.value}: ${o.text}`);
      });
    } else {
      console.log('  → No se encontró select de banco en esta página');
    }

    // ═══════════════════════════════════════════════════════════════
    // FIN - DRY RUN
    // ═══════════════════════════════════════════════════════════════
    console.log(`

═══════════════════════════════════════════════════════════════
   ⚠️  DRY RUN V2 COMPLETADO - NO SE REALIZÓ EL PAGO
═══════════════════════════════════════════════════════════════

El flujo de pago se exploró hasta identificar elementos de PSE.
NO se hizo click en "Continuar con el pago".

Revisa los screenshots en: ./screenshots/

Esperando 30 segundos para inspección visual...
(Puedes cerrar el navegador manualmente o esperar)

`);

    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error en dry-run:', error);
    await browserManager.takeScreenshot(
      (await browserManager.newPage().catch(() => null)) || null as any,
      'pago-v2-error'
    ).catch(() => {});
  } finally {
    console.log('✓ Cerrando navegador...');
    await browserManager.close();
  }
}

main().catch(console.error);
