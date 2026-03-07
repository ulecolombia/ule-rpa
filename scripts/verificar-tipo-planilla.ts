/**
 * Script para verificar las opciones del select tipoPlanilla en SOI
 *
 * Este script:
 * 1. Login a SOI
 * 2. Navega a crear planilla en línea
 * 3. Espera que cargue el formulario
 * 4. Extrae todas las opciones del select tipoPlanilla
 */

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../src/utils/crypto';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function verificarTipoPlanilla() {
  console.log('='.repeat(60));
  console.log('VERIFICAR OPCIONES DE TIPO PLANILLA');
  console.log('='.repeat(60));

  // Obtener credenciales (usuario con credenciales SOI válidas)
  const user = await prisma.enlaceUser.findFirst({
    where: { id: 'test-camilo-001' }
  });

  if (!user || !user.soiPassword || !user.soiPasswordIV) {
    throw new Error('Usuario no encontrado o sin credenciales SOI');
  }

  const password = decryptPassword(user.soiPassword, user.soiPasswordIV);
  console.log('✅ Credenciales obtenidas');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 900 }
  });

  const page = await browser.newPage();

  try {
    // 1. Login
    console.log('\n[1] Login a SOI...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/index.do?LoginIndependiente=true', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await page.waitForSelector('#tipoIdUsuario', { timeout: 10000 });
    await page.select('#tipoIdUsuario', 'CC');
    await page.type('#idNumeroIdentificacionUsuario', user.numeroDocumento);
    await page.type('#idClaveUsuario', password);
    await page.click('#botonIngresarIndp');

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    console.log('✅ Login exitoso');

    // Obtener sessionID
    const currentUrl = page.url();
    const sessionMatch = currentUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);

    if (!sessionMatch) {
      throw new Error('No se encontró sessionID');
    }

    const sessionId = sessionMatch[1];
    console.log(`✅ SessionID: ${sessionId.substring(0, 20)}...`);

    // 2. Navegar a crear planilla
    console.log('\n[2] Navegando a crear planilla en línea...');
    const targetUrl = `https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do;nuevoSoiAchColombiaSessionID=${sessionId}`;

    await page.goto(targetUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Esperar que cargue el formulario
    await page.waitForSelector('select[name="tipoPlanilla"]', { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('✅ Formulario cargado');

    // 3. Extraer información del formulario
    console.log('\n[3] Extrayendo información del formulario...');

    const formInfo = await page.evaluate(() => {
      const result: any = {};

      // Tipo Aportante
      const tipoAportante = document.querySelector('select[name="tipoAportante"]') as HTMLSelectElement;
      if (tipoAportante) {
        result.tipoAportante = {
          value: tipoAportante.value,
          selectedText: tipoAportante.options[tipoAportante.selectedIndex]?.text,
          options: Array.from(tipoAportante.options).map(o => ({ value: o.value, text: o.text }))
        };
      }

      // Clase Aportante
      const claseAportante = document.querySelector('select[name="claseAportante"]') as HTMLSelectElement;
      if (claseAportante) {
        result.claseAportante = {
          value: claseAportante.value,
          selectedText: claseAportante.options[claseAportante.selectedIndex]?.text,
          options: Array.from(claseAportante.options).map(o => ({ value: o.value, text: o.text }))
        };
      }

      // Tipo Planilla
      const tipoPlanilla = document.querySelector('select[name="tipoPlanilla"]') as HTMLSelectElement;
      if (tipoPlanilla) {
        result.tipoPlanilla = {
          value: tipoPlanilla.value,
          selectedText: tipoPlanilla.options[tipoPlanilla.selectedIndex]?.text,
          options: Array.from(tipoPlanilla.options).map(o => ({ value: o.value, text: o.text })),
          disabled: tipoPlanilla.disabled
        };
      }

      // Periodo
      const periodoMes = document.querySelector('#periodoLiquidacionMes') as HTMLSelectElement;
      const periodoAnio = document.querySelector('#periodoLiquidacionAnnio') as HTMLSelectElement;

      if (periodoMes && periodoAnio) {
        result.periodo = {
          mes: {
            value: periodoMes.value,
            options: Array.from(periodoMes.options).map(o => ({ value: o.value, text: o.text }))
          },
          anio: {
            value: periodoAnio.value,
            options: Array.from(periodoAnio.options).map(o => ({ value: o.value, text: o.text }))
          }
        };
      }

      return result;
    });

    console.log('\n' + '='.repeat(60));
    console.log('INFORMACIÓN DEL FORMULARIO');
    console.log('='.repeat(60));

    console.log('\n[TIPO APORTANTE]');
    console.log(`  Valor actual: ${formInfo.tipoAportante?.value}`);
    console.log(`  Texto: ${formInfo.tipoAportante?.selectedText}`);
    console.log('  Opciones:');
    formInfo.tipoAportante?.options?.forEach((o: any) => {
      console.log(`    - "${o.value}" = "${o.text}"`);
    });

    console.log('\n[CLASE APORTANTE]');
    console.log(`  Valor actual: ${formInfo.claseAportante?.value}`);
    console.log(`  Texto: ${formInfo.claseAportante?.selectedText}`);
    console.log('  Opciones:');
    formInfo.claseAportante?.options?.forEach((o: any) => {
      console.log(`    - "${o.value}" = "${o.text}"`);
    });

    console.log('\n[TIPO PLANILLA] ⭐');
    console.log(`  Valor actual: ${formInfo.tipoPlanilla?.value}`);
    console.log(`  Texto: ${formInfo.tipoPlanilla?.selectedText}`);
    console.log(`  Disabled: ${formInfo.tipoPlanilla?.disabled}`);
    console.log('  Opciones:');
    formInfo.tipoPlanilla?.options?.forEach((o: any) => {
      const marker = o.value === 'I' ? ' ⭐' : '';
      console.log(`    - "${o.value}" = "${o.text}"${marker}`);
    });

    console.log('\n[PERIODO]');
    console.log(`  Mes actual: ${formInfo.periodo?.mes?.value}`);
    console.log(`  Año actual: ${formInfo.periodo?.anio?.value}`);

    // Tomar screenshot
    await page.screenshot({
      path: './logs/screenshots/verificar_tipo_planilla.png',
      fullPage: true
    });
    console.log('\n✅ Screenshot guardado en: ./logs/screenshots/verificar_tipo_planilla.png');

    // 4. Verificar si hay eventos que cargan opciones
    console.log('\n[4] Verificando si tipoPlanilla cambia al modificar tipoAportante...');

    // Intentar disparar evento change en tipoAportante
    await page.evaluate(() => {
      const tipoAportante = document.querySelector('select[name="tipoAportante"]') as HTMLSelectElement;
      if (tipoAportante) {
        tipoAportante.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await page.waitForTimeout(2000);

    // Re-extraer opciones de tipoPlanilla
    const tipoPlanillaAfter = await page.evaluate(() => {
      const tipoPlanilla = document.querySelector('select[name="tipoPlanilla"]') as HTMLSelectElement;
      if (tipoPlanilla) {
        return {
          value: tipoPlanilla.value,
          selectedText: tipoPlanilla.options[tipoPlanilla.selectedIndex]?.text,
          options: Array.from(tipoPlanilla.options).map(o => ({ value: o.value, text: o.text })),
          disabled: tipoPlanilla.disabled
        };
      }
      return null;
    });

    console.log('\n[TIPO PLANILLA DESPUÉS DE CHANGE EVENT]');
    console.log(`  Valor: ${tipoPlanillaAfter?.value}`);
    console.log(`  Texto: ${tipoPlanillaAfter?.selectedText}`);
    console.log(`  Disabled: ${tipoPlanillaAfter?.disabled}`);
    console.log('  Opciones:');
    tipoPlanillaAfter?.options?.forEach((o: any) => {
      const marker = o.value === 'I' ? ' ⭐' : '';
      console.log(`    - "${o.value}" = "${o.text}"${marker}`);
    });

    // Tomar otro screenshot
    await page.screenshot({
      path: './logs/screenshots/verificar_tipo_planilla_after.png',
      fullPage: true
    });

    console.log('\n' + '='.repeat(60));
    console.log('VERIFICACIÓN COMPLETADA');
    console.log('Presiona Ctrl+C para cerrar el navegador...');
    console.log('='.repeat(60));

    // Mantener navegador abierto para inspección manual
    await new Promise(() => {});

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({
      path: './logs/screenshots/verificar_error.png',
      fullPage: true
    });
  } finally {
    await prisma.$disconnect();
  }
}

verificarTipoPlanilla().catch(console.error);
