/**
 * Test Mi Planilla Registro - DRY RUN
 *
 * Este script hace todo el flujo de registro en Mi Planilla
 * pero se DETIENE antes de hacer click en "Finalizar Registro".
 *
 * Útil para verificar que todos los selectores funcionan correctamente.
 *
 * Usage: npx tsx scripts/test-miplanilla-registro-dry-run.ts
 */

import { Page } from 'puppeteer';
import { BrowserManager } from '../src/bots/utils/browser';
import { config } from '../src/utils/config';
import {
  MIPLANILLA_URLS,
  MIPLANILLA_SELECTORS,
  generateMiPlanillaPassword,
} from '../src/types/miplanilla.types';

// Datos de prueba
const TEST_USER = {
  tipoDocumento: 'CC',
  documento: '1234567909', // Documento de prueba (no real)
  primerNombre: 'JUAN',
  segundoNombre: 'CARLOS',
  primerApellido: 'PRUEBA',
  segundoApellido: 'TEST',
  email: 'test@example.com',
  celular: '3001234567',
  telefonoFijo: '6011234567',
  direccion: 'Calle 123 # 45-67',
  ciudad: 'Bogo', // Parcial para autocomplete → selecciona "Bogotá"
  ingresosMensuales: 2000000,
  // Nombres para buscar en la lista del modal (click directo sin campo de búsqueda)
  epsNombre: 'ALIANSALUD', // EPS001 - ALIANSALUD EPS S.A.
  afpNombre: 'PORVENIR', // Fondo de pensiones común
  actividadEconomica: '9609',
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   MI PLANILLA REGISTRO - DRY RUN TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Este script probará todo el flujo de registro EXCEPTO el paso final.');
  console.log('Se detendrá ANTES de hacer click en "Finalizar Registro".');
  console.log('');

  const browserManager = new BrowserManager({
    headless: false, // Visible para ver el flujo
    downloadsPath: './downloads/test-miplanilla',
  });

  let page: Page | null = null;

  try {
    await browserManager.launch();
    page = await browserManager.newPage();

    // ═══════════════════════════════════════════════════════════════
    // PASO 1: Landing Page → Click "Independiente"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 1] Navegando a landing page...');
    await page.goto(MIPLANILLA_URLS.landing, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000); // Esperar carga adicional
    await browserManager.takeScreenshot(page, 'test-01-landing');
    console.log('✓ Landing cargado');

    // Click en Independiente
    console.log('  → Buscando botón "Independiente"...');
    const independienteClicked = await clickByText(page, 'Independiente');
    if (!independienteClicked) {
      throw new Error('No se encontró botón "Independiente"');
    }
    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'test-02-after-independiente');
    console.log('✓ Click en "Independiente"');

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: Portal Independientes → Cerrar popup → Click "REGISTRO"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 2] Portal de independientes...');
    await browserManager.takeScreenshot(page, 'test-03-portal');

    // Cerrar popup si existe
    console.log('  → Buscando popup para cerrar...');
    const popupClosed = await cerrarPopup(page);
    if (popupClosed) {
      console.log('✓ Popup cerrado');
      await page.waitForTimeout(500);
    } else {
      console.log('  (no había popup)');
    }

    // Click en REGISTRO
    console.log('  → Buscando botón "REGISTRO"...');
    const registroClicked = await clickByText(page, 'REGISTRO');
    if (!registroClicked) {
      // Intentar con "Registro"
      await clickByText(page, 'Registro');
    }
    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'test-04-registro-page');
    console.log('✓ Click en "REGISTRO"');

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: Ingresar documento → "Iniciar Registro"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 3] Ingresando documento...');

    // Buscar input de documento
    const docInput = await findInput(page, ['numeroDocumento', 'numDoc', 'documento']);
    if (docInput) {
      await page.click(docInput, { clickCount: 3 });
      await page.type(docInput, TEST_USER.documento, { delay: 50 });
      console.log(`✓ Documento ingresado: ${TEST_USER.documento}`);
    } else {
      console.log('⚠ No se encontró input de documento');
    }

    await browserManager.takeScreenshot(page, 'test-05-documento');

    // Click en Iniciar Registro - este click puede causar navegación
    console.log('  → Buscando botón "Iniciar Registro"...');

    // Usar Promise.all para manejar la posible navegación
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
        clickByText(page, 'Iniciar Registro'),
      ]);
    } catch (e) {
      // Si no hay navegación, continuar
    }

    // Esperar a que la página esté estable
    await page.waitForTimeout(3000);
    await browserManager.takeScreenshot(page, 'test-06-tipo-aporte');
    console.log('✓ Click en "Iniciar Registro"');

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: Seleccionar "Aporte Propio" e "Independiente"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 4] Seleccionando tipo de aporte...');

    // Click en Aporte Propio
    await clickByText(page, 'Aporte Propio');
    await page.waitForTimeout(1000);
    await browserManager.takeScreenshot(page, 'test-07-aporte-propio');
    console.log('✓ Seleccionado "Aporte Propio"');

    // Click en Independiente
    await clickByText(page, 'Independiente');
    await page.waitForTimeout(1000);
    await browserManager.takeScreenshot(page, 'test-08-independiente');
    console.log('✓ Seleccionado "Independiente"');

    // Click Continuar
    await clickByText(page, 'Continuar');
    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'test-09-info-basica');
    console.log('✓ Click en "Continuar"');

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: Información Básica (Step 1/3)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 5] Llenando información básica...');

    // Primer Nombre
    await fillInputByName(page, 'primerNombre', TEST_USER.primerNombre);
    console.log(`  ✓ Primer nombre: ${TEST_USER.primerNombre}`);

    // Segundo Nombre
    await fillInputByName(page, 'segundoNombre', TEST_USER.segundoNombre);
    console.log(`  ✓ Segundo nombre: ${TEST_USER.segundoNombre}`);

    // Primer Apellido
    await fillInputByName(page, 'primerApellido', TEST_USER.primerApellido);
    console.log(`  ✓ Primer apellido: ${TEST_USER.primerApellido}`);

    // Segundo Apellido
    await fillInputByName(page, 'segundoApellido', TEST_USER.segundoApellido);
    console.log(`  ✓ Segundo apellido: ${TEST_USER.segundoApellido}`);

    // Email
    await fillInputByName(page, 'correo', TEST_USER.email);
    console.log(`  ✓ Email: ${TEST_USER.email}`);

    // Celular
    await fillInputByName(page, 'celular', TEST_USER.celular);
    console.log(`  ✓ Celular: ${TEST_USER.celular}`);

    // Teléfono
    await fillInputByName(page, 'telefono', TEST_USER.telefonoFijo);
    console.log(`  ✓ Teléfono: ${TEST_USER.telefonoFijo}`);

    // Dirección
    await fillInputByName(page, 'direccion', TEST_USER.direccion);
    console.log(`  ✓ Dirección: ${TEST_USER.direccion}`);

    await browserManager.takeScreenshot(page, 'test-10-info-basica-partial');

    // Ciudad (autocompletado)
    console.log('  → Seleccionando ciudad (modal)...');
    await seleccionarCiudad(page, TEST_USER.ciudad);
    console.log(`  ✓ Ciudad: ${TEST_USER.ciudad}`);

    await browserManager.takeScreenshot(page, 'test-11-info-basica-filled');

    // Click Continuar
    await clickByText(page, 'Continuar');
    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'test-12-info-aportes');
    console.log('✓ Información básica completada');

    // ═══════════════════════════════════════════════════════════════
    // PASO 6: Información de Aportes (Step 2/3)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 6] Llenando información de aportes...');

    // Esperar a que la página esté estable
    await page.waitForTimeout(2000);

    // ¿Ubicación exterior? → No (buscar el botón "No" específico)
    try {
      await page.evaluate(() => {
        const labels = document.querySelectorAll('label, button, div[role="button"]');
        for (const label of labels) {
          const text = label.textContent?.toLowerCase() || '';
          if (text.includes('no') && text.includes('ubicación') && text.includes('colombia')) {
            (label as HTMLElement).click();
            return;
          }
        }
        // Fallback: buscar cualquier "No" cerca de "exterior"
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.toLowerCase().includes('no, mi ubicación')) {
            (el as HTMLElement).click();
            return;
          }
        }
      });
      await page.waitForTimeout(1000);
      console.log('  ✓ Ubicación: Colombia');
    } catch (e) {
      console.log('  ⚠ No se pudo seleccionar ubicación, continuando...');
    }

    // ¿Estás obligado a cotizar pensión? → Sí (usando click NATIVO)
    const pensionButtons = await page.$$('button, div, span, label');
    let pensionClicked = false;
    for (const btn of pensionButtons) {
      const text = await btn.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
      // Buscar el texto exacto del botón
      if (text === 'Si, debo cotizar a pensión') {
        const box = await btn.boundingBox();
        if (box && box.width > 50) {
          await btn.click();
          pensionClicked = true;
          console.log('  ✓ Pensión: Si, debo cotizar (click nativo)');
          break;
        }
      }
    }
    if (!pensionClicked) {
      console.log('  ⚠ No se encontró botón de pensión');
    }
    await page.waitForTimeout(1000);
    await browserManager.takeScreenshot(page, 'test-13a-pension-seleccionada');

    // Ingresos mensuales - buscar input con valor "0" y reemplazar
    const ingresosInputs = await page.$$('input');
    let ingresosFilled = false;
    for (const inp of ingresosInputs) {
      const value = await inp.evaluate(el => (el as HTMLInputElement).value);
      const type = await inp.evaluate(el => (el as HTMLInputElement).type);
      // El input de ingresos tiene valor "0" y es tipo text o number
      if ((value === '0' || value === '') && (type === 'text' || type === 'number' || type === '')) {
        const box = await inp.boundingBox();
        if (box && box.width > 50) { // Input visible y de tamaño razonable
          await inp.click({ clickCount: 3 }); // Triple click para seleccionar
          await page.keyboard.type(TEST_USER.ingresosMensuales.toString(), { delay: 30 });
          ingresosFilled = true;
          console.log(`  ✓ Ingresos: ${TEST_USER.ingresosMensuales}`);
          break;
        }
      }
    }
    if (!ingresosFilled) {
      console.log('  ⚠ No se pudo llenar ingresos');
    }

    await browserManager.takeScreenshot(page, 'test-13-aportes-partial');

    // EPS - click directo en la lista
    console.log('  → Seleccionando EPS...');
    await seleccionarModalConCodigo(page, 'EPS', TEST_USER.epsNombre);

    // Esperar que el modal se cierre y hacer scroll para ver AFP
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(500);

    // AFP - click directo en la lista
    console.log('  → Seleccionando AFP...');
    await seleccionarModalConCodigo(page, 'AFP', TEST_USER.afpNombre);

    // ¿Aportas a riesgos laborales de forma voluntaria? → No
    console.log('  → Respondiendo ARL voluntaria...');
    await clickBotonPregunta(page, 'riesgos laborales', 'No');

    // ¿Aportas a cajas de compensación familiar voluntaria? → No
    console.log('  → Respondiendo Cajas de compensación...');
    await clickBotonPregunta(page, 'cajas de compensación', 'No');

    // ¿Eres un trabajador nuevo? → No
    console.log('  → Respondiendo Trabajador nuevo...');
    await clickBotonPregunta(page, 'trabajador nuevo', 'No');

    await browserManager.takeScreenshot(page, 'test-14-aportes-filled');

    // Click Continuar
    await clickByText(page, 'Continuar');
    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'test-15-datos-usuario');
    console.log('✓ Información de aportes completada');

    // ═══════════════════════════════════════════════════════════════
    // PASO 7: Datos de Usuario (Step 3/3) - ÚLTIMO PASO ANTES DE CREAR
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 7] Llenando datos de usuario (ÚLTIMO PASO)...');

    await browserManager.takeScreenshot(page, 'test-15b-paso7-inicio');

    // Usar clicks nativos de Puppeteer para todos los botones Sí/No
    // Estructura de la página:
    // 1. "¿Deseas recibir información... vía correo electrónico?" → Sí
    // 2. "¿Deseas recibir información... vía mensaje de texto?" → No
    // 3. Password fields
    // 4. "¿Autorizas... tratamiento de tus datos personales?" → Sí
    // 5. "¿Aceptas términos y condiciones de uso?" → Sí

    // Recopilar TODOS los botones Sí/No en la página con sus posiciones
    const allButtons = await page.$$('button, div[role="button"], span, label');
    const siNoButtons: { el: any; text: string; y: number }[] = [];

    for (const btn of allButtons) {
      const text = await btn.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
      // Solo botones que dicen exactamente "Sí" o "No" (o "Si")
      if (text === 'Sí' || text === 'Si' || text === 'No') {
        const box = await btn.boundingBox();
        if (box && box.width > 30 && box.height > 20) {
          siNoButtons.push({ el: btn, text, y: box.y });
        }
      }
    }

    // Ordenar por posición Y (de arriba a abajo)
    siNoButtons.sort((a, b) => a.y - b.y);
    console.log(`    [DEBUG] Encontrados ${siNoButtons.length} botones Sí/No`);

    // Debug: mostrar todos los botones
    for (let i = 0; i < siNoButtons.length; i++) {
      console.log(`      [DEBUG] Botón ${i}: "${siNoButtons[i].text}" y=${Math.round(siNoButtons[i].y)}`);
    }

    // La estructura esperada es:
    // Posición 0,1: Correo (Sí, No) - queremos Sí (posición 0)
    // Posición 2,3: Mensaje texto (Sí, No) - queremos No (posición 3)
    // Posición 4,5: Datos personales (Sí, No) - queremos Sí (posición 4)
    // Posición 6: Términos (solo Sí) - queremos Sí (posición 6)

    // 1. Click en "Sí" para correo electrónico (primer Sí)
    console.log('  → Seleccionando notificación email = Sí...');
    if (siNoButtons.length >= 2) {
      // Primer par: Correo electrónico - click en Sí (primer botón)
      await siNoButtons[0].el.click();
      console.log('    ✓ Correo electrónico: Sí');
      await page.waitForTimeout(500);
    }

    // 2. Click en "No" para mensaje de texto (segundo No)
    console.log('  → Seleccionando notificación SMS = No...');
    if (siNoButtons.length >= 4) {
      // Segundo par: Mensaje de texto - click en No (cuarto botón, índice 3)
      await siNoButtons[3].el.click();
      console.log('    ✓ Mensaje de texto: No');
      await page.waitForTimeout(500);
    }

    await browserManager.takeScreenshot(page, 'test-16a-notificaciones');

    // 3. Password - usar clicks nativos de Puppeteer para inputs
    const testPassword = generateMiPlanillaPassword();
    console.log(`  → Password generada: ${testPassword}`);

    const passwordInputs = await page.$$('input[type="password"]');
    console.log(`    [DEBUG] Encontrados ${passwordInputs.length} inputs de password`);

    if (passwordInputs.length >= 2) {
      await passwordInputs[0].click({ clickCount: 3 });
      await page.keyboard.type(testPassword, { delay: 30 });
      console.log('    ✓ Password ingresada');
      await page.waitForTimeout(300);

      await passwordInputs[1].click({ clickCount: 3 });
      await page.keyboard.type(testPassword, { delay: 30 });
      console.log('    ✓ Confirm password ingresada');
    } else {
      await fillInputByName(page, 'password', testPassword);
      await fillInputByName(page, 'confirm', testPassword);
      console.log('    ✓ Password ingresada (fallback)');
    }

    await browserManager.takeScreenshot(page, 'test-16-password');

    // 4. Scroll para ver botones de términos
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(500);

    // 5. Click en "Sí" para datos personales (tercer Sí)
    console.log('  → Aceptando tratamiento de datos personales = Sí...');
    if (siNoButtons.length >= 6) {
      // Tercer par: Datos personales - click en Sí (quinto botón, índice 4)
      await siNoButtons[4].el.click();
      console.log('    ✓ Datos personales: Sí');
      await page.waitForTimeout(500);
    }

    // 6. Click en "Sí" para términos (puede ser solo un botón Sí)
    console.log('  → Aceptando términos y condiciones = Sí...');
    if (siNoButtons.length >= 7) {
      // Términos: click en Sí (séptimo botón, índice 6)
      await siNoButtons[6].el.click();
      console.log('    ✓ Términos y condiciones: Sí');
      await page.waitForTimeout(500);
    } else if (siNoButtons.length === 6) {
      // Si solo hay 6 botones, el último es de términos
      // Buscar el último "Sí" que no haya sido clickeado
      const lastSi = siNoButtons.filter(b => b.text === 'Sí' || b.text === 'Si').pop();
      if (lastSi) {
        await lastSi.el.click();
        console.log('    ✓ Términos y condiciones: Sí');
        await page.waitForTimeout(500);
      }
    }

    // 7. Screenshot final para verificar
    await browserManager.takeScreenshot(page, 'test-16b-botones-seleccionados');
    console.log('  ✓ Notificaciones y términos completados');

    await browserManager.takeScreenshot(page, 'test-17-ready-to-submit');

    // ═══════════════════════════════════════════════════════════════
    // ¡STOP! - NO HACER CLICK EN "Finalizar Registro"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   ⚠️  DRY RUN COMPLETADO - NO SE CREARÁ EL USUARIO');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('El flujo llegó hasta el paso final.');
    console.log('El botón "Finalizar Registro" está visible pero NO se hizo click.');
    console.log('');
    console.log('Revisa los screenshots en: ./downloads/test-miplanilla/');
    console.log('');

    // Verificar que el botón existe
    const finalizarBtn = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value;
        if (text?.toLowerCase().includes('finalizar')) {
          return true;
        }
      }
      return false;
    });

    if (finalizarBtn) {
      console.log('✅ Botón "Finalizar Registro" encontrado y listo.');
    } else {
      console.log('⚠️  Botón "Finalizar Registro" no encontrado.');
    }

    // Esperar para ver el resultado
    console.log('\nEsperando 30 segundos para inspección visual...');
    console.log('(Puedes cerrar el navegador manualmente o esperar)');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    if (page) {
      await browserManager.takeScreenshot(page, 'test-error');
    }
  } finally {
    // NO cerrar el navegador para evitar bloqueos en Mi Planilla
    // await browserManager.close();
    console.log('\n✓ Navegador permanece abierto - ciérralo manualmente cuando termines');
  }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

