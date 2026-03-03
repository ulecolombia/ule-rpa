/**
 * Buscar y clickear el link directo de pago (href con inicioPagoPlanillas)
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

async function pagarLinkDirecto() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 Buscar link directo de pago                           ║');
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
  await ss(page, 'link-01-dashboard');

  // Buscar TODOS los links en la página
  console.log('\n📍 Buscando todos los links de la página...');

  const links = await page.evaluate(() => {
    const allLinks = document.querySelectorAll('a');
    const result: any[] = [];

    allLinks.forEach((link, idx) => {
      const href = link.href || '';
      const text = link.innerText?.trim() || '';
      const onclick = link.getAttribute('onclick') || '';

      // Solo mostrar links relevantes (pago, planilla, etc)
      if (href.includes('Pago') || href.includes('pago') || href.includes('planilla') ||
          onclick.includes('Pago') || onclick.includes('pago') ||
          text.includes('$') || text.includes('pagar')) {
        result.push({
          idx,
          href: href.substring(0, 150),
          text: text.substring(0, 50),
          onclick: onclick.substring(0, 100),
        });
      }
    });

    return result;
  });

  console.log(`   Links relevantes encontrados: ${links.length}`);
  links.forEach(l => {
    console.log(`   [${l.idx}] ${l.text || '(sin texto)'}`);
    console.log(`       href: ${l.href}`);
    if (l.onclick) console.log(`       onclick: ${l.onclick}`);
  });

  // Buscar el link específico de inicioPagoPlanillas
  console.log('\n📍 Buscando link "inicioPagoPlanillas" o similar...');

  const clickResult = await page.evaluate(() => {
    const allLinks = document.querySelectorAll('a');

    for (const link of allLinks) {
      const href = link.href || '';

      // Buscar el link de pago de planillas
      if (href.includes('inicioPagoPlanillas') || href.includes('inicioPago')) {
        return {
          success: true,
          href: href,
          text: (link as HTMLElement).innerText?.trim() || '',
        };
      }
    }

    // Buscar por onclick
    for (const link of allLinks) {
      const onclick = link.getAttribute('onclick') || '';
      if (onclick.includes('inicioPago') || onclick.includes('PagoPlanilla')) {
        (link as HTMLElement).click();
        return {
          success: true,
          onclick: onclick,
          clicked: true,
        };
      }
    }

    return { success: false };
  });

  console.log('   Resultado búsqueda:', JSON.stringify(clickResult, null, 2));

  if (clickResult.success && clickResult.href) {
    console.log(`\n📍 Navegando directamente a: ${clickResult.href}`);
    await page.goto(clickResult.href, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(2000);
  }

  await ss(page, 'link-02-despues-navegacion');

  // Verificar estado actual
  const estado = await page.evaluate(() => {
    return {
      url: window.location.href,
      titulo: document.querySelector('h1, h2, legend')?.textContent?.trim(),
      bodyText: document.body.innerText.substring(0, 1000),
    };
  });

  console.log(`\n   URL: ${estado.url}`);
  console.log(`   Título: ${estado.titulo}`);
  console.log(`   Contiene PSE: ${estado.bodyText.includes('PSE')}`);
  console.log(`   Contiene TOTAL: ${estado.bodyText.includes('TOTAL')}`);

  if (estado.bodyText.includes('PSE')) {
    console.log('\n✅ Página con opción PSE encontrada!');

    // Scroll abajo
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await ss(page, 'link-03-seccion-pse');

    // Click en PSE
    const clickPSE = await page.evaluate(() => {
      // Buscar imagen o link de PSE
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        if ((img as HTMLImageElement).src.toLowerCase().includes('pse')) {
          const parent = img.closest('a') || img;
          (parent as HTMLElement).click();
          return { clicked: true, type: 'img' };
        }
      }

      // Buscar texto "Pago PSE"
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if ((el as HTMLElement).innerText?.trim() === 'Pago PSE') {
          const link = el.closest('a') || el.querySelector('a') || el;
          (link as HTMLElement).click();
          return { clicked: true, type: 'text' };
        }
      }

      // Buscar link con href PSE
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.href?.toLowerCase().includes('pse') ||
            link.getAttribute('onclick')?.toLowerCase().includes('pse')) {
          (link as HTMLElement).click();
          return { clicked: true, type: 'link' };
        }
      }

      return { clicked: false };
    });

    console.log('   Click PSE:', JSON.stringify(clickPSE));

    await page.waitForTimeout(3000);
    await ss(page, 'link-04-formulario-pse');

    // Verificar si estamos en formulario PSE
    const enPSE = await page.evaluate(() => {
      const texto = document.body.innerText.toLowerCase();
      return texto.includes('tipo de persona') || texto.includes('entidad financiera');
    });

    if (enPSE) {
      console.log('\n✅ ¡Estamos en el formulario PSE!');
    }
  }

  console.log('\n⏳ Esperando 60 segundos para revisar...');
  await page.waitForTimeout(60000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

pagarLinkDirecto().catch(console.error);
