/**
 * FLUJO COMPLETO SOI: Crear Planilla → Liquidar → Pagar → Bancolombia
 *
 * Este script prueba el flujo completo desde crear una nueva planilla
 * hasta llegar a Bancolombia Negocios
 *
 * Pasos:
 * 1. Login SOI
 * 2. Ir a "Deseo liquidar una planilla"
 * 3. Crear nueva planilla para Marzo 2026
 * 4. Liquidar la planilla
 * 5. Pagar la planilla (SOI → PSE → Bancolombia)
 * 6. Click en "Bancolombia Negocios"
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

// Datos de ULE
const ULE_DATA = {
  // PSE
  nit: '9020190314',
  email: 'pagos.ule@gmail.com',
  tipoAportante: 'JURIDICA',
  banco: 'BANCOLOMBIA',

  // Liquidación
  periodoMes: 3, // Marzo
  periodoAno: 2026,
  ibc: 1300000, // Salario mínimo 2026
};

async function flujoCompletoConPlanilla() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   FLUJO COMPLETO: Nueva Planilla → Liquidar → Pagar       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  // ═══════════════════════════════════════════════════════════════
  // PASO 1: Login
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 1: Login SOI');
  console.log('═══════════════════════════════════════════════════════════\n');

  let page = authBot.getPage();
  if (!page) {
    console.log('   Iniciando login...');
    await authBot.login();
    page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('   Login OK\n');
    await page.waitForTimeout(2000);
  }

  await ss(page, 'completo-01-login');

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Navegar a "Deseo liquidar una planilla"
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 2: Navegar a liquidar planilla');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Ir al dashboard
  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  // Buscar y clickear "Deseo liquidar una planilla"
  const liquidarLink = await page.$x("//a[contains(., 'Deseo liquidar una planilla')]");
  if (liquidarLink.length > 0) {
    console.log('   Encontrado link "Deseo liquidar una planilla"');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      liquidarLink[0].click(),
    ]);
    console.log('   Click realizado\n');
  } else {
    // Fallback: navegar directamente
    console.log('   Navegando directamente a gestionar planillas...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/gestionPlanillas.do', { waitUntil: 'networkidle0' });
  }

  await page.waitForTimeout(2000);
  await ss(page, 'completo-02-gestionar-planillas');
  console.log(`   URL: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Seleccionar periodo y verificar/crear planilla
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`PASO 3: Seleccionar periodo ${ULE_DATA.periodoMes}/${ULE_DATA.periodoAno}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Analizar la página actual
  const pageInfo = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    const links = document.querySelectorAll('a');

    return {
      title: document.title,
      selects: Array.from(selects).map((s) => ({
        name: s.name,
        id: s.id,
        options: Array.from(s.options).slice(0, 5).map((o) => o.text),
      })),
      buttons: Array.from(buttons)
        .map((b) => ((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').trim())
        .filter((t) => t),
      links: Array.from(links)
        .map((a) => a.innerText.trim())
        .filter((t) => t && t.length < 50)
        .slice(0, 10),
    };
  });

  console.log('   Página actual:', pageInfo.title);
  console.log('   Selects:', pageInfo.selects.map((s) => s.name || s.id).join(', ') || 'ninguno');
  console.log('   Botones:', pageInfo.buttons.slice(0, 5).join(', ') || 'ninguno');
  console.log('   Links:', pageInfo.links.slice(0, 5).join(', ') || 'ninguno');

  // Intentar seleccionar periodo
  await page.evaluate(
    (mes, ano) => {
      // Buscar select de mes
      const mesSelects = document.querySelectorAll('select[name*="mes"], select[id*="mes"]');
      mesSelects.forEach((select) => {
        const sel = select as HTMLSelectElement;
        const mesNombre = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][mes - 1];
        const option = Array.from(sel.options).find(
          (o) => o.text.toLowerCase().includes(mesNombre.toLowerCase()) || o.value === mes.toString()
        );
        if (option) {
          sel.value = option.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Buscar select de año
      const anoSelects = document.querySelectorAll('select[name*="ano"], select[id*="ano"], select[name*="year"], select[id*="year"]');
      anoSelects.forEach((select) => {
        const sel = select as HTMLSelectElement;
        const option = Array.from(sel.options).find((o) => o.text.includes(ano.toString()) || o.value === ano.toString());
        if (option) {
          sel.value = option.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    },
    ULE_DATA.periodoMes,
    ULE_DATA.periodoAno
  );

  console.log(`\n   Periodo seleccionado: ${ULE_DATA.periodoMes}/${ULE_DATA.periodoAno}\n`);
  await page.waitForTimeout(1000);
  await ss(page, 'completo-03-periodo-seleccionado');

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Buscar planilla existente o crear nueva
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 4: Buscar o crear planilla');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Click en buscar
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
    for (const btn of buttons) {
      const text = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
      if (text.includes('buscar') || text.includes('consultar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });

  await page.waitForTimeout(3000);
  await ss(page, 'completo-04-busqueda');

  // Verificar si hay planilla o necesitamos crear una
  const hayPlanilla = await page.evaluate(() => {
    const tbody = document.querySelector('table tbody');
    if (tbody && tbody.children.length > 0) {
      return tbody.children[0].textContent?.includes('No hay') ? false : true;
    }
    return false;
  });

  if (!hayPlanilla) {
    console.log('   No hay planilla para este periodo, creando nueva...\n');

    // Buscar y clickear "Nueva planilla" o similar
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a, img');
      for (const btn of buttons) {
        const text = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
        const src = (btn as HTMLImageElement).src?.toLowerCase() || '';
        if (text.includes('nueva') || text.includes('crear') || src.includes('nueva') || src.includes('crear')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });

    await page.waitForTimeout(3000);
    await ss(page, 'completo-05-nueva-planilla');

    // TODO: Llenar datos de liquidación aquí
    console.log('   Nota: Aquí se llenarían los datos de liquidación\n');
  } else {
    console.log('   Planilla encontrada para el periodo\n');
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 5: Liquidar (si es necesario)
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 5: Verificar estado de planilla');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar estado de la planilla
  const estadoPlanilla = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    if (texto.includes('liquidada')) return 'LIQUIDADA';
    if (texto.includes('guardada')) return 'GUARDADA';
    if (texto.includes('pagada')) return 'PAGADA';
    return 'DESCONOCIDO';
  });

  console.log(`   Estado de planilla: ${estadoPlanilla}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 6: Ir a pagar
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 6: Navegar a pago');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Volver al dashboard e intentar pagar
  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  // Buscar botón pagar
  const pagarImg = await page.$('img[src*="pagar.png"]');
  if (pagarImg) {
    console.log('   Encontrada imagen pagar.png');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      pagarImg.click(),
    ]);
    console.log('   Click en pagar realizado\n');
  } else {
    console.log('   No se encontró imagen pagar.png');
    console.log('   Buscando otras opciones de pago...\n');

    // Buscar links de pago
    const pagoLinks = await page.$x("//a[contains(., 'Necesito mis soportes de pago')] | //a[contains(., 'pago')]");
    if (pagoLinks.length > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        pagoLinks[0].click(),
      ]);
    }
  }

  await page.waitForTimeout(2000);
  await ss(page, 'completo-06-pagina-pago');
  console.log(`   URL: ${page.url()}\n`);

  // Continuar con el flujo de pago PSE si llegamos a la página correcta
  const urlActual = page.url();
  if (urlActual.includes('Pago') || urlActual.includes('pago') || urlActual.includes('inicioPagoPlanillas')) {
    console.log('   Estamos en página de pago, continuando flujo PSE...\n');

    // Scroll y buscar PSE
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const pseImg = await page.$('img[src*="pse"]');
    if (pseImg) {
      console.log('   Encontrada imagen PSE');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        pseImg.click(),
      ]);
    }

    // Continuar con el resto del flujo...
    // (Advertencia, formulario PSE, etc.)
  } else {
    console.log('   No se encontró página de pago disponible');
    console.log('   Puede que no haya planillas listas para pagar\n');
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    RESUMEN                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`   URL final: ${page.url()}`);
  console.log('   Screenshots en ./screenshots/completo-*.png\n');

  console.log('   Esperando 60 segundos para revisión manual...\n');
  await page.waitForTimeout(60000);

  console.log('Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoCompletoConPlanilla().catch(console.error);