async function clickByText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((searchText) => {
    const elements = document.querySelectorAll('button, a, label, input, div[role="button"], span');
    for (const el of elements) {
      const elText = (el as HTMLElement).innerText || (el as HTMLInputElement).value || '';
      if (elText.toLowerCase().includes(searchText.toLowerCase())) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, text);
}

async function cerrarPopup(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Buscar botón X en modales
    const closeButtons = document.querySelectorAll(
      '.modal .close, .modal button[class*="close"], [class*="modal"] .btn-close, button[aria-label="Close"], .modal-header button'
    );
    for (const btn of closeButtons) {
      (btn as HTMLElement).click();
      return true;
    }
    return false;
  });
}

async function findInput(page: Page, names: string[]): Promise<string | null> {
  for (const name of names) {
    const selectors = [
      `input[name*="${name}" i]`,
      `input[id*="${name}" i]`,
      `#${name}`,
    ];
    for (const selector of selectors) {
      const el = await page.$(selector);
      if (el) return selector;
    }
  }
  return null;
}

async function fillInputByName(page: Page, name: string, value: string): Promise<void> {
  const selector = await findInput(page, [name]);
  if (selector) {
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value, { delay: 30 });
  }
}

async function selectOptionByName(page: Page, name: string, value: string): Promise<void> {
  const selectors = [
    `select[name*="${name}" i]`,
    `select[id*="${name}" i]`,
    `#${name}`,
  ];

  for (const selector of selectors) {
    const el = await page.$(selector);
    if (el) {
      await page.evaluate(
        (sel, val) => {
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
            }
          }
        },
        selector,
        value
      );
      return;
    }
  }
}

