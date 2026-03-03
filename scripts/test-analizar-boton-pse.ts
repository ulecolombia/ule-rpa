/**
 * Script para analizar la estructura del botón "Ir al Banco" en PSE
 * y luego clickearlo correctamente
 */

import puppeteer from 'puppeteer';

async function analizarYClickear() {
  console.log('🔍 Buscando browser Chrome con página PSE...\n');

  // Conectar a Chrome existente (el que tiene la página PSE abierta)
  // En Mac, Chrome debug port suele ser 9222
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
    });

    const pages = await browser.pages();
    console.log(`📄 Páginas abiertas: ${pages.length}`);

    // Buscar la página PSE
    let psePage = null;
    for (const p of pages) {
      const url = p.url();
      console.log(`   - ${url}`);
      if (url.includes('pse.com.co')) {
        psePage = p;
        break;
      }
    }

    if (!psePage) {
      console.log('\n❌ No se encontró página PSE');
      return;
    }

    console.log(`\n✅ Encontrada página PSE: ${psePage.url()}\n`);

    // Analizar la estructura
    const analysis = await psePage.evaluate(() => {
      const result: any = {
        buttons: [],
        inputs: [],
        forms: [],
        allClickables: [],
      };

      // Buscar todos los botones
      document.querySelectorAll('button').forEach((btn, i) => {
        result.buttons.push({
          index: i,
          tag: 'button',
          text: btn.innerText.trim(),
          class: btn.className,
          id: btn.id,
          disabled: btn.disabled,
          type: btn.type,
          outerHTML: btn.outerHTML.substring(0, 200),
        });
      });

      // Buscar inputs submit
      document.querySelectorAll('input[type="submit"], input[type="button"]').forEach((inp, i) => {
        const input = inp as HTMLInputElement;
        result.inputs.push({
          index: i,
          tag: 'input',
          value: input.value,
          class: input.className,
          id: input.id,
          disabled: input.disabled,
          type: input.type,
          outerHTML: input.outerHTML.substring(0, 200),
        });
      });

      // Buscar links que parezcan botones
      document.querySelectorAll('a').forEach((a, i) => {
        const text = a.innerText.trim().toLowerCase();
        if (text.includes('banco') || text.includes('continuar') || text.includes('pagar')) {
          result.allClickables.push({
            index: i,
            tag: 'a',
            text: a.innerText.trim(),
            class: a.className,
            id: a.id,
            href: a.href,
            outerHTML: a.outerHTML.substring(0, 200),
          });
        }
      });

      // Buscar por texto "Ir al Banco"
      const xpath = "//button[contains(., 'Ir al Banco')] | //a[contains(., 'Ir al Banco')] | //input[contains(@value, 'Ir al Banco')]";
      const xpathResult = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      result.xpathMatches = [];
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        const node = xpathResult.snapshotItem(i) as HTMLElement;
        result.xpathMatches.push({
          tag: node.tagName,
          text: node.innerText?.trim() || (node as any).value,
          class: node.className,
          id: node.id,
        });
      }

      return result;
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    ANÁLISIS DE BOTONES');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📋 BOTONES (<button>):');
    analysis.buttons.forEach((btn: any) => {
      console.log(`   ${btn.index}. "${btn.text}" class="${btn.class}" id="${btn.id}" type="${btn.type}"`);
      console.log(`      HTML: ${btn.outerHTML.substring(0, 100)}...`);
    });

    console.log('\n📋 INPUTS (submit/button):');
    analysis.inputs.forEach((inp: any) => {
      console.log(`   ${inp.index}. value="${inp.value}" class="${inp.class}" id="${inp.id}"`);
    });

    console.log('\n📋 LINKS clickeables:');
    analysis.allClickables.forEach((a: any) => {
      console.log(`   ${a.index}. "${a.text}" class="${a.class}" href="${a.href}"`);
    });

    console.log('\n📋 XPath matches para "Ir al Banco":');
    analysis.xpathMatches.forEach((m: any) => {
      console.log(`   <${m.tag}> "${m.text}" class="${m.class}" id="${m.id}"`);
    });

    // Ahora intentar clickear
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    INTENTANDO CLICK');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Encontrar el botón por el análisis
    const irAlBancoBtn = analysis.buttons.find((b: any) => b.text.toLowerCase().includes('ir al banco'));

    if (irAlBancoBtn) {
      console.log(`✅ Encontrado botón: "${irAlBancoBtn.text}"`);
      console.log(`   Clase: ${irAlBancoBtn.class}`);
      console.log(`   ID: ${irAlBancoBtn.id}`);

      // Intentar click con diferentes métodos
      console.log('\n🖱️ Método 1: click() directo...');
      const clicked = await psePage.evaluate((btnClass: string) => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.innerText.toLowerCase().includes('ir al banco')) {
            // Scroll into view
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Click
            btn.click();
            return true;
          }
        }
        return false;
      }, irAlBancoBtn.class);

      if (clicked) {
        console.log('   ✅ Click ejecutado');
      }

      // Esperar un poco
      await psePage.waitForTimeout(2000);

      // Verificar si cambió la URL
      const newUrl = psePage.url();
      console.log(`\n📍 URL después del click: ${newUrl}`);

      if (!newUrl.includes('pse.com.co') || newUrl.includes('bancolombia')) {
        console.log('🏦 ¡Navegación exitosa!');
      } else {
        console.log('⚠️ La URL no cambió, intentando método alternativo...');

        // Método 2: Simular click con eventos
        await psePage.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.innerText.toLowerCase().includes('ir al banco')) {
              // Dispatch mouse events
              const rect = btn.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;

              btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: centerX, clientY: centerY }));
              btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: centerX, clientY: centerY }));
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: centerX, clientY: centerY }));
              return;
            }
          }
        });

        await psePage.waitForTimeout(3000);
        console.log(`📍 URL: ${psePage.url()}`);
      }
    } else {
      console.log('❌ No se encontró botón "Ir al Banco" en el análisis');

      // Intentar click por XPath
      if (analysis.xpathMatches.length > 0) {
        console.log('\n🔄 Intentando con XPath...');
        await psePage.evaluate(() => {
          const xpath = "//button[contains(., 'Ir al Banco')]";
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const btn = result.singleNodeValue as HTMLElement;
          if (btn) btn.click();
        });
        await psePage.waitForTimeout(2000);
        console.log(`📍 URL: ${psePage.url()}`);
      }
    }

    // Screenshot final
    await psePage.screenshot({ path: 'screenshots/pse-analisis-final.png', fullPage: true });
    console.log('\n📸 Screenshot guardado en screenshots/pse-analisis-final.png');

    // Desconectar (no cerrar)
    browser.disconnect();
    console.log('\n✅ Análisis completado');

  } catch (error: any) {
    if (error.message.includes('connect')) {
      console.log('❌ No se pudo conectar a Chrome.');
      console.log('   Asegúrate de que Chrome esté corriendo con debugging habilitado:');
      console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    } else {
      console.error('Error:', error.message);
    }
  }
}

analizarYClickear().catch(console.error);
