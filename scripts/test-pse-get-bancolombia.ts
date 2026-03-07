/**
 * Test: Obtener el value de Bancolombia del select de entidades financieras
 */

import { PrismaClient } from '@prisma/client';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { decryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

const TEST_CONFIG = {
  cedula: '1047478670',
};

async function main() {
  console.log('TEST: Obtener value de Bancolombia\n');

  const user = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: TEST_CONFIG.cedula },
  });

  if (!user?.soiPassword || !user?.soiPasswordIV) {
    throw new Error('Usuario sin credenciales SOI');
  }

  const password = decryptPassword(user.soiPassword, user.soiPasswordIV);

  const browserManager = new BrowserManager({ headless: false });
  const browser = await browserManager.launch();
  const page = await browserManager.newPage();

  try {
    // Login
    console.log('[1] Login a SOI...');
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
    console.log('    Login OK\n');

    // Click en pagar
    console.log('[2] Navegando a formulario PSE...');
    const btnPagar = await page.$('a img[src*="pagar"], img[src*="pagar"]');
    if (btnPagar) {
      await btnPagar.click();
      await page.waitForTimeout(3000);
    }

    // Click en PSE
    const pseLink = await page.$('a[href*="pagoPlanillaPSEInicio"]');
    if (pseLink) {
      await pseLink.click();
      await page.waitForTimeout(3000);
    }

    // Manejar advertencia PSE-04006
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('PSE-04006') || page.url().includes('pagoPlanillaPSEInicio')) {
      console.log('    Manejando advertencia PSE-04006...');
      const btnSi = await page.$('input[value="Si"]');
      if (btnSi) {
        await btnSi.click();
        await page.waitForTimeout(3000);
      }
    }

    console.log('    URL:', page.url());
    console.log('    En formulario PSE\n');

    // Obtener TODAS las opciones del select de entidades financieras
    console.log('[3] Obteniendo opciones de Entidad Financiera...\n');

    const opciones = await page.evaluate(() => {
      const select = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
      if (!select) return [];

      return Array.from(select.options).map(o => ({
        value: o.value,
        text: o.text,
      }));
    });

    console.log(`Total de opciones: ${opciones.length}\n`);

    // Buscar Bancolombia
    console.log('Buscando Bancolombia...\n');
    const bancolombia = opciones.find(o =>
      o.text.toLowerCase().includes('bancolombia')
    );

    if (bancolombia) {
      console.log('========================================');
      console.log('BANCOLOMBIA ENCONTRADO:');
      console.log('========================================');
      console.log(`  value: "${bancolombia.value}"`);
      console.log(`  text:  "${bancolombia.text}"`);
      console.log('========================================\n');
    } else {
      console.log('Bancolombia NO encontrado. Listando todas las opciones:\n');
      for (const opt of opciones) {
        console.log(`  "${opt.value}" => "${opt.text}"`);
      }
    }

    // También buscar tipo de aportante
    console.log('\n[4] Opciones de Tipo de Aportante:\n');
    const tipoOpciones = await page.evaluate(() => {
      const select = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
      if (!select) return [];

      return Array.from(select.options).map(o => ({
        value: o.value,
        text: o.text,
      }));
    });

    for (const opt of tipoOpciones) {
      console.log(`  "${opt.value}" => "${opt.text}"`);
    }

    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nFinalizado.');
  }
}

main().catch(console.error);
