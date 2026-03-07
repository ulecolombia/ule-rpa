/**
 * Test Fase 2: Pago PSE en SOI
 *
 * Este script:
 * 1. Login a SOI
 * 2. Navega a una planilla GUARDADA existente
 * 3. Click en PSE
 * 4. Maneja advertencia PSE-04006 si aparece
 * 5. Llega al formulario PSE e imprime el HTML
 */

import { BrowserManager } from '../src/bots/utils/browser';
import { loginIndependiente } from '../src/bots/soi/auth.bot';
import { pagarPlanillaPSE } from '../src/bots/soi/planilla.bot';
import { prisma } from '../src/db/prisma';
import { decrypt } from '../src/utils/crypto';

async function main() {
  console.log('============================================================');
  console.log('TEST FASE 2: Pago PSE SOI');
  console.log('============================================================\n');

  // Usuario de prueba
  const cedula = '1047478670';
  const numeroPlanilla = '6010795958';  // Planilla creada en Fase 1

  // Obtener credenciales
  const user = await prisma.uleUser.findFirst({
    where: { numeroDocumento: cedula },
  });

  if (!user || !user.soiPassword || !user.soiPasswordIV) {
    console.error('Usuario no encontrado o sin credenciales SOI');
    process.exit(1);
  }

  const password = decrypt(user.soiPassword, user.soiPasswordIV);

  console.log(`[1] Usuario: ${user.nombre}`);
  console.log(`    Cédula: ${cedula}`);
  console.log(`    Planilla: ${numeroPlanilla}\n`);

  // Iniciar browser
  const browserManager = new BrowserManager({ headless: false });
  const { browser, page } = await browserManager.launch();

  try {
    // Login
    console.log('[2] Iniciando sesión en SOI...');
    await loginIndependiente(page, {
      tipoDocumento: 'CC',
      documento: cedula,
      password,
    });

    const loginUrl = page.url();
    console.log(`    URL post-login: ${loginUrl.substring(0, 80)}...`);

    // Verificar que hay planillas disponibles
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('GUARDADA')) {
      console.log('    Planillas GUARDADAS encontradas\n');
    }

    // Navegar a la página de pago de la planilla
    // En SOI, después del login estamos en el dashboard con las planillas listadas
    // Necesitamos hacer click en la planilla para ir a la página de pago

    console.log('[3] Buscando planilla para pagar...');

    // Buscar el botón de pagar para la planilla específica
    // El botón de pagar está en la tabla de planillas
    const planillaRow = await page.evaluate((numPlanilla) => {
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        if (row.textContent?.includes(numPlanilla)) {
          // Encontrar el botón de pagar en esta fila
          const btnPagar = row.querySelector('a[href*="pagar"], img[src*="pagar"], a img');
          if (btnPagar) {
            const href = (btnPagar as HTMLAnchorElement).href ||
                        (btnPagar.parentElement as HTMLAnchorElement)?.href;
            return {
              found: true,
              href: href?.substring(0, 100),
              rowText: row.textContent?.substring(0, 100),
            };
          }
        }
      }
      return { found: false };
    }, numeroPlanilla);

    console.log(`    Planilla encontrada: ${JSON.stringify(planillaRow)}`);

    if (!planillaRow.found) {
      // Intentar buscar cualquier botón de pagar
      console.log('    Buscando cualquier botón de pagar...');

      const anyPayButton = await page.$('a img[src*="pagar"], img[src*="pagar"]');
      if (anyPayButton) {
        console.log('    Botón de pagar encontrado, haciendo click...');
        await anyPayButton.click();
        await page.waitForTimeout(3000);
      } else {
        // Navegar directamente a la URL de pago si la conocemos
        const sessionMatch = loginUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);
        if (sessionMatch) {
          const sessionId = sessionMatch[1];
          // Intentar navegar a la página de pago directamente
          const pagoUrl = `https://servicio.nuevosoi.com.co/soi/verPlanillaPago.do;nuevoSoiAchColombiaSessionID=${sessionId}?numeroPlanilla=${numeroPlanilla}`;
          console.log(`    Navegando directamente a: ${pagoUrl.substring(0, 80)}...`);
          await page.goto(pagoUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        }
      }
    } else {
      // Click en el enlace de pagar
      if (planillaRow.href) {
        console.log(`    Navegando a: ${planillaRow.href}`);
        await page.goto(planillaRow.href, { waitUntil: 'networkidle0', timeout: 30000 });
      }
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'logs/screenshots/pse_test_antes_fase2.png', fullPage: true });

    const urlBeforePSE = page.url();
    console.log(`    URL antes de PSE: ${urlBeforePSE.substring(0, 80)}...\n`);

    // Ejecutar Fase 2
    console.log('[4] Ejecutando pagarPlanillaPSE()...\n');

    const result = await pagarPlanillaPSE(page, numeroPlanilla);

    console.log('\n============================================================');
    console.log('RESULTADO FASE 2');
    console.log('============================================================\n');

    if (result.success) {
      console.log('  ESTADO: ' + result.estado);
      console.log('  URL: ' + result.urlActual);
      console.log('  Screenshot: ' + result.screenshotPath);

      console.log('\n  SELECTORES ENCONTRADOS:');
      console.log('  - Tipo Aportante: ' + (result.selectoresEncontrados?.tipoAportante || 'NO ENCONTRADO'));
      console.log('  - Entidad Financiera: ' + (result.selectoresEncontrados?.entidadFinanciera || 'NO ENCONTRADO'));
      console.log('  - Botón Pagar: ' + (result.selectoresEncontrados?.btnPagar || 'NO ENCONTRADO'));

      if (result.formHtml) {
        console.log('\n  HTML DEL FORMULARIO (primeros 3000 chars):');
        console.log('  ' + '-'.repeat(50));
        console.log(result.formHtml.substring(0, 3000));
        console.log('  ' + '-'.repeat(50));
      }
    } else {
      console.log('  ERROR: ' + result.error);
      console.log('  URL: ' + result.urlActual);
      console.log('  Screenshot: ' + result.screenshotPath);
    }

    console.log('\n============================================================\n');

    // Esperar antes de cerrar para inspección manual
    console.log('Esperando 30 segundos antes de cerrar (inspecciona el browser)...\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'logs/screenshots/pse_test_error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('Browser cerrado.');
  }
}

main().catch(console.error);
