/**
 * Buscar todos los elementos con onclick para encontrar el de pago
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

async function findOnclick() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🔍 Buscar elementos onclick de pago                      ║');
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
  await ss(page, 'onclick-01-dashboard');

  // Buscar todos los elementos con onclick que contengan "pago" o "Pago"
  console.log('\n📍 Buscando elementos con onclick relacionados a pago...');

  const onclickElements = await page.evaluate(() => {
    const all = document.querySelectorAll('[onclick]');
    const result: any[] = [];

    all.forEach((el, idx) => {
      const onclick = el.getAttribute('onclick') || '';
      const text = (el as HTMLElement).innerText?.trim() || '';
      const tag = el.tagName;

      // Filtrar solo los relacionados a pago/planilla
      const lower = onclick.toLowerCase();
      if (lower.includes('pago') || lower.includes('planilla') || lower.includes('indice')) {
        result.push({
          idx,
          tag,
          text: text.substring(0, 100),
          onclick: onclick,
        });
      }
    });

    return result;
  });

  console.log(`   Elementos onclick relevantes: ${onclickElements.length}`);
  onclickElements.forEach((el, i) => {
    console.log(`\n   [${i}] <${el.tag}> "${el.text.substring(0, 30)}..."`);
    console.log(`       onclick: ${el.onclick}`);
  });

  // Buscar imágenes con onclick o dentro de links
  console.log('\n\n📍 Buscando imágenes con onclick o dentro de links...');

  const images = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    const result: any[] = [];

    imgs.forEach((img, idx) => {
      const src = (img as HTMLImageElement).src || '';
      const onclick = img.getAttribute('onclick') || '';
      const parent = img.parentElement;
      const parentOnclick = parent?.getAttribute('onclick') || '';
      const parentHref = (parent as HTMLAnchorElement)?.href || '';

      // Filtrar solo las relevantes
      const srcName = src.split('/').pop()?.toLowerCase() || '';
      if (srcName.includes('pago') || srcName.includes('dollar') || srcName.includes('pay') ||
          onclick.includes('Pago') || parentOnclick.includes('Pago') || parentHref.includes('Pago')) {
        result.push({
          idx,
          src: srcName,
          onclick,
          parentTag: parent?.tagName,
          parentOnclick,
          parentHref: parentHref.substring(0, 100),
        });
      }
    });

    return result;
  });

  console.log(`   Imágenes relevantes: ${images.length}`);
  images.forEach((img, i) => {
    console.log(`\n   [${i}] src: ${img.src}`);
    if (img.onclick) console.log(`       onclick: ${img.onclick}`);
    console.log(`       parent: <${img.parentTag}>`);
    if (img.parentOnclick) console.log(`       parent onclick: ${img.parentOnclick}`);
    if (img.parentHref) console.log(`       parent href: ${img.parentHref}`);
  });

  // Si encontramos el elemento de pago, hacer click
  if (onclickElements.length > 0) {
    // Buscar el que contenga "inicioPagoPlanillas"
    const pagoElement = onclickElements.find(el =>
      el.onclick.includes('inicioPagoPlanillas') || el.onclick.includes('inicioPago')
    );

    if (pagoElement) {
      console.log(`\n\n✅ Encontrado elemento de pago! Haciendo click...`);
      console.log(`   onclick: ${pagoElement.onclick}`);

      await page.evaluate((idx) => {
        const all = document.querySelectorAll('[onclick]');
        let counter = 0;
        for (const el of all) {
          const onclick = el.getAttribute('onclick') || '';
          if (onclick.toLowerCase().includes('pago') || onclick.toLowerCase().includes('planilla') || onclick.toLowerCase().includes('indice')) {
            if (counter === idx) {
              (el as HTMLElement).click();
              return;
            }
            counter++;
          }
        }
      }, onclickElements.indexOf(pagoElement));

      await page.waitForTimeout(3000);
      await ss(page, 'onclick-02-despues-click');

      // Verificar estado
      const estado = await page.evaluate(() => ({
        url: window.location.href,
        tienePSE: document.body.innerText.includes('PSE'),
        tieneTOTAL: document.body.innerText.includes('TOTAL POR PAGAR'),
      }));

      console.log(`   URL: ${estado.url}`);
      console.log(`   Tiene PSE: ${estado.tienePSE}`);
      console.log(`   Tiene TOTAL: ${estado.tieneTOTAL}`);
    }
  }

  console.log('\n\n⏳ Esperando 60 segundos para revisar...');
  await page.waitForTimeout(60000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

findOnclick().catch(console.error);
