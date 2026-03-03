/**
 * Solución: Usar "Buscar por documento" para traer datos correctos de BDUA
 * Esto evita el error de subtipo inválido
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

async function testBuscarCotizanteBDUA() {
  console.log('========================================');
  console.log('SOLUCIÓN: Buscar cotizante desde BDUA');
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

    // Click Siguiente to go to Step 2 (Información Detallada)
    console.log('3. Going to Step 2 (Información Detallada)...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);

    const currentUrl = page.url();
    console.log(`   URL: ${currentUrl}`);

    await browserManager?.takeScreenshot(page, 'test-bdua-paso2');

    // Look for search field and button
    console.log('\n4. Finding search elements...');

    const searchElements = await page.evaluate(() => {
      // Find input for document search
      const searchInput = document.querySelector('input[name="numIden"], input#consultarCzte, input[id*="numIden"]') as HTMLInputElement;

      // Find search button
      const searchBtn = document.querySelector('#consultarCzteAll, button[onclick*="buscar"], input[onclick*="buscar"]');

      // Find all inputs with "documento" or "buscar" related
      const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(el => ({
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        type: (el as HTMLInputElement).type || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
      }));

      return {
        searchInputFound: !!searchInput,
        searchInputId: searchInput?.id || '',
        searchInputName: searchInput?.name || '',
        searchBtnFound: !!searchBtn,
        searchBtnId: (searchBtn as HTMLElement)?.id || '',
        allInputs: allInputs.slice(0, 15),
      };
    });

    console.log('   Search input found:', searchElements.searchInputFound);
    console.log(`   Input: id="${searchElements.searchInputId}" name="${searchElements.searchInputName}"`);
    console.log('   Search button found:', searchElements.searchBtnFound);
    console.log(`   Button id: "${searchElements.searchBtnId}"`);

    console.log('\n   All visible inputs:');
    searchElements.allInputs.forEach((inp, i) => {
      console.log(`      ${i + 1}. [${inp.type}] id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}"`);
    });

    // Enter document number in search field
    console.log('\n5. Entering document number in search field...');

    // Try multiple selectors for the search input
    const inputSelectors = [
      '#u24_input',
      'input[name="numIden"]',
      '#consultarCzte',
      'input[placeholder*="documento"]',
      'input[placeholder*="Buscar"]',
    ];

    let inputFound = false;
    for (const selector of inputSelectors) {
      try {
        const exists = await page.$(selector);
        if (exists) {
          await page.type(selector, TEST_CREDENTIALS.documento);
          console.log(`   ✓ Typed in ${selector}`);
          inputFound = true;
          break;
        }
      } catch {}
    }

    if (!inputFound) {
      // Try using evaluate to find and fill input
      await page.evaluate((doc) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        // Find the one near "Buscar por documento" label
        const searchInput = inputs.find(inp => {
          const parent = inp.closest('tr, div, td');
          return parent?.textContent?.toLowerCase().includes('buscar') ||
                 parent?.textContent?.toLowerCase().includes('documento');
        }) as HTMLInputElement;

        if (searchInput) {
          searchInput.value = doc;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, TEST_CREDENTIALS.documento);
      console.log('   ✓ Typed using evaluate');
    }

    await page.waitForTimeout(1000);
    await browserManager?.takeScreenshot(page, 'test-bdua-after-type');

    // Enable and click search button
    console.log('\n6. Clicking search button...');

    // First, enable the button if disabled
    await page.evaluate(() => {
      const btn = document.querySelector('#consultarCzteAll') as HTMLButtonElement;
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });

    // Click the search button
    const btnSelectors = [
      '#consultarCzteAll',
      'input[onclick*="consultar"]',
      'button[onclick*="buscar"]',
      'img[onclick*="consultar"]',
    ];

    let btnClicked = false;
    for (const selector of btnSelectors) {
      try {
        const exists = await page.$(selector);
        if (exists) {
          await page.click(selector);
          console.log(`   ✓ Clicked ${selector}`);
          btnClicked = true;
          break;
        }
      } catch {}
    }

    if (!btnClicked) {
      // Try clicking via evaluate
      await page.evaluate(() => {
        // Find search icon/button near the input
        const searchBtn = document.querySelector('#consultarCzteAll, [onclick*="consultar"], [onclick*="buscar"]') as HTMLElement;
        if (searchBtn) {
          searchBtn.click();
        } else {
          // Try the magnifying glass icon
          const imgs = Array.from(document.querySelectorAll('img'));
          const searchImg = imgs.find(img => img.src.includes('lupa') || img.src.includes('search') || img.src.includes('buscar'));
          if (searchImg) searchImg.click();
        }
      });
      console.log('   ✓ Clicked via evaluate');
    }

    // Wait for BDUA response
    console.log('\n7. Waiting for BDUA response...');
    await page.waitForTimeout(5000);

    await browserManager?.takeScreenshot(page, 'test-bdua-after-search');

    // Check results
    console.log('\n8. Checking search results...');

    const searchResults = await page.evaluate(() => {
      // Check for error messages
      const errors = document.querySelectorAll('.error, .alert, .mensaje, [class*="error"]');
      const errorTexts = Array.from(errors).map(e => e.textContent?.trim()).filter(t => t);

      // Check if cotizante table has data
      const table = document.querySelector('#CrearPlanilla, table[id*="cotizante"]');
      const rows = table?.querySelectorAll('tr') || [];

      // Check for success indicators
      const successMsg = document.querySelector('.exito, .success, [class*="success"]');

      // Check if "Agregar cotizante" popup opened
      const popup = document.querySelector('.modal, .popup, [class*="popup"]');

      return {
        errorMessages: errorTexts.slice(0, 5),
        tableRows: rows.length,
        hasSuccessMsg: !!successMsg,
        popupFound: !!popup,
        pageContent: document.body.textContent?.substring(0, 500) || '',
      };
    });

    if (searchResults.errorMessages.length > 0) {
      console.log('   ⚠️ Errors:', searchResults.errorMessages.join(', '));
    }

    console.log(`   Table rows: ${searchResults.tableRows}`);
    console.log(`   Success message: ${searchResults.hasSuccessMsg}`);

    // Check if cotizante was added
    const cotizanteAdded = await page.evaluate(() => {
      // Look for the cotizante data in the page
      const page = document.body.textContent || '';
      return {
        hasCamilo: page.includes('CAMILO') || page.includes('Camilo'),
        hasTorres: page.includes('TORRES') || page.includes('Torres'),
        hasCC: page.includes('1018482146'),
      };
    });

    console.log(`   Cotizante found: Camilo=${cotizanteAdded.hasCamilo}, Torres=${cotizanteAdded.hasTorres}, CC=${cotizanteAdded.hasCC}`);

    // If cotizante was found/added, try to edit it to see IBC fields
    if (cotizanteAdded.hasCC) {
      console.log('\n9. Cotizante found! Looking for edit link...');

      // Look for edit link
      const editLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const editLink = links.find(l =>
          l.textContent?.toLowerCase().includes('editar') ||
          l.getAttribute('onclick')?.includes('editar') ||
          l.getAttribute('onclick')?.includes('modificar')
        );
        return editLink ? {
          text: editLink.textContent?.trim() || '',
          onclick: editLink.getAttribute('onclick') || '',
          href: editLink.href || '',
        } : null;
      });

      if (editLink) {
        console.log(`   Edit link found: "${editLink.text}"`);
        console.log(`   onclick: ${editLink.onclick.substring(0, 60)}...`);

        // Click edit to open cotizante form
        await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          const editLink = links.find(l =>
            l.textContent?.toLowerCase().includes('editar') ||
            l.getAttribute('onclick')?.includes('editar')
          );
          if (editLink) editLink.click();
        });

        await page.waitForTimeout(4000);
        await browserManager?.takeScreenshot(page, 'test-bdua-edit-cotizante');

        // Now we should be in the cotizante form, try to navigate to Paso 3
        console.log('\n10. Navigating through cotizante steps to find IBC...');

        // Check current step
        const currentStep = await page.evaluate(() => {
          const stepIndicator = document.querySelector('.active, [class*="current"], [class*="paso"]');
          return stepIndicator?.textContent?.trim() || 'unknown';
        });
        console.log(`    Current step: ${currentStep}`);

        // Click Siguiente until we reach Paso 3 (Seguridad Social)
        for (let i = 0; i < 3; i++) {
          const stepLabels = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label, th, td, span'));
            return labels.map(l => l.textContent?.trim() || '').filter(t =>
              t.toLowerCase().includes('ibc') ||
              t.toLowerCase().includes('salario') ||
              t.toLowerCase().includes('ingreso') ||
              t.toLowerCase().includes('días cotizados') ||
              t.toLowerCase().includes('dias cotizados') ||
              t.toLowerCase().includes('pensión') ||
              t.toLowerCase().includes('pension')
            ).slice(0, 10);
          });

          if (stepLabels.length > 0) {
            console.log(`\n    ★★★ IBC LABELS FOUND! ★★★`);
            stepLabels.forEach((l, idx) => console.log(`       ${idx + 1}. "${l}"`));

            // Get all IBC-related fields
            const ibcFields = await page.evaluate(() => {
              const inputs = Array.from(document.querySelectorAll('input, select'));
              return inputs
                .filter(el => {
                  const name = (el as HTMLInputElement).name?.toLowerCase() || '';
                  const id = el.id?.toLowerCase() || '';
                  return name.includes('ibc') || name.includes('dias') || name.includes('tarifa') ||
                         name.includes('salario') || name.includes('ingreso') ||
                         id.includes('ibc') || id.includes('dias') || id.includes('tarifa');
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
              console.log('\n    IBC FORM FIELDS:');
              ibcFields.forEach((f, idx) => {
                const vis = f.visible ? '✓' : '✗';
                console.log(`       ${idx + 1}. [${vis}] [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
              });
            }

            await browserManager?.takeScreenshot(page, 'test-bdua-ibc-fields-found');
            break;
          }

          // Click Siguiente
          const clicked = await page.evaluate(() => {
            const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
            if (btn) {
              btn.click();
              return true;
            }
            return false;
          });

          if (!clicked) break;

          console.log(`    Clicked Siguiente (attempt ${i + 1})`);
          await page.waitForTimeout(3000);
          await browserManager?.takeScreenshot(page, `test-bdua-paso${i + 2}`);
        }
      }
    }

    // Final analysis
    console.log('\n========================================');
    console.log('✓ ANALYSIS COMPLETED');
    console.log('========================================');

    // Get all form fields for documentation
    const allFields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
        }))
        .slice(0, 30);
    });

    console.log('\nAll visible form fields:');
    allFields.forEach((f, i) => {
      console.log(`   ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
    });

    console.log('\n⏳ Browser open for inspection (30 seconds)...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    const page = authBot.getPage();
    const browserManager = (authBot as any).browserManager;
    if (page && browserManager) {
      try {
        await browserManager.takeScreenshot(page, 'test-bdua-error');
      } catch {}
    }
  } finally {
    await authBot.close();
  }
}

testBuscarCotizanteBDUA();
