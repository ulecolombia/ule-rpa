/**
 * Test: Scroll y encontrar botón para Paso 2
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

async function testScrollPaso2() {
  console.log('========================================');
  console.log('TEST: Encontrar botón para Paso 2');
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

    // Scroll down the page
    console.log('\n3. Scrolling page to find navigation buttons...');

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    await browserManager?.takeScreenshot(page, 'test-scroll-bottom');

    // Get ALL buttons and links on the page
    console.log('\n4. Finding ALL buttons on page...');
    const allButtons = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, a[onclick], input[onclick]'));
      return elements.map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim() || (el as HTMLInputElement).value || '',
        id: el.id || '',
        name: (el as HTMLInputElement).name || '',
        onclick: (el as HTMLElement).getAttribute('onclick')?.substring(0, 80) || '',
        type: (el as HTMLInputElement).type || '',
        classes: (el as HTMLElement).className || '',
        visible: (el as HTMLElement).offsetParent !== null,
        rect: el.getBoundingClientRect(),
      }));
    });

    console.log('   All buttons/interactive elements:');
    allButtons.forEach((btn, i) => {
      const visStr = btn.visible ? '✓' : '✗';
      console.log(`      ${i + 1}. [${visStr}] [${btn.tag}] "${btn.text.substring(0, 30)}" id="${btn.id}" onclick="${btn.onclick.substring(0, 40)}"`);
    });

    // Look specifically for form submission or navigation
    console.log('\n5. Looking for form actions...');
    const formInfo = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      return forms.map(f => ({
        id: f.id || '',
        name: f.name || '',
        action: f.action || '',
        method: f.method || '',
        onsubmit: f.getAttribute('onsubmit')?.substring(0, 100) || '',
      }));
    });

    console.log('   Forms found:');
    formInfo.forEach((f, i) => {
      console.log(`      ${i + 1}. id="${f.id}" name="${f.name}" action="${f.action.substring(0, 50)}"`);
      if (f.onsubmit) console.log(`         onsubmit: ${f.onsubmit}`);
    });

    // Scroll to specific areas and take screenshots
    console.log('\n6. Scrolling to find more content...');

    // Scroll to middle
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    await page.waitForTimeout(500);
    await browserManager?.takeScreenshot(page, 'test-scroll-middle');

    // Check for hidden period selection section
    console.log('\n7. Looking for period selection section...');
    const periodSection = await page.evaluate(() => {
      // Look for elements containing "periodo" or "Periodo"
      const allElements = Array.from(document.querySelectorAll('*'));
      const periodElements = allElements.filter(el =>
        el.textContent?.toLowerCase().includes('periodo') &&
        el.children.length < 5
      );
      return periodElements.map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 50) || '',
        id: el.id || '',
        visible: (el as HTMLElement).offsetParent !== null,
      })).slice(0, 10);
    });

    console.log('   Period-related elements:');
    periodSection.forEach((el, i) => {
      console.log(`      ${i + 1}. [${el.tag}] "${el.text}" visible=${el.visible}`);
    });

    // Look for "Continuar" or similar in onclick handlers
    console.log('\n8. Looking for JavaScript actions...');
    const jsActions = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[onclick]'));
      return elements.map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 30) || '',
        onclick: (el as HTMLElement).getAttribute('onclick') || '',
      })).filter(el =>
        el.onclick.includes('validar') ||
        el.onclick.includes('Validar') ||
        el.onclick.includes('continuar') ||
        el.onclick.includes('Continuar') ||
        el.onclick.includes('siguiente') ||
        el.onclick.includes('Siguiente') ||
        el.onclick.includes('submit') ||
        el.onclick.includes('paso')
      );
    });

    if (jsActions.length > 0) {
      console.log('   Found navigation-related onclick handlers:');
      jsActions.forEach((el, i) => {
        console.log(`      ${i + 1}. [${el.tag}] "${el.text}" onclick="${el.onclick.substring(0, 60)}..."`);
      });
    } else {
      console.log('   No navigation onclick handlers found');
    }

    // Full page screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Take a full page screenshot by setting viewport
    await browserManager?.takeScreenshot(page, 'test-scroll-full-page');

    console.log('\n========================================');
    console.log('✓ SCAN COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (15 seconds)...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testScrollPaso2();
