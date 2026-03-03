/**
 * PAGO DIRECTO SOI v2
 * Corregido: usa type() para escribir el número de planilla
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';
const ULE_DATA = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  numeroDocumento: '9020190314',
  email: 'pagos.ule@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function pagarDirectoV2() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 PAGO DIRECTO SOI v2                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  // Login
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
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Navegando a Pendientes de pago');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Click en inicio
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

  await ss(page, 'pagar2-01-pendientes');
  console.log('✅ En Pendientes de pago\n');

  // Escribir número de planilla usando type() de Puppeteer
  console.log(`📍 Escribiendo número de planilla: ${PLANILLA_NUMERO}`);

  // Encontrar y limpiar el input
  const inputSelector = 'input[type="text"]';
  await page.waitForSelector(inputSelector, { timeout: 5000 });

  // Click en el input para enfocarlo
  await page.click(inputSelector);
  await page.waitForTimeout(300);

  // Limpiar el campo (triple click para seleccionar todo + borrar)
  await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
    }
  });

  // Escribir usando type()
  await page.type(inputSelector, PLANILLA_NUMERO, { delay: 50 });
  await page.waitForTimeout(500);

  await ss(page, 'pagar2-02-numero-escrito');

  // Click en Buscar
  console.log('📍 Haciendo click en Buscar...');

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    for (const btn of btns) {
      const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
      if (texto.includes('buscar')) {
        console.log('Encontrado botón buscar:', texto);
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  await page.waitForTimeout(3000);
  await ss(page, 'pagar2-03-resultado-busqueda');

  // Verificar resultados
  const resultado = await page.evaluate(() => {
    const texto = document.body.innerText;
    const tieneTabla = document.querySelector('table tbody tr') !== null;
    const registros = texto.match(/(\d+)\s*REGISTROS?\s*DE\s*(\d+)/i);

    return {
      tieneTabla,
      registros: registros ? registros[0] : 'No detectado',
      contieneNumero: texto.includes('6008280827'),
    };
  });

  console.log(`   Tiene tabla: ${resultado.tieneTabla}`);
  console.log(`   Registros: ${resultado.registros}`);
  console.log(`   Contiene número: ${resultado.contieneNumero}\n`);

  if (!resultado.contieneNumero) {
    console.log('⚠️ La planilla no aparece. Verificando página...');
    await ss(page, 'pagar2-04-debug');

    // Intentar búsqueda general
    console.log('📍 Intentando pestaña "General"...');

    await page.evaluate(() => {
      const tabs = document.querySelectorAll('a, button, [onclick]');
      for (const tab of tabs) {
        const texto = (tab as HTMLElement).innerText?.toLowerCase() || '';
        if (texto === 'general') {
          (tab as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    await page.waitForTimeout(1500);

    // Buscar sin filtro específico
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
    await ss(page, 'pagar2-05-busqueda-general');
  }

  // Buscar la fila con la planilla y hacer click en Pagar
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Buscando botón PAGAR en la tabla');
  console.log('═══════════════════════════════════════════════════════════\n');

  const clickPagar = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const log: string[] = [];

    for (const row of rows) {
      const texto = row.textContent || '';
      log.push(`Fila: ${texto.substring(0, 100)}...`);

      if (texto.includes('6008280827') || texto.includes('570.000') || texto.includes('570000')) {
        log.push('  -> Encontrada planilla!');

        // Buscar todos los elementos clickeables en la fila
        const clickables = row.querySelectorAll('a, img, button, [onclick]');
        log.push(`  -> ${clickables.length} elementos clickeables`);

        for (let i = 0; i < clickables.length; i++) {
          const el = clickables[i] as HTMLElement;
          const info = {
            tag: el.tagName,
            text: el.innerText?.trim() || '',
            title: el.getAttribute('title') || '',
            onclick: el.getAttribute('onclick')?.substring(0, 50) || '',
            src: (el as HTMLImageElement).src?.split('/').pop() || '',
          };
          log.push(`  [${i}] ${info.tag}: "${info.text}" title="${info.title}" src="${info.src}"`);

          // Buscar el de pagar (suele ser una imagen o link)
          const combined = `${info.text} ${info.title} ${info.onclick} ${info.src}`.toLowerCase();
          if (combined.includes('pagar') || combined.includes('pse') || combined.includes('pay')) {
            el.click();
            return { clicked: true, element: i, info: combined.substring(0, 100), log };
          }
        }

        // Si no encontró pagar, intentar por posición (columna 10-11 suele ser Pagar)
        const cells = row.querySelectorAll('td');
        for (let i = 9; i < Math.min(cells.length, 13); i++) {
          const cell = cells[i];
          const clickable = cell.querySelector('a, img, [onclick]') as HTMLElement;
          if (clickable) {
            log.push(`  Intentando celda ${i}...`);
            clickable.click();
            return { clicked: true, element: `celda-${i}`, log };
          }
        }
      }
    }

    return { clicked: false, log };
  });

  console.log('   Log de búsqueda:');
  clickPagar.log?.forEach((l: string) => console.log(`   ${l}`));
  console.log(`\n   Resultado: ${clickPagar.clicked ? '✅ Click realizado' : '❌ No se pudo hacer click'}`);

  await page.waitForTimeout(3000);
  await ss(page, 'pagar2-06-despues-click-pagar');

  // Verificar si llegamos al formulario PSE
  const estadoActual = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    const url = window.location.href;
    const titulo = document.querySelector('h1, h2, h3, .titulo, legend')?.textContent?.trim();

    return {
      url,
      titulo: titulo || 'No detectado',
      esPSE: texto.includes('pse') || texto.includes('tipo de persona') ||
             texto.includes('entidad financiera') || texto.includes('datos del pagador'),
      esConfirmacion: texto.includes('confirmar') || texto.includes('resumen'),
      esError: texto.includes('error') || texto.includes('no disponible'),
    };
  });

  console.log(`\n   URL: ${estadoActual.url}`);
  console.log(`   Título: ${estadoActual.titulo}`);
  console.log(`   ¿Es PSE?: ${estadoActual.esPSE}`);
  console.log(`   ¿Es confirmación?: ${estadoActual.esConfirmacion}`);

  if (estadoActual.esPSE) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 ¡FORMULARIO PSE DETECTADO! Llenando datos ULE...');
    console.log('═══════════════════════════════════════════════════════════\n');

    await ss(page, 'pagar2-07-formulario-pse');

    // Llenar formulario PSE
    // ... (código de llenado PSE aquí)
  }

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('📸 Screenshots en ./screenshots/pagar2-*.png');
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

pagarDirectoV2().catch(console.error);
