/**
 * Test: Click "Agregar cotizante" para ver campos de IBC
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

async function testAgregarCotizante() {
  console.log('========================================');
  console.log('TEST: Agregar Cotizante - Ver campos IBC');
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

    // Find and click "Siguiente" button
    console.log('3. Finding "Siguiente" button...');

    const siguienteBtn = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('input, button, a'));
      const btn = elements.find(el => {
        const text = (el as HTMLInputElement).value?.toLowerCase() || el.textContent?.trim().toLowerCase() || '';
        return text.includes('siguiente');
      });
      if (btn) {
        return {
          tag: btn.tagName,
          id: btn.id,
          value: (btn as HTMLInputElement).value || btn.textContent?.trim() || '',
        };
      }
      return null;
    });

    if (siguienteBtn) {
      console.log(`   Found: [${siguienteBtn.tag}] id="${siguienteBtn.id}" value="${siguienteBtn.value}"`);

      // Click using ID or find and click
      if (siguienteBtn.id) {
        await page.click(`#${siguienteBtn.id}`);
      } else {
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('input, button, a'));
          const btn = elements.find(el => {
            const text = (el as HTMLInputElement).value?.toLowerCase() || el.textContent?.trim().toLowerCase() || '';
            return text.includes('siguiente');
          });
          if (btn) (btn as HTMLElement).click();
        });
      }
      await page.waitForTimeout(4000);
      console.log('   ✓ Clicked "Siguiente"');
    } else {
      console.log('   ✗ "Siguiente" button not found');
    }

    await browserManager?.takeScreenshot(page, 'test-cotizante-paso2');

    // Look for "Agregar cotizante" button
    console.log('\n4. Looking for "Agregar cotizante" button...');

    const agregarBtn = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, input, span, div'));
      const btn = elements.find(el => {
        const text = el.textContent?.trim().toLowerCase() || '';
        return text.includes('agregar cotizante') || text.includes('agregar');
      });
      if (btn) {
        return {
          tag: btn.tagName,
          text: btn.textContent?.trim() || '',
          id: btn.id || '',
          onclick: (btn as HTMLElement).getAttribute('onclick') || '',
          href: (btn as HTMLAnchorElement).href || '',
          classes: (btn as HTMLElement).className || '',
        };
      }
      return null;
    });

    if (agregarBtn) {
      console.log(`   Found: [${agregarBtn.tag}] "${agregarBtn.text}"`);
      console.log(`   id="${agregarBtn.id}" onclick="${agregarBtn.onclick?.substring(0, 60)}"`);
      console.log(`   classes="${agregarBtn.classes}"`);
    }

    // Click "Agregar cotizante"
    console.log('\n5. Clicking "Agregar cotizante"...');

    const clicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, input, span, div, img'));
      for (const el of elements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        const alt = (el as HTMLImageElement).alt?.toLowerCase() || '';
        if (text.includes('agregar cotizante') || alt.includes('agregar')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      // Try by image with onclick
      const imgs = Array.from(document.querySelectorAll('img[onclick]'));
      for (const img of imgs) {
        const onclick = (img as HTMLElement).getAttribute('onclick') || '';
        if (onclick.includes('agregar') || onclick.includes('cotizante')) {
          (img as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      console.log('   ✓ Clicked!');
    } else {
      console.log('   ✗ Button not found, trying alternative selectors...');

      // Try clicking any element with "agregar" text
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        for (const el of all) {
          if (el.children.length === 0 || el.tagName === 'A' || el.tagName === 'BUTTON') {
            const text = el.textContent?.trim().toLowerCase() || '';
            if (text === 'agregar cotizante' || text.includes('agregar cotizante')) {
              (el as HTMLElement).click();
              return;
            }
          }
        }
      });
    }

    await page.waitForTimeout(3000);
    await browserManager?.takeScreenshot(page, 'test-cotizante-after-click');

    // Check for modal or new form fields
    console.log('\n6. Checking for modal or new form...');

    const modalInfo = await page.evaluate(() => {
      // Check for modals
      const modals = document.querySelectorAll('.modal, .dialog, [role="dialog"], .popup, #modal, .fancybox-wrap');
      const visibleModal = Array.from(modals).find(m => (m as HTMLElement).offsetParent !== null);

      // Check for new form fields
      const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      const visibleInputs = allInputs.filter(el => (el as HTMLElement).offsetParent !== null);

      // Look specifically for IBC related fields
      const ibcFields = visibleInputs.filter(el => {
        const name = (el as HTMLInputElement).name?.toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        const placeholder = (el as HTMLInputElement).placeholder?.toLowerCase() || '';
        return name.includes('ibc') || id.includes('ibc') ||
               name.includes('salario') || id.includes('salario') ||
               name.includes('ingreso') || id.includes('ingreso') ||
               name.includes('dias') || id.includes('dias') ||
               placeholder.includes('ibc') || placeholder.includes('salario');
      });

      return {
        modalFound: !!visibleModal,
        modalId: visibleModal?.id || '',
        modalClass: (visibleModal as HTMLElement)?.className || '',
        totalVisibleInputs: visibleInputs.length,
        ibcFieldsFound: ibcFields.length,
        ibcFields: ibcFields.map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
        })),
      };
    });

    console.log(`   Modal found: ${modalInfo.modalFound}`);
    if (modalInfo.modalFound) {
      console.log(`   Modal id="${modalInfo.modalId}" class="${modalInfo.modalClass}"`);
    }
    console.log(`   Total visible inputs: ${modalInfo.totalVisibleInputs}`);
    console.log(`   IBC-related fields: ${modalInfo.ibcFieldsFound}`);

    if (modalInfo.ibcFields.length > 0) {
      console.log('   IBC Fields:');
      modalInfo.ibcFields.forEach((f, i) => {
        console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
      });
    }

    // Get ALL visible form fields for complete analysis
    console.log('\n7. All visible form fields:');
    const allFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      return inputs
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          placeholder: (el as HTMLInputElement).placeholder || '',
          value: (el as HTMLInputElement).value || '',
        }));
    });

    allFields.forEach((f, i) => {
      const identifier = f.name || f.id || f.placeholder || 'unnamed';
      console.log(`   ${i + 1}. [${f.tag}:${f.type}] ${identifier} = "${f.value.substring(0, 20)}"`);
    });

    // Get all labels in the current view
    console.log('\n8. Labels visible:');
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td, .label'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 60)
        .slice(0, 30);
    });

    labels.forEach((l, i) => {
      console.log(`   ${i + 1}. "${l}"`);
    });

    // Check current URL
    const currentUrl = page.url();
    console.log(`\n9. Current URL: ${currentUrl}`);

    await browserManager?.takeScreenshot(page, 'test-cotizante-analysis');

    console.log('\n========================================');
    console.log('✓ COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (25 seconds)...');
    await page.waitForTimeout(25000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
  } finally {
    await authBot.close();
  }
}

testAgregarCotizante();