async function seleccionarCiudad(page: Page, ciudad: string): Promise<void> {
  // 1. Buscar el elemento Ciudad y hacer click
  // El campo tiene label "Ciudad" y un div/input con "Selecciona una opción"
  const ciudadElement = await page.evaluateHandle(() => {
    // Buscar el label "Ciudad" y luego el siguiente elemento clickeable
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      if (label.textContent?.trim() === 'Ciudad') {
        // El siguiente hermano o hijo debería ser el selector
        const parent = label.parentElement;
        const selector = parent?.querySelector('input, div[class*="select"], .form-control');
        if (selector) return selector;
      }
    }
    return null;
  });

  if (ciudadElement) {
    await (ciudadElement as any).click();
    console.log('    → Click en campo Ciudad');
  } else {
    console.log('    ⚠ No encontró campo Ciudad');
    return;
  }

  // 2. Esperar que aparezca el modal
  await page.waitForTimeout(1500);

  // Verificar que el modal está abierto
  const modalOpen = await page.evaluate(() => {
    return document.body.innerText.includes('Busca la ciudad');
  });

  if (!modalOpen) {
    console.log('    ⚠ Modal no se abrió');
    return;
  }
  console.log('    → Modal abierto');

  // 3. Hacer CLICK en el input del modal (el cuadrado blanco)
  await page.waitForTimeout(500);

  // Buscar el input que está DESPUÉS del texto "Busca la ciudad"
  const inputClicked = await page.evaluate(() => {
    // Buscar el texto "Busca la ciudad"
    const textNodes = document.body.querySelectorAll('*');
    for (const node of textNodes) {
      if (node.textContent?.includes('Busca la ciudad') && node.children.length === 0) {
        // Encontramos el texto, ahora buscar el input cercano
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          const input = parent.querySelector('input[type="text"], input:not([type])');
          if (input) {
            (input as HTMLElement).click();
            (input as HTMLInputElement).focus();
            return true;
          }
          parent = parent.parentElement;
        }
      }
    }
    // Fallback: cualquier input vacío
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      const i = inp as HTMLInputElement;
      if (i.value === '' && i.offsetParent !== null && i.type !== 'hidden') {
        i.click();
        i.focus();
        return true;
      }
    }
    return false;
  });

  if (!inputClicked) {
    console.log('    ⚠ No se pudo hacer click en input del modal');
    return;
  }

  console.log('    → Click en input del modal');
  await page.waitForTimeout(200);

  // 4. Escribir con keyboard (simula teclas reales)
  await page.keyboard.type(ciudad, { delay: 150 });
  console.log(`    → Escribiendo "${ciudad}"...`);

  // 5. Esperar que aparezca BOGOTÁ en el autocomplete
  await page.waitForTimeout(2500);

  // Debug: tomar screenshot para ver el estado del modal
  await page.screenshot({ path: 'screenshots/debug-modal-bogota.png' });
  console.log('    → Screenshot guardado: debug-modal-bogota.png');

  // 6. Hacer click NATIVO en "BOGOTÁ, D.C. - BOGOTÁ D. C."
  const allElements = await page.$$('button, div, a, span, li');
  let clicked = false;

  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text === 'BOGOTÁ, D.C. - BOGOTÁ D. C.' ||
        (text.includes('BOGOTÁ') && text.includes('D.C.') && text.length < 50)) {
      // Click NATIVO de Puppeteer
      await el.click();
      clicked = true;
      console.log(`    → Click nativo en: ${text}`);
      break;
    }
  }

  if (!clicked) {
    console.log('    ⚠ No se encontró opción BOGOTÁ');
  }

  await page.waitForTimeout(1000);
}

