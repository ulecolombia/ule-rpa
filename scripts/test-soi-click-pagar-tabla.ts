/**
 * Click específico en el botón $ verde de la tabla del Dashboard
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';

async function clickPagarTabla() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 Click en botón $ verde de la tabla                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  let page = authBot.getPage();
  if (!page) {
    console.log('📍 Iniciando login...');
    await authBot.login();
    page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Login OK\n');
    await page.waitForTimeout(2000);
  }

  // Ir al Dashboard
  console.log('📍 Navegando al Dashboard...');
  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);
  await ss(page, 'click-01-dashboard');

  // Analizar la estructura de la tabla del dashboard
  console.log('\n📍 Analizando tabla "Últimas planillas disponibles"...');

  const analisis = await page.evaluate(() => {
    // Buscar la sección de planillas disponibles
    const sectionText = document.body.innerText;
    const tieneSeccion = sectionText.includes('Últimas planillas disponibles');

    // Buscar todas las tablas
    const tables = document.querySelectorAll('table');
    const tablesInfo: any[] = [];

    tables.forEach((table, idx) => {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
      const rowCount = table.querySelectorAll('tbody tr').length;
      tablesInfo.push({ idx, headers, rowCount });
    });

    return { tieneSeccion, tablesInfo };
  });

  console.log('   Tiene sección planillas:', analisis.tieneSeccion);
  console.log('   Tablas encontradas:', JSON.stringify(analisis.tablesInfo, null, 2));

  // Buscar y hacer click en el botón Pagar de la planilla específica
  console.log(`\n📍 Buscando botón Pagar para planilla ${PLANILLA_NUMERO}...`);

  const clickResult = await page.evaluate((numPlanilla) => {
    const tables = document.querySelectorAll('table');
    const log: string[] = [];

    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim().toLowerCase());

      // Verificar si es la tabla correcta (tiene columna "Pagar")
      const pagarColIdx = headers.findIndex(h => h.includes('pagar'));
      const planillaColIdx = headers.findIndex(h => h.includes('planilla'));

      if (pagarColIdx === -1) continue;

      log.push(`Tabla con columna Pagar en índice ${pagarColIdx}`);

      const rows = table.querySelectorAll('tbody tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent || '';

        if (rowText.includes(numPlanilla)) {
          log.push(`  Encontrada fila con planilla ${numPlanilla}`);
          log.push(`  Número de celdas: ${cells.length}`);

          // Obtener la celda de la columna Pagar
          const pagarCell = cells[pagarColIdx];

          if (pagarCell) {
            log.push(`  Contenido celda Pagar: ${pagarCell.innerHTML.substring(0, 200)}`);

            // Buscar el link o imagen clickeable
            const link = pagarCell.querySelector('a');
            const img = pagarCell.querySelector('img');
            const button = pagarCell.querySelector('button, [onclick]');

            if (link) {
              log.push(`  Encontrado <a> con href: ${link.href}`);
              link.click();
              return { success: true, method: 'link', href: link.href, log };
            }

            if (img) {
              log.push(`  Encontrado <img> con src: ${(img as HTMLImageElement).src}`);
              // Click en la imagen o su padre
              const parent = img.parentElement;
              if (parent?.tagName === 'A') {
                (parent as HTMLElement).click();
                return { success: true, method: 'img-parent', log };
              } else {
                (img as HTMLElement).click();
                return { success: true, method: 'img', log };
              }
            }

            if (button) {
              log.push(`  Encontrado botón/onclick`);
              (button as HTMLElement).click();
              return { success: true, method: 'button', log };
            }

            // Si no hay elemento clickeable específico, intentar click en la celda
            const clickable = pagarCell.querySelector('*');
            if (clickable) {
              (clickable as HTMLElement).click();
              return { success: true, method: 'first-child', log };
            }
          }

          return { success: false, error: 'Celda Pagar no encontrada o vacía', log };
        }
      }
    }

    return { success: false, error: 'No se encontró la tabla o la planilla', log };
  }, PLANILLA_NUMERO);

  console.log('\n   Log de búsqueda:');
  clickResult.log?.forEach((l: string) => console.log(`   ${l}`));
  console.log(`\n   Resultado: ${clickResult.success ? '✅ Click realizado' : '❌ ' + clickResult.error}`);

  await page.waitForTimeout(3000);
  await ss(page, 'click-02-despues-click');

  // Verificar dónde llegamos
  const estado = await page.evaluate(() => {
    return {
      url: window.location.href,
      titulo: document.querySelector('h1, h2, h3, legend, .titulo')?.textContent?.trim(),
      tienePSE: document.body.innerText.includes('PSE') || document.body.innerText.includes('Pago PSE'),
      tieneTotal: document.body.innerText.includes('TOTAL POR PAGAR'),
    };
  });

  console.log(`\n   URL: ${estado.url}`);
  console.log(`   Título: ${estado.titulo}`);
  console.log(`   Tiene PSE: ${estado.tienePSE}`);
  console.log(`   Tiene Total: ${estado.tieneTotal}`);

  if (estado.tienePSE) {
    console.log('\n✅ ¡Llegamos a página con opción PSE!');

    // Scroll y click en PSE
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await ss(page, 'click-03-seccion-pse');

    // Click en PSE
    const clickPSE = await page.evaluate(() => {
      const elements = document.querySelectorAll('a, img, [onclick]');
      for (const el of elements) {
        const src = (el as HTMLImageElement).src || '';
        const text = (el as HTMLElement).innerText || '';
        const href = (el as HTMLAnchorElement).href || '';

        if (src.toLowerCase().includes('pse') || text.toLowerCase().includes('pse') || href.toLowerCase().includes('pse')) {
          const link = el.closest('a') || el;
          (link as HTMLElement).click();
          return { clicked: true, info: src || text || href };
        }
      }
      return { clicked: false };
    });

    console.log('   Click PSE:', JSON.stringify(clickPSE));
    await page.waitForTimeout(3000);
    await ss(page, 'click-04-formulario-pse');
  }

  console.log('\n⏳ Esperando 60 segundos para revisar...\n');
  await page.waitForTimeout(60000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

clickPagarTabla().catch(console.error);
