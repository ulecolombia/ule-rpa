/**
 * FLUJO PAGO COMPLETO SOI v2
 *
 * 1. Dashboard → Click en imagen pagar.png
 * 2. Página detalle → Click en PSE
 * 3. Diálogo advertencia → Click "Sí"
 * 4. Formulario PSE → Llenar datos ULE
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const ULE_PSE = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  numeroDocumento: '9020190314',
  email: 'pagos.ule@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function flujoCompletoV2() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 FLUJO PAGO COMPLETO SOI v2                            ║');
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
  await ss(page, 'pagov2-01-dashboard');

  const pagarImg = await page.$('img[src*="pagar.png"]');
  if (pagarImg) {
    console.log('   ✅ Encontrada imagen pagar.png');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      pagarImg.click(),
    ]);
    console.log('   ✅ Navegación completada\n');
  } else {
    // Fallback por onclick
    await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[onclick*="inicioPagoPlanillas"]');
      if (imgs.length > 0) (imgs[0] as HTMLElement).click();
    });
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  }

  await page.waitForTimeout(2000);
  await ss(page, 'pagov2-02-detalle');

  const url1 = page.url();
  console.log(`   URL: ${url1}`);

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
  await ss(page, 'pagov2-03-despues-pse');

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Diálogo advertencia → Click "Sí"
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Diálogo advertencia → Click "Sí"');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar si hay diálogo de advertencia
  const hayAdvertencia = await page.evaluate(() => {
    const texto = document.body.innerText;
    return texto.includes('Advertencia') && texto.includes('Desea continuar');
  });

  if (hayAdvertencia) {
    console.log('   ✅ Detectado diálogo de advertencia');

    // Click en botón "Sí"
    const clickSi = await page.evaluate(() => {
      // Buscar botón "Sí" o "Si"
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
      for (const btn of buttons) {
        const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').trim().toLowerCase();
        if (texto === 'sí' || texto === 'si' || texto === 'yes') {
          (btn as HTMLElement).click();
          return { clicked: true, texto };
        }
      }

      // Buscar por value exacto
      const inputs = document.querySelectorAll('input[value="Si"], input[value="Sí"], input[value="SI"]');
      if (inputs.length > 0) {
        (inputs[0] as HTMLElement).click();
        return { clicked: true, type: 'input-value' };
      }

      return { clicked: false };
    });

    console.log('   Resultado click Sí:', JSON.stringify(clickSi));

    await page.waitForTimeout(3000);
    await ss(page, 'pagov2-04-despues-si');
  } else {
    console.log('   ⚠️ No se detectó diálogo de advertencia');
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Formulario PSE → Llenar datos
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 4: Formulario PSE → Llenar datos ULE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000);
  const url2 = page.url();
  console.log(`   URL actual: ${url2}`);

  // Verificar contenido de la página
  const pageContent = await page.evaluate(() => {
    const body = document.body.innerText.toLowerCase();
    return {
      tienePersona: body.includes('tipo de persona') || body.includes('tipo persona'),
      tieneBanco: body.includes('banco') || body.includes('entidad financiera'),
      tieneDocumento: body.includes('número de documento') || body.includes('numero documento'),
      tieneEmail: body.includes('correo') || body.includes('email'),
    };
  });

  console.log('   Contenido página:', JSON.stringify(pageContent));

  await ss(page, 'pagov2-05-formulario');

  // Si hay campos del formulario PSE, llenarlos
  if (pageContent.tienePersona || pageContent.tieneBanco) {
    console.log('\n   ✅ Detectado formulario PSE. Llenando datos...\n');

    const resultado = await page.evaluate((ule) => {
      const log: string[] = [];
      const selects = document.querySelectorAll('select');
      const inputs = document.querySelectorAll('input');

      // Analizar estructura
      log.push(`Selects encontrados: ${selects.length}`);
      log.push(`Inputs encontrados: ${inputs.length}`);

      // Llenar selects
      selects.forEach((sel, idx) => {
        const name = sel.name || sel.id || `select-${idx}`;
        const options = Array.from(sel.options).map(o => o.text);
        log.push(`Select [${name}]: ${options.slice(0, 5).join(', ')}...`);

        const labelText = sel.closest('tr, div, label')?.textContent?.toLowerCase() || '';

        // Tipo de persona
        if (labelText.includes('persona') || name.toLowerCase().includes('persona')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('jurídica') || o.text.toLowerCase().includes('juridica')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`  → Tipo Persona: ${opt.text}`);
          }
        }

        // Tipo documento
        if (labelText.includes('documento') || name.toLowerCase().includes('doc')) {
          const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`  → Tipo Doc: ${opt.text}`);
          }
        }

        // Banco
        if (labelText.includes('banco') || labelText.includes('entidad') || name.toLowerCase().includes('banco')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('bancolombia')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`  → Banco: ${opt.text}`);
          }
        }
      });

      // Llenar inputs
      inputs.forEach((inp, idx) => {
        const name = inp.name || inp.id || `input-${idx}`;
        const type = inp.type;
        const labelText = inp.closest('tr, div, label')?.textContent?.toLowerCase() || '';

        if (type === 'text' || type === 'email' || type === 'number') {
          // Número de documento
          if (labelText.includes('número') || labelText.includes('documento') || name.toLowerCase().includes('num')) {
            inp.value = ule.numeroDocumento;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            log.push(`  → Número Doc: ${ule.numeroDocumento}`);
          }

          // Email
          if (labelText.includes('correo') || labelText.includes('email') || type === 'email') {
            inp.value = ule.email;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            log.push(`  → Email: ${ule.email}`);
          }
        }
      });

      return log;
    }, ULE_PSE);

    resultado.forEach(l => console.log(`   ${l}`));

    await page.waitForTimeout(1000);
    await ss(page, 'pagov2-06-formulario-lleno');
  } else {
    console.log('   ⚠️ No se detectaron campos PSE estándar');
    console.log('   Puede ser una página diferente o ya se completó');
  }

  // Mostrar botones disponibles
  const botones = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, input[type="submit"]');
    return Array.from(btns).map(b =>
      (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || ''
    ).filter(t => t.length > 0);
  });

  console.log(`\n   Botones disponibles: ${botones.join(' | ')}`);
  console.log('\n   ⚠️ NO SE HARÁ CLICK EN PAGAR/CONTINUAR (prueba hasta aquí)');

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`   URL final: ${page.url()}`);
  console.log('   📸 Screenshots en ./screenshots/pagov2-*.png');
  console.log('\n   ⏳ Esperando 60 segundos para revisar...\n');

  await page.waitForTimeout(60000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoCompletoV2().catch(console.error);
