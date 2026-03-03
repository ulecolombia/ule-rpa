/**
 * Script FINAL para navegar hasta Paso 3 (Seguridad Social) del popup de cotizante
 * Maneja el caso donde BDUA no llena el tipo cotizante
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

async function fillAndNavigateCotizante() {
  console.log('========================================');
  console.log('PASO 3 FINAL - Seguridad Social (IBC)');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');
    const browserManager = (authBot as any).browserManager;
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
    console.log('\n5. PASO 1 - Filling form completely...');

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

    // Check and fill tipo cotizante if not filled by BDUA
    const tipoCotizanteValue = await popupPage.evaluate(() => {
      const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      return select?.value || '';
    });

    console.log(`   Tipo Cotizante from BDUA: "${tipoCotizanteValue}"`);

    if (!tipoCotizanteValue) {
      console.log('   BDUA did not fill tipo cotizante, selecting manually...');

      // Select tipo cotizante = Independiente (value usually "3" or "3,3")
      await popupPage.evaluate(() => {
        const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
        if (select) {
          const options = Array.from(select.options);
          const indepOption = options.find(o =>
            o.text.toLowerCase().includes('independiente') ||
            o.value.includes('3')
          );
          if (indepOption) {
            select.value = indepOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`   Selected: ${indepOption.text} (${indepOption.value})`);
          }
        }
      });

      await popupPage.waitForTimeout(2000);
    }

    // Check subtipo and fill if needed
    const subTipoCotizanteValue = await popupPage.evaluate(() => {
      const select = document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement;
      return select?.value || '';
    });

    console.log(`   SubTipo Cotizante: "${subTipoCotizanteValue}"`);

    if (!subTipoCotizanteValue) {
      console.log('   Selecting subtipo cotizante...');

      await popupPage.evaluate(() => {
        const select = document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement;
        if (select && select.options.length > 1) {
          // Try to find a reasonable default (usually first non-empty option)
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      });

      await popupPage.waitForTimeout(1000);
    }

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

    // Log current form state
    const formState = await popupPage.evaluate(() => {
      return {
        tipoCotizante: (document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement)?.value || '',
        subTipoCotizante: (document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement)?.value || '',
        departamento: (document.querySelector('select[name="departamento"]') as HTMLSelectElement)?.value || '',
        municipio: (document.querySelector('select[name="municipio"]') as HTMLSelectElement)?.value || '',
        primerNombre: (document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement)?.value || '',
      };
    });

    console.log('   Form state before Siguiente:');
    console.log(`      tipoCotizante: "${formState.tipoCotizante}"`);
    console.log(`      subTipoCotizante: "${formState.subTipoCotizante}"`);
    console.log(`      departamento: "${formState.departamento}"`);
    console.log(`      municipio: "${formState.municipio}"`);
    console.log(`      primerNombre: "${formState.primerNombre}"`);

    await popupPage.screenshot({
      path: `screenshots/test-final-paso1-before_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Click Siguiente to Paso 2
    console.log('\n   Clicking Siguiente (Paso 1 -> Paso 2)...');
    await popupPage.click('input#siguiente2');
    await popupPage.waitForTimeout(4000);

    // Check for errors
    const paso1Errors = await popupPage.evaluate(() => {
      const errors = document.querySelectorAll('.mensajeError, .error, .alert-danger, [class*="error"]');
      return Array.from(errors)
        .map(e => e.textContent?.trim())
        .filter(t => t && t.length > 0);
    });

    if (paso1Errors.length > 0) {
      console.log(`   ⚠️ Validation errors: ${paso1Errors.join(' | ')}`);
      await popupPage.screenshot({
        path: `screenshots/test-final-paso1-error_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fullPage: true,
      });
      // Continue anyway to see what happens
    }

    // Check current step
    const stepAfterPaso1 = await popupPage.evaluate(() => {
      const match = document.body.textContent?.match(/Paso (\d) de 5/);
      return match ? match[1] : '?';
    });
    console.log(`   Current step: Paso ${stepAfterPaso1} de 5`);

    await popupPage.screenshot({
      path: `screenshots/test-final-paso2_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // === PASO 2: Novedades ===
    if (stepAfterPaso1 === '2') {
      console.log('\n6. PASO 2 - Novedades');

      // Get novedades fields
      const novedadesData = await popupPage.evaluate(() => {
        return Array.from(document.querySelectorAll('input:not([type="hidden"]), select'))
          .filter(el => (el as HTMLElement).offsetParent !== null)
          .map(el => ({
            name: (el as HTMLInputElement).name || '',
            value: (el as HTMLInputElement).value || '',
          }))
          .filter(f => f.name && !f.name.includes('csrf'))
          .slice(0, 10);
      });

      console.log('   Novedades fields:');
      novedadesData.forEach(f => console.log(`      ${f.name}: "${f.value}"`));

      // Click Siguiente to Paso 3
      console.log('\n   Clicking Siguiente (Paso 2 -> Paso 3)...');
      await popupPage.evaluate(() => {
        const btns = document.querySelectorAll('input[type="button"], input[type="submit"]');
        for (const btn of btns) {
          if ((btn as HTMLInputElement).value?.toLowerCase().includes('siguiente')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
      await popupPage.waitForTimeout(4000);
    }

    // === PASO 3: Seguridad Social ===
    const stepAfterPaso2 = await popupPage.evaluate(() => {
      const match = document.body.textContent?.match(/Paso (\d) de 5/);
      return match ? match[1] : '?';
    });
    console.log(`   Current step: Paso ${stepAfterPaso2} de 5`);

    console.log('\n========================================');
    console.log('7. PASO 3 - SEGURIDAD SOCIAL (IBC)');
    console.log('========================================\n');

    await popupPage.screenshot({
      path: `screenshots/test-final-PASO3-IBC_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Get ALL form fields in current step
    const allFields = await popupPage.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          value: (el as HTMLInputElement).value || '',
        }))
        .filter(f => f.name || f.id);
    });

    console.log('   ★★★ ALL VISIBLE FIELDS: ★★★\n');
    allFields.forEach((f, i) => {
      console.log(`   ${i + 1}. [${f.type}] name="${f.name}" id="${f.id}" value="${f.value}"`);
    });

    // Specifically search for IBC-related fields
    const ibcRelatedFields = await popupPage.evaluate(() => {
      const keywords = ['ibc', 'salario', 'ingreso', 'base', 'cotiza', 'dias', 'días', 'aporte', 'tarifa', 'salud', 'pension', 'riesgo', 'arl'];

      return Array.from(document.querySelectorAll('input, select'))
        .map(el => {
          const name = (el as HTMLInputElement).name?.toLowerCase() || '';
          const id = el.id?.toLowerCase() || '';
          const matches = keywords.some(k => name.includes(k) || id.includes(k));
          if (matches) {
            return {
              name: (el as HTMLInputElement).name || '',
              id: el.id || '',
              value: (el as HTMLInputElement).value || '',
              type: (el as HTMLInputElement).type || el.tagName,
            };
          }
          return null;
        })
        .filter(f => f !== null);
    });

    if (ibcRelatedFields.length > 0) {
      console.log('\n   ★★★ IBC-RELATED FIELDS FOUND: ★★★\n');
      ibcRelatedFields.forEach((f, i) => {
        console.log(`   ${i + 1}. [${f!.type}] name="${f!.name}" id="${f!.id}" value="${f!.value}"`);
      });
    }

    // Get all labels
    const allLabels = await popupPage.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td.label, span.label'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 80)
        .filter((v, i, a) => a.indexOf(v) === i);
    });

    console.log('\n   ★★★ LABELS ON PAGE: ★★★\n');
    allLabels.forEach((l, i) => {
      console.log(`   ${i + 1}. "${l}"`);
    });

    console.log('\n========================================');
    console.log('✓ ANALYSIS COMPLETED');
    console.log('========================================\n');

    console.log('⏳ Popup open for inspection (30 seconds)...');
    await popupPage.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  } finally {
    await authBot.close();
  }
}

fillAndNavigateCotizante();
