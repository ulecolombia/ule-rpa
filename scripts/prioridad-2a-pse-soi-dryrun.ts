/**
 * PRIORIDAD 2A: PSE Dry-Run SOI hasta Bancolombia
 *
 * Objetivo: Navegar desde planilla pendiente → PSE → Bancolombia (STOP)
 *
 * Planilla existente: #6010501784 - $855,000
 * Usuario: CC 1018482146
 */

import { Page } from 'puppeteer';
import { getSOIAuthBot } from '../src/bots/soi/auth.bot';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const EVIDENCIAS_PATH = path.resolve('./tests/evidencias');

const TEST_USER = {
  tipoDocumento: 'CC',
  documento: '1018482146',
  password: process.env.SOI_PASSWORD || 'Ulecolombia123*',
};

const PLANILLA = {
  numero: '6010501784',
  valor: 855000,
};

const PSE_DATA = {
  tipoPersona: 'J', // Jurídica
  nit: '9020190314',
  email: 'ulecolombia@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function takeScreenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(EVIDENCIAS_PATH)) {
    fs.mkdirSync(EVIDENCIAS_PATH, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(EVIDENCIAS_PATH, `pse-soi-${name}_${timestamp}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   📸 Screenshot: ${path.basename(filepath)}`);
  return filepath;
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   PRIORIDAD 2A: PSE DRY-RUN SOI → BANCOLOMBIA              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER.documento}`);
  console.log(`📋 Planilla: #${PLANILLA.numero} ($${PLANILLA.valor.toLocaleString()})`);
  console.log(`🏦 Banco destino: ${PSE_DATA.banco}`);
  console.log('');
  console.log('────────────────────────────────────────────────────────────');
  console.log('');

  const authBot = getSOIAuthBot();
  let page: Page | null = null;

  try {
    // ========================================
    // PASO 1: Login en SOI
    // ========================================
    console.log('📋 PASO 1/5: Login en SOI');

    // Inicializar browser
    page = await authBot.initialize();

    const session = await authBot.loginAsUser({
      tipoDocumento: TEST_USER.tipoDocumento as 'CC' | 'CE',
      documento: TEST_USER.documento,
      password: TEST_USER.password,
    });

    if (!session?.isAuthenticated) {
      throw new Error('Login fallido en SOI');
    }

    console.log(`   ✅ Login exitoso: ${session.userName || 'Usuario autenticado'}`);
    await takeScreenshot(page, '01-login-ok');

    // ========================================
    // PASO 2: Navegar a planillas pendientes
    // ========================================
    console.log('');
    console.log('📋 PASO 2/5: Navegar a planillas pendientes');

    // Click en menú "Gestionar Planillas"
    const clickedGestionar = await page.evaluate(() => {
      const links = document.querySelectorAll('a, span, div');
      for (const el of links) {
        const text = (el.textContent || '').trim();
        if (text.includes('Gestionar Planillas') || text.includes('Gestionar planillas')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedGestionar) {
      console.log('   ✅ Click en "Gestionar Planillas"');
      await page.waitForTimeout(2000);
    }

    await takeScreenshot(page, '02a-menu-gestionar');

    // Buscar submenú "Planillas pendientes" o "Unificar para pago"
    const clickedPendientes = await page.evaluate(() => {
      const links = document.querySelectorAll('a, span, div');
      for (const el of links) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes('pendientes de pago') ||
            text.includes('planillas pendientes') ||
            text.includes('unificar para pago')) {
          (el as HTMLElement).click();
          return { clicked: true, text: (el as HTMLElement).textContent?.trim() };
        }
      }
      return { clicked: false };
    });

    if (clickedPendientes.clicked) {
      console.log(`   ✅ Click en: "${clickedPendientes.text}"`);
      await page.waitForTimeout(3000);
    } else {
      // Intentar navegación directa
      console.log('   ⚠️ Submenú no encontrado, intentando navegación directa...');
    }

    await takeScreenshot(page, '02b-planillas-pendientes');

    // Verificar si vemos la planilla
    const planillaEncontrada = await page.evaluate((numPlanilla) => {
      const bodyText = document.body.innerText;
      return {
        tieneNumero: bodyText.includes(numPlanilla),
        tienePagar: bodyText.toLowerCase().includes('pagar'),
        preview: bodyText.slice(0, 500)
      };
    }, PLANILLA.numero);

    console.log(`   Planilla #${PLANILLA.numero}: ${planillaEncontrada.tieneNumero ? '✅ Encontrada' : '❌ No visible'}`);

    // ========================================
    // PASO 3: Buscar y seleccionar planilla para pagar
    // ========================================
    console.log('');
    console.log('📋 PASO 3/5: Seleccionar planilla para pagar');

    // Buscar checkbox o link de la planilla
    const seleccionadaPlanilla = await page.evaluate((numPlanilla) => {
      // Buscar checkbox asociado a la planilla
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const row = cb.closest('tr');
        if (row && row.textContent?.includes(numPlanilla)) {
          (cb as HTMLInputElement).click();
          return { selected: true, method: 'checkbox' };
        }
      }

      // Buscar link de pago en la fila de la planilla
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        if (row.textContent?.includes(numPlanilla)) {
          const pagarLink = row.querySelector('a[href*="pago"], img[src*="pagar"], a img');
          if (pagarLink) {
            (pagarLink as HTMLElement).click();
            return { selected: true, method: 'link-pago' };
          }
        }
      }

      return { selected: false };
    }, PLANILLA.numero);

    if (seleccionadaPlanilla.selected) {
      console.log(`   ✅ Planilla seleccionada: ${seleccionadaPlanilla.method}`);
      await page.waitForTimeout(2000);
    }

    await takeScreenshot(page, '03a-planilla-seleccionada');

    // Buscar botón "Pagar" (icono amarillo con $)
    // En SOI el botón de pagar está en la columna "Pagar" de la tabla
    const clickedPagar = await page.evaluate(() => {
      // Buscar en la fila de la planilla seleccionada
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const checkbox = row.querySelector('input[type="checkbox"]:checked');
        if (checkbox) {
          // Buscar icono/link de pago en esta fila
          const imgs = row.querySelectorAll('img');
          for (const img of imgs) {
            const src = img.getAttribute('src') || '';
            const onclick = img.getAttribute('onclick') || '';
            const parent = img.parentElement;
            const parentOnclick = parent?.getAttribute('onclick') || '';

            if (src.includes('pagar') || src.includes('pse') || src.includes('$') ||
                onclick.includes('pagar') || parentOnclick.includes('pagar')) {
              // Click en el enlace padre si existe
              if (parent?.tagName === 'A') {
                parent.click();
              } else {
                img.click();
              }
              return { clicked: true, element: 'pagar-icon', src };
            }
          }

          // Buscar link de pago
          const links = row.querySelectorAll('a');
          for (const link of links) {
            const href = link.getAttribute('href') || '';
            const onclick = link.getAttribute('onclick') || '';
            if (href.includes('pago') || onclick.includes('pago') || onclick.includes('pagar')) {
              link.click();
              return { clicked: true, element: 'link-pago' };
            }
          }
        }
      }

      // Fallback: buscar cualquier botón de pagar
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        const src = img.getAttribute('src') || '';
        if (src.includes('pagar') || src.includes('dollar') || src.includes('$')) {
          const parent = img.closest('a') || img;
          (parent as HTMLElement).click();
          return { clicked: true, element: 'img-pagar-fallback' };
        }
      }

      return { clicked: false };
    });

    if (clickedPagar.clicked) {
      console.log(`   ✅ Click en: ${clickedPagar.element}`);
    }

    // Esperar navegación o popup
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
    } catch {
      // Puede que no haya navegación inmediata
    }
    await page.waitForTimeout(3000);

    await takeScreenshot(page, '03b-despues-click-pagar');

    // ========================================
    // PASO 4: Proceso PSE - Seleccionar forma de pago
    // ========================================
    console.log('');
    console.log('📋 PASO 4/5: Seleccionar PSE como forma de pago');

    const urlActual = page.url();
    console.log(`   URL: ${urlActual}`);

    // Verificar si estamos en página de Editar Planilla con opciones de pago
    const estadoPagina = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        tieneResumen: bodyText.includes('Resumen') || bodyText.includes('TOTAL POR PAGAR'),
        tienePSE: bodyText.includes('Pago PSE') || bodyText.includes('pse'),
        tieneTotal: bodyText.includes('855.000') || bodyText.includes('855,000'),
        preview: bodyText.slice(0, 500)
      };
    });

    console.log(`   Resumen visible: ${estadoPagina.tieneResumen}`);
    console.log(`   Opción PSE: ${estadoPagina.tienePSE}`);
    console.log(`   Total $855,000: ${estadoPagina.tieneTotal}`);

    await takeScreenshot(page, '04a-pagina-resumen-pago');

    // Click en el logo/imagen PSE para seleccionar esa forma de pago
    const clickedPSE = await page.evaluate(() => {
      // Buscar imagen de PSE
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        if (src.toLowerCase().includes('pse') || alt.toLowerCase().includes('pse')) {
          // Click en el enlace padre si existe
          const parent = img.closest('a') || img;
          (parent as HTMLElement).click();
          return { clicked: true, element: 'img-pse' };
        }
      }

      // Buscar link con texto PSE
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = (link.textContent || '').toLowerCase();
        const href = link.getAttribute('href') || '';
        if (text.includes('pse') || href.includes('pse')) {
          link.click();
          return { clicked: true, element: 'link-pse' };
        }
      }

      return { clicked: false };
    });

    if (clickedPSE.clicked) {
      console.log(`   ✅ Click en: ${clickedPSE.element}`);
      // Esperar navegación
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
      } catch { }
      await page.waitForTimeout(2000);
    }

    await takeScreenshot(page, '04b-despues-click-pse');

    // Manejar advertencia de horario (PSE-04006)
    const advertencia = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        tieneAdvertencia: bodyText.includes('Advertencia') || bodyText.includes('PSE-04006'),
        tieneSi: bodyText.includes('Sí') || bodyText.includes('Si'),
      };
    });

    if (advertencia.tieneAdvertencia) {
      console.log('   ⚠️ Advertencia de horario detectada');

      // Click en "Sí" para continuar
      const clickedSi = await page.evaluate(() => {
        const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
        for (const btn of buttons) {
          const value = ((btn as HTMLInputElement).value || btn.textContent || '').trim();
          if (value === 'Sí' || value === 'Si' || value === 'SÍ' || value === 'SI') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clickedSi) {
        console.log('   ✅ Click en "Sí" (continuar)');
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
        } catch { }
        await page.waitForTimeout(2000);
      }
    }

    await takeScreenshot(page, '04b2-despues-advertencia');

    // Verificar URL actual después de click en PSE
    const urlDespuesPSE = page.url();
    console.log(`   URL después PSE: ${urlDespuesPSE}`);

    // Buscar formulario PSE (tipo entidad, banco, etc.)
    const formPSE = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        tieneEntidad: bodyText.includes('Entidad') || bodyText.includes('Banco'),
        tienePersona: bodyText.includes('Persona') || bodyText.includes('Tipo'),
        preview: bodyText.slice(0, 500)
      };
    });

    console.log(`   Formulario PSE detectado: Entidad=${formPSE.tieneEntidad}, Persona=${formPSE.tienePersona}`);

    await takeScreenshot(page, '04c-formulario-pse');

    // Obtener todos los selects disponibles
    const selectsDisponibles = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      return Array.from(selects).map(sel => ({
        name: sel.getAttribute('name'),
        id: sel.getAttribute('id'),
        options: Array.from(sel.options).map(opt => ({ value: opt.value, text: opt.text }))
      }));
    });

    console.log(`   Selects encontrados: ${selectsDisponibles.length}`);
    selectsDisponibles.forEach(s => {
      console.log(`     - ${s.name || s.id}: ${s.options.length} opciones`);
    });

    // Seleccionar tipo aportante: JURIDICA (buscar "JURIDICA" en las opciones)
    for (const selInfo of selectsDisponibles) {
      const juridica = selInfo.options.find(opt =>
        opt.text.toUpperCase().includes('JURIDICA') || opt.value.toUpperCase() === 'J'
      );
      if (juridica && selInfo.name) {
        await page.select(`select[name="${selInfo.name}"]`, juridica.value);
        console.log(`   ✅ Tipo aportante: ${juridica.text}`);
        await page.waitForTimeout(500);
        break;
      }
    }

    // Refrescar lista de selects después del cambio
    await page.waitForTimeout(1000);

    // Seleccionar entidad financiera: BANCOLOMBIA
    const selectsActualizados = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      return Array.from(selects).map(sel => ({
        name: sel.getAttribute('name'),
        id: sel.getAttribute('id'),
        options: Array.from(sel.options).map(opt => ({ value: opt.value, text: opt.text }))
      }));
    });

    for (const selInfo of selectsActualizados) {
      const bancolombia = selInfo.options.find(opt =>
        opt.text.toUpperCase().includes('BANCOLOMBIA')
      );
      if (bancolombia && selInfo.name) {
        await page.select(`select[name="${selInfo.name}"]`, bancolombia.value);
        console.log(`   ✅ Entidad financiera: ${bancolombia.text}`);
        break;
      }
    }

    await page.waitForTimeout(1000);
    await takeScreenshot(page, '04d-banco-seleccionado');

    await takeScreenshot(page, '04e-datos-pse-llenos');

    // ========================================
    // PASO 5: Click en Pagar y llegar a Bancolombia
    // ========================================
    console.log('');
    console.log('📋 PASO 5/5: Click en Pagar');

    // Click en botón Pagar
    const clickedPagar2 = await page.evaluate(() => {
      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
      for (const btn of buttons) {
        const value = ((btn as HTMLInputElement).value || btn.textContent || '').toLowerCase();
        if (value.includes('pagar')) {
          (btn as HTMLElement).click();
          return { clicked: true, text: value };
        }
      }
      return { clicked: false };
    });

    if (clickedPagar2.clicked) {
      console.log(`   ✅ Click en: "${clickedPagar2.text}"`);
    }

    // Esperar navegación a página del banco
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 });
    } catch { }

    await page.waitForTimeout(5000);
    await takeScreenshot(page, '05a-despues-pagar');

    // Manejar posible diálogo de confirmación
    const clickedSiConfirmar = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase();
        if (text === 'sí' || text === 'si' || text === 'aceptar' || text === 'confirmar') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedSiConfirmar) {
      console.log('   ✅ Diálogo confirmado');
      await page.waitForTimeout(5000);
    }

    // Esperar posible redirección
    await page.waitForTimeout(3000);

    const urlFinal = page.url();
    console.log(`   URL final: ${urlFinal}`);

    const estadoFinal = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        title: document.title,
        esBancolombia: bodyText.toLowerCase().includes('bancolombia') ||
                       document.location.href.includes('bancolombia'),
        esPSE: document.location.href.includes('pse'),
        tieneLogin: bodyText.toLowerCase().includes('usuario') &&
                    bodyText.toLowerCase().includes('clave'),
        preview: bodyText.slice(0, 500)
      };
    });

    await takeScreenshot(page, '05b-pagina-final');

    // ========================================
    // RESULTADO
    // ========================================
    console.log('');
    console.log('════════════════════════════════════════════════════════════');

    if (estadoFinal.esBancolombia || urlFinal.includes('bancolombia') || urlFinal.includes('pse')) {
      console.log('✅ ÉXITO: Flujo PSE completado');
      console.log(`   🛑 BOT DETENIDO en: ${urlFinal}`);
      console.log(`   Título: ${estadoFinal.title}`);
      if (estadoFinal.tieneLogin) {
        console.log('   📝 Página de login detectada - Admin debe completar');
      }
    } else {
      console.log('⚠️ Flujo incompleto');
      console.log(`   URL: ${urlFinal}`);
      console.log(`   Preview: ${estadoFinal.preview.slice(0, 200)}...`);
    }

    console.log('');
    console.log('────────────────────────────────────────────────────────────');

  } catch (error) {
    console.log('');
    console.log(`❌ ERROR: ${error instanceof Error ? error.message : error}`);
    if (page) {
      await takeScreenshot(page, 'error-final');
    }
  } finally {
    if (page) {
      const browser = page.browser();
      await browser.close();
      console.log('Browser cerrado');
    }
  }
}

main().catch(console.error);
