/**
 * Mi Planilla Liquidación - Dry Run Test
 *
 * Prueba el flujo completo de generación de planilla.
 * Se detiene ANTES de generar la planilla final.
 *
 * Credenciales de prueba:
 * - Usuario: cc1047484978
 * - Password: Ulecolombia123
 *
 * Flujo:
 * 1. Login (usando lógica probada del flujo 2)
 * 2. Click en "Generar nueva planilla"
 * 3. Cerrar modal ARL si aparece
 * 4. Seleccionar tipo de planilla (Pagos propios)
 * 5. Seleccionar período
 * 6. Ver/Modificar información del cotizante (IBC)
 * 7. DRY RUN: Se detiene antes de "Generar Planilla"
 */

import { BrowserManager } from '../src/bots/utils/browser';

const MIPLANILLA_URLS = {
  portal: 'https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes',
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',
  generarPlanilla: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/GenerarPlanilla',
};

// Credenciales de prueba
const TEST_CREDENTIALS = {
  tipoDocumento: 'CC',
  documento: '1047484978',
  password: 'Ulecolombia123',
  get usuario() {
    return `${this.tipoDocumento}${this.documento}`;
  },
};

// Datos de prueba para liquidación
const TEST_LIQUIDACION = {
  ibc: 2000000, // IBC de prueba: 2 millones
  periodo: 'Febrero de 2026', // Período actual
};