/**
 * Selecciona una opción de EPS o AFP.
 *
 * ESTRATEGIA MEJORADA:
 * 1. Para EPS: buscar el dropdown "Selecciona una opción" cerca del label EPS
 * 2. Para AFP: después de seleccionar EPS, buscar específicamente por la posición Y
 *    (AFP está DESPUÉS de EPS en la página, así que tiene mayor coordenada Y)
 * 3. Verificar que el modal correcto se abrió (EPS vs AFP por el título)
 */
async function seleccionarModalConCodigo(page: Page, tipo: 'EPS' | 'AFP', nombreBuscar: string): Promise<void> {
  const modalTituloEsperado = tipo === 'EPS' ? 'Administradoras de Salud' : 'Administradoras de Pensión';

  // Usar Puppeteer $$ para obtener ElementHandles nativos
  const allDivs = await page.$$('div, span, input');
  let dropdownClicked = false;

  // Recolectar todos los dropdowns "Selecciona una opción" con sus posiciones
  const dropdownCandidates: { el: any; y: number; isEps: boolean; isAfp: boolean }[] = [];

  for (const el of allDivs) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || (e as HTMLInputElement).placeholder || '');

    // El dropdown debe mostrar exactamente "Selecciona una opción" (no más texto)
    // También verificar que es un elemento interactivo (no un label o contenedor)
    if (text === 'Selecciona una opción') {
      // Verificar que este elemento tiene pocos hijos (es el elemento real del dropdown)
      const isInteractive = await el.evaluate(e => {
        const childCount = e.children.length;
        const tagName = e.tagName.toLowerCase();
        // El dropdown real suele ser un div/span con 0-2 hijos, no un contenedor grande
        return childCount <= 3 && ['div', 'span', 'input'].includes(tagName);
      });
      if (!isInteractive) continue;
      const box = await el.boundingBox();
      if (box && box.width > 100 && box.height > 20) {
        // Verificar si está cerca del label EPS o AFP
        const nearLabels = await el.evaluate((e) => {
          let parent = e.parentElement;
          let isEps = false;
          let isAfp = false;
          for (let i = 0; i < 5 && parent; i++) {
            const parentText = parent.textContent?.toLowerCase() || '';
            // Check if this specific section contains EPS or AFP label
            if (parentText.includes('eps te encuentras afiliado') && !parentText.includes('fondo de pensiones')) {
              isEps = true;
            }
            if (parentText.includes('fondo de pensiones')) {
              isAfp = true;
            }
            parent = parent.parentElement;
          }
          return { isEps, isAfp };
        });

        dropdownCandidates.push({
          el,
          y: box.y,
          isEps: nearLabels.isEps,
          isAfp: nearLabels.isAfp,
        });
      }
    }
  }

  console.log(`    [DEBUG] Encontrados ${dropdownCandidates.length} dropdowns "Selecciona una opción"`);

  // Debug: mostrar todos los candidatos
  for (const d of dropdownCandidates) {
    console.log(`      [DEBUG] Dropdown y=${Math.round(d.y)} isEps=${d.isEps} isAfp=${d.isAfp}`);
  }

  // Ordenar candidatos por posición Y (de arriba a abajo)
  dropdownCandidates.sort((a, b) => a.y - b.y);

  let targetDropdown = null;

  if (tipo === 'EPS') {
    // Para EPS: buscar el dropdown que esté cerca de EPS label y NO de AFP
    targetDropdown = dropdownCandidates.find(d => d.isEps && !d.isAfp);
    if (!targetDropdown && dropdownCandidates.length > 0) {
      // Fallback: tomar el PRIMERO (más arriba) porque EPS está antes que AFP
      targetDropdown = dropdownCandidates[0];
    }
  } else {
    // Para AFP: buscar dropdown SOLO cerca de AFP label (NO de EPS)
    targetDropdown = dropdownCandidates.find(d => d.isAfp && !d.isEps);
    if (!targetDropdown && dropdownCandidates.length > 0) {
      // Fallback: tomar el ÚLTIMO (más abajo) porque AFP está después de EPS
      targetDropdown = dropdownCandidates[dropdownCandidates.length - 1];
    }
  }

  if (targetDropdown) {
    await targetDropdown.el.click();
    dropdownClicked = true;
    console.log(`    → Click en dropdown ${tipo} (y=${Math.round(targetDropdown.y)})`);
  }

  if (!dropdownClicked) {
    console.log(`    ⚠ No se encontró dropdown para: ${tipo}`);
    await page.screenshot({ path: `screenshots/debug-no-dropdown-${tipo}-${Date.now()}.png` });
    return;
  }

  // 2. Esperar que el modal se abra y verificar que es el correcto
  // CLAVE: Buscar el TÍTULO del modal, no cualquier texto en la página
  let modalCorrecto = false;
  const tituloEPS = 'Administradoras de Salud (EPS)';
  const tituloAFP = 'Administradoras de Pensiones (AFP)';
  const tituloEsperado = tipo === 'EPS' ? tituloEPS : tituloAFP;

  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(400);
    // Buscar el título DENTRO del modal (elemento con clase modal o similar)
    modalCorrecto = await page.evaluate((titulo) => {
      // Buscar elementos que parecen ser títulos de modal (h1, h2, h3, h4, o divs con clase *title*)
      const titulos = document.querySelectorAll('h1, h2, h3, h4, h5, [class*="title"], [class*="header"], .modal-title');
      for (const t of titulos) {
        const text = (t as HTMLElement).innerText?.trim() || '';
        if (text.includes(titulo)) {
          return true;
        }
      }
      // Fallback: buscar texto que comience con el título esperado
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        // Solo considerar elementos con texto corto (títulos, no contenedores)
        if (text === titulo || (text.startsWith(titulo) && text.length < titulo.length + 20)) {
          return true;
        }
      }
      return false;
    }, tituloEsperado);
    if (modalCorrecto) break;
  }

  if (!modalCorrecto) {
    console.log(`    ⚠ Modal ${tipo} no se abrió o es el modal incorrecto`);
    await page.screenshot({ path: `screenshots/debug-modal-not-open-${tipo}-${Date.now()}.png` });
    return;
  }

  console.log(`    → Modal ${tipo} abierto correctamente`);
  await page.screenshot({ path: `screenshots/debug-modal-open-${tipo}-${Date.now()}.png` });

  // 3. Click en la opción de la lista usando TreeWalker (más confiable)
  await page.waitForTimeout(500);

  const clicked = await page.evaluate((searchName) => {
    // Estrategia: buscar elementos que sean "hojas" (sin hijos con texto largo)
    const candidates: HTMLElement[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const el = node as HTMLElement;
      const text = el.innerText?.trim() || '';

      // Solo considerar elementos que contengan el nombre buscado
      if (!text.toUpperCase().includes(searchName.toUpperCase())) continue;

      // El texto debe ser el de un item de lista (entre 5 y 80 caracteres)
      if (text.length < 5 || text.length > 80) continue;

      // Excluir instrucciones del modal
      if (text.includes('Busca') || text.includes('Selecciona una') || text.includes('ingresando')) continue;

      // Verificar que es un elemento "hoja" (texto directo o pocos hijos)
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .join(' ')
        .trim();

      const childCount = el.children.length;
      if (directText.length > 3 || childCount <= 2) {
        const rect = el.getBoundingClientRect();
        // Debe ser visible y tener tamaño razonable
        if (rect.width > 80 && rect.height > 15 && rect.top > 50 && rect.top < window.innerHeight - 50) {
          candidates.push(el);
        }
      }
    }

    // Ordenar por especificidad (texto más corto = más específico)
    candidates.sort((a, b) => (a.innerText?.length || 0) - (b.innerText?.length || 0));

    // Click en el candidato más específico
    if (candidates.length > 0) {
      const best = candidates[0];
      best.click();
      return best.innerText?.trim().substring(0, 60);
    }

    return null;
  }, nombreBuscar);

  if (clicked) {
    console.log(`    ✓ Seleccionado: ${clicked}`);
    await page.waitForTimeout(1000);
  } else {
    console.log(`    ⚠ No se encontró opción: ${nombreBuscar}`);
    await page.screenshot({ path: `screenshots/debug-no-option-${tipo}-${Date.now()}.png` });
  }
}

