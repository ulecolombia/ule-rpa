/**
 * Test Fase 3: Flujo PSE completo hasta Bancolombia
 *
 * Este script:
 * 1. Login a SOI
 * 2. Navegar a planilla GUARDADA
 * 3. Click en PSE
 * 4. Manejar advertencia PSE-04006
 * 5. Completar formulario PSE (tipo aportante + banco)
 * 6. Click en Pagar
 * 7. Llegar a Bancolombia y DETENERSE
 *
 * USO:
 *   npx tsx scripts/test-pse-fase3-completo.ts
 */

import { PrismaClient } from '@prisma/client';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { pagarPlanillaPSE, completarFormularioPSE, PSE_CONFIG } from '../src/bots/soi/planilla.bot';
import { decryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

const TEST_CONFIG = {
  cedula: '1047478670',
  numeroPlanilla: '6010795958',
};

async function main() {
  console.log('='.repeat(60));
  console.log('TEST FASE 3: PSE Completo hasta Bancolombia');
  console.log('='.repeat(60));
  console.log('');

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

    await page.select('select', '1');
    await page.waitForTimeout(300);

    const docInput = await page.$('input[type="text"]');
    if (docInput) {
      await docInput.click({ clickCount: 3 });
      await docInput.type(TEST_CONFIG.cedula, { delay: 30 });
    }

    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.click();
      await pwdInput.type(password, { delay: 30 });
    }

    const btnIngresar = await page.$('button');
    if (btnIngresar) await btnIngresar.click();

    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log('    Login OK');
    console.log('    URL:', page.url().substring(0, 80), '...\n');

    // 4. Esperar a que cargue la tabla de planillas
    console.log('[3] Esperando tabla de planillas...');
    await page.waitForTimeout(3000);

    // Verificar que hay planillas GUARDADAS
    const hayPlanillas = await page.evaluate(() => {
      return document.body.innerText.includes('GUARDADA');
    });

    if (!hayPlanillas) {
      throw new Error('No se encontraron planillas GUARDADAS');
    }
    console.log('    Planillas GUARDADAS encontradas');

    // 5. Click en botón de pagar de la primera planilla
    console.log('[4] Navegando a página de pago...');

    // Buscar el botón de pagar (es una imagen dentro de un link)
    // El selector correcto basado en el screenshot es el círculo verde en columna "Pagar"
    const btnPagar = await page.$('img[src*="pagar"]') ||
                     await page.$('a[href*="inicioPagoPlanillas"] img') ||
                     await page.$('td img[onclick]');

    if (!btnPagar) {
      // Intentar con JavaScript directo
      const clicked = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          if (src.includes('pagar')) {
            (img as HTMLElement).click();
            return true;
          }
        }
        // Buscar por el link href
        const links = document.querySelectorAll('a');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href.includes('inicioPagoPlanillas')) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        throw new Error('No se encontró botón de pagar');
      }
      console.log('    Click via JavaScript');
    } else {
      await btnPagar.click();
      console.log('    Click en imagen pagar');
    }

    // Esperar navegación
    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

    const urlAfterPagar = page.url();
    console.log('    URL:', urlAfterPagar.substring(0, 80), '...');

    if (!urlAfterPagar.includes('inicioPagoPlanillas') && !urlAfterPagar.includes('pago')) {
      console.log('    Advertencia: La URL no cambió a página de pago');
      await page.screenshot({ path: 'logs/screenshots/pse_debug_after_click.png', fullPage: true });
    }
    console.log('');

    // 6. Ejecutar Fase 2: Navegar al formulario PSE
    console.log('[5] Ejecutando Fase 2 (navegar a formulario PSE)...');
    const fase2Result = await pagarPlanillaPSE(page, TEST_CONFIG.numeroPlanilla);

    if (!fase2Result.success) {
      throw new Error(`Fase 2 falló: ${fase2Result.error}`);
    }

    console.log('    Fase 2 completada');
    console.log('    Estado:', fase2Result.estado);
    console.log('    URL:', fase2Result.urlActual);
    console.log('    Selectores:', JSON.stringify(fase2Result.selectoresEncontrados, null, 2));
    console.log('');

    // 7. Ejecutar Fase 3: Completar formulario y navegar al banco
    console.log('[6] Ejecutando Fase 3 (completar formulario PSE)...');
    console.log('    Tipo Aportante: JURIDICA');
    console.log('    Banco: BANCOLOMBIA');
    console.log('');

    const fase3Result = await completarFormularioPSE(page, {
      tipoAportante: 'JURIDICA',
      banco: PSE_CONFIG.VALUES.bancolombia,
    });

    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO FASE 3');
    console.log('='.repeat(60));

    if (fase3Result.success) {
      console.log('\n  ✅ ÉXITO - LLEGAMOS AL BANCO');
      console.log(`  Estado: ${fase3Result.estado}`);
      console.log(`  URL Banco: ${fase3Result.urlBanco}`);
      console.log(`  Screenshot: ${fase3Result.screenshotPath}`);
      console.log('');
      console.log('  ⛔ BOT SE DETIENE AQUÍ');
      console.log('  El admin debe ingresar credenciales manualmente');
    } else {
      console.log('\n  ❌ ERROR');
      console.log(`  Mensaje: ${fase3Result.error}`);
      console.log(`  Screenshot: ${fase3Result.screenshotPath}`);
    }

    console.log('\n' + '='.repeat(60));

    // Mantener browser abierto para inspección manual
    console.log('\nManteniendo browser abierto 60 segundos para inspección...');
    console.log('El admin puede ingresar credenciales del banco manualmente.\n');

    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error);
    await page.screenshot({ path: 'logs/screenshots/pse_fase3_error.png', fullPage: true });
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nBrowser cerrado.');
  }
}

main().catch(console.error);
