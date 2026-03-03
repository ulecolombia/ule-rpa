/**
 * Test: Navegar directamente a ingresarCotizante.do para ver campos de IBC
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

async function testIngresarCotizanteDirecto() {
  console.log('========================================');
  console.log('TEST: Navegar a ingresarCotizante.do');
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

    // Get CSRF token from current page
    console.log('2. Getting CSRF token...');
    const csrfToken = await page.evaluate(() => {
      const csrfInput = document.getElementById('csrfPreventionSalt') as HTMLInputElement;
      return csrfInput?.value || '';
    });
    console.log(`   CSRF Token: ${csrfToken.substring(0, 20)}...`);

    // Navigate to planilla form first
    console.log('\n3. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(3000);

    // Get new CSRF token
    const csrfToken2 = await page.evaluate(() => {
      const csrfInput = document.getElementById('csrfPreventionSalt') as HTMLInputElement;
      return csrfInput?.value || '';
    });
    console.log(`   New CSRF Token: ${csrfToken2.substring(0, 20)}...`);

    // Click Siguiente to go to Step 2
    console.log('\n4. Going to Step 2...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('input[value="Siguiente"]'));
      if (elements[0]) (elements[0] as HTMLElement).click();
    });
    await page.waitForTimeout(4000);

    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    // Get CSRF token again
    const csrfToken3 = await page.evaluate(() => {
      const csrfInput = document.getElementById('csrfPreventionSalt') as HTMLInputElement;
      return csrfInput?.value || '';
    });

    await browserManager?.takeScreenshot(page, 'test-directo-paso2');

    // Now navigate directly to ingresarCotizante.do
    console.log('\n5. Navigating to ingresarCotizante.do...');
    const targetUrl = `https://servicio.nuevosoi.com.co/soi/ingresarCotizante.do?csrfPreventionSalt=${csrfToken3}`;
    console.log(`   Target URL: ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    const newUrl = page.url();
    console.log(`   Landed URL: ${newUrl}`);

    await browserManager?.takeScreenshot(page, 'test-directo-ingresar-cotizante');

    // Analyze the page
    console.log('\n6. Analyzing page...');

    // Get page title
    const pageTitle = await page.title();
    console.log(`   Page title: ${pageTitle}`);

    // Check for error messages
    const errorMsg = await page.evaluate(() => {
      const errors = document.querySelectorAll('.error, .alert, .mensaje, .warning');
      return Array.from(errors).map(e => e.textContent?.trim()).filter(t => t).slice(0, 5);
    });
    if (errorMsg.length > 0) {
      console.log(`   Errors: ${errorMsg.join(', ')}`);
    }

    // Get all form fields
    console.log('\n7. ALL form fields:');
    const allFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        value: (el as HTMLInputElement).value || '',
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });

    allFields.forEach((f, i) => {
      const identifier = f.name || f.id || f.placeholder || 'unnamed';
      const visStr = f.visible ? '✓' : '✗';
      console.log(`   ${i + 1}. [${visStr}] [${f.tag}:${f.type}] ${identifier} = "${f.value.substring(0, 25)}"`);
    });

    // Look for IBC/salary related
    console.log('\n8. Looking for IBC/Salary fields...');
    const ibcRelated = await page.evaluate(() => {
      const keywords = ['ibc', 'salario', 'ingreso', 'dias', 'días', 'cotizado', 'novedad', 'periodo'];
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
        }));
    });

    if (ibcRelated.length > 0) {
      console.log('   Found IBC-related fields:');
      ibcRelated.forEach((f, i) => {
        console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
      });
    } else {
      console.log('   No IBC fields found by name/id');
    }

    // Get all labels
    console.log('\n9. All labels on page:');
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 60)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 30);
    });

    labels.forEach((l, i) => {
      console.log(`   ${i + 1}. "${l}"`);
    });

    // Get hidden fields (they often contain important data)
    console.log('\n10. Hidden fields:');
    const hiddenFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="hidden"]'));
      return inputs.map(el => ({
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        value: (el as HTMLInputElement).value || '',
      })).slice(0, 20);
    });

    hiddenFields.forEach((f, i) => {
      const identifier = f.name || f.id || 'unnamed';
      console.log(`   ${i + 1}. ${identifier} = "${f.value.substring(0, 30)}"`);
    });

    // Check forms
    console.log('\n11. Forms on page:');
    const forms = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('form')).map(f => ({
        id: f.id || '',
        name: f.name || '',
        action: f.action || '',
        method: f.method || '',
      }));
    });

    forms.forEach((f, i) => {
      console.log(`   ${i + 1}. Form id="${f.id}" name="${f.name}"`);
      console.log(`      action="${f.action.substring(0, 60)}" method="${f.method}"`);
    });

    console.log('\n========================================');
    console.log('✓ ANALYSIS COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (25 seconds)...');
    await page.waitForTimeout(25000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testIngresarCotizanteDirecto();
