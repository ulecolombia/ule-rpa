/**
 * Solución: Agregar cotizante usando autocomplete de BDUA
 * 1. Click "Agregar cotizante" (abre popup)
 * 2. Ingresar documento y esperar que BDUA autocomplete
 * 3. Navegar hasta Paso 3 para ver IBC
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import type { SOIUserCredentials } from '../src/bots/soi/auth.bot';
import type { Page, Browser } from 'puppeteer';

const TEST_CREDENTIALS: SOIUserCredentials = {
  tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
  password: process.env.SOI_PASSWORD || '',
};

async function testAgregarCotizanteBDUA() {
  console.log('========================================');
  console.log('SOLUCIÓN: Agregar Cotizante con BDUA Autocomplete');
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
    console.log('3. Going to Paso 2...');
    await page.waitForSelector('#siguiente2', { timeout: 5000 });
    await page.click('#siguiente2');
    await page.waitForTimeout(5000);

    console.log(`   URL: ${page.url()}`);
    await browserManager?.takeScreenshot(page, 'test-bdua-auto-paso2');

    // Setup popup listener BEFORE clicking Agregar cotizante
    console.log('\n4. Setting up popup listener...');

    let popupPage: Page | null = null;

    // Listen for new pages/targets
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

    // Click "Agregar cotizante"
    console.log('5. Clicking "Agregar cotizante"...');

    await page.evaluate(() => {
      // Find and click the agregar cotizante element
      const elements = Array.from(document.querySelectorAll('a, span, div, img'));
      for (const el of elements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        const onclick = (el as HTMLElement).getAttribute('onclick') || '';
        if (text.includes('agregar cotizante') || onclick.includes('agregarCotizante')) {
          (el as HTMLElement).click();
          return;
        }
      }
      // Direct function call if available
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
      }
    });

    // Wait for popup
    console.log('   Waiting for popup...');
    popupPage = await popupPromise;

    if (!popupPage) {
      // Try getting it from browser pages
      await page.waitForTimeout(3000);
      const pages = await browser.pages();
      console.log(`   Total pages: ${pages.length}`);
      for (const p of pages) {
        const url = p.url();
        console.log(`      Page: ${url}`);
        if (url.includes('ingresarCotizante') || url.includes('informacionBasica')) {
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

    const popupUrl = popupPage.url();
    console.log(`   Popup URL: ${popupUrl}`);

    // Take screenshot of popup
    await popupPage.screenshot({
      path: `screenshots/test-bdua-auto-popup_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Fill ONLY the document number and wait for BDUA autocomplete
    console.log('\n6. Entering document number (waiting for BDUA autocomplete)...');

    // Type document number
    await popupPage.waitForSelector('input[name="numeroIdentificacionCotizante"]', { timeout: 5000 });
    await popupPage.type('input[name="numeroIdentificacionCotizante"]', TEST_CREDENTIALS.documento);
    console.log(`   Typed: ${TEST_CREDENTIALS.documento}`);

    // Trigger blur/change to initiate BDUA lookup
    await popupPage.evaluate(() => {
      const input = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
      if (input) {
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Wait for BDUA response - names should auto-fill
    console.log('   Waiting for BDUA response (5 seconds)...');
    await popupPage.waitForTimeout(5000);

    await popupPage.screenshot({
      path: `screenshots/test-bdua-auto-after-doc_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Check if names were auto-filled
    const autoFillCheck = await popupPage.evaluate(() => {
      const primerNombre = (document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement)?.value || '';
      const primerApellido = (document.querySelector('input[name="primerApellidoCotizante"]') as HTMLInputElement)?.value || '';
      const tipoCotizante = (document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement)?.value || '';
      const subTipoCotizante = (document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement)?.value || '';

      return {
        primerNombre,
        primerApellido,
        tipoCotizante,
        subTipoCotizante,
        autoFilled: primerNombre.length > 0 || primerApellido.length > 0,
      };
    });

    console.log(`   Auto-filled: ${autoFillCheck.autoFilled}`);
    console.log(`   Primer Nombre: "${autoFillCheck.primerNombre}"`);
    console.log(`   Primer Apellido: "${autoFillCheck.primerApellido}"`);
    console.log(`   Tipo Cotizante: "${autoFillCheck.tipoCotizante}"`);
    console.log(`   SubTipo Cotizante: "${autoFillCheck.subTipoCotizante}"`);

    // If not auto-filled, there might be a "Consultar BDUA" button
    if (!autoFillCheck.autoFilled) {
      console.log('\n   Looking for BDUA lookup button...');

      const bduaButton = await popupPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], a, img'));
        const bduaBtn = buttons.find(b => {
          const text = b.textContent?.toLowerCase() || '';
          const onclick = (b as HTMLElement).getAttribute('onclick')?.toLowerCase() || '';
          const title = (b as HTMLElement).getAttribute('title')?.toLowerCase() || '';
          return text.includes('bdua') || text.includes('consultar') ||
                 onclick.includes('bdua') || onclick.includes('consultar') ||
                 title.includes('bdua') || title.includes('consultar');
        });
        if (bduaBtn) {
          (bduaBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (bduaButton) {
        console.log('   ✓ Clicked BDUA lookup button');
        await popupPage.waitForTimeout(5000);

        await popupPage.screenshot({
          path: `screenshots/test-bdua-auto-after-bdua_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          fullPage: true,
        });
      }
    }

    // Complete required fields if not auto-filled
    console.log('\n7. Completing required fields...');

    await popupPage.evaluate(() => {
      // Fill names if empty
      const fields = [
        { name: 'primerNombreCotizante', value: 'CAMILO' },
        { name: 'segundoNombreCotizante', value: 'ANDRES' },
        { name: 'primerApellidoCotizante', value: 'TORRES' },
        { name: 'segundoApellidoCotizante', value: 'SANDOVAL' },
      ];

      fields.forEach(f => {
        const input = document.querySelector(`input[name="${f.name}"]`) as HTMLInputElement;
        if (input && !input.value) {
          input.value = f.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Select tipo cotizante if empty
      const tipoCzte = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      if (tipoCzte && !tipoCzte.value) {
        // Find independiente option
        const options = Array.from(tipoCzte.options);
        const indepOpt = options.find(o => o.text.toLowerCase().includes('independiente'));
        if (indepOpt) {
          tipoCzte.value = indepOpt.value;
          tipoCzte.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    await popupPage.waitForTimeout(2000);

    // Select subtipo and ubicación
    await popupPage.evaluate(() => {
      // SubTipo - select first available if set by BDUA, otherwise don't touch
      const subTipo = document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement;
      if (subTipo && !subTipo.value && subTipo.options.length > 1) {
        subTipo.selectedIndex = 1;
        subTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Departamento
      const depto = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
      if (depto && !depto.value && depto.options.length > 1) {
        const bogOption = Array.from(depto.options).find(o => o.text.toLowerCase().includes('bogota'));
        depto.value = bogOption ? bogOption.value : depto.options[1].value;
        depto.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await popupPage.waitForTimeout(1500);

    await popupPage.evaluate(() => {
      // Municipio
      const muni = document.querySelector('select[name="municipio"]') as HTMLSelectElement;
      if (muni && muni.options.length > 1) {
        muni.selectedIndex = 1;
        muni.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await popupPage.waitForTimeout(500);

    await popupPage.screenshot({
      path: `screenshots/test-bdua-auto-paso1-filled_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Navigate through steps to find IBC
    console.log('\n8. Navigating to find IBC fields...');

    for (let step = 1; step <= 4; step++) {
      // Check for IBC labels
      const ibcCheck = await popupPage.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        const hasIBC = text.includes('ibc') ||
                      text.includes('ingreso base de cotización') ||
                      (text.includes('salario') && text.includes('cotizado'));
        const hasDias = text.includes('días cotizados') || text.includes('dias cotizados');
        const hasPension = text.includes('cotización pensión') || text.includes('cotizacion pension');
        const hasSalud = text.includes('cotización salud') || text.includes('cotizacion salud');

        return { hasIBC, hasDias, hasPension, hasSalud, foundAny: hasIBC || hasDias || hasPension || hasSalud };
      });

      if (ibcCheck.foundAny) {
        console.log(`\n   ★★★ PASO ${step + 1}: IBC/SEGURIDAD SOCIAL ENCONTRADO! ★★★`);

        // Get all labels
        const labels = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('label, th, td, span'))
            .map(l => l.textContent?.trim() || '')
            .filter(t => t.length > 2 && t.length < 70)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 30);
        });

        console.log('\n   Labels encontrados:');
        labels.forEach((l, i) => console.log(`      ${i + 1}. "${l}"`));

        // Get IBC input fields
        const ibcFields = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('input, select'))
            .map(el => ({
              tag: el.tagName,
              type: (el as HTMLInputElement).type || '',
              name: (el as HTMLInputElement).name || '',
              id: el.id || '',
              value: (el as HTMLInputElement).value || '',
              visible: (el as HTMLElement).offsetParent !== null,
            }))
            .filter(f => f.visible && f.type !== 'hidden');
        });

        console.log('\n   ★★★ CAMPOS VISIBLES (IBC): ★★★');
        ibcFields.forEach((f, i) => {
          console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}" value="${f.value}"`);
        });

        await popupPage.screenshot({
          path: `screenshots/test-bdua-auto-IBC-FOUND_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          fullPage: true,
        });

        break;
      }

      // Click Siguiente
      const clickResult = await popupPage.evaluate(() => {
        const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
        if (btn) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false };
      });

      if (!clickResult.clicked) {
        console.log(`   Step ${step}: No Siguiente button found`);
        break;
      }

      console.log(`   Step ${step}: Clicked Siguiente`);
      await popupPage.waitForTimeout(4000);

      // Check for errors
      const errors = await popupPage.evaluate(() => {
        const errorEls = document.querySelectorAll('.error, .alert, [class*="error"]');
        return Array.from(errorEls).map(e => e.textContent?.trim()).filter(t => t);
      });

      if (errors.length > 0) {
        console.log(`   ⚠️ Errors: ${errors.slice(0, 3).join(', ')}`);

        await popupPage.screenshot({
          path: `screenshots/test-bdua-auto-error-step${step}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          fullPage: true,
        });
      }
    }

    console.log('\n========================================');
    console.log('✓ COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Popup open for inspection (30 seconds)...');
    await popupPage.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testAgregarCotizanteBDUA();
