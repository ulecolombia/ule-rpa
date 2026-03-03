/**
 * FLUJO PAGO COMPLETO SOI → PSE → BANCOLOMBIA
 *
 * 1. Dashboard → Click en imagen pagar.png
 * 2. Página detalle → Click en PSE
 * 3. Diálogo advertencia → Click "Sí"
 * 4. Formulario PSE → JURIDICA + BANCOLOMBIA
 * 5. Click "Pagar" → Redirige a Bancolombia
 * 6. En Bancolombia → Ingresar datos ULE
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const ULE_PSE = {
  tipoAportante: 'JURIDICA',
  banco: 'BANCOLOMBIA',
};

async function flujoCompletoFinal() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 FLUJO PAGO COMPLETO: SOI → PSE → BANCOLOMBIA          ║');
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

  // ═══════════════════════════════════════════════════════════════
  // PASO 1: Dashboard → Click en imagen pagar.png
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 1: Dashboard → Click en botón Pagar');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);
  await ss(page, 'final-01-dashboard');

  const pagarImg = await page.$('img[src*="pagar.png"]');
  if (pagarImg) {
    console.log('   ✅ Encontrada imagen pagar.png');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      pagarImg.click(),
    ]);
    console.log('   ✅ Navegación completada\n');
  } else {
    await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[onclick*="inicioPagoPlanillas"]');
      if (imgs.length > 0) (imgs[0] as HTMLElement).click();
    });
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  }

  await page.waitForTimeout(2000);
  await ss(page, 'final-02-detalle');
  console.log(`   URL: ${page.url()}`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Click en botón PSE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 2: Click en botón PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const pseImg = await page.$('img[src*="pse"]');
  if (pseImg) {
    console.log('   ✅ Encontrada imagen PSE');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      pseImg.click(),
    ]);
  } else {
    await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        if ((img as HTMLImageElement).src.toLowerCase().includes('pse')) {
          (img.closest('a') || img as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  }

  await page.waitForTimeout(2000);
  await ss(page, 'final-03-despues-pse');

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Diálogo advertencia → Click "Sí"
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Diálogo advertencia → Click "Sí"');
  console.log('═══════════════════════════════════════════════════════════\n');

  const hayAdvertencia = await page.evaluate(() => {
    const texto = document.body.innerText;
    return texto.includes('Advertencia') && texto.includes('Desea continuar');
  });

  if (hayAdvertencia) {
    console.log('   ✅ Detectado diálogo de advertencia');
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
      for (const btn of buttons) {
        const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').trim().toLowerCase();
        if (texto === 'sí' || texto === 'si' || texto === 'yes') {
          (btn as HTMLElement).click();
          return;
        }
      }
      const inputs = document.querySelectorAll('input[value="Si"], input[value="Sí"], input[value="SI"]');
      if (inputs.length > 0) (inputs[0] as HTMLElement).click();
    });
    console.log('   ✅ Click en "Sí"\n');
    await page.waitForTimeout(3000);
    await ss(page, 'final-04-despues-si');
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Formulario PSE → JURIDICA + BANCOLOMBIA
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 4: Formulario PSE → JURIDICA + BANCOLOMBIA');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000);

  // Seleccionar Tipo de Aportante = JURIDICA
  await page.evaluate(() => {
    const select = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
    if (select) {
      const option = Array.from(select.options).find(o => o.value === 'JURIDICA' || o.text.toUpperCase() === 'JURIDICA');
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  console.log('   ✅ Tipo Aportante: JURIDICA');
  await page.waitForTimeout(500);

  // Seleccionar Entidad Financiera = BANCOLOMBIA
  await page.evaluate(() => {
    const select = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
    if (select) {
      const option = Array.from(select.options).find(o => o.text.toUpperCase().includes('BANCOLOMBIA'));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  console.log('   ✅ Entidad Financiera: BANCOLOMBIA');
  await page.waitForTimeout(500);

  await ss(page, 'final-05-formulario-lleno');

  // ═══════════════════════════════════════════════════════════════
  // PASO 5: Click "Pagar" → Redirige a Bancolombia/PSE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 5: Click "Pagar" → Redirige a Bancolombia');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Buscar y clickear botón Pagar
  const pagarBtn = await page.$('input[value="Pagar"], button');
  if (pagarBtn) {
    console.log('   ✅ Encontrado botón Pagar');

    // Click en Pagar
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
      pagarBtn.click(),
    ]);

    console.log('   ✅ Click en Pagar completado\n');
  } else {
    // Fallback: buscar por texto
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
      for (const inp of inputs) {
        const value = (inp as HTMLInputElement).value || (inp as HTMLElement).innerText || '';
        if (value.toLowerCase().includes('pagar')) {
          (inp as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  }

  await page.waitForTimeout(5000);
  await ss(page, 'final-06-despues-pagar');

  const urlDespuesPagar = page.url();
  console.log(`   URL después de Pagar: ${urlDespuesPagar}`);

  // Verificar si llegamos a la página del banco
  const esPaginaBanco = !urlDespuesPagar.includes('nuevosoi.com.co');

  if (esPaginaBanco) {
    console.log('\n   🏦 ¡REDIRIGIDO A PÁGINA DEL BANCO!');
    console.log(`   URL Banco: ${urlDespuesPagar}`);
  } else {
    // Puede que haya una página intermedia de PSE/ACH
    console.log('\n   📋 Página actual (puede ser PSE intermedia)');

    // Verificar contenido
    const contenido = await page.evaluate(() => {
      return {
        titulo: document.title,
        texto: document.body.innerText.substring(0, 500),
      };
    });
    console.log(`   Título: ${contenido.titulo}`);
    console.log(`   Contenido: ${contenido.texto.substring(0, 200)}...`);
  }

  await ss(page, 'final-07-pagina-banco');

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`   URL final: ${page.url()}`);
  console.log('   📸 Screenshots en ./screenshots/final-*.png');
  console.log('\n   ⏳ Esperando 120 segundos para revisar/completar pago...\n');

  await page.waitForTimeout(120000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoCompletoFinal().catch(console.error);
