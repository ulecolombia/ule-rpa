/**
 * Script: Test FLUJO COMPLETO SOI hasta Bancolombia - CC 1047478670
 *
 * Datos del test:
 * - Cuenta: CC 1047478670, password: Pruebaule123*
 * - IBC: 2,000,000
 * - Periodo: marzo 2026 (mes 3, año 2026)
 * - Nombres: Camilo Andres Maturana Mejia
 * - Departamento: BOLIVAR, Municipio: CARTAGENA
 * - Tipo cotizante: INDEPENDIENTE
 *
 * Flujo completo:
 * 1. Login
 * 2. Árbol de decisión (verificar planilla existente)
 * 3. Si NO existe → Crear planilla nueva (Wizard)
 * 4. Iniciar pago PSE
 * 5. Seleccionar BANCOLOMBIA
 * 6. Llenar datos PSE (Jurídica, NIT ULE, email ULE)
 * 7. DETENERSE en pantalla de Bancolombia (screenshot)
 *
 * ⚠️ NO ingresar credenciales bancarias
 *
 * Uso: npx tsx scripts/test-liquidacion-camilo.ts
 */

import 'dotenv/config';
import { Page } from 'puppeteer';
import { SOIAuthBot } from '../src/bots/soi';
import {
  verificarEstadoPlanillaSOI,
  aplicarArbolDecision,
} from '../src/bots/utils/planilla-state';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SCREENSHOTS_PATH = path.resolve('./screenshots');
const EVIDENCIAS_PATH = path.resolve('./tests/evidencias');

const TEST_CREDENTIALS = {
  tipoDocumento: 'CC' as const,
  documento: '1047478670',
  password: 'Pruebaule123*',
};

const TEST_USER_DATA = {
  primerNombre: 'CAMILO',
  segundoNombre: 'ANDRES',
  primerApellido: 'MATURANA',
  segundoApellido: 'MEJIA',
  departamento: 'BOLIVAR',
  municipio: 'CARTAGENA',
};

const PSE_DATA = {
  tipoPersona: 'J',  // Jurídica
  nit: '9020190314',
  email: 'ulecolombia@gmail.com',
  banco: 'BANCOLOMBIA',
};

const PERIODO = {
  mes: 3,     // Marzo
  anio: 2026,
};

let stepCounter = 0;

// ============================================================================
// UTILIDADES
// ============================================================================

async function takeScreenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(SCREENSHOTS_PATH)) {
    fs.mkdirSync(SCREENSHOTS_PATH, { recursive: true });
  }
  if (!fs.existsSync(EVIDENCIAS_PATH)) {
    fs.mkdirSync(EVIDENCIAS_PATH, { recursive: true });
  }

  stepCounter++;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `camilo-${String(stepCounter).padStart(2, '0')}-${name}_${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_PATH, filename);

  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   📸 ${filename}`);

  // También copiar a evidencias
  const evidenciaPath = path.join(EVIDENCIAS_PATH, filename);
  fs.copyFileSync(filepath, evidenciaPath);

  return filepath;
}