async function testMiPlanillaLiquidacion() {
  console.log(`
═══════════════════════════════════════════════════════════════
   MI PLANILLA LIQUIDACIÓN - DRY RUN TEST
═══════════════════════════════════════════════════════════════

Este script probará el flujo de generación de planilla.
Se detendrá ANTES de hacer click en "Generar Planilla".

Usuario: ${TEST_CREDENTIALS.usuario}
IBC Prueba: $${TEST_LIQUIDACION.ibc.toLocaleString()}

`);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/test-miplanilla-liquidacion',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // ═══════════════════════════════════════════════════════════════
    // FASE 1: LOGIN (reutilizando lógica probada)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 1] Realizando login...');

    await page.goto(MIPLANILLA_URLS.portal, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    // Cerrar popup si existe
    try {
      const closeButtons = await page.$$('button.close, .modal .close, [aria-label="Close"]');
      for (const btn of closeButtons) {
        const isVisible = await btn.boundingBox();
        if (isVisible) {
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch { /* no popup */ }

    // Ingresar usuario
    const usuarioInput = await page.$('#usuario');
    if (usuarioInput) {
      await usuarioInput.click({ clickCount: 3 });
      await page.keyboard.type(TEST_CREDENTIALS.usuario, { delay: 30 });
    }

    // Ingresar clave
    const claveInput = await page.$('#clave');
    if (claveInput) {
      await claveInput.click({ clickCount: 3 });
      await page.keyboard.type(TEST_CREDENTIALS.password, { delay: 30 });
    }

    // Click en Entrar
    const entrarBtn = await page.$('button.btn.btn-primary.button-cta');
    if (entrarBtn) {
      await entrarBtn.click();
    }

    // Esperar redirección al dashboard
    await page.waitForTimeout(5000);
    await browserManager.takeScreenshot(page, 'liquidacion-01-dashboard');

    const currentUrl = page.url();
    if (!currentUrl.includes('Principal') && !currentUrl.includes('Privado')) {
      throw new Error('Login falló - no llegamos al dashboard');
    }
    console.log('  ✓ Login exitoso');

    // ═══════════════════════════════════════════════════════════════
    // FASE 2: Navegar a "Generar nueva planilla"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 2] Navegando a "Generar nueva planilla"...');

    await page.waitForTimeout(2000);

    // Cerrar cualquier modal/popup que aparezca en el dashboard
    await cerrarModalesYPopups(page);

    // Navegar directamente a la URL de generar planilla (más confiable)
    console.log('  → Navegando directamente a GenerarPlanilla...');
    await page.goto(MIPLANILLA_URLS.generarPlanilla, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(3000);
    await browserManager.takeScreenshot(page, 'liquidacion-02-generar-planilla-page');
    console.log('  ✓ En página de generar planilla');

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: Cerrar modal ARL si aparece
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 3] Verificando modal ARL...');

    await cerrarModalesYPopups(page);

    // Buscar modal específico de ARL
    const arlModal = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      return bodyText.includes('arl') && bodyText.includes('actualizar');
    });

    if (arlModal) {
      console.log('  → Modal ARL detectado');
      // Buscar botón "No" o "No actualizar"
      const noBtn = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('no') && !text.includes('nombre')) {
            (btn as HTMLButtonElement).click();
            return true;
          }
        }
        return false;
      });
      if (noBtn) {
        console.log('  ✓ Modal ARL cerrado (No actualizar)');
      }
      await page.waitForTimeout(1000);
    } else {
      console.log('  → No hay modal ARL');
    }

    await browserManager.takeScreenshot(page, 'liquidacion-03-after-arl-modal');

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: Analizar página de generar planilla
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 4] Analizando formulario de planilla...');

    // Debug: listar todos los inputs
    const inputs = await page.$$eval('input:not([type="hidden"]), select', (els) =>
      els.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type,
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: (el as HTMLInputElement).placeholder,
        className: el.className,
      }))
    );
    console.log('  [DEBUG] Inputs/Selects encontrados:', JSON.stringify(inputs.slice(0, 10), null, 2));

    // Debug: listar radios y checkboxes
    const radios = await page.$$eval('input[type="radio"], input[type="checkbox"]', (els) =>
      els.map(el => ({
        type: el.type,
        name: el.getAttribute('name'),
        id: el.id,
        value: el.getAttribute('value'),
        labelText: el.parentElement?.textContent?.trim()?.substring(0, 50),
      }))
    );
    console.log('  [DEBUG] Radios/Checkboxes:', JSON.stringify(radios.slice(0, 10), null, 2));

    await browserManager.takeScreenshot(page, 'liquidacion-04-form-analysis');

    // ═══════════════════════════════════════════════════════════════
    // FASE 5: Seleccionar tipo de planilla (radio I)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 5] Seleccionando tipo de planilla...');

    // Click en el radio con id="I" (Pagos de mis propios aportes)
    const radioI = await page.$('#I');
    if (radioI) {
      await radioI.click();
      console.log('  ✓ Click en radio #I (Propios aportes)');
    } else {
      // Fallback: buscar por texto en el contenedor
      const clicked = await page.evaluate(() => {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
          const text = label.textContent?.toLowerCase() || '';
          if (text.includes('propios aportes') || text.includes('mis propios')) {
            label.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) {
        console.log('  ✓ Tipo de planilla seleccionado por texto');
      } else {
        console.log('  ? No se encontró opción de tipo de planilla');
      }
    }

    await page.waitForTimeout(2000); // Esperar que cargue la información del cotizante
    await browserManager.takeScreenshot(page, 'liquidacion-05-tipo-planilla');

    // ═══════════════════════════════════════════════════════════════
    // FASE 6: Seleccionar período
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 6] Verificando período...');

    // Buscar selector de período
    const periodoSelect = await page.$('select[name*="periodo"], select[id*="periodo"], select[name*="Periodo"]');
    if (periodoSelect) {
      const options = await periodoSelect.$$eval('option', (opts) =>
        opts.map(o => ({ value: o.value, text: o.text }))
      );
      console.log('  [DEBUG] Períodos disponibles:', JSON.stringify(options, null, 2));

      // Seleccionar el período actual (febrero 2026)
      const periodoActual = options.find(o =>
        o.text.toLowerCase().includes('febrero') && o.text.includes('2026')
      );
      if (periodoActual) {
        await periodoSelect.select(periodoActual.value);
        console.log(`  ✓ Período seleccionado: ${periodoActual.text}`);
      }
    } else {
      console.log('  → Período puede estar pre-seleccionado o no visible aún');
    }

    await page.waitForTimeout(1000);
    await browserManager.takeScreenshot(page, 'liquidacion-06-periodo');

    // ═══════════════════════════════════════════════════════════════
    // FASE 7: Buscar información del cotizante
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 7] Buscando información del cotizante...');

    // Esperar a que cargue la lista de personas
    await page.waitForTimeout(3000);

    // Capturar sección de "Personas incluidas en la planilla"
    const personasInfo = await page.evaluate(() => {
      // Buscar el contenedor de personas
      const bodyText = document.body.innerText;

      // Extraer número de personas
      const personasMatch = bodyText.match(/Personas incluidas en la planilla \((\d+)\)/);
      const numPersonas = personasMatch ? parseInt(personasMatch[1]) : 0;

      // Buscar tabla de cotizantes
      const tables = document.querySelectorAll('table');
      const tableInfo: Array<{headers: string[], rows: number}> = [];
      tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
        const rows = table.querySelectorAll('tbody tr').length;
        if (headers.length > 0 || rows > 0) {
          tableInfo.push({ headers, rows });
        }
      });

      // Buscar botones de acción
      const buttons = Array.from(document.querySelectorAll('a, button')).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim()?.substring(0, 50),
        href: (el as HTMLAnchorElement).href || null,
      })).filter(b => b.text && b.text.length > 0);

      return {
        numPersonas,
        tables: tableInfo,
        buttonsCount: buttons.length,
        relevantButtons: buttons.filter(b =>
          b.text?.toLowerCase().includes('modificar') ||
          b.text?.toLowerCase().includes('editar') ||
          b.text?.toLowerCase().includes('ibc') ||
          b.text?.toLowerCase().includes('eliminar') ||
          b.text?.toLowerCase().includes('agregar')
        ).slice(0, 5)
      };
    });

    console.log(`  → Personas incluidas: ${personasInfo.numPersonas}`);
    console.log('  [DEBUG] Tablas:', JSON.stringify(personasInfo.tables, null, 2));
    console.log('  [DEBUG] Botones relevantes:', JSON.stringify(personasInfo.relevantButtons, null, 2));

    await browserManager.takeScreenshot(page, 'liquidacion-07-cotizante-info');

    // ═══════════════════════════════════════════════════════════════
    // FASE 7.1: Explorar "Modificar información" (para cambiar IBC)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 7.1] Explorando "Modificar información"...');

    // Click en "Modificar información"
    const modificarClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent?.trim() === 'Modificar información') {
          link.click();
          return true;
        }
      }
      return false;
    });

    if (modificarClicked) {
      console.log('  ✓ Click en "Modificar información"');
      await page.waitForTimeout(3000); // Esperar que cargue el modal/página
      await browserManager.takeScreenshot(page, 'liquidacion-07b-modificar-info');

      // Analizar qué aparece después del click
      const modificarInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText;

        // Buscar inputs relacionados con IBC/Salario
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).map(el => ({
          name: el.getAttribute('name'),
          id: el.id,
          value: (el as HTMLInputElement).value,
          placeholder: (el as HTMLInputElement).placeholder,
        })).filter(i => i.id || i.name);

        // Buscar selects
        const selects = Array.from(document.querySelectorAll('select')).map(el => ({
          name: el.getAttribute('name'),
          id: el.id,
          selectedValue: (el as HTMLSelectElement).value,
        }));

        // Buscar botones de guardar
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).map(el => ({
          text: el.textContent?.trim() || (el as HTMLInputElement).value,
          type: el.getAttribute('type'),
        })).filter(b => b.text);

        return { inputs: inputs.slice(0, 15), selects: selects.slice(0, 10), buttons: buttons.slice(0, 10) };
      });

      console.log('  [DEBUG] Inputs encontrados:', JSON.stringify(modificarInfo.inputs, null, 2));
      console.log('  [DEBUG] Selects encontrados:', JSON.stringify(modificarInfo.selects, null, 2));
      console.log('  [DEBUG] Botones:', JSON.stringify(modificarInfo.buttons, null, 2));

      // ═══════════════════════════════════════════════════════════════
      // MODIFICAR EL IBC A 3,000,000
      // ═══════════════════════════════════════════════════════════════
      console.log('\n  [MODIFICANDO IBC] Cambiando valor a 3,000,000...');

      // Buscar y modificar el campo #IngresosMensuales
      const ibcInput = await page.$('#IngresosMensuales');
      if (ibcInput) {
        // Limpiar el campo
        await ibcInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);

        // Escribir el nuevo valor
        await ibcInput.type('3000000', { delay: 50 });
        console.log('  ✓ IBC cambiado a 3,000,000');

        await browserManager.takeScreenshot(page, 'liquidacion-07d-ibc-modified');

        // Click en "Guardar empleado"
        console.log('  [GUARDANDO] Click en "Guardar empleado"...');
        const guardado = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, input[type="submit"]');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '';
            if (text.includes('guardar')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (guardado) {
          console.log('  ✓ Click en "Guardar empleado"');
          await page.waitForTimeout(3000); // Esperar que guarde
          await browserManager.takeScreenshot(page, 'liquidacion-07e-after-save');

          // Verificar si hay mensaje de éxito
          const successMsg = await page.evaluate(() => {
            const body = document.body.innerText.toLowerCase();
            return body.includes('correctamente') || body.includes('éxito') || body.includes('guardado');
          });
          if (successMsg) {
            console.log('  ✓ Cambios guardados correctamente');
          }
        } else {
          console.log('  ? No se encontró botón "Guardar empleado"');
        }
      } else {
        console.log('  ? No se encontró campo #IngresosMensuales');
      }

      // Volver a la página de generar planilla
      console.log('\n  → Navegando de vuelta a generar planilla...');
      await page.goto(MIPLANILLA_URLS.generarPlanilla, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(2000);

      // Re-seleccionar tipo de planilla
      const radioIAgain = await page.$('#I');
      if (radioIAgain) await radioIAgain.click();
      await page.waitForTimeout(2000);

      await browserManager.takeScreenshot(page, 'liquidacion-07f-back-to-form');
    } else {
      console.log('  ? No se encontró link "Modificar información"');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 8: Buscar botón "Generar Planilla" (NO hacer click)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[FASE 8] Buscando botón "Generar Planilla"...');

    const generarPlanillaBtn = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], a');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('generar planilla') || text === 'generar') {
          return {
            tag: btn.tagName,
            text: btn.textContent?.trim() || (btn as HTMLInputElement).value,
            className: btn.className,
            disabled: (btn as HTMLButtonElement).disabled,
          };
        }
      }
      return null;
    });

    if (generarPlanillaBtn) {
      console.log('  ✓ Botón "Generar Planilla" encontrado');
      console.log(`    Tag: ${generarPlanillaBtn.tag}`);
      console.log(`    Texto: ${generarPlanillaBtn.text}`);
      console.log(`    Disabled: ${generarPlanillaBtn.disabled}`);
    } else {
      console.log('  ? Botón "Generar Planilla" no encontrado aún');
    }

    await browserManager.takeScreenshot(page, 'liquidacion-08-ready');

    console.log(`
═══════════════════════════════════════════════════════════════
   ⚠️  DRY RUN COMPLETADO - NO SE GENERÓ LA PLANILLA
═══════════════════════════════════════════════════════════════

El flujo llegó hasta antes de generar la planilla.
El botón "Generar Planilla" está identificado pero NO se hizo click.

Revisa los screenshots en: ./screenshots/

Esperando 30 segundos para inspección visual...
(Puedes cerrar el navegador manualmente o esperar)
`);

    await page.waitForTimeout(30000);
    console.log('\n✓ Cerrando navegador...');
    await browserManager.close();

  } catch (error) {
    console.error('\n✗ Error durante el test:', error);
    await browserManager.close();
    process.exit(1);
  }
}

/**
 * Cierra modales y popups que puedan aparecer
 */
async function cerrarModalesYPopups(page: any): Promise<void> {
  try {
    // Intentar cerrar modales con botón X
    const closeSelectors = [
      'button.close',
      '.modal .close',
      '[aria-label="Close"]',
      'button[class*="close"]',
      '.btn-close',
    ];

    for (const selector of closeSelectors) {
      const closeButtons = await page.$$(selector);
      for (const btn of closeButtons) {
        const isVisible = await btn.boundingBox();
        if (isVisible) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Intentar cerrar con botones de texto
    const textButtons = ['Cerrar', 'Omitir', 'No', 'Cancelar'];
    for (const text of textButtons) {
      const clicked = await page.evaluate((searchText: string) => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent?.trim().toLowerCase() === searchText.toLowerCase()) {
            const style = window.getComputedStyle(btn);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              btn.click();
              return true;
            }
          }
        }
        return false;
      }, text);

      if (clicked) {
        await page.waitForTimeout(500);
      }
    }
  } catch {
    // Ignorar errores
  }
}

// Ejecutar
testMiPlanillaLiquidacion().catch(console.error);
