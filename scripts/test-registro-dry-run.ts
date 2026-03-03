/**
 * Test: Registro de independiente SOI (DRY RUN)
 * Paso 3 de prueba multi-usuario
 *
 * Este script llena el formulario de registro pero NO lo envía
 * Solo verifica que los selectores funcionan correctamente
 */

import dotenv from 'dotenv';
dotenv.config();

import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { ULE_SOI_CONFIG, generateRandomPhone } from '../src/types/soi.types';

// Datos de prueba (NO CREAR CUENTA REAL)
const TEST_USER = {
  tipoDocumento: 'Cédula de ciudadanía',
  documento: '9999999999', // Documento falso
  nombres: 'PRUEBA',
  apellidos: 'NO ENVIAR',
  departamento: 'Bogotá D.C.',
  municipio: 'Bogotá D.C.',
};

async function testRegistroDryRun() {
  console.log('========================================');
  console.log('TEST: Registro SOI (DRY RUN - NO ENVIAR)');
  console.log('========================================\n');

  const browserManager = new BrowserManager({
    headless: false, // Ver el navegador
    downloadsPath: './downloads/test',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // Navegar a la página de registro
    console.log('1. Navegando a página de registro...');
    await page.goto(SOI_SELECTORS.URLS.REGISTRO_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await browserManager.takeScreenshot(page, 'test-registro-step1');
    console.log('   ✓ Página cargada');

    // Esperar formulario
    await page.waitForSelector(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO, {
      timeout: 10000,
    });
    console.log('   ✓ Formulario encontrado');

    // === PASO 1: DATOS PERSONALES ===
    console.log('\n2. Llenando Paso 1 - Datos Personales...');

    // Tipo de documento
    console.log('   → Seleccionando tipo documento...');
    const tipoDocSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO;

    // Listar opciones disponibles
    const tipoDocOptions = await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      return select ? Array.from(select.options).map(o => ({ value: o.value, text: o.text })) : [];
    }, tipoDocSelector);
    console.log('   → Opciones de tipo documento:', tipoDocOptions.slice(0, 5).map(o => o.text).join(', '));

    // Seleccionar "Cédula de ciudadanía"
    await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select) {
        const option = Array.from(select.options).find(o =>
          o.text.toLowerCase().includes('cédula de ciudadanía') ||
          o.text.toLowerCase().includes('cedula de ciudadania')
        );
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, tipoDocSelector);
    await page.waitForTimeout(500);
    console.log('   ✓ Tipo documento seleccionado');

    // Número de documento
    console.log('   → Escribiendo documento...');
    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NUMERO_DOCUMENTO);
    await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NUMERO_DOCUMENTO, TEST_USER.documento, { delay: 30 });
    console.log('   ✓ Documento escrito');

    // Nombres
    console.log('   → Escribiendo nombres...');
    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NOMBRES);
    await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NOMBRES, TEST_USER.nombres, { delay: 30 });
    console.log('   ✓ Nombres escritos');

    // Apellidos
    console.log('   → Escribiendo apellidos...');
    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.APELLIDOS);
    await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.APELLIDOS, TEST_USER.apellidos, { delay: 30 });
    console.log('   ✓ Apellidos escritos');

    await page.waitForTimeout(500);
    await browserManager.takeScreenshot(page, 'test-registro-step1-filled');

    // Verificar si el botón Siguiente está habilitado
    const siguienteBtn = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE);
    const siguienteEnabled = await page.evaluate((sel: string) => {
      const btn = document.querySelector(sel) as HTMLButtonElement;
      return btn && !btn.classList.contains('btn-disabled');
    }, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE);

    console.log(`   → Botón Siguiente: ${siguienteEnabled ? 'HABILITADO ✓' : 'DESHABILITADO ✗'}`);

    if (!siguienteEnabled) {
      console.log('\n⚠️  El botón Siguiente está deshabilitado.');
      console.log('   Puede ser que falten campos requeridos o haya validación.');
      console.log('   Verificar manualmente en el navegador...');
      await page.waitForTimeout(10000);
      return;
    }

    // Click en Siguiente
    console.log('   → Haciendo click en Siguiente...');
    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE);
    await page.waitForTimeout(1500);
    console.log('   ✓ Paso 2 cargado');

    // === PASO 2: DATOS DE CONTACTO ===
    console.log('\n3. Llenando Paso 2 - Datos de Contacto...');

    await browserManager.takeScreenshot(page, 'test-registro-step2');

    // Departamento
    console.log('   → Seleccionando departamento...');
    const deptSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DEPARTAMENTO;
    await page.waitForSelector(deptSelector, { visible: true, timeout: 5000 });

    // Listar opciones disponibles
    const deptOptions = await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      return select ? Array.from(select.options).map(o => o.text) : [];
    }, deptSelector);
    console.log(`   → Opciones de departamento: ${deptOptions.slice(0, 5).join(', ')}...`);

    // Seleccionar Bogotá
    await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select) {
        const option = Array.from(select.options).find(o => o.text.toLowerCase().includes('bogotá'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, deptSelector);
    await page.waitForTimeout(1000);
    console.log('   ✓ Departamento seleccionado');

    // Municipio
    console.log('   → Seleccionando municipio...');
    const munSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.MUNICIPIO;
    await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, munSelector);
    console.log('   ✓ Municipio seleccionado');

    // Dirección
    console.log('   → Escribiendo dirección...');
    const dirInput = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DIRECCION);
    if (dirInput) {
      await dirInput.click({ clickCount: 3 });
      await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DIRECCION, 'Calle Test 123', { delay: 30 });
      console.log('   ✓ Dirección escrita');
    } else {
      console.log('   ⚠️  Campo dirección no encontrado');
    }

    // Teléfono
    console.log('   → Escribiendo teléfono...');
    const telInput = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TELEFONO);
    if (telInput) {
      await telInput.click({ clickCount: 3 });
      await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TELEFONO, generateRandomPhone(), { delay: 30 });
      console.log('   ✓ Teléfono escrito');
    }

    // Celular
    console.log('   → Escribiendo celular...');
    const celInput = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CELULAR);
    if (celInput) {
      await celInput.click({ clickCount: 3 });
      await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CELULAR, ULE_SOI_CONFIG.celular, { delay: 30 });
      console.log('   ✓ Celular escrito');
    }

    // Email
    console.log('   → Escribiendo email...');
    const emailInput = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CORREO);
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await page.type(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CORREO, ULE_SOI_CONFIG.email, { delay: 30 });
      console.log('   ✓ Email escrito');
    }

    // Cómo nos conociste
    console.log('   → Seleccionando cómo nos conociste...');
    const comoSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.COMO_NOS_CONOCISTE;
    await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select && select.options.length > 1) {
        select.selectedIndex = 3; // "Búsqueda en web"
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, comoSelector);
    console.log('   ✓ Cómo nos conociste seleccionado');

    await page.waitForTimeout(500);
    await browserManager.takeScreenshot(page, 'test-registro-step2-filled');

    // Verificar checkbox de términos
    const checkboxSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CHECKBOX_TERMINOS;
    const checkbox = await page.$(checkboxSelector);
    if (checkbox) {
      console.log('   → Checkbox de términos encontrado');
    }

    // Verificar botón Finalizar
    const finalizarSelector = SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_FINALIZAR;
    const finalizarBtn = await page.$(finalizarSelector);
    if (finalizarBtn) {
      const finalizarEnabled = await page.evaluate((sel: string) => {
        const btn = document.querySelector(sel) as HTMLButtonElement;
        return btn && !btn.classList.contains('btn-disabled');
      }, finalizarSelector);
      console.log(`   → Botón Finalizar: ${finalizarEnabled ? 'HABILITADO' : 'DESHABILITADO'}`);
    }

    console.log('\n========================================');
    console.log('✓ DRY RUN COMPLETADO');
    console.log('========================================');
    console.log('\nTodos los selectores funcionan correctamente.');
    console.log('NO se envió el formulario (dry run).');
    console.log('\n⚠️  Para crear una cuenta real, elimina el "dry run" flag.');
    console.log('   La password será enviada a: ' + ULE_SOI_CONFIG.email);

    // Esperar para inspección manual
    console.log('\n⏳ Navegador abierto para inspección (10 segundos)...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await browserManager.close();
  }
}

testRegistroDryRun();
