/**
 * Script para probar click en botón PAGAR de SOI
 *
 * Este script:
 * 1. Login en SOI
 * 2. Encuentra la planilla en el dashboard
 * 3. Hace click en el botón "Pagar"
 * 4. Captura la pantalla siguiente (formulario PSE)
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function testClickPagar() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      🧪 TEST: CLICK EN BOTÓN PAGAR - SOI PSE           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  try {
    // ====== PASO 1: Login ======
    console.log('📍 PASO 1: Autenticación...');
    const session = await authBot.login();

    if (!session.isAuthenticated) {
      throw new Error('Login fallido');
    }
    console.log('✅ Login exitoso\n');

    const page = authBot.getPage();
    if (!page) throw new Error('No page');

    // ====== PASO 2: Esperar dashboard ======
    console.log('📍 PASO 2: Esperando dashboard...');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'screenshots/pagar-1-dashboard.png',
      fullPage: true,
    });
    console.log('✅ Dashboard cargado\n');

    // ====== PASO 3: Buscar info de planillas ======
    console.log('📍 PASO 3: Buscando planillas disponibles...');

    const planillaInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr, table tr');
      const planillas: { numero: string; estado: string; valor: string; hasPagarBtn: boolean }[] = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          // Buscar si hay botón de pagar en esta fila
          const hasPagar = row.querySelector('button, a, [onclick]') !== null;

          planillas.push({
            numero: cells[0]?.textContent?.trim() || cells[1]?.textContent?.trim() || '',
            estado: cells[2]?.textContent?.trim() || cells[3]?.textContent?.trim() || '',
            valor: cells[4]?.textContent?.trim() || cells[5]?.textContent?.trim() || '',
            hasPagarBtn: hasPagar,
          });
        }
      });

      return planillas.filter(p => p.numero && p.numero.match(/\d{5,}/));
    });

    console.log('   Planillas encontradas:');
    planillaInfo.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.numero} | ${p.estado} | ${p.valor} | Pagar: ${p.hasPagarBtn ? '✅' : '❌'}`);
    });
    console.log('');

    // ====== PASO 4: Click en botón Pagar ======
    console.log('📍 PASO 4: Haciendo click en botón PAGAR...');

    const clicked = await page.evaluate(() => {
      // Buscar todos los elementos que podrían ser el botón Pagar
      // El botón tiene un icono de $ dentro de un círculo verde

      // Buscar por la columna "Pagar" en la tabla
      const headerCells = document.querySelectorAll('th');
      let pagarColIndex = -1;

      headerCells.forEach((th, index) => {
        if (th.textContent?.toLowerCase().includes('pagar')) {
          pagarColIndex = index;
        }
      });

      console.log('Pagar column index:', pagarColIndex);

      // Buscar la primera fila con datos y hacer click en la columna Pagar
      const rows = document.querySelectorAll('table tbody tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');

        // Buscar botón o link en la fila
        const buttons = row.querySelectorAll('button, a, svg, [onclick], [class*="btn"]');

        for (const btn of buttons) {
          const parent = btn.closest('td');
          const btnText = btn.textContent?.toLowerCase() || '';
          const btnClass = (btn as HTMLElement).className?.toLowerCase() || '';
          const title = (btn as HTMLElement).getAttribute('title')?.toLowerCase() || '';

          // El botón Pagar suele estar en las últimas columnas
          if (parent) {
            const cellIndex = Array.from(cells).indexOf(parent as HTMLTableCellElement);

            // Si es la columna de Pagar o tiene indicadores de pago
            if (cellIndex >= 6 || btnText.includes('pagar') || title.includes('pagar') ||
                btnClass.includes('pagar') || btnClass.includes('pay')) {
              (btn as HTMLElement).click();
              return { success: true, cellIndex, element: btn.tagName };
            }
          }
        }

        // Si encontramos una fila con planilla, hacer click en el primer botón/link de las últimas columnas
        if (cells.length >= 7) {
          const pagarCell = cells[7] || cells[6]; // Columna Pagar
          if (pagarCell) {
            const clickable = pagarCell.querySelector('button, a, svg, [onclick]');
            if (clickable) {
              (clickable as HTMLElement).click();
              return { success: true, method: 'pagarCell', element: clickable.tagName };
            }
          }
        }
      }

      // Último intento: buscar cualquier elemento con icono de $ o clase pagar
      const allClickables = document.querySelectorAll('[class*="pagar"], [class*="pay"], button svg, a svg');
      if (allClickables.length > 0) {
        (allClickables[0] as HTMLElement).click();
        return { success: true, method: 'fallback', count: allClickables.length };
      }

      return { success: false };
    });

    console.log('   Resultado click:', clicked);

    // Esperar navegación
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'screenshots/pagar-2-despues-click.png',
      fullPage: true,
    });
    console.log('✅ Screenshot guardado: pagar-2-despues-click.png\n');

    // ====== PASO 5: Analizar página siguiente ======
    console.log('📍 PASO 5: Analizando página después del click...');

    const currentUrl = page.url();
    console.log('   URL actual:', currentUrl);

    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasForm: document.querySelector('form') !== null,
        hasPSE: document.body.textContent?.toLowerCase().includes('pse'),
        hasBanco: document.body.textContent?.toLowerCase().includes('banco'),
        hasNIT: document.body.textContent?.toLowerCase().includes('nit'),
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"]'))
          .map(b => b.textContent?.trim() || (b as HTMLInputElement).value)
          .filter(t => t && t.length > 1)
          .slice(0, 10),
        inputs: Array.from(document.querySelectorAll('input:not([type="hidden"]), select'))
          .map(i => ({
            type: (i as HTMLInputElement).type || 'select',
            name: (i as HTMLInputElement).name || (i as HTMLSelectElement).name,
            placeholder: (i as HTMLInputElement).placeholder
          }))
          .slice(0, 15),
      };
    });

    console.log('   Título:', pageContent.title);
    console.log('   ¿Tiene formulario?', pageContent.hasForm ? '✅ Sí' : '❌ No');
    console.log('   ¿Menciona PSE?', pageContent.hasPSE ? '✅ Sí' : '❌ No');
    console.log('   ¿Menciona Banco?', pageContent.hasBanco ? '✅ Sí' : '❌ No');
    console.log('   ¿Menciona NIT?', pageContent.hasNIT ? '✅ Sí' : '❌ No');
    console.log('   Botones:', pageContent.buttons.join(', ') || 'Ninguno');
    console.log('   Inputs:', pageContent.inputs.length);

    if (pageContent.inputs.length > 0) {
      console.log('   Campos del formulario:');
      pageContent.inputs.forEach((inp, i) => {
        console.log(`     ${i + 1}. [${inp.type}] ${inp.name || inp.placeholder || 'sin nombre'}`);
      });
    }

    console.log('\n✅ TEST COMPLETADO');
    console.log('📸 Ver screenshots en ./screenshots/pagar-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);

    const page = authBot.getPage();
    if (page) {
      await page.screenshot({
        path: 'screenshots/pagar-error.png',
        fullPage: true,
      });
    }
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

testClickPagar().catch(console.error);
