/**
 * Solución v2: Buscar cotizante desde BDUA - Con navegación correcta
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

async function testBDUAv2() {
  console.log('========================================');
  console.log('SOLUCIÓN v2: Buscar cotizante desde BDUA');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');
    const browserManager = (authBot as any).browserManager;
    await page.waitForTimeout(2000);

    // Navigate to planilla form
    console.log('2. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(4000);

    // Verify we're on Paso 1
    const paso1Check = await page.evaluate(() => {
      return document.body.textContent?.includes('Paso 1 de 4') || false;
    });
    console.log(`   On Paso 1: ${paso1Check}`);

    await browserManager?.takeScreenshot(page, 'test-bdua-v2-paso1');

    // Click "Siguiente" button using ID
    console.log('\n3. Clicking "Siguiente" to go to Paso 2...');

    // Wait for button and click
    await page.waitForSelector('#siguiente2', { timeout: 5000 });
    await page.click('#siguiente2');

    // Wait for navigation
    await page.waitForTimeout(5000);

    // Check URL
    const currentUrl = page.url();
    console.log(`   URL after click: ${currentUrl}`);

    // Verify we're on Paso 2
    const paso2Check = await page.evaluate(() => {
      return document.body.textContent?.includes('Paso 2 de 4') ||
             document.body.textContent?.includes('Información Detallada') ||
             document.body.textContent?.includes('Agregar cotizante') ||
             document.body.textContent?.includes('Buscar por documento') || false;
    });
    console.log(`   On Paso 2: ${paso2Check}`);

    await browserManager?.takeScreenshot(page, 'test-bdua-v2-paso2');

    if (!paso2Check) {
      // Maybe we need to wait for form submission
      console.log('   Waiting for page to load...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    // Check current step indicator
    const stepInfo = await page.evaluate(() => {
      const indicators = document.querySelectorAll('[class*="paso"], .wizard-step, [class*="step"]');
      const activeStep = document.querySelector('.active, [class*="current"]');
      const pasoText = document.body.textContent?.match(/Paso \d de \d/)?.[0] || '';

      return {
        indicatorsFound: indicators.length,
        activeStepText: activeStep?.textContent?.trim() || '',
        pasoText,
        hasAgregarCotizante: document.body.textContent?.includes('Agregar cotizante') || false,
        hasBuscarDocumento: document.body.textContent?.includes('Buscar por documento') || false,
      };
    });

    console.log(`   Step text: "${stepInfo.pasoText}"`);
    console.log(`   Has "Agregar cotizante": ${stepInfo.hasAgregarCotizante}`);
    console.log(`   Has "Buscar por documento": ${stepInfo.hasBuscarDocumento}`);

    // If we found Paso 2 elements, proceed with search
    if (stepInfo.hasAgregarCotizante || stepInfo.hasBuscarDocumento) {
      console.log('\n4. Found Paso 2! Looking for search elements...');

      // Find the search input
      const searchInput = await page.$('#u24_input, input[id*="numIden"], input[name*="numIden"]');

      if (searchInput) {
        console.log('   Search input found');

        // Type document number
        await searchInput.type(TEST_CREDENTIALS.documento);
        console.log(`   Typed document: ${TEST_CREDENTIALS.documento}`);

        await page.waitForTimeout(1000);

        // Enable and click search button
        await page.evaluate(() => {
          const btn = document.querySelector('#consultarCzteAll') as HTMLButtonElement;
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.click();
          }
        });

        console.log('   Clicked search button');

        // Wait for BDUA response
        console.log('\n5. Waiting for BDUA response...');
        await page.waitForTimeout(6000);

        await browserManager?.takeScreenshot(page, 'test-bdua-v2-after-search');

        // Check if cotizante appeared in table
        const tableData = await page.evaluate(() => {
          const table = document.querySelector('#CrearPlanilla, table');
          const rows = table?.querySelectorAll('tr') || [];
          const rowData = Array.from(rows).map(row => row.textContent?.trim().substring(0, 100) || '');

          // Check for cotizante links
          const links = Array.from(document.querySelectorAll('a'));
          const editLinks = links.filter(l =>
            l.textContent?.toLowerCase().includes('editar') ||
            l.getAttribute('onclick')?.includes('editar')
          );

          return {
            rowCount: rows.length,
            rowSample: rowData.slice(0, 5),
            editLinksCount: editLinks.length,
            hasCotizanteData: document.body.textContent?.includes('TORRES') ||
                              document.body.textContent?.includes('CAMILO') || false,
          };
        });

        console.log(`   Table rows: ${tableData.rowCount}`);
        console.log(`   Edit links: ${tableData.editLinksCount}`);
        console.log(`   Cotizante data found: ${tableData.hasCotizanteData}`);

        if (tableData.rowSample.length > 0) {
          console.log('   Table sample:');
          tableData.rowSample.forEach((r, i) => console.log(`      ${i}: "${r.substring(0, 80)}..."`));
        }

        // If cotizante found, click edit to see IBC fields
        if (tableData.editLinksCount > 0 || tableData.hasCotizanteData) {
          console.log('\n6. Cotizante found! Clicking edit...');

          await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const editLink = links.find(l =>
              l.textContent?.toLowerCase().includes('editar') ||
              l.getAttribute('onclick')?.includes('editar') ||
              l.getAttribute('onclick')?.includes('modificar')
            );
            if (editLink) editLink.click();
          });

          await page.waitForTimeout(5000);

          await browserManager?.takeScreenshot(page, 'test-bdua-v2-edit-cotizante');

          // Navigate to Paso 3 (Seguridad Social) to find IBC
          console.log('\n7. Navigating to find IBC fields...');

          for (let step = 0; step < 4; step++) {
            // Check for IBC labels
            const ibcCheck = await page.evaluate(() => {
              const text = document.body.textContent?.toLowerCase() || '';
              const hasIBC = text.includes('ibc') ||
                            text.includes('ingreso base') ||
                            text.includes('salario') && text.includes('cotizado');
              const hasDias = text.includes('días cotizados') || text.includes('dias cotizados');

              // Get all labels
              const labels = Array.from(document.querySelectorAll('label, th, td'))
                .map(l => l.textContent?.trim() || '')
                .filter(t => t.length > 2 && t.length < 60);

              return { hasIBC, hasDias, labels: labels.slice(0, 20) };
            });

            if (ibcCheck.hasIBC || ibcCheck.hasDias) {
              console.log('\n   ★★★ IBC/DÍAS FIELDS FOUND! ★★★');
              console.log('   Labels:');
              ibcCheck.labels.forEach((l, i) => console.log(`      ${i + 1}. "${l}"`));

              // Get IBC input fields
              const ibcFields = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('input, select'))
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
                  }));
              });

              if (ibcFields.length > 0) {
                console.log('\n   ★★★ IBC INPUT FIELDS: ★★★');
                ibcFields.forEach((f, i) => {
                  console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
                });
              }

              await browserManager?.takeScreenshot(page, 'test-bdua-v2-ibc-found');
              break;
            }

            // Click Siguiente to next step
            const clicked = await page.evaluate(() => {
              const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
              if (btn) {
                btn.click();
                return true;
              }
              return false;
            });

            if (!clicked) break;

            console.log(`   Step ${step + 1}: Clicked Siguiente`);
            await page.waitForTimeout(4000);
            await browserManager?.takeScreenshot(page, `test-bdua-v2-step${step + 2}`);
          }
        }
      } else {
        console.log('   Search input NOT found. Looking for all inputs...');

        const allInputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input[type="text"]'))
            .map(el => ({
              id: el.id || '',
              name: (el as HTMLInputElement).name || '',
              placeholder: (el as HTMLInputElement).placeholder || '',
            }));
        });

        allInputs.forEach((inp, i) => {
          console.log(`      ${i + 1}. id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}"`);
        });
      }
    } else {
      console.log('\n   Still not on Paso 2. Current page content:');
      const pageContent = await page.evaluate(() => {
        return document.body.textContent?.substring(0, 500) || '';
      });
      console.log(`   ${pageContent.substring(0, 300)}...`);
    }

    console.log('\n========================================');
    console.log('✓ COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (30 seconds)...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    const page = authBot.getPage();
    const browserManager = (authBot as any).browserManager;
    if (page && browserManager) {
      try {
        await browserManager.takeScreenshot(page, 'test-bdua-v2-error');
      } catch {}
    }
  } finally {
    await authBot.close();
  }
}

testBDUAv2();
