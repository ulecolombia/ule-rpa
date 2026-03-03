/**
 * Test: Capturar popup de "Agregar cotizante" para ver campos de IBC
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

async function testCotizantePopup() {
  console.log('========================================');
  console.log('TEST: Capturar Popup Agregar Cotizante');
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

    // Click "Siguiente" to go to Step 2
    console.log('3. Clicking "Siguiente" to go to Step 2...');
    const siguienteBtn = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('input, button, a'));
      const btn = elements.find(el => {
        const text = (el as HTMLInputElement).value?.toLowerCase() || el.textContent?.trim().toLowerCase() || '';
        return text.includes('siguiente');
      });
      return btn ? (btn as HTMLElement).id : null;
    });

    if (siguienteBtn) {
      await page.click(`#${siguienteBtn}`);
      await page.waitForTimeout(4000);
      console.log('   ✓ On Step 2');
    }

    await browserManager?.takeScreenshot(page, 'test-popup-paso2');

    // Setup listener for popup BEFORE clicking
    console.log('\n4. Setting up popup listener...');

    let popupPage: Page | null = null;

    const popupPromise = new Promise<Page>((resolve) => {
      browser.once('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          if (newPage) {
            resolve(newPage);
          }
        }
      });
    });

    // Click "Agregar cotizante" (it opens a popup)
    console.log('5. Clicking "Agregar cotizante"...');

    await page.evaluate(() => {
      // Call the function directly if it exists
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
      } else {
        // Or find and click the element
        const elements = Array.from(document.querySelectorAll('a, span, div, img'));
        for (const el of elements) {
          const text = el.textContent?.trim().toLowerCase() || '';
          const onclick = (el as HTMLElement).getAttribute('onclick') || '';
          if (text.includes('agregar cotizante') || onclick.includes('agregarCotizante')) {
            (el as HTMLElement).click();
            break;
          }
        }
      }
    });

    console.log('   Waiting for popup...');

    // Wait for popup with timeout
    popupPage = await Promise.race([
      popupPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]) as Page | null;

    if (!popupPage) {
      console.log('   ✗ Popup did not open within timeout');

      // Try to find any new pages
      const pages = await browser.pages();
      console.log(`   Total pages: ${pages.length}`);
      for (let i = 0; i < pages.length; i++) {
        const url = pages[i].url();
        console.log(`      Page ${i}: ${url}`);
        if (url.includes('ingresarCotizante')) {
          popupPage = pages[i];
          break;
        }
      }
    }

    if (popupPage) {
      console.log('   ✓ Popup captured!');

      // Wait for popup to load
      await popupPage.waitForTimeout(3000);

      const popupUrl = popupPage.url();
      console.log(`\n6. Popup URL: ${popupUrl}`);

      // Take screenshot of popup
      await popupPage.screenshot({
        path: `screenshots/test-popup-cotizante_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fullPage: true,
      });
      console.log('   ✓ Screenshot saved');

      // Analyze popup form fields
      console.log('\n7. Analyzing popup form fields...');

      const popupFields = await popupPage.evaluate(() => {
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

      console.log('   ALL form fields in popup:');
      popupFields.forEach((f, i) => {
        const identifier = f.name || f.id || f.placeholder || 'unnamed';
        const visStr = f.visible ? '✓' : '✗';
        console.log(`      ${i + 1}. [${visStr}] [${f.tag}:${f.type}] ${identifier} = "${f.value.substring(0, 30)}"`);
      });

      // Look specifically for IBC fields
      console.log('\n8. Looking for IBC/Salary related fields...');
      const ibcFields = await popupPage.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        return all
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            const name = (el as HTMLInputElement).name?.toLowerCase() || '';
            return (
              text.includes('ibc') ||
              text.includes('salario') ||
              text.includes('ingreso') ||
              text.includes('días cotizados') ||
              text.includes('dias cotizados') ||
              id.includes('ibc') ||
              name.includes('ibc') ||
              id.includes('salario') ||
              name.includes('salario')
            );
          })
          .filter(el =>
            el.tagName === 'INPUT' ||
            el.tagName === 'SELECT' ||
            el.tagName === 'LABEL' ||
            el.tagName === 'TD' ||
            el.tagName === 'TH' ||
            el.tagName === 'SPAN'
          )
          .map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim().substring(0, 60) || '',
            id: el.id || '',
            name: (el as HTMLInputElement).name || '',
          }))
          .slice(0, 20);
      });

      if (ibcFields.length > 0) {
        console.log('   Found IBC/Salary related elements:');
        ibcFields.forEach((f, i) => {
          console.log(`      ${i + 1}. [${f.tag}] id="${f.id}" name="${f.name}" text="${f.text}"`);
        });
      } else {
        console.log('   No IBC fields found directly');
      }

      // Get ALL labels
      console.log('\n9. All labels in popup:');
      const labels = await popupPage.evaluate(() => {
        return Array.from(document.querySelectorAll('label, th, td, span, div'))
          .map(l => l.textContent?.trim() || '')
          .filter(t => t.length > 2 && t.length < 80)
          .filter((v, i, a) => a.indexOf(v) === i) // unique
          .slice(0, 40);
      });

      labels.forEach((l, i) => {
        console.log(`      ${i + 1}. "${l}"`);
      });

      // Get page HTML structure for analysis
      console.log('\n10. Page structure (forms):');
      const forms = await popupPage.evaluate(() => {
        return Array.from(document.querySelectorAll('form')).map(f => ({
          id: f.id || '',
          name: f.name || '',
          action: f.action || '',
        }));
      });

      forms.forEach((f, i) => {
        console.log(`      ${i + 1}. Form: id="${f.id}" name="${f.name}" action="${f.action.substring(0, 50)}"`);
      });

      console.log('\n========================================');
      console.log('✓ POPUP ANALYSIS COMPLETED');
      console.log('========================================');

      // Keep popup open for inspection
      console.log('\n⏳ Popup open for inspection (30 seconds)...');
      await popupPage.waitForTimeout(30000);

    } else {
      console.log('   ✗ Could not capture popup');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testCotizantePopup();