// Función anterior (mantener por compatibilidad)
async function seleccionarModalConClick(page: Page, labelTexto: string, opcionBuscar: string): Promise<void> {
  // 1. Buscar "Selecciona una opción" que esté cerca del label usando Puppeteer nativo
  const dropdowns = await page.$$('div, span, input');
  let dropdownClicked = false;

  for (const dd of dropdowns) {
    const text = await dd.evaluate(e => {
      const el = e as HTMLElement;
      return el.innerText?.trim() || (el as HTMLInputElement).placeholder || '';
    });
    // Usar includes para ser más flexible
    if (text.includes('Selecciona una opción')) {
      // Verificar que está cerca del label específico (EPS o AFP)
      const isNearLabel = await dd.evaluate((e, label) => {
        let parent = e.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          const parentText = parent.textContent || '';
          // Buscar el label o una versión más corta
          if (parentText.includes(label) ||
              (label.includes('EPS') && parentText.includes('EPS')) ||
              (label.includes('AFP') && parentText.includes('pensiones'))) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }, labelTexto);

      if (isNearLabel) {
        const box = await dd.boundingBox();
        if (box && box.width > 100 && box.height > 20) {
          await dd.click();
          dropdownClicked = true;
          console.log(`    → Click en dropdown ${labelTexto}`);
          break;
        }
      }
    }
  }

  if (!dropdownClicked) {
    console.log(`    ⚠ No se encontró dropdown para: ${labelTexto}`);
    await page.screenshot({ path: `screenshots/debug-no-dropdown-${Date.now()}.png` });
    return;
  }

  await page.waitForTimeout(2000);

  // 2. Verificar si se abrió modal
  const modalAbierto = await page.evaluate(() => {
    return document.body.innerText.includes('Selecciona una administradora') ||
           document.body.innerText.includes('Busca la administradora') ||
           document.body.innerText.includes('Busca el fondo') ||
           document.body.innerText.includes('Administradoras de Salud (EPS)') ||
           document.body.innerText.includes('Administradoras de Pensión');
  });

  if (!modalAbierto) {
    console.log('    ⚠ Modal no se abrió');
    await page.screenshot({ path: `screenshots/debug-modal-not-open-${Date.now()}.png` });
    return;
  }

  console.log('    → Modal abierto');

  // Esperar que el modal esté completamente renderizado
  await page.waitForTimeout(500);

  // Usar el MISMO patrón que funciona para ciudad - page.$$ con click nativo
  const allElements = await page.$$('button, div, span, li, a');
  let found = false;

  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    // Debug: mostrar textos que contengan parte del buscado
    if (text.toUpperCase().includes(opcionBuscar.substring(0, 3).toUpperCase()) && text.length < 80) {
      console.log(`      [DEBUG] Encontrado: "${text.substring(0, 50)}"`);
    }

    if (text.toUpperCase().includes(opcionBuscar.toUpperCase()) &&
        text.length < 120 &&
        text.length > 3 &&
        !text.includes('Busca la') &&
        !text.includes('Selecciona una') &&
        !text.includes('ingresando el nombre')) {
      // Click NATIVO de Puppeteer (como funciona con ciudad)
      await el.click();
      console.log(`    ✓ Seleccionado: ${text.substring(0, 60)}`);
      found = true;
      await page.waitForTimeout(1000);
      break;
    }
  }

  if (!found) {
    console.log(`    ⚠ No se encontró opción: ${opcionBuscar}`);
    await page.screenshot({ path: `screenshots/debug-no-option-${Date.now()}.png` });
  }
}

