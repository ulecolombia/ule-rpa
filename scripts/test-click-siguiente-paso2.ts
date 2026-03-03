/**
 * Test: Click "Siguiente" para ver Paso 2
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

async function testClickSiguiente() {
  console.log('========================================');
  console.log('TEST: Click Siguiente -> Ver Paso 2');
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
    console.log('   ✓ On Step 1');

    await browserManager?.takeScreenshot(page, 'test-paso2-before-click');

    // Click on "Siguiente" button (id="siguiente2")
    console.log('\n3. Clicking "Siguiente" (#siguiente2)...');

    const buttonExists = await page.$('#siguiente2');
    if (!buttonExists) {
      console.log('   ❌ Button #siguiente2 not found!');
      return;
    }

    await page.click('#siguiente2');
    console.log('   ✓ Clicked!');

    // Wait for navigation/form update
    await page.waitForTimeout(5000);

    await browserManager?.takeScreenshot(page, 'test-paso2-after-click');

    // Check current URL
    const currentUrl = page.url();
    console.log(`\n4. After click:`);
    console.log(`   URL: ${currentUrl}`);

    // Check for Step 2 indicators
    const pageStatus = await page.evaluate(() => {
      // Check which step is active (by looking at step indicators)
      const steps = document.querySelectorAll('[class*="paso"], [class*="step"], .wizard-step');
      const activeStep = document.querySelector('.active, [class*="current"]');

      // Check for error messages
      const errors = document.querySelectorAll('.error, .alert-danger, [class*="error"]');
      const errorTexts = Array.from(errors).map(e => e.textContent?.trim()).filter(t => t);

      // Check page title/header
      const pageTitle = document.querySelector('h1, h2, .titulo, .title')?.textContent?.trim() || '';

      return {
        stepsFound: steps.length,
        activeStepText: activeStep?.textContent?.trim() || '',
        errors: errorTexts.slice(0, 5),
        pageTitle,
      };
    });

    console.log(`   Steps found: ${pageStatus.stepsFound}`);
    console.log(`   Active step: ${pageStatus.activeStepText || 'unknown'}`);
    console.log(`   Page title: ${pageStatus.pageTitle}`);
    if (pageStatus.errors.length > 0) {
      console.log(`   ⚠️ Errors: ${pageStatus.errors.join(', ')}`);
    }

    // Analyze form fields in Step 2
    console.log('\n5. Analyzing Step 2 form fields...');

    const formFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        value: (el as HTMLInputElement).value || '',
        visible: (el as HTMLElement).offsetParent !== null,
      })).filter(f => f.visible);
    });

    console.log('   Visible form fields:');
    formFields.forEach((f, i) => {
      const identifier = f.name || f.id || f.placeholder || 'unnamed';
      console.log(`      ${i + 1}. [${f.tag}:${f.type}] ${identifier} = "${f.value.substring(0, 20)}"`);
    });

    // Look specifically for IBC, salario, dias fields
    const ibcFields = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const ibcRelated = all.filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        const name = (el as HTMLInputElement).name?.toLowerCase() || '';
        return (text.includes('ibc') || text.includes('salario') || text.includes('ingreso') ||
                text.includes('días') || text.includes('dias') || text.includes('cotizado') ||
                id.includes('ibc') || name.includes('ibc') ||
                id.includes('salario') || name.includes('salario'));
      });

      return ibcRelated
        .filter(el => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'LABEL' || el.tagName === 'TD' || el.tagName === 'TH')
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim().substring(0, 50) || '',
          id: el.id || '',
          name: (el as HTMLInputElement).name || '',
        }))
        .slice(0, 15);
    });

    if (ibcFields.length > 0) {
      console.log('\n   IBC/Salary related fields:');
      ibcFields.forEach((f, i) => {
        console.log(`      ${i + 1}. [${f.tag}] id="${f.id}" name="${f.name}" text="${f.text}"`);
      });
    }

    // Get all labels
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 60)
        .slice(0, 25);
    });

    console.log('\n   Page labels (sample):');
    labels.slice(0, 15).forEach((l, i) => {
      console.log(`      ${i + 1}. "${l}"`);
    });

    await browserManager?.takeScreenshot(page, 'test-paso2-analysis');

    console.log('\n========================================');
    console.log('✓ COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (20 seconds)...');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testClickSiguiente();
