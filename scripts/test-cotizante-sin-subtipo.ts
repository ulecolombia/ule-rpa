/**
 * Script para navegar hasta Paso 3 (Seguridad Social)
 * SIN seleccionar subtipo de cotizante (dejarlo en SELECCIONE)
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import type { SOIUserCredentials } from '../src/bots/soi/auth.bot';
import type { Page } from 'puppeteer';

const TEST_CREDENTIALS: SOIUserCredentials = {
  tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
  password: process.env.SOI_PASSWORD || '',
};

async function testSinSubtipo() {
  console.log('========================================');
  console.log('Test: Cotizante SIN SubTipo (dejarlo vacío)');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');
    const browser = page.browser();
    await page.waitForTimeout(2000);

    // Navigate to planilla form
    console.log('2. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(4000);

    // Click Siguiente to go to Paso 2
    console.log('3. Going to Paso 2 of planilla...');
    await page.waitForSelector('#siguiente2', { timeout: 5000 });
    await page.click('#siguiente2');
    await page.waitForTimeout(5000);

    // Capture popup
    console.log('\n4. Opening Agregar Cotizante popup...');

    let popupPage: Page | null = null;
    const popupPromise = new Promise<Page | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 15000);
      browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          clearTimeout(timeout);
          const newPage = await target.page();
          resolve(newPage);
        }
      });
    });

    await page.evaluate(() => {
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
      }
    });

    popupPage = await popupPromise;

    if (!popupPage) {
      await page.waitForTimeout(3000);
      const pages = await browser.pages();
      for (const p of pages) {
        if (p.url().includes('ingresarCotizante')) {
          popupPage = p;
          break;
        }
      }
    }

    if (!popupPage) {
      console.log('   ✗ Popup not found!');
      return;
    }

    console.log('   ✓ Popup captured!');
    await popupPage.waitForTimeout(3000);

    // === PASO 1: Información Básica ===
    console.log('\n5. PASO 1 - Filling form (WITHOUT subtipo)...');

    // Enter document
    await popupPage.waitForSelector('input[name="numeroIdentificacionCotizante"]', { timeout: 5000 });
    await popupPage.type('input[name="numeroIdentificacionCotizante"]', TEST_CREDENTIALS.documento);

    // Trigger BDUA lookup
    await popupPage.evaluate(() => {
      const input = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
      if (input) {
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('   Waiting for BDUA (7 seconds)...');
    await popupPage.waitForTimeout(7000);

    // ONLY select tipo cotizante, NOT subtipo
    const tipoCotizanteValue = await popupPage.evaluate(() => {
      const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      return select?.value || '';
    });

    console.log(`   Tipo Cotizante from BDUA: "${tipoCotizanteValue}"`);

    if (!tipoCotizanteValue) {
      console.log('   Selecting tipo cotizante = 3-INDEPENDIENTE...');
      await popupPage.evaluate(() => {
        const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
        if (select) {
          const options = Array.from(select.options);
          const indepOption = options.find(o => o.value.includes('3'));
          if (indepOption) {
            select.value = indepOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      await popupPage.waitForTimeout(2000);
    }

    // IMPORTANT: Do NOT touch subtipo - leave it as "SELECCIONE"
    console.log('   SubTipo Cotizante: leaving EMPTY (SELECCIONE)');

    // Fill location
    console.log('   Filling location...');
    await popupPage.evaluate(() => {
      const depto = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
      if (depto && !depto.value) {
        const bogOption = Array.from(depto.options).find(o => o.text.toLowerCase().includes('bogota'));
        depto.value = bogOption ? bogOption.value : (depto.options[1]?.value || '');
        depto.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await popupPage.waitForTimeout(1500);

    await popupPage.evaluate(() => {
      const muni = document.querySelector('select[name="municipio"]') as HTMLSelectElement;
      if (muni && muni.options.length > 1) {
        muni.selectedIndex = 1;
        muni.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await popupPage.waitForTimeout(500);

    // Log form state
    const formState = await popupPage.evaluate(() => {
      return {
        tipoCotizante: (document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement)?.value || '',
        subTipoCotizante: (document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement)?.value || '',
        departamento: (document.querySelector('select[name="departamento"]') as HTMLSelectElement)?.value || '',
        municipio: (document.querySelector('select[name="municipio"]') as HTMLSelectElement)?.value || '',
      };
    });

    console.log('\n   Form state:');
    console.log(`      tipoCotizante: "${formState.tipoCotizante}"`);
    console.log(`      subTipoCotizante: "${formState.subTipoCotizante}" (should be empty!)`);
    console.log(`      departamento: "${formState.departamento}"`);
    console.log(`      municipio: "${formState.municipio}"`);

    await popupPage.screenshot({
      path: `screenshots/test-sinsubtipo-paso1_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Click Siguiente
    console.log('\n   Clicking Siguiente (Paso 1 -> Paso 2)...');
    await popupPage.click('input#siguiente2');
    await popupPage.waitForTimeout(4000);

    // Check for errors
    const errors = await popupPage.evaluate(() => {
      const errorDiv = document.querySelector('.mensajeError, .error, [class*="Error"]');
      return errorDiv?.textContent?.trim() || '';
    });

    if (errors) {
      console.log(`   ⚠️ Error: ${errors}`);
      await popupPage.screenshot({
        path: `screenshots/test-sinsubtipo-error_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fullPage: true,
      });
    }

    // Check current step
    const currentStep = await popupPage.evaluate(() => {
      const match = document.body.textContent?.match(/Paso (\d) de 5/);
      return match ? match[1] : '?';
    });
    console.log(`\n   Current step: Paso ${currentStep} de 5`);

    // If we made it to Paso 2, continue to Paso 3
    if (currentStep === '2') {
      console.log('\n6. PASO 2 - Novedades...');
      await popupPage.screenshot({
        path: `screenshots/test-sinsubtipo-paso2_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fullPage: true,
      });

      // Click Siguiente to Paso 3
      console.log('   Clicking Siguiente (Paso 2 -> Paso 3)...');
      await popupPage.evaluate(() => {
        const btns = document.querySelectorAll('input[type="button"]');
        for (const btn of btns) {
          if ((btn as HTMLInputElement).value?.toLowerCase().includes('siguiente')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
      await popupPage.waitForTimeout(4000);

      const stepAfter2 = await popupPage.evaluate(() => {
        const match = document.body.textContent?.match(/Paso (\d) de 5/);
        return match ? match[1] : '?';
      });
      console.log(`   Current step: Paso ${stepAfter2} de 5`);

      if (stepAfter2 === '3') {
        console.log('\n========================================');
        console.log('7. PASO 3 - SEGURIDAD SOCIAL (IBC)');
        console.log('========================================\n');

        await popupPage.screenshot({
          path: `screenshots/test-sinsubtipo-PASO3-IBC_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          fullPage: true,
        });

        // Get all IBC fields
        const ibcFields = await popupPage.evaluate(() => {
          const keywords = ['ibc', 'salario', 'ingreso', 'base', 'cotiza', 'dias', 'días', 'aporte', 'tarifa', 'salud', 'pension', 'riesgo', 'arl'];
          return Array.from(document.querySelectorAll('input:not([type="hidden"]), select'))
            .filter(el => (el as HTMLElement).offsetParent !== null)
            .map(el => {
              const name = (el as HTMLInputElement).name || '';
              const id = el.id || '';
              const isIBC = keywords.some(k => name.toLowerCase().includes(k) || id.toLowerCase().includes(k));
              return {
                name,
                id,
                value: (el as HTMLInputElement).value || '',
                type: (el as HTMLInputElement).type || el.tagName,
                isIBC,
              };
            })
            .filter(f => f.name || f.id);
        });

        console.log('   ★★★ ALL FIELDS IN PASO 3: ★★★\n');
        ibcFields.forEach((f, i) => {
          const marker = f.isIBC ? '🔹' : '  ';
          console.log(`   ${marker} ${i + 1}. [${f.type}] name="${f.name}" id="${f.id}" value="${f.value}"`);
        });

        // Get labels
        const labels = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('label, th, td'))
            .map(l => l.textContent?.trim() || '')
            .filter(t => t.length > 2 && t.length < 80)
            .filter(t => {
              const lower = t.toLowerCase();
              return lower.includes('ibc') || lower.includes('salario') || lower.includes('cotizaci') ||
                     lower.includes('días') || lower.includes('dias') || lower.includes('aporte') ||
                     lower.includes('salud') || lower.includes('pensión') || lower.includes('pension') ||
                     lower.includes('riesgo') || lower.includes('tarifa');
            })
            .filter((v, i, a) => a.indexOf(v) === i);
        });

        if (labels.length > 0) {
          console.log('\n   ★★★ IBC-RELATED LABELS: ★★★\n');
          labels.forEach((l, i) => console.log(`   ${i + 1}. "${l}"`));
        }
      }
    }

    console.log('\n========================================');
    console.log('✓ COMPLETED');
    console.log('========================================\n');

    console.log('⏳ Popup open for inspection (30 seconds)...');
    await popupPage.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testSinSubtipo();