async function seleccionarDropdownPorIndice(page: Page, indice: number, opcionBuscar: string): Promise<void> {
  // 1. Buscar TODOS los elementos que CONTENGAN "Selecciona una opción"
  const dropdowns = await page.$$('div, span, input');
  const selectores: any[] = [];

  for (const dd of dropdowns) {
    const text = await dd.evaluate(e => (e as HTMLElement).innerText?.trim() || (e as HTMLInputElement).placeholder || '');
    // Usar includes porque el texto puede tener más contenido
    if (text.includes('Selecciona una opción') && text.length < 50) {
      const box = await dd.boundingBox();
      if (box && box.width > 100 && box.height > 20) {
        selectores.push(dd);
      }
    }
  }

  console.log(`    → Encontrados ${selectores.length} dropdowns con "Selecciona una opción"`);

  if (selectores.length <= indice) {
    console.log(`    ⚠ No hay suficientes dropdowns (índice: ${indice})`);
    return;
  }

  await selectores[indice].click();
  console.log(`    → Click en dropdown índice ${indice}`);
  await page.waitForTimeout(1500);

  // 2. Escribir en el input de búsqueda
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const inp of inputs) {
      const i = inp as HTMLInputElement;
      if (i.value === '' && i.offsetParent !== null) {
        i.focus();
        return;
      }
    }
  });

  await page.waitForTimeout(300);
  await page.keyboard.type(opcionBuscar.substring(0, 4), { delay: 150 });
  console.log(`    → Escribiendo "${opcionBuscar.substring(0, 4)}"...`);
  await page.waitForTimeout(2500);

  // Debug screenshot
  await page.screenshot({ path: `screenshots/debug-dropdown-${Date.now()}.png` });

  // 3. Click NATIVO en la opción que contenga el texto
  const allElements = await page.$$('button, div, span, li');
  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text.toUpperCase().includes(opcionBuscar.toUpperCase()) &&
        text.length < 100 &&
        !text.includes('Busca') &&
        !text.includes('Selecciona') &&
        !text.includes('Información')) {
      const box = await el.boundingBox();
      if (box && box.width > 50 && box.height > 15) {
        await el.click();
        console.log(`    → Seleccionado: ${text.substring(0, 50)}`);
        await page.waitForTimeout(500);
        return;
      }
    }
  }

  console.log(`    ⚠ No se encontró opción: ${opcionBuscar}`);
}

