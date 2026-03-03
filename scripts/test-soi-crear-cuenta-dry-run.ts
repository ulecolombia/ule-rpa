/**
 * Test: Simulacro de creación de cuenta SOI (DRY RUN)
 *
 * Este script ejecuta TODO el flujo de creación de cuenta SOI
 * EXCEPTO el click final en "Finalizar", para verificar que el bot funciona
 * sin crear realmente una cuenta.
 *
 * Flujo:
 * 1. Navegar a página de registro de independientes
 * 2. Paso 1: Llenar datos personales (documento, nombres)
 * 3. Click en "Siguiente"
 * 4. Paso 2: Llenar datos de contacto (ubicación, teléfono, email)
 * 5. Marcar checkbox de términos
 * 6. DETENERSE antes de "Finalizar" y tomar screenshot
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { config } from '../src/utils/config';

// Datos de prueba para el simulacro
const TEST_USER = {
  tipoDocumento: 'CC',
  documento: '9876543210', // Documento ficticio
  nombres: 'Usuario',
  apellidos: 'Prueba Simulacro',
  departamento: 'Bogotá D.C.',
  municipio: 'Bogotá D.C.',
};

// Datos fijos de ULE
const ULE_CONFIG = {
  email: 'pagos.ule@gmail.com',
  celular: '3001234567',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function selectOption(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    const selected = await page.evaluate(
      (sel: string, val: string) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        if (select) {
          const options = Array.from(select.options);
          const option = options.find(
            (opt) =>
              opt.value.toLowerCase().includes(val.toLowerCase()) ||
              opt.text.toLowerCase().includes(val.toLowerCase())
          );
          if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      },
      selector,
      value
    );
    return selected;
  } catch (error) {
    console.log(`⚠️ Could not select option: ${selector} = ${value}`);
    return false;
  }
}

async function fillInput(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value, { delay: 30 });
    return true;
  } catch (error) {
    console.log(`⚠️ Could not fill input: ${selector}`);
    return false;
  }
}

function generateRandomPhone(): string {
  const prefixes = ['300', '301', '302', '310', '311', '312', '320', '321'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${prefix}${number}`;
}

async function main() {
  console.log('🚀 SIMULACRO DE CREACIÓN DE CUENTA SOI (DRY RUN)');
  console.log('='.repeat(60));
  console.log('\nEste script ejecuta el flujo completo EXCEPTO el click final.\n');

  const browserManager = new BrowserManager({
    headless: false, // Visible para poder ver el proceso
    downloadsPath: './downloads/soi-test',
  });

  let page: Page | null = null;

  try {
    // Iniciar navegador
    console.log('📱 Iniciando navegador...');
    await browserManager.launch();
    page = await browserManager.newPage();

    // ============================================
    // PASO 1: Navegar a página de registro
    // ============================================
    console.log('\n📍 Navegando a página de registro de independientes...');
    await page.goto(SOI_SELECTORS.URLS.REGISTRO_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await browserManager.takeScreenshot(page, 'dry-run-step0-landing');
    console.log('✅ Página de registro cargada');

    // Esperar formulario
    await page.waitForSelector(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO, {
      timeout: 10000,
    });

    // ============================================
    // PASO 2: Llenar datos personales (Paso 1 del form)
    // ============================================
    console.log('\n📝 PASO 1: Llenando datos personales...');

    // Tipo de documento
    const tipoDocMap: Record<string, string> = {
      CC: 'Cédula de ciudadanía',
      CE: 'Cédula de extranjería',
      PA: 'Pasaporte',
    };
    const tipoDocValue = tipoDocMap[TEST_USER.tipoDocumento] || TEST_USER.tipoDocumento;

    console.log(`   → Tipo documento: ${tipoDocValue}`);
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TIPO_DOCUMENTO, tipoDocValue);
    await sleep(300);

    // Número de documento
    console.log(`   → Número documento: ${TEST_USER.documento}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NUMERO_DOCUMENTO, TEST_USER.documento);
    await sleep(300);

    // Nombres
    console.log(`   → Nombres: ${TEST_USER.nombres}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.NOMBRES, TEST_USER.nombres);
    await sleep(300);

    // Apellidos
    console.log(`   → Apellidos: ${TEST_USER.apellidos}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.APELLIDOS, TEST_USER.apellidos);
    await sleep(500);

    await browserManager.takeScreenshot(page, 'dry-run-step1-datos-personales');
    console.log('✅ Datos personales completados');

    // ============================================
    // PASO 3: Click en "Siguiente"
    // ============================================
    console.log('\n⏭️ Haciendo click en "Siguiente"...');

    // Esperar a que el botón esté habilitado
    try {
      await page.waitForFunction(
        (selector: string) => {
          const btn = document.querySelector(selector) as HTMLButtonElement;
          return btn && !btn.classList.contains('btn-disabled') && !btn.disabled;
        },
        { timeout: 5000 },
        SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE
      );
    } catch {
      console.log('⚠️ Botón Siguiente puede estar deshabilitado, intentando igual...');
    }

    await page.click(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_SIGUIENTE);
    await sleep(2000);

    await browserManager.takeScreenshot(page, 'dry-run-step2-after-siguiente');
    console.log('✅ Pasamos al paso 2');

    // ============================================
    // PASO 4: Llenar datos de contacto (Paso 2 del form)
    // ============================================
    console.log('\n📝 PASO 2: Llenando datos de contacto...');

    // Esperar campos del paso 2
    await page.waitForSelector(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DEPARTAMENTO, {
      visible: true,
      timeout: 10000,
    });

    // Departamento
    console.log(`   → Departamento: ${TEST_USER.departamento}`);
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DEPARTAMENTO, TEST_USER.departamento);
    await sleep(1500); // Esperar carga de municipios

    // Municipio
    console.log(`   → Municipio: ${TEST_USER.municipio}`);
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.MUNICIPIO, TEST_USER.municipio);
    await sleep(300);

    // Dirección
    const direccion = 'Calle Principal 123';
    console.log(`   → Dirección: ${direccion}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.DIRECCION, direccion);
    await sleep(300);

    // Teléfono (random)
    const telefono = generateRandomPhone();
    console.log(`   → Teléfono: ${telefono}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.TELEFONO, telefono);
    await sleep(300);

    // Celular (ULE)
    console.log(`   → Celular (ULE): ${ULE_CONFIG.celular}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CELULAR, ULE_CONFIG.celular);
    await sleep(300);

    // Email (ULE)
    console.log(`   → Email (ULE): ${ULE_CONFIG.email}`);
    await fillInput(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CORREO, ULE_CONFIG.email);
    await sleep(300);

    // Cómo nos conociste
    console.log(`   → Cómo nos conociste: Búsqueda en web`);
    await selectOption(page, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.COMO_NOS_CONOCISTE, 'Búsqueda en web');
    await sleep(300);

    await browserManager.takeScreenshot(page, 'dry-run-step3-datos-contacto');
    console.log('✅ Datos de contacto completados');

    // ============================================
    // PASO 5: Aceptar términos y condiciones
    // ============================================
    console.log('\n☑️ Aceptando términos y condiciones...');

    const checkbox = await page.$(SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CHECKBOX_TERMINOS);
    if (checkbox) {
      const isChecked = await page.evaluate(
        (sel: string) => (document.querySelector(sel) as HTMLInputElement)?.checked,
        SOI_SELECTORS.REGISTRO_INDEPENDIENTE.CHECKBOX_TERMINOS
      );
      if (!isChecked) {
        await checkbox.click();
        await sleep(300);
        console.log('✅ Checkbox marcado');
      } else {
        console.log('✅ Checkbox ya estaba marcado');
      }
    } else {
      console.log('⚠️ No se encontró el checkbox de términos');
    }

    await browserManager.takeScreenshot(page, 'dry-run-step4-terminos-aceptados');

    // ============================================
    // PASO 6: Verificar estado del botón Finalizar
    // ============================================
    console.log('\n🔍 Verificando estado del botón "Finalizar"...');

    const btnFinalizarState = await page.evaluate((selector: string) => {
      const btn = document.querySelector(selector) as HTMLButtonElement;
      if (!btn) return { exists: false, enabled: false, text: '' };
      return {
        exists: true,
        enabled: !btn.disabled && !btn.classList.contains('btn-disabled'),
        text: btn.textContent?.trim() || '',
        classes: btn.className,
      };
    }, SOI_SELECTORS.REGISTRO_INDEPENDIENTE.BTN_FINALIZAR);

    console.log(`   → Botón existe: ${btnFinalizarState.exists}`);
    console.log(`   → Botón habilitado: ${btnFinalizarState.enabled}`);
    console.log(`   → Texto del botón: ${btnFinalizarState.text}`);

    await browserManager.takeScreenshot(page, 'dry-run-step5-listo-para-finalizar');

    // ============================================
    // RESULTADO FINAL
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADO DEL SIMULACRO');
    console.log('='.repeat(60));

    if (btnFinalizarState.exists && btnFinalizarState.enabled) {
      console.log('\n✅ ¡ÉXITO! El formulario está completamente lleno y listo para enviar.');
      console.log('   El botón "Finalizar" está HABILITADO.');
      console.log('\n⚠️ NO se hizo click en "Finalizar" (esto es un simulacro).');
      console.log('   En producción, el RPA haría click y SOI enviaría la contraseña al email.');
    } else if (btnFinalizarState.exists && !btnFinalizarState.enabled) {
      console.log('\n⚠️ El botón "Finalizar" existe pero está DESHABILITADO.');
      console.log('   Puede que falte algún campo requerido o validación.');
    } else {
      console.log('\n❌ No se encontró el botón "Finalizar".');
      console.log('   Revisar los selectores o la estructura del formulario.');
    }

    console.log('\n📸 Screenshots guardados en: ./screenshots/dry-run-*.png');

    // Esperar un poco para que el usuario pueda ver el resultado
    console.log('\n⏳ El navegador se cerrará en 10 segundos...');
    console.log('   (Puedes revisar el formulario en el navegador)');
    await sleep(10000);

  } catch (error) {
    console.error('\n❌ Error durante el simulacro:', error instanceof Error ? error.message : error);
    if (page) {
      await browserManager.takeScreenshot(page, 'dry-run-error');
    }
  } finally {
    console.log('\n🔒 Cerrando navegador...');
    await browserManager.close();
    console.log('✅ Navegador cerrado');
  }
}

// Ejecutar
main().catch(console.error);
