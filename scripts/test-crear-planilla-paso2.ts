/**
 * Test: Explorar Paso 2 del formulario de planilla
 *
 * 1. Login como usuario
 * 2. Navegar a crear planilla
 * 3. Avanzar al paso 2 (Información Detallada)
 * 4. Analizar campos de IBC, periodo, días
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

async function testPlanillaPaso2() {
  console.log('========================================');
  console.log('TEST: Explorar Paso 2 - Información Detallada');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Step 1: Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    console.log('   ✓ Login successful');

    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');

    const browserManager = (authBot as any).browserManager;
    await page.waitForTimeout(1500);

    // Step 2: Click "Deseo liquidar una planilla"
    console.log('\n2. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(3000);
    console.log('   ✓ Planilla form loaded');

    await browserManager?.takeScreenshot(page, 'test-paso2-step1-initial');

    // Step 3: Fill minimum required fields in Step 1
    console.log('\n3. Analyzing Step 1 required fields...');

    // Check what dropdowns need to be filled
    const step1Fields = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      return selects.map(s => ({
        name: s.name || s.id || 'unnamed',
        value: s.value,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text })).slice(0, 5),
        required: s.required || s.classList.contains('required'),
      }));
    });

    console.log('   SELECT fields:');
    step1Fields.forEach((field, i) => {
      console.log(`      ${i + 1}. ${field.name}: "${field.value}" (${field.options.length} options)`);
    });

    // Look for "Siguiente" or "Continuar" button
    console.log('\n4. Looking for navigation button...');
    const navigationButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
      return btns
        .filter(b => {
          const text = b.textContent?.trim() || (b as HTMLInputElement).value || '';
          return text.toLowerCase().includes('siguiente') ||
                 text.toLowerCase().includes('continuar') ||
                 text.toLowerCase().includes('next');
        })
        .map(b => ({
          text: b.textContent?.trim() || (b as HTMLInputElement).value || '',
          tag: b.tagName,
          id: b.id || '',
          onclick: (b as HTMLElement).getAttribute('onclick') || '',
        }));
    });

    console.log('   Navigation buttons:');
    navigationButtons.forEach((btn, i) => {
      console.log(`      ${i + 1}. [${btn.tag}] "${btn.text}" id="${btn.id}"`);
      if (btn.onclick) console.log(`         onclick: ${btn.onclick.substring(0, 50)}...`);
    });

    // Try to click the navigation button
    if (navigationButtons.length > 0) {
      console.log('\n5. Clicking navigation button to go to Step 2...');

      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
        for (const btn of btns) {
          const text = btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
          if (text.toLowerCase().includes('siguiente') || text.toLowerCase().includes('continuar')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        console.log('   ✓ Clicked navigation button');
        await page.waitForTimeout(3000);
      }
    }

    await browserManager?.takeScreenshot(page, 'test-paso2-after-navigation');

    // Step 6: Analyze Step 2 form
    console.log('\n6. Analyzing Step 2 form (if navigated)...');

    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    // Check for IBC, periodo, dias fields
    const step2Fields = await page.evaluate(() => {
      // Look for all inputs and selects
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));

      // Filter to relevant fields
      const relevantFields = inputs.filter(el => {
        const name = (el as HTMLInputElement).name || el.id || '';
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent || '';
        return name.toLowerCase().includes('ibc') ||
               name.toLowerCase().includes('salario') ||
               name.toLowerCase().includes('periodo') ||
               name.toLowerCase().includes('mes') ||
               name.toLowerCase().includes('año') ||
               name.toLowerCase().includes('annio') ||
               name.toLowerCase().includes('dias') ||
               name.toLowerCase().includes('cotiz') ||
               label.toLowerCase().includes('ibc') ||
               label.toLowerCase().includes('salario') ||
               label.toLowerCase().includes('ingreso');
      });

      return relevantFields.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        value: (el as HTMLInputElement).value || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
      }));
    });

    if (step2Fields.length > 0) {
      console.log('   ✓ Found IBC/Periodo related fields:');
      step2Fields.forEach((field, i) => {
        console.log(`      ${i + 1}. [${field.tag}:${field.type}] name="${field.name}" id="${field.id}" value="${field.value}"`);
      });
    } else {
      console.log('   → No IBC/Periodo fields found, checking all visible fields...');
    }

    // Get ALL visible form fields for analysis
    const allFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        visible: (el as HTMLElement).offsetParent !== null,
      })).filter(f => f.visible);
    });

    console.log('\n   All visible form fields:');
    allFields.slice(0, 20).forEach((field, i) => {
      const identifier = field.name || field.id || field.placeholder || 'unnamed';
      console.log(`      ${i + 1}. [${field.tag}:${field.type}] ${identifier}`);
    });

    // Get all labels
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, .label, th'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 0 && t.length < 50)
        .slice(0, 20);
    });

    console.log('\n   Labels on page:');
    labels.forEach((label, i) => {
      console.log(`      ${i + 1}. "${label}"`);
    });

    await browserManager?.takeScreenshot(page, 'test-paso2-final-analysis');

    console.log('\n========================================');
    console.log('✓ EXPLORATION COMPLETED');
    console.log('========================================');

    // Keep browser open
    console.log('\n⏳ Browser open for inspection (20 seconds)...');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
    console.log('\n✓ Browser closed');
  }
}

testPlanillaPaso2();