async function seleccionarDropdownConBusqueda(page: Page, labelTexto: string, opcionBuscar: string): Promise<void> {
  // 1. Buscar "Selecciona una opción" con Puppeteer y hacer click NATIVO
  const dropdowns = await page.$$('div, span');
  let dropdownClicked = false;

  for (const dd of dropdowns) {
    const text = await dd.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text === 'Selecciona una opción') {
      // Verificar que está cerca del label
      const isNearLabel = await dd.evaluate((e, label) => {
        let parent = e.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          if (parent.textContent?.includes(label)) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }, labelTexto);

      if (isNearLabel) {
        const box = await dd.boundingBox();
        if (box && box.width > 50) {
          await dd.click(); // Click NATIVO de Puppeteer
          dropdownClicked = true;
          console.log(`    → Click NATIVO en dropdown "${labelTexto}"`);
          break;
        }
      }
    }
  }

  if (!dropdownClicked) {
    console.log(`    ⚠ No se encontró dropdown para: ${labelTexto}`);
    return;
  }

  await page.waitForTimeout(1500);

  // 2. Escribir en el input de búsqueda
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const inp of inputs) {
      const i = inp as HTMLInputElement;
      if (i.value === '' && i.offsetParent !== null) {
        i.focus();
        return;
      }
    }
  });

  await page.waitForTimeout(200);
  await page.keyboard.type(opcionBuscar.substring(0, 4), { delay: 100 });
  console.log(`    → Escribiendo "${opcionBuscar.substring(0, 4)}"...`);
  await page.waitForTimeout(2000);

  // 3. Click NATIVO en la opción
  const allElements = await page.$$('button, div, span, li');
  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text.toUpperCase().includes(opcionBuscar.toUpperCase()) &&
        text.length < 100 &&
        !text.includes('Busca') &&
        !text.includes('Selecciona')) {
      const box = await el.boundingBox();
      if (box && box.width > 50) {
        await el.click();
        console.log(`    → Seleccionado: ${text.substring(0, 50)}`);
        await page.waitForTimeout(500);
        return;
      }
    }
  }

  console.log(`    ⚠ No se encontró opción: ${opcionBuscar}`);
}

