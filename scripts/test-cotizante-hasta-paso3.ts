/**
 * Script para navegar hasta Paso 3 (Seguridad Social) del popup de cotizante
 * y documentar los campos IBC
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

async function testCotizanteHastaPaso3() {
  console.log('========================================');
  console.log('Navegar hasta Paso 3 - Seguridad Social (IBC)');
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
    console.log('\n5. PASO 1 - Información Básica...');

    // Enter document and wait for BDUA
    await popupPage.waitForSelector('input[name="numeroIdentificacionCotizante"]', { timeout: 5000 });
    await popupPage.type('input[name="numeroIdentificacionCotizante"]', TEST_CREDENTIALS.documento);

    await popupPage.evaluate(() => {
      const input = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
      if (input) {
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('   Waiting for BDUA autocomplete...');
    await popupPage.waitForTimeout(5000);

    // Check what BDUA filled
    const bduaData = await popupPage.evaluate(() => {
      return {
        primerNombre: (document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement)?.value || '',
        tipoCotizante: (document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement)?.value || '',
        subTipoCotizante: (document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement)?.value || '',
      };
    });

    console.log(`   BDUA Data: Nombre="${bduaData.primerNombre}", Tipo="${bduaData.tipoCotizante}", SubTipo="${bduaData.subTipoCotizante}"`);

    // Fill location if needed
    await popupPage.evaluate(() => {
      const depto = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
      if (depto && !depto.value && depto.options.length > 1) {
        const bogOption = Array.from(depto.options).find(o => o.text.toLowerCase().includes('bogota'));
        depto.value = bogOption ? bogOption.value : depto.options[1].value;
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

    await popupPage.waitForTimeout(1000);

    await popupPage.screenshot({
      path: `screenshots/test-paso3-paso1-filled_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Click Siguiente to Paso 2
    console.log('   Clicking Siguiente...');
    await popupPage.click('input[value="Siguiente"]');
    await popupPage.waitForTimeout(4000);

    // Check for errors in Paso 1
    const paso1Errors = await popupPage.evaluate(() => {
      const errors = document.querySelectorAll('.error, .alert, [class*="error"]');
      return Array.from(errors).map(e => e.textContent?.trim()).filter(t => t);
    });

    if (paso1Errors.length > 0) {
      console.log(`   ⚠️ Errors in Paso 1: ${paso1Errors.join(', ')}`);
      await popupPage.screenshot({
        path: `screenshots/test-paso3-paso1-error_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fullPage: true,
      });
      return;
    }

    // === PASO 2: Novedades ===
    console.log('\n6. PASO 2 - Novedades...');

    await popupPage.screenshot({
      path: `screenshots/test-paso3-paso2_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Check current step
    const currentStep = await popupPage.evaluate(() => {
      const stepIndicator = document.body.textContent?.match(/Paso (\d) de 5/);
      return stepIndicator ? stepIndicator[1] : 'unknown';
    });
    console.log(`   Current step: ${currentStep}`);

    // Get novedades fields
    const novedadesFields = await popupPage.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          value: (el as HTMLInputElement).value || '',
        }))
        .filter(f => f.name && !f.name.includes('csrf'));
    });

    console.log('   Novedades fields:');
    novedadesFields.slice(0, 15).forEach((f, i) => {
      console.log(`      ${i + 1}. [${f.tag}] name="${f.name}" value="${f.value}"`);
    });

    // Click Siguiente to Paso 3
    console.log('   Clicking Siguiente...');
    const clickedPaso2 = await popupPage.evaluate(() => {
      // Find siguiente button for paso 2
      const btns = document.querySelectorAll('input[type="button"], input[type="submit"]');
      for (const btn of btns) {
        const val = (btn as HTMLInputElement).value?.toLowerCase();
        if (val?.includes('siguiente')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clickedPaso2) {
      console.log('   ✗ Could not find Siguiente button in Paso 2');
      return;
    }

    await popupPage.waitForTimeout(4000);

    // Check for errors in Paso 2
    const paso2Errors = await popupPage.evaluate(() => {
      const errors = document.querySelectorAll('.error, .alert, [class*="error"]');
      return Array.from(errors).map(e => e.textContent?.trim()).filter(t => t);
    });

    if (paso2Errors.length > 0) {
      console.log(`   ⚠️ Errors in Paso 2: ${paso2Errors.join(', ')}`);
    }

    // === PASO 3: Seguridad Social (IBC) ===
    console.log('\n========================================');
    console.log('7. PASO 3 - SEGURIDAD SOCIAL (IBC)');
    console.log('========================================\n');

    await popupPage.screenshot({
      path: `screenshots/test-paso3-SEGURIDAD-SOCIAL_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      fullPage: true,
    });

    // Verify we're on Paso 3
    const paso3Check = await popupPage.evaluate(() => {
      const stepIndicator = document.body.textContent?.match(/Paso (\d) de 5/);
      return stepIndicator ? stepIndicator[1] : 'unknown';
    });
    console.log(`   Current step: Paso ${paso3Check} de 5`);

    // Get ALL visible fields
    const ibcFields = await popupPage.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          value: (el as HTMLInputElement).value || '',
          className: el.className || '',
        }))
        .filter(f => f.name || f.id);
    });

    console.log('   ★★★ CAMPOS IBC ENCONTRADOS: ★★★\n');
    ibcFields.forEach((f, i) => {
      console.log(`   ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}" value="${f.value}"`);
    });

    // Get all labels for IBC fields
    const ibcLabels = await popupPage.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, span, td'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 100)
        .filter(t =>
          t.toLowerCase().includes('ibc') ||
          t.toLowerCase().includes('salario') ||
          t.toLowerCase().includes('cotización') ||
          t.toLowerCase().includes('cotizacion') ||
          t.toLowerCase().includes('días') ||
          t.toLowerCase().includes('dias') ||
          t.toLowerCase().includes('aporte') ||
          t.toLowerCase().includes('salud') ||
          t.toLowerCase().includes('pensión') ||
          t.toLowerCase().includes('pension') ||
          t.toLowerCase().includes('riesgos') ||
          t.toLowerCase().includes('ingreso')
        )
        .filter((v, i, a) => a.indexOf(v) === i);
    });

    console.log('\n   ★★★ LABELS RELACIONADOS CON IBC: ★★★\n');
    ibcLabels.forEach((l, i) => {
      console.log(`   ${i + 1}. "${l}"`);
    });

    // Get the specific IBC input fields
    const specificIBCFields = await popupPage.evaluate(() => {
      const fieldNames = [
        'salarioBasico', 'salarioBasicoCotizante', 'ibc', 'ibcSalud', 'ibcPension',
        'diasCotizados', 'diasCotizadosSalud', 'diasCotizadosPension',
        'aporteSalud', 'aportePension', 'aporteRiesgos', 'aporteARL',
        'ingresoCotizacion', 'basesCotizacion', 'valorAporte', 'tarifa'
      ];

      return fieldNames.map(name => {
        const byName = document.querySelector(`[name*="${name}"]`) as HTMLInputElement;
        const byId = document.querySelector(`[id*="${name}"]`) as HTMLInputElement;
        const el = byName || byId;
        if (el) {
          return {
            name: el.name || '',
            id: el.id || '',
            value: el.value || '',
            type: el.type || el.tagName,
            found: true,
          };
        }
        return { name, found: false };
      }).filter(f => f.found);
    });

    if (specificIBCFields.length > 0) {
      console.log('\n   ★★★ CAMPOS IBC ESPECÍFICOS: ★★★\n');
      specificIBCFields.forEach((f, i) => {
        console.log(`   ${i + 1}. name="${f.name}" id="${f.id}" value="${f.value}" type="${f.type}"`);
      });
    }

    // Get page HTML structure around IBC fields
    const ibcHtmlSection = await popupPage.evaluate(() => {
      const body = document.body.innerHTML;
      const ibcMatch = body.match(/(?:ibc|ingreso.*base|salario.*coti)/i);
      if (ibcMatch && ibcMatch.index !== undefined) {
        return body.substring(Math.max(0, ibcMatch.index - 200), ibcMatch.index + 500);
      }
      return '';
    });

    if (ibcHtmlSection) {
      console.log('\n   ★★★ HTML CONTEXT AROUND IBC: ★★★\n');
      console.log(ibcHtmlSection.replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ').trim().substring(0, 500));
    }

    console.log('\n========================================');
    console.log('✓ COMPLETED - Check screenshots');
    console.log('========================================\n');

    console.log('⏳ Popup open for inspection (30 seconds)...');
    await popupPage.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  } finally {
    await authBot.close();
  }
}

testCotizanteHastaPaso3();