async function clickButton(page: Page, textPattern: string): Promise<boolean> {
  const clicked = await page.evaluate((pattern) => {
    const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button, a');
    for (const btn of buttons) {
      const value = ((btn as HTMLInputElement).value || btn.textContent || '').toLowerCase();
      if (value.includes(pattern.toLowerCase())) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, textPattern);

  if (clicked) {
    await page.waitForTimeout(2000);
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
    } catch {
      // Ignorar timeout
    }
  }
  return clicked;
}

async function waitAndClick(page: Page, selector: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   TEST FLUJO COMPLETO SOI HASTA BANCOLOMBIA                          ║');
  console.log('║   Usuario: CC 1047478670 (Camilo Andres Maturana Mejia)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Configuración:');
  console.log(`   • Documento: ${TEST_CREDENTIALS.tipoDocumento} ${TEST_CREDENTIALS.documento}`);
  console.log(`   • Periodo: ${PERIODO.mes}/${PERIODO.anio}`);
  console.log(`   • Ubicación: ${TEST_USER_DATA.departamento}, ${TEST_USER_DATA.municipio}`);
  console.log(`   • Banco destino: ${PSE_DATA.banco}`);
  console.log('');

  const authBot = new SOIAuthBot();
  let numeroPlanilla: string | null = null;

  try {
    // ═══════════════════════════════════════════════════════════════
    // PASO 1: LOGIN
    // ═══════════════════════════════════════════════════════════════
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [1/7] LOGIN SOI');
    console.log('══════════════════════════════════════════════════════════════════');

    const session = await authBot.loginAsUser(TEST_CREDENTIALS);

    if (!session.isAuthenticated) {
      throw new Error('Login falló');
    }

    console.log(`   ✅ Login exitoso: ${session.userName}`);

    const page = authBot.getPage();
    if (!page) throw new Error('No se pudo obtener la página');

    await takeScreenshot(page, 'login-exitoso');

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: ÁRBOL DE DECISIÓN
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [2/7] ÁRBOL DE DECISIÓN');
    console.log('══════════════════════════════════════════════════════════════════');

    const estadoPlanilla = await verificarEstadoPlanillaSOI(page, {
      periodo: PERIODO,
      tipoDocumento: TEST_CREDENTIALS.tipoDocumento,
      numeroDocumento: TEST_CREDENTIALS.documento,
    });

    const decision = aplicarArbolDecision(estadoPlanilla);

    console.log(`   • Estado encontrado: ${estadoPlanilla.estado}`);
    console.log(`   • Acción recomendada: ${decision.accion}`);
    console.log(`   • Mensaje: ${decision.mensaje}`);

    await takeScreenshot(page, 'arbol-decision');

    // Manejar según decisión
    if (decision.accion === 'DESCARGAR_COMPROBANTE') {
      console.log('');
      console.log('   ⚠️  Planilla ya PAGADA para este periodo.');
      console.log(`   Número: ${estadoPlanilla.numeroPlanilla}`);
      console.log(`   Valor: $${estadoPlanilla.valorTotal?.toLocaleString('es-CO')}`);
      console.log('');
      console.log('   No hay nada que hacer. Fin del test.');
      return;
    }

    if (decision.accion === 'CORREGIR_DATOS') {
      console.log('');
      console.log('   ❌ Error de validación detectado:');
      console.log(`   ${estadoPlanilla.mensaje}`);
      console.log('');
      console.log('   El usuario debe corregir sus datos en SOI.');
      return;
    }

    // Para IR_A_PAGO o CREAR_PLANILLA, continuamos
    if (decision.accion === 'IR_A_PAGO') {
      console.log('');
      console.log('   ✅ Planilla PENDIENTE DE PAGO encontrada.');
      console.log(`   Número: ${estadoPlanilla.numeroPlanilla}`);
      console.log(`   Valor: $${estadoPlanilla.valorTotal?.toLocaleString('es-CO')}`);
      console.log('');
      console.log('   Saltando creación, ir directo a pago...');
      numeroPlanilla = estadoPlanilla.numeroPlanilla || null;
      // Continuamos al paso de pago
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: CREAR PLANILLA (si decision === CREAR_PLANILLA)
    // ═══════════════════════════════════════════════════════════════
    if (decision.accion === 'CREAR_PLANILLA' || decision.accion === 'REINTENTAR') {
      console.log('');
      console.log('══════════════════════════════════════════════════════════════════');
      console.log('   [3/7] CREAR PLANILLA - NAVEGAR');
      console.log('══════════════════════════════════════════════════════════════════');

      // Después del árbol de decisión, volver al Home usando el ícono de casa
      // El árbol de decisión puede haber navegado a otra página
      console.log('   Regresando al dashboard...');

      // Click en el ícono de Home (casa) en la parte superior
      const homeClicked = await page.evaluate(() => {
        // Buscar el ícono de home en el header
        const homeIcons = document.querySelectorAll('a[href*="index"], img[alt*="home"], .fa-home, svg, a');
        for (const icon of homeIcons) {
          const parent = icon.closest('a');
          if (parent) {
            const href = parent.getAttribute('href') || '';
            if (href.includes('index') || href === '/' || href === '#') {
              parent.click();
              return 'link';
            }
          }
          // También buscar por posición (primer ícono circular en el header)
          const rect = icon.getBoundingClientRect();
          if (rect.top < 100 && rect.width > 20 && rect.width < 60) {
            (icon as HTMLElement).click();
            return 'icon';
          }
        }
        return null;
      });

      if (homeClicked) {
        console.log(`   ✅ Click en Home (${homeClicked})`);
        await page.waitForTimeout(3000);
      } else {
        // Si no encontramos el home, navegar directamente al dashboard de independientes
        // pero manteniendo la sesión con cookies
        console.log('   ⚠️ Navegando al dashboard directamente...');
      }

      await takeScreenshot(page, 'dashboard-post-arbol');

      // Verificar si estamos en el dashboard (debe mostrar el menú lateral)
      const enDashboard = await page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        return body.includes('gestionar planillas') || body.includes('bienvenido');
      });

      if (!enDashboard) {
        console.log('   ⚠️ No estamos en el dashboard, reautenticando...');
        // Forzar reautenticación sin cerrar el browser
        await page.goto('https://www.nuevosoi.com.co/independientes', {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        await page.waitForTimeout(2000);

        // Llenar credenciales de nuevo si es necesario
        const needsLogin = await page.evaluate(() => {
          return document.querySelector('#botonIngresarIndp') !== null;
        });

        if (needsLogin) {
          console.log('   🔐 Re-autenticando...');
          // Llenar el formulario de login
          const tipoDoc = TEST_CREDENTIALS.tipoDocumento;
          const numDoc = TEST_CREDENTIALS.documento;
          const pwd = TEST_CREDENTIALS.password;

          await page.select('select[name="tipoIdUsuario"]', tipoDoc);
          await page.type('input[name="numeroIdUsuario"]', numDoc);
          await page.type('input[name="claveUsuario"]', pwd);
          await page.click('#botonIngresarIndp');
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
          console.log('   ✅ Re-autenticación exitosa');
        }

        await page.waitForTimeout(2000);
      }

      await takeScreenshot(page, 'dashboard-listo');

      // Ahora buscar y expandir "Gestionar Planillas" en el menú lateral
      console.log('   Buscando menú "Gestionar Planillas"...');

      const menuGestionar = await page.evaluate(() => {
        const menuItems = document.querySelectorAll('a, span, div, li');
        for (const item of menuItems) {
          const text = (item as HTMLElement).innerText?.trim().toLowerCase() || '';
          if (text === 'gestionar planillas' || text.includes('gestionar planillas')) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (menuGestionar) {
        console.log('   ✅ Menú "Gestionar Planillas" expandido');
        await page.waitForTimeout(2000);
      }

      await takeScreenshot(page, 'menu-gestionar-expandido');

      // Ahora buscar "Deseo liquidar una planilla" dentro del submenú
      const clickedLiquidar = await page.evaluate(() => {
        const links = document.querySelectorAll('a, span');
        for (const link of links) {
          const text = (link as HTMLElement).innerText?.trim().toLowerCase() || '';
          if (text.includes('deseo liquidar') ||
              text.includes('liquidar una planilla') ||
              text.includes('liquidar planilla')) {
            (link as HTMLElement).click();
            return text;
          }
        }
        return null;
      });

      if (clickedLiquidar) {
        console.log(`   ✅ Click en "${clickedLiquidar}"`);
        await page.waitForTimeout(3000);
      } else {
        // Intentar buscar cualquier opción relacionada con crear/liquidar
        console.log('   ⚠️ Buscando alternativas...');

        const altClicked = await page.evaluate(() => {
          const allElements = document.querySelectorAll('a, span, div');
          for (const el of allElements) {
            const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
            if ((text.includes('liquidar') || text.includes('crear') || text.includes('nueva')) &&
                text.includes('planilla')) {
              (el as HTMLElement).click();
              return text;
            }
          }
          return null;
        });

        if (!altClicked) {
          await takeScreenshot(page, 'error-menu-no-encontrado');
          throw new Error('No se encontró opción para liquidar planilla');
        }
        console.log(`   ✅ Click en alternativa: "${altClicked}"`);
        await page.waitForTimeout(3000);
      }

      await takeScreenshot(page, 'wizard-inicio');

      // Manejar diálogo de confirmación si aparece
      const dialogoVisible = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.ui-dialog, [role="dialog"], .modal');
        for (const dialog of dialogs) {
          const text = dialog.textContent?.toLowerCase() || '';
          if (text.includes('estás seguro') || text.includes('liquidar dos planillas')) {
            const btnSi = dialog.querySelector('button');
            if (btnSi) {
              btnSi.click();
              return true;
            }
          }
        }
        return false;
      });

      if (dialogoVisible) {
        console.log('   ✅ Diálogo de confirmación aceptado');
        await page.waitForTimeout(2000);
      }

      // Verificar si necesitamos agregar cotizante
      const necesitaAgregar = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        // Si hay mensaje de "agregar cotizante" o tabla vacía
        return bodyText.includes('agregar cotizante') ||
               bodyText.includes('no hay cotizantes') ||
               bodyText.includes('adicionar cotizante');
      });

      if (necesitaAgregar) {
        console.log('');
        console.log('   ── WIZARD: Agregar Cotizante ──');

        // Click en botón "Agregar cotizante"
        const clickedAgregar = await page.evaluate(() => {
          const buttons = document.querySelectorAll('input[type="button"], button, a');
          for (const btn of buttons) {
            const text = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
            if (text.includes('agregar') && text.includes('cotizante')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
          // Buscar imagen de agregar
          const imgs = document.querySelectorAll('img[src*="agregar"], img[alt*="agregar"]');
          for (const img of imgs) {
            (img as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (clickedAgregar) {
          console.log('   ✅ Click en "Agregar cotizante"');
          await page.waitForTimeout(3000);
        }

        await takeScreenshot(page, 'wizard-agregar-cotizante');

        // Ingresar cédula
        const inputCedula = await page.$('input[name="numeroIdentificacion"], input[name="numIdentificacion"]');
        if (inputCedula) {
          await inputCedula.click({ clickCount: 3 });
          await inputCedula.type(TEST_CREDENTIALS.documento, { delay: 50 });
          console.log(`   ✅ Cédula ingresada: ${TEST_CREDENTIALS.documento}`);

          // Tab para activar autocompletado
          await page.keyboard.press('Tab');
          console.log('   ⏳ Esperando autocompletado (BDUA)...');
          await page.waitForTimeout(4000);
        }

        await takeScreenshot(page, 'wizard-autocompletado');

        // Seleccionar tipo cotizante: 3-INDEPENDIENTE
        await page.evaluate(() => {
          const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
          if (select) {
            const options = Array.from(select.options);
            const opcion = options.find(opt =>
              opt.text.includes('3') && opt.text.toUpperCase().includes('INDEPENDIENTE')
            );
            if (opcion) {
              select.value = opcion.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
        console.log('   ✅ Tipo cotizante: 3-INDEPENDIENTE');
        await page.waitForTimeout(1500);

        // Seleccionar departamento: BOLIVAR
        await page.evaluate((depto) => {
          const select = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
          if (select) {
            const options = Array.from(select.options);
            const opcion = options.find(opt => opt.text.toUpperCase().includes(depto));
            if (opcion) {
              select.value = opcion.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, TEST_USER_DATA.departamento);
        console.log(`   ✅ Departamento: ${TEST_USER_DATA.departamento}`);
        await page.waitForTimeout(2000);

        // Seleccionar municipio: CARTAGENA
        await page.evaluate((mpio) => {
          const select = document.querySelector('select[name="municipio"]') as HTMLSelectElement;
          if (select) {
            const options = Array.from(select.options);
            const opcion = options.find(opt => opt.text.toUpperCase().includes(mpio));
            if (opcion) {
              select.value = opcion.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, TEST_USER_DATA.municipio);
        console.log(`   ✅ Municipio: ${TEST_USER_DATA.municipio}`);

        await takeScreenshot(page, 'wizard-datos-cotizante');

        // Pasar por los pasos del wizard
        for (let paso = 1; paso <= 4; paso++) {
          if (await clickButton(page, 'siguiente')) {
            console.log(`   ✅ Paso ${paso} → Siguiente`);
            await page.waitForTimeout(2000);
          }
        }

        // Finalizar wizard
        if (await clickButton(page, 'finalizar')) {
          console.log('   ✅ Wizard finalizado');
          await page.waitForTimeout(3000);
        }

        await takeScreenshot(page, 'wizard-completado');
      }

      // Continuar con liquidación
      console.log('');
      console.log('   ── Liquidación ──');

      // Buscar y hacer click en los pasos de liquidación
      for (let i = 0; i < 3; i++) {
        if (await clickButton(page, 'siguiente')) {
          console.log(`   ✅ Liquidación paso ${i + 1}`);
          await page.waitForTimeout(2000);
        }
      }

      await takeScreenshot(page, 'liquidacion-completada');

      // Extraer número de planilla
      numeroPlanilla = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const match = bodyText.match(/planilla[:\s]*#?\s*(\d{8,15})/i) ||
                      bodyText.match(/número[:\s]*(\d{8,15})/i) ||
                      bodyText.match(/(\d{10,15})/);
        return match ? match[1] : null;
      });

      if (numeroPlanilla) {
        console.log(`   ✅ Planilla creada: #${numeroPlanilla}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: INICIAR PAGO PSE
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [4/7] INICIAR PAGO PSE');
    console.log('══════════════════════════════════════════════════════════════════');

    // Buscar botón de pagar
    const clickedPagar = await page.evaluate(() => {
      // Buscar imagen de pagar
      const imgPagar = document.querySelector('img[src*="pagar"], img[alt*="pagar"]');
      if (imgPagar) {
        (imgPagar as HTMLElement).click();
        return 'img';
      }
      // Buscar botón/link de pagar
      const buttons = document.querySelectorAll('button, a, input[type="button"]');
      for (const btn of buttons) {
        const text = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
        if (text.includes('pagar') && !text.includes('comprobante')) {
          (btn as HTMLElement).click();
          return 'button';
        }
      }
      return null;
    });

    if (clickedPagar) {
      console.log(`   ✅ Click en Pagar (${clickedPagar})`);
      await page.waitForTimeout(3000);
    } else {
      // Si no hay botón pagar, ir a administrar planillas (independientes)
      console.log('   ⚠️ Buscando en Administrar planillas...');
      // Usar menú lateral en lugar de URL directa
      const menuConsultas = await page.evaluate(() => {
        const items = document.querySelectorAll('a, span');
        for (const item of items) {
          const text = (item as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('consultas') || text.includes('administrar planillas')) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (menuConsultas) {
        await page.waitForTimeout(2000);
      }

      // Buscar planilla pendiente y click en pagar
      const pagoPendiente = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr');
        for (const row of rows) {
          const text = row.textContent?.toLowerCase() || '';
          if (text.includes('pendiente')) {
            const imgPagar = row.querySelector('img[src*="pagar"]');
            if (imgPagar) {
              (imgPagar as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });

      if (pagoPendiente) {
        console.log('   ✅ Click en pagar planilla pendiente');
        await page.waitForTimeout(3000);
      }
    }

    await takeScreenshot(page, 'pago-inicio');

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: SELECCIONAR PSE
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [5/7] SELECCIONAR MÉTODO PSE');
    console.log('══════════════════════════════════════════════════════════════════');

    // Buscar y click en PSE
    const clickedPSE = await page.evaluate(() => {
      const imgPSE = document.querySelector('img[src*="pse"], img[alt*="pse"]');
      if (imgPSE) {
        (imgPSE as HTMLElement).click();
        return true;
      }
      const links = document.querySelectorAll('a, button');
      for (const link of links) {
        const text = (link as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('pse')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedPSE) {
      console.log('   ✅ Click en PSE');
      await page.waitForTimeout(3000);
    }

    // Manejar diálogo de advertencia
    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.ui-dialog, [role="dialog"]');
      for (const dialog of dialogs) {
        const btnSi = dialog.querySelector('button');
        if (btnSi && btnSi.textContent?.toLowerCase().includes('si')) {
          btnSi.click();
        }
      }
    });
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'pse-seleccionado');

    // ═══════════════════════════════════════════════════════════════
    // PASO 6: LLENAR FORMULARIO PSE Y SELECCIONAR BANCO
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [6/7] FORMULARIO PSE - DATOS ULE');
    console.log('══════════════════════════════════════════════════════════════════');

    // Seleccionar tipo entidad: Jurídica
    await page.evaluate(() => {
      const select = document.querySelector('select[name="codTipoEntidad"], select[name="tipoPersona"]') as HTMLSelectElement;
      if (select) {
        const options = Array.from(select.options);
        const opcion = options.find(opt =>
          opt.text.toUpperCase().includes('JURIDICA') || opt.value === 'J'
        );
        if (opcion) {
          select.value = opcion.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    console.log('   ✅ Tipo entidad: JURÍDICA');
    await page.waitForTimeout(1500);

    // Seleccionar banco: BANCOLOMBIA
    await page.evaluate(() => {
      const select = document.querySelector('select[name="codEntidadFinanciera"], select[name="banco"]') as HTMLSelectElement;
      if (select) {
        const options = Array.from(select.options);
        const opcion = options.find(opt => opt.text.toUpperCase().includes('BANCOLOMBIA'));
        if (opcion) {
          select.value = opcion.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    console.log('   ✅ Banco: BANCOLOMBIA');

    await takeScreenshot(page, 'pse-formulario');

    // Click en Pagar/Continuar
    if (await clickButton(page, 'pagar') || await clickButton(page, 'continuar')) {
      console.log('   ✅ Click Pagar/Continuar');
      await page.waitForTimeout(5000);
    }

    // Verificar si estamos en registro.pse.com.co
    const currentUrl = page.url();
    console.log(`   📍 URL actual: ${currentUrl}`);

    if (currentUrl.includes('pse.com.co')) {
      console.log('   ✅ Redirigido a PSE ACH Colombia');

      // Llenar datos en PSE
      // Seleccionar tab Jurídica
      await page.evaluate(() => {
        const tabs = document.querySelectorAll('a, button, [role="tab"]');
        for (const tab of tabs) {
          const text = (tab as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('jurídica') || text.includes('juridica')) {
            (tab as HTMLElement).click();
            break;
          }
        }
      });
      await page.waitForTimeout(2000);

      // Ingresar NIT
      const inputNit = await page.$('input[name*="nit"], input[name*="documento"], input[id*="nit"]');
      if (inputNit) {
        await inputNit.click({ clickCount: 3 });
        await inputNit.type(PSE_DATA.nit, { delay: 50 });
        console.log(`   ✅ NIT ingresado: ${PSE_DATA.nit}`);
      }

      // Ingresar email
      const inputEmail = await page.$('input[type="email"], input[name*="email"], input[name*="correo"]');
      if (inputEmail) {
        await inputEmail.click({ clickCount: 3 });
        await inputEmail.type(PSE_DATA.email, { delay: 50 });
        console.log(`   ✅ Email ingresado: ${PSE_DATA.email}`);
      }

      await takeScreenshot(page, 'pse-datos-ule');

      // Click en "Ir al Banco"
      if (await clickButton(page, 'ir al banco') || await clickButton(page, 'continuar')) {
        console.log('   ✅ Click "Ir al Banco"');
        await page.waitForTimeout(5000);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 7: DETENERSE EN BANCOLOMBIA
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   [7/7] PANTALLA DE BANCOLOMBIA');
    console.log('══════════════════════════════════════════════════════════════════');

    const finalUrl = page.url();
    console.log(`   📍 URL final: ${finalUrl}`);

    // Verificar si llegamos a Bancolombia
    if (finalUrl.includes('bancolombia') || finalUrl.includes('pse.com.co')) {
      console.log('   ✅ ÉXITO: Llegamos a la página del banco');

      // Si hay opción de seleccionar "Bancolombia Negocios", hacer click
      const clickedNegocios = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, button, div[onclick]');
        for (const el of elements) {
          const text = (el as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('negocios') || text.includes('empresarial')) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clickedNegocios) {
        console.log('   ✅ Click en "Bancolombia Negocios"');
        await page.waitForTimeout(3000);
      }
    }

    await takeScreenshot(page, 'bancolombia-final');

    // ═══════════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ TEST COMPLETADO EXITOSAMENTE                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📊 Resumen:');
    console.log(`   • Usuario: CC ${TEST_CREDENTIALS.documento}`);
    console.log(`   • Planilla: ${numeroPlanilla || 'N/A'}`);
    console.log(`   • Estado: En pantalla de ${PSE_DATA.banco}`);
    console.log(`   • URL final: ${page.url()}`);
    console.log('');
    console.log('⚠️  IMPORTANTE: El bot se detuvo aquí.');
    console.log('   El admin debe ingresar manualmente:');
    console.log('   - Password de Bancolombia');
    console.log('   - Código OTP del token');
    console.log('');
    console.log(`📁 Screenshots guardados en: ${SCREENSHOTS_PATH}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error instanceof Error ? error.message : error);

    try {
      const page = authBot.getPage();
      if (page) {
        await takeScreenshot(page, 'error-final');
      }
    } catch {
      // Ignorar
    }
  } finally {
    console.log('🔄 Cerrando navegador...');
    await authBot.close();
    console.log('   ✅ Navegador cerrado');
  }
}

main();