async function seleccionarEPS(page: Page, epsName: string): Promise<void> {
  // 1. Buscar y hacer click NATIVO en "Selecciona una opción" del campo EPS
  const dropdowns = await page.$$('div, span, input');
  let dropdownClicked = false;

  for (const dd of dropdowns) {
    const text = await dd.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text === 'Selecciona una opción') {
      // Verificar que está cerca de "EPS" o "Administradoras"
      const parentText = await dd.evaluate(e => {
        let parent = e.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          if (parent.textContent?.toLowerCase().includes('eps') ||
              parent.textContent?.toLowerCase().includes('administradora')) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      });

      if (parentText) {
        await dd.click();
        dropdownClicked = true;
        console.log('    → Click en dropdown EPS');
        break;
      }
    }
  }

  if (!dropdownClicked) {
    console.log('    ⚠ No se encontró dropdown de EPS');
    return;
  }

  await page.waitForTimeout(1500);

  // 2. Verificar que el modal se abrió
  const modalOpen = await page.evaluate(() => {
    return document.body.innerText.includes('Busca la administradora') ||
           document.body.innerText.includes('Administradoras de Salud');
  });

  if (!modalOpen) {
    console.log('    ⚠ Modal EPS no se abrió');
    return;
  }
  console.log('    → Modal EPS abierto');

  // 3. Buscar input vacío y escribir
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const inp of inputs) {
      const i = inp as HTMLInputElement;
      if (i.value === '' && i.offsetParent !== null) {
        i.focus();
        break;
      }
    }
  });
  await page.waitForTimeout(200);

  await page.keyboard.type(epsName, { delay: 100 });
  console.log(`    → Escribiendo "${epsName}"...`);
  await page.waitForTimeout(2000);

  // 4. Click NATIVO en la opción que contenga el nombre
  const allElements = await page.$$('button, div, span, li');
  let optionClicked = false;
  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text.toUpperCase().includes(epsName.toUpperCase()) &&
        text.length < 100 &&
        !text.includes('Busca')) {
      const box = await el.boundingBox();
      if (box && box.width > 50) {
        await el.click();
        optionClicked = true;
        console.log(`    → EPS seleccionada: ${text.substring(0, 50)}`);
        break;
      }
    }
  }

  if (!optionClicked) {
    console.log(`    ⚠ No se encontró opción: ${epsName}`);
  }

  await page.waitForTimeout(500);
}

async function clickBotonPregunta(page: Page, preguntaKeyword: string, respuesta: string): Promise<boolean> {
  // Buscar todos los botones y encontrar el que está cerca de la pregunta
  const allButtons = await page.$$('button, div, span, label');

  for (const btn of allButtons) {
    const text = await btn.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    // El texto debe ser exactamente "Sí" o "No" (también "Si" sin tilde)
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedRespuesta = respuesta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalizedText === normalizedRespuesta || text === respuesta) {
      // Verificar que tiene boundingBox visible
      const box = await btn.boundingBox();
      if (!box || box.width < 30) continue;

      // Verificar que está cerca de la pregunta
      const isNearQuestion = await btn.evaluate((e, keyword) => {
        let parent = e.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          if (parent.textContent?.toLowerCase().includes(keyword.toLowerCase())) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }, preguntaKeyword);

      if (isNearQuestion) {
        await btn.click();
        console.log(`    ✓ ${preguntaKeyword}: ${respuesta}`);
        await page.waitForTimeout(500);
        return true;
      }
    }
  }
  console.log(`    ⚠ No se encontró botón "${respuesta}" para "${preguntaKeyword}"`);
  return false;
}

async function seleccionarDropdown(page: Page, labelText: string, optionText: string): Promise<void> {
  // 1. Buscar el label y hacer click en el dropdown asociado
  const dropdownClicked = await page.evaluate((label) => {
    const labels = document.querySelectorAll('label');
    for (const lbl of labels) {
      if (lbl.textContent?.toLowerCase().includes(label.toLowerCase())) {
        const parent = lbl.parentElement;
        const dropdown = parent?.querySelector('div[class*="select"], input, .form-control');
        if (dropdown) {
          (dropdown as HTMLElement).click();
          return true;
        }
      }
    }
    // Fallback: buscar "Selecciona una opción" cerca del label
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent?.includes('Selecciona una opción')) {
        const parent = el.closest('div');
        if (parent?.textContent?.toLowerCase().includes(label.toLowerCase())) {
          (el as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }, labelText);

  if (!dropdownClicked) {
    console.log(`    ⚠ No se encontró dropdown para: ${labelText}`);
    return;
  }

  await page.waitForTimeout(1500);
  console.log(`    → Dropdown "${labelText}" abierto`);

  // 2. Si hay un input de búsqueda, escribir
  const hasSearchInput = await page.evaluate(() => {
    return document.body.innerText.includes('Busca') ||
           document.querySelector('.modal input[type="text"]') !== null;
  });

  if (hasSearchInput) {
    // Escribir las primeras letras para filtrar
    await page.keyboard.type(optionText.substring(0, 4), { delay: 100 });
    await page.waitForTimeout(2000);
  }

  // 3. Hacer click en la opción
  const allElements = await page.$$('button, div, span, li, a');
  let clicked = false;

  for (const el of allElements) {
    const text = await el.evaluate(e => (e as HTMLElement).innerText?.trim() || '');
    if (text.toUpperCase().includes(optionText.toUpperCase())) {
      await el.click();
      clicked = true;
      console.log(`    → Seleccionado: ${text.substring(0, 40)}`);
      break;
    }
  }

  if (!clicked) {
    console.log(`    ⚠ No se encontró opción: ${optionText}`);
  }

  await page.waitForTimeout(500);
}

// Ejecutar
main().catch(console.error);
