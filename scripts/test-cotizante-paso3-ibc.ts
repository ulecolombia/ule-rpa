/**
 * Test: Navegar al Paso 3 "Seguridad Social" para ver campos IBC
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import type { SOIUserCredentials } from '../src/bots/soi/auth.bot';

const TEST_CREDENTIALS: SOIUserCredentials = {
  tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
  password: process.env.SOI_PASSWORD || '',
};

async function testCotizantePaso3() {
  console.log('========================================');
  console.log('TEST: Navegar a Paso 3 - Seguridad Social');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');
    const browserManager = (authBot as any).browserManager;
    await page.waitForTimeout(1500);

    // Navigate to planilla form
    console.log('2. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(3000);

    // Get CSRF and go to Step 2
    console.log('3. Going to Step 2 of planilla...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);

    // Get CSRF token
    const csrfToken = await page.evaluate(() => {
      const csrfInput = document.getElementById('csrfPreventionSalt') as HTMLInputElement;
      return csrfInput?.value || '';
    });

    // Navigate to ingresarCotizante
    console.log('4. Navigating to ingresarCotizante...');
    const targetUrl = `https://servicio.nuevosoi.com.co/soi/ingresarCotizante.do?csrfPreventionSalt=${csrfToken}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    await browserManager?.takeScreenshot(page, 'test-ibc-paso1');

    // Fill Paso 1 - Información Básica
    console.log('\n5. Filling Paso 1 - Información Básica...');

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Wait for the input field and type
    await page.waitForSelector('input[name="numeroIdentificacionCotizante"]', { timeout: 10000 });
    await page.type('input[name="numeroIdentificacionCotizante"]', TEST_CREDENTIALS.documento);
    console.log('   ✓ Documento filled');

    // Wait and check if BDUA auto-fills data
    await page.waitForTimeout(2000);

    // Check if names were auto-filled
    const autoFilled = await page.evaluate(() => {
      const nombre = (document.getElementById('primerNombreCotizante') as HTMLInputElement)?.value;
      return nombre ? true : false;
    });

    if (!autoFilled) {
      // Fill names manually (for testing)
      await page.type('input[name="primerNombreCotizante"]', 'CAMILO');
      await page.type('input[name="segundoNombreCotizante"]', 'ANDRES');
      await page.type('input[name="primerApellidoCotizante"]', 'TORRES');
      await page.type('input[name="segundoApellidoCotizante"]', 'SANDOVAL');
      console.log('   ✓ Names filled manually');
    } else {
      console.log('   ✓ Names auto-filled from BDUA');
    }

    // Tipo Cotizante - Select "Independiente"
    console.log('   Selecting Tipo Cotizante...');
    await page.select('select[name="tipoCotizante"]', '1');  // Usually 1 = Independiente
    await page.waitForTimeout(1000);

    // Try different values if 1 doesn't work
    const tipoCotizanteValue = await page.evaluate(() => {
      const select = document.getElementById('tipoCotizante') as HTMLSelectElement;
      return select?.value || '';
    });

    if (!tipoCotizanteValue || tipoCotizanteValue === '') {
      // Try to find "Independiente" option
      await page.evaluate(() => {
        const select = document.getElementById('tipoCotizante') as HTMLSelectElement;
        const options = Array.from(select.options);
        const indepOption = options.find(o =>
          o.text.toLowerCase().includes('independiente') ||
          o.text.includes('02') ||
          o.text.includes('03')
        );
        if (indepOption) {
          select.value = indepOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
    await page.waitForTimeout(1000);
    console.log('   ✓ Tipo Cotizante selected');

    // SubTipo Cotizante
    await page.evaluate(() => {
      const select = document.getElementById('subTipoCotizante') as HTMLSelectElement;
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;  // Select first non-empty option
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    console.log('   ✓ SubTipo selected');

    // Departamento
    await page.evaluate(() => {
      const select = document.getElementById('departamento') as HTMLSelectElement;
      const options = Array.from(select.options);
      const bogotaOption = options.find(o =>
        o.text.toLowerCase().includes('bogota') ||
        o.text.toLowerCase().includes('cundinamarca')
      );
      if (bogotaOption) {
        select.value = bogotaOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1500);
    console.log('   ✓ Departamento selected');

    // Municipio
    await page.evaluate(() => {
      const select = document.getElementById('municipio') as HTMLSelectElement;
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    console.log('   ✓ Municipio selected');

    await browserManager?.takeScreenshot(page, 'test-ibc-paso1-filled');

    // Click Siguiente to go to Paso 2 (Novedades)
    console.log('\n6. Going to Paso 2 - Novedades...');
    await page.click('input[value="Siguiente"]');
    await page.waitForTimeout(3000);

    const paso2Url = page.url();
    console.log(`   URL: ${paso2Url}`);

    await browserManager?.takeScreenshot(page, 'test-ibc-paso2-novedades');

    // Check for errors
    const errors2 = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.error, .alert-danger, .mensaje');
      return Array.from(errorElements).map(e => e.textContent?.trim()).filter(t => t);
    });
    if (errors2.length > 0) {
      console.log(`   ⚠️ Errors: ${errors2.join(', ')}`);
    }

    // Analyze Paso 2 fields
    console.log('\n   Paso 2 fields (Novedades):');
    const paso2Fields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || el.id || '',
        }))
        .slice(0, 15);
    });
    paso2Fields.forEach((f, i) => {
      console.log(`      ${i + 1}. [${f.tag}:${f.type}] ${f.name}`);
    });

    // Click Siguiente to go to Paso 3 (Seguridad Social)
    console.log('\n7. Going to Paso 3 - Seguridad Social...');
    await page.click('input[value="Siguiente"]');
    await page.waitForTimeout(3000);

    const paso3Url = page.url();
    console.log(`   URL: ${paso3Url}`);

    await browserManager?.takeScreenshot(page, 'test-ibc-paso3-seguridad-social');

    // THIS IS THE KEY STEP - Analyze Paso 3 for IBC fields
    console.log('\n8. Analyzing Paso 3 - Seguridad Social (IBC fields)...');

    // Get all form fields
    const paso3Fields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          placeholder: (el as HTMLInputElement).placeholder || '',
          visible: (el as HTMLElement).offsetParent !== null,
        }));
    });

    console.log('   ALL Paso 3 form fields:');
    paso3Fields.filter(f => f.visible).forEach((f, i) => {
      const identifier = f.name || f.id || f.placeholder || 'unnamed';
      console.log(`      ${i + 1}. [${f.tag}:${f.type}] ${identifier}`);
    });

    // Look specifically for IBC fields
    const ibcFields = await page.evaluate(() => {
      const keywords = ['ibc', 'salario', 'ingreso', 'dias', 'días', 'cotizado', 'tarifa', 'aporte'];
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs
        .filter(el => {
          const name = (el as HTMLInputElement).name?.toLowerCase() || '';
          const id = el.id?.toLowerCase() || '';
          return keywords.some(k => name.includes(k) || id.includes(k));
        })
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          visible: (el as HTMLElement).offsetParent !== null,
        }));
    });

    if (ibcFields.length > 0) {
      console.log('\n   ✓ IBC-RELATED FIELDS FOUND:');
      ibcFields.forEach((f, i) => {
        const visStr = f.visible ? '✓' : '✗';
        console.log(`      ${i + 1}. [${visStr}] [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
      });
    } else {
      console.log('   → No IBC fields found by keyword search');
    }

    // Get all labels
    console.log('\n   Labels on Paso 3:');
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td, span'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 60)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 35);
    });

    labels.forEach((l, i) => {
      console.log(`      ${i + 1}. "${l}"`);
    });

    console.log('\n========================================');
    console.log('✓ ANALYSIS COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (30 seconds)...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    const page = authBot.getPage();
    const browserManager = (authBot as any).browserManager;
    if (page && browserManager) {
      await browserManager.takeScreenshot(page, 'test-ibc-error');
    }
  } finally {
    await authBot.close();
  }
}

testCotizantePaso3();
