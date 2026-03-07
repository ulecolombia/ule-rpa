/**
 * Test simple: Navegar a planilla y llamar pagarPlanillaPSE
 *
 * Este script:
 * 1. Login a SOI
 * 2. Llama pagarPlanillaPSE() para analizar el formulario PSE
 * 3. Imprime el HTML del formulario
 */

import { PrismaClient } from '@prisma/client';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { pagarPlanillaPSE } from '../src/bots/soi/planilla.bot';
import { decryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

const TEST_CONFIG = {
  cedula: '1047478670',
  numeroPlanilla: '6010795958',
};

async function main() {
  console.log('TEST: PSE Simple\n');

  // 1. Obtener credenciales
  console.log('[1] Obteniendo credenciales...');
  const user = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: TEST_CONFIG.cedula },
  });

  if (!user?.soiPassword || !user?.soiPasswordIV) {
    throw new Error('Usuario sin credenciales SOI');
  }

  const password = decryptPassword(user.soiPassword, user.soiPasswordIV);
  console.log(`    Usuario: ${TEST_CONFIG.cedula}`);
  console.log(`    Planilla: ${TEST_CONFIG.numeroPlanilla}\n`);

  // 2. Iniciar browser
  const browserManager = new BrowserManager({ headless: false });
  const browser = await browserManager.launch();
  const page = await browserManager.newPage();

  try {
    // 3. Login a SOI
    console.log('[2] Login a SOI...');
    await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Seleccionar tipo documento (value "1" = Cédula de ciudadanía)
    await page.select('select', '1');
    await page.waitForTimeout(300);

    // Ingresar número de documento
    const docInput = await page.$('input[type="text"]');
    if (docInput) {
      await docInput.click({ clickCount: 3 });
      await docInput.type(TEST_CONFIG.cedula, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Ingresar password
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.click();
      await pwdInput.type(password, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Click en Ingresar
    const btnIngresar = await page.$('button');
    if (btnIngresar) await btnIngresar.click();

    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log('    URL post-login:', page.url().substring(0, 80), '...\n');

    // 4. Verificar planillas GUARDADAS
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('GUARDADA')) {
      console.log('    Planillas GUARDADAS encontradas\n');
    }

    // Screenshot del dashboard
    await page.screenshot({ path: 'logs/screenshots/pse_01_dashboard.png', fullPage: true });

    // 5. Buscar la planilla específica y click en pagar
    console.log('[3] Buscando planilla para pagar...');

    // Buscar imágenes de pagar
    const payButtonInfo = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      const results: string[] = [];

      for (const img of images) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        const parent = img.parentElement;
        const parentHref = parent?.getAttribute('href') || '';

        if (src.toLowerCase().includes('pagar') ||
            src.toLowerCase().includes('pse') ||
            alt.toLowerCase().includes('pagar') ||
            parentHref.toLowerCase().includes('pagar')) {
          results.push(`IMG: src=${src}, href=${parentHref.substring(0, 80)}`);
        }
      }

      return results;
    });

    console.log('    Botones encontrados:', payButtonInfo);

    // Click en el primer botón de pagar
    const btnPagar = await page.$('a img[src*="pagar"], a[href*="pagar"] img, img[src*="pagar"]');

    if (btnPagar) {
      console.log('    Click en botón de pagar...');
      await btnPagar.click();
      await page.waitForTimeout(3000);

      console.log('    URL después de click:', page.url().substring(0, 80));
      await page.screenshot({ path: 'logs/screenshots/pse_02_despues_click.png', fullPage: true });
    } else {
      console.log('    No se encontró botón de pagar directo');

      // Buscar cualquier link que lleve a pago
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors
          .filter(a => a.href.includes('pago') || a.href.includes('PSE'))
          .map(a => ({ href: a.href.substring(0, 80), text: a.textContent?.substring(0, 30) }));
      });
      console.log('    Links de pago:', links);
    }

    // 6. Llamar pagarPlanillaPSE
    console.log('\n[4] Llamando pagarPlanillaPSE()...\n');

    const result = await pagarPlanillaPSE(page, TEST_CONFIG.numeroPlanilla);

    console.log('\n============ RESULTADO ============');
    console.log('Success:', result.success);
    console.log('Estado:', result.estado);
    console.log('URL:', result.urlActual);
    console.log('Screenshot:', result.screenshotPath);

    if (result.selectoresEncontrados) {
      console.log('\nSelectores:');
      console.log('  tipoAportante:', result.selectoresEncontrados.tipoAportante || 'N/A');
      console.log('  entidadFinanciera:', result.selectoresEncontrados.entidadFinanciera || 'N/A');
      console.log('  btnPagar:', result.selectoresEncontrados.btnPagar || 'N/A');
    }

    if (result.formHtml) {
      console.log('\nHTML (primeros 2000 chars):');
      console.log('-'.repeat(50));
      console.log(result.formHtml.substring(0, 2000));
      console.log('-'.repeat(50));
    }

    if (result.error) {
      console.log('\nError:', result.error);
    }

    console.log('\nEsperando 15 segundos...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'logs/screenshots/pse_error.png', fullPage: true });
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nFinalizado.');
  }
}

main().catch(console.error);
