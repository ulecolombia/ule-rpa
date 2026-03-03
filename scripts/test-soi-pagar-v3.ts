/**
 * PAGO DIRECTO SOI v3
 * Busca específicamente el ícono de pago (icono_pago_ventanilla.png) en la tabla
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';

async function pagarDirectoV3() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 PAGO DIRECTO SOI v3 - Click exacto en ícono Pagar     ║');
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
  } else {
    console.log('✅ Usando sesión existente\n');
  }

  // Ir a Pendientes de pago
  console.log('📍 Navegando a Pendientes de pago...');

  await page.evaluate(() => {
    const home = document.querySelector('a[href*="inicio"], [title*="Inicio"]') as HTMLElement;
    if (home) home.click();
  });
  await page.waitForTimeout(2000);

  await clickMenu(page, 'gestionar planillas');
  await page.waitForTimeout(1000);
  await clickMenu(page, 'activos');
  await page.waitForTimeout(1000);
  await clickMenu(page, 'pendientes de pago');
  await page.waitForTimeout(3000);

  console.log('✅ En Pendientes de pago\n');

  // Escribir número de planilla
  console.log(`📍 Buscando planilla: ${PLANILLA_NUMERO}`);

  await page.click('input[type="text"]');
  await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (input) input.value = '';
  });
  await page.type('input[type="text"]', PLANILLA_NUMERO, { delay: 50 });

  // Click en Buscar
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    for (const btn of btns) {
      const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
      if (texto.includes('buscar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });

  await page.waitForTimeout(3000);
  await ss(page, 'pagar3-01-resultado');

  // AHORA: Buscar específicamente la tabla de resultados y el ícono de pago
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 Buscando ícono de PAGAR en la tabla de resultados');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Analizar la estructura de la tabla
  const analisis = await page.evaluate(() => {
    // Buscar la tabla de resultados (la que tiene los encabezados de planilla)
    const tables = document.querySelectorAll('table');
    let targetTable: HTMLTableElement | null = null;

    for (const table of tables) {
      const headerText = table.innerText?.toLowerCase() || '';
      if (headerText.includes('no. planilla') || headerText.includes('no planilla') ||
          headerText.includes('valor sin mora') || headerText.includes('estado')) {
        targetTable = table;
        break;
      }
    }

    if (!targetTable) {
      return { error: 'No se encontró la tabla de resultados' };
    }

    // Buscar las filas de datos (tbody tr)
    const rows = targetTable.querySelectorAll('tbody tr');
    const info: any[] = [];

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const cells = row.querySelectorAll('td');
      const rowText = row.textContent || '';

      // Buscar si esta fila contiene el número de planilla
      if (rowText.includes('6008280827')) {
        info.push({ rowIdx, isTarget: true, cellCount: cells.length });

        // Analizar cada celda
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const imgs = cell.querySelectorAll('img');
          const links = cell.querySelectorAll('a');

          if (imgs.length > 0 || links.length > 0) {
            for (const img of imgs) {
              info.push({
                cellIdx: i,
                type: 'img',
                src: (img as HTMLImageElement).src?.split('/').pop(),
                alt: (img as HTMLImageElement).alt,
                title: img.getAttribute('title'),
              });
            }
            for (const link of links) {
              info.push({
                cellIdx: i,
                type: 'link',
                href: (link as HTMLAnchorElement).href?.substring(0, 50),
                text: (link as HTMLElement).innerText?.trim(),
              });
            }
          }
        }
      }
    }

    return { tableFound: true, info };
  });

  console.log('   Análisis de tabla:', JSON.stringify(analisis, null, 2));

  // Ahora hacer click específicamente en el ícono de pago
  console.log('\n📍 Intentando click en ícono de pago...');

  const clickResult = await page.evaluate(() => {
    // Buscar la tabla de resultados
    const tables = document.querySelectorAll('table');
    let targetTable: HTMLTableElement | null = null;

    for (const table of tables) {
      const headerText = table.innerText?.toLowerCase() || '';
      if (headerText.includes('no. planilla') || headerText.includes('valor sin mora')) {
        targetTable = table;
        break;
      }
    }

    if (!targetTable) return { success: false, error: 'Tabla no encontrada' };

    // Buscar la fila con la planilla
    const rows = targetTable.querySelectorAll('tbody tr');

    for (const row of rows) {
      const rowText = row.textContent || '';

      if (rowText.includes('6008280827')) {
        // Buscar el ícono de pago en esta fila específica
        const imgs = row.querySelectorAll('img');

        for (const img of imgs) {
          const src = (img as HTMLImageElement).src || '';
          const srcName = src.split('/').pop()?.toLowerCase() || '';

          // Buscar el ícono de pago
          if (srcName.includes('pago') || srcName.includes('pse') ||
              srcName.includes('ventanilla') || srcName.includes('pay')) {
            // Click en el link padre o en la imagen directamente
            const parent = img.closest('a') || img.parentElement;
            if (parent) {
              (parent as HTMLElement).click();
              return { success: true, clicked: 'parent', src: srcName };
            } else {
              (img as HTMLElement).click();
              return { success: true, clicked: 'img', src: srcName };
            }
          }
        }

        // Si no encontró por nombre, buscar en la columna "Pagar" (índice ~10)
        const cells = row.querySelectorAll('td');
        // Contar columnas: Seleccionar(0), No.Planilla(1), Valor(2), Tipo(3), Periodo(4), Otros(5), Salud(6), Estado(7), Fecha(8), Soporte(9), Pagar(10)
        for (let i = 9; i <= 11; i++) {
          if (cells[i]) {
            const clickable = cells[i].querySelector('a, img') as HTMLElement;
            if (clickable) {
              const src = (clickable as HTMLImageElement).src || '';
              // No click en PDF ni en editar
              if (!src.includes('pdf') && !src.includes('rework') && !src.includes('copia')) {
                clickable.click();
                return { success: true, clicked: `cell-${i}`, src: src.split('/').pop() };
              }
            }
          }
        }

        return { success: false, error: 'No se encontró ícono de pago en la fila' };
      }
    }

    return { success: false, error: 'Fila de planilla no encontrada' };
  });

  console.log('   Resultado:', JSON.stringify(clickResult));

  await page.waitForTimeout(3000);
  await ss(page, 'pagar3-02-despues-click');

  // Verificar dónde llegamos
  const estado = await page.evaluate(() => {
    return {
      url: window.location.href,
      titulo: document.querySelector('h1, h2, .titulo, legend')?.textContent?.trim() || 'No detectado',
      texto: document.body.innerText.substring(0, 500),
    };
  });

  console.log(`\n   URL: ${estado.url}`);
  console.log(`   Título: ${estado.titulo}`);
  console.log(`   Contenido: ${estado.texto.substring(0, 200)}...`);

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('📸 Screenshots en ./screenshots/pagar3-*.png');
  console.log('⚠️  Navegador abierto - 60s para revisar\n');

  await page.waitForTimeout(60000);
  console.log('✅ Finalizado');
}

async function clickMenu(page: any, menuText: string) {
  await page.evaluate((text: string) => {
    const links = document.querySelectorAll('a, button, [onclick], li, span');
    for (const link of links) {
      const linkText = (link as HTMLElement).innerText?.trim().toLowerCase() || '';
      if (linkText === text || linkText.includes(text)) {
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, menuText.toLowerCase());
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

pagarDirectoV3().catch(console.error);
