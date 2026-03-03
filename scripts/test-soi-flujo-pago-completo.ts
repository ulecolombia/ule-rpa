/**
 * FLUJO PAGO COMPLETO SOI
 *
 * 1. Dashboard → Click en imagen pagar.png (botón $)
 * 2. Página detalle → Scroll → Click en imagen PSE
 * 3. Formulario PSE → Llenar datos ULE
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const ULE_PSE = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  numeroDocumento: '9020190314',
  email: 'pagos.ule@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function flujoCompleto() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 FLUJO PAGO COMPLETO SOI                               ║');
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
  await ss(page, 'pago-01-dashboard');

  // Buscar y clickear la imagen pagar.png
  console.log('   Buscando imagen pagar.png...');

  const pagarImg = await page.$('img[src*="pagar.png"]');

  if (pagarImg) {
    console.log('   ✅ Encontrada imagen pagar.png');

    // Click y esperar navegación
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      pagarImg.click(),
    ]);

    console.log('   ✅ Navegación completada\n');
  } else {
    console.log('   ❌ No se encontró imagen pagar.png');
    // Intentar buscar por onclick
    const result = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[onclick*="inicioPagoPlanillas"]');
      if (imgs.length > 0) {
        (imgs[0] as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (result) {
      await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
      console.log('   ✅ Click por onclick\n');
    }
  }

  await page.waitForTimeout(2000);
  await ss(page, 'pago-02-detalle-planilla');

  // Verificar que estamos en la página de pago
  const urlActual = page.url();
  console.log(`   URL actual: ${urlActual}`);

  const pageInfo = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      tieneTotal: body.includes('TOTAL POR PAGAR'),
      tienePSE: body.includes('PSE') || body.includes('Pago PSE'),
      total: body.match(/TOTAL POR PAGAR[:\s]*\$?\s*([\d.,]+)/i)?.[1] || 'No detectado',
    };
  });

  console.log(`   Tiene TOTAL: ${pageInfo.tieneTotal}`);
  console.log(`   Tiene PSE: ${pageInfo.tienePSE}`);
  console.log(`   Total a pagar: ${pageInfo.total}\n`);

  if (!pageInfo.tienePSE) {
    console.log('⚠️ No se detectó opción PSE. Verificar página...');
    await page.waitForTimeout(60000);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Scroll y click en PSE
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 2: Click en botón PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Scroll al final
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await ss(page, 'pago-03-seccion-pse');

  // Buscar y clickear el logo/botón de PSE
  console.log('   Buscando imagen PSE...');

  const pseImg = await page.$('img[src*="pse"], img[alt*="pse"], img[alt*="PSE"]');

  if (pseImg) {
    console.log('   ✅ Encontrada imagen PSE');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      pseImg.click(),
    ]);

    console.log('   ✅ Click en PSE completado\n');
  } else {
    // Buscar por onclick o href
    const pseClick = await page.evaluate(() => {
      // Buscar imagen con src que contenga pse
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = (img as HTMLImageElement).src?.toLowerCase() || '';
        if (src.includes('pse')) {
          const parent = img.closest('a') || img;
          (parent as HTMLElement).click();
          return { clicked: true, type: 'img' };
        }
      }

      // Buscar link con texto "Pago PSE"
      const links = document.querySelectorAll('a, [onclick]');
      for (const link of links) {
        const text = (link as HTMLElement).innerText?.toLowerCase() || '';
        const onclick = link.getAttribute('onclick')?.toLowerCase() || '';
        if (text.includes('pago pse') || onclick.includes('pse')) {
          (link as HTMLElement).click();
          return { clicked: true, type: 'link' };
        }
      }

      return { clicked: false };
    });

    console.log('   Resultado PSE:', JSON.stringify(pseClick));
  }

  await page.waitForTimeout(3000);
  await ss(page, 'pago-04-formulario-pse');

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Llenar formulario PSE
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Llenar formulario PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  const enFormPSE = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('tipo de persona') ||
           text.includes('entidad financiera') ||
           text.includes('número de documento');
  });

  if (enFormPSE) {
    console.log('   ✅ En formulario PSE. Llenando datos ULE...\n');

    // Llenar campos del formulario
    const campos = await page.evaluate((ule) => {
      const log: string[] = [];

      // Selects
      document.querySelectorAll('select').forEach(sel => {
        const name = (sel.name || sel.id || '').toLowerCase();
        const label = sel.closest('tr, div')?.textContent?.toLowerCase() || '';

        // Tipo de Persona
        if (name.includes('persona') || label.includes('tipo de persona')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('jurídica') || o.text.toLowerCase().includes('juridica')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Tipo Persona: ${opt.text}`);
          }
        }

        // Tipo Documento
        if (name.includes('documento') || label.includes('tipo de documento') || label.includes('tipo documento')) {
          const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Tipo Doc: ${opt.text}`);
          }
        }

        // Banco
        if (name.includes('banco') || name.includes('entidad') || label.includes('banco') || label.includes('entidad financiera')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('bancolombia')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Banco: ${opt.text}`);
          }
        }
      });

      // Inputs
      document.querySelectorAll('input').forEach(inp => {
        const name = (inp.name || inp.id || '').toLowerCase();
        const label = inp.closest('tr, div')?.textContent?.toLowerCase() || '';

        // Número de documento
        if (name.includes('numero') || name.includes('document') || label.includes('número de documento')) {
          inp.value = ule.numeroDocumento;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          log.push(`✓ Número Doc: ${ule.numeroDocumento}`);
        }

        // Email
        if (name.includes('email') || name.includes('correo') || inp.type === 'email') {
          inp.value = ule.email;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          log.push(`✓ Email: ${ule.email}`);
        }
      });

      return log;
    }, ULE_PSE);

    campos.forEach(c => console.log(`   ${c}`));

    await page.waitForTimeout(1000);
    await ss(page, 'pago-05-formulario-lleno');

    // Mostrar botones disponibles
    const botones = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"]');
      return Array.from(btns).map(b =>
        (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || ''
      ).filter(t => t.length > 0);
    });

    console.log(`\n   Botones disponibles: ${botones.join(' | ')}`);
    console.log('\n   ⚠️ NO SE HARÁ CLICK EN PAGAR (prueba solo hasta aquí)');
  } else {
    console.log('   ⚠️ No parece ser formulario PSE estándar');
  }

  // Resumen final
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN FINAL                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const urlFinal = page.url();
  console.log(`   URL final: ${urlFinal}`);
  console.log('   📸 Screenshots en ./screenshots/pago-*.png');
  console.log('\n   ⏳ Esperando 60 segundos para revisar...\n');

  await page.waitForTimeout(60000);
  console.log('✅ Script finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoCompleto().catch(console.error);
