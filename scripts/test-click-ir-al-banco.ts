/**
 * Script para clickear "Ir al Banco" en página PSE
 * Detecta si hay una sesión abierta y clickea el botón
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

async function clickIrAlBanco() {
  console.log('🔍 Buscando sesión activa de SOI...\n');

  const authBot = getSOIAuthBot();
  const page = authBot.getPage();

  if (!page) {
    console.log('❌ No hay página activa. Ejecuta primero test-soi-pago-hasta-bancolombia.ts');
    return;
  }

  const url = page.url();
  console.log(`📍 URL actual: ${url}\n`);

  // Verificar si estamos en página PSE
  if (url.includes('pse.com.co')) {
    console.log('✅ Estamos en página PSE\n');

    // Analizar la página para encontrar el botón
    const pageInfo = await page.evaluate(() => {
      const allButtons = document.querySelectorAll('button, input[type="submit"], a');
      const buttons: { tag: string; text: string; class: string; id: string; href?: string }[] = [];

      allButtons.forEach((btn) => {
        const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '';
        buttons.push({
          tag: btn.tagName,
          text: text.trim().substring(0, 50),
          class: btn.className,
          id: btn.id,
          href: (btn as HTMLAnchorElement).href || undefined,
        });
      });

      return {
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500),
        buttons,
      };
    });

    console.log('📋 Botones encontrados:');
    pageInfo.buttons.forEach((btn, i) => {
      console.log(`   ${i + 1}. <${btn.tag}> "${btn.text}" class="${btn.class}" id="${btn.id}"`);
    });

    console.log('\n🖱️ Intentando click en "Ir al Banco"...\n');

    // Método 1: Buscar por texto exacto
    const clicked = await page.evaluate(() => {
      // Buscar todos los elementos clickeables
      const elements = document.querySelectorAll('button, input[type="submit"], a, span, div[role="button"]');

      for (const el of elements) {
        const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || '').toLowerCase().trim();

        // Buscar "ir al banco"
        if (text.includes('ir al banco')) {
          console.log('Encontrado:', text);
          (el as HTMLElement).click();
          return { found: true, text, tag: el.tagName };
        }
      }

      // Fallback: buscar botón naranja/amarillo (estilo PSE)
      const orangeButtons = document.querySelectorAll('[style*="background"], [class*="btn"], [class*="button"]');
      for (const btn of orangeButtons) {
        const text = ((btn as HTMLElement).innerText || '').toLowerCase().trim();
        if (text.includes('banco')) {
          (btn as HTMLElement).click();
          return { found: true, text, tag: btn.tagName, method: 'style' };
        }
      }

      return { found: false };
    });

    if (clicked.found) {
      console.log(`✅ Click exitoso en: ${clicked.text} (${clicked.tag})`);

      // Esperar navegación
      console.log('\n⏳ Esperando navegación a Bancolombia...');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch((e) => {
        console.log('   Timeout en navegación:', e.message);
      });

      await page.waitForTimeout(3000);

      const newUrl = page.url();
      console.log(`\n📍 Nueva URL: ${newUrl}`);

      if (newUrl.includes('bancolombia')) {
        console.log('🏦 ¡Llegamos a BANCOLOMBIA!');
      }

      await page.screenshot({ path: 'screenshots/click-ir-banco-result.png', fullPage: true });
      console.log('📸 Screenshot guardado');
    } else {
      console.log('❌ No se encontró el botón "Ir al Banco"');

      // Intentar con selector CSS específico de PSE
      console.log('\n🔄 Intentando con selectores alternativos...');

      // El botón en PSE suele tener un estilo específico
      const altClick = await page.evaluate(() => {
        // Buscar en spans dentro de botones
        const spans = document.querySelectorAll('button span, a span');
        for (const span of spans) {
          if ((span as HTMLElement).innerText.toLowerCase().includes('banco')) {
            (span.closest('button') || span.closest('a') || span as HTMLElement).click();
            return true;
          }
        }

        // Buscar input submit
        const submits = document.querySelectorAll('input[type="submit"]');
        for (const sub of submits) {
          if ((sub as HTMLInputElement).value.toLowerCase().includes('banco')) {
            (sub as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (altClick) {
        console.log('✅ Click alternativo exitoso');
        await page.waitForTimeout(5000);
        console.log(`📍 URL: ${page.url()}`);
      }
    }
  } else {
    console.log('❌ No estamos en página PSE');
    console.log('   Navega manualmente a la página PSE primero');
  }

  console.log('\n✅ Script finalizado');
}

clickIrAlBanco().catch(console.error);
