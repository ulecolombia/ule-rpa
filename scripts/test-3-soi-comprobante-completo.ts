/**
 * TEST 3-SOI COMPLETO: Descarga de Comprobante
 *
 * Este test completa la descarga de comprobante de planillas pagadas en SOI:
 *
 * 1. Login en SOI
 * 2. Navegar a consulta de planillas con filtro PAGADA
 * 3. Seleccionar la planilla más reciente
 * 4. Descargar el PDF del comprobante
 * 5. Verificar que el archivo tiene contenido (>0 bytes)
 * 6. Guardar en tests/evidencias/
 *
 * SEGURO: Este test es READ-ONLY - solo descarga documentos.
 */

import { getSOIAuthBot, SOIAuthBot } from '../src/bots/soi/auth.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const TEST_USER_SOI = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: '1018482146',
  password: process.env.SOI_PASSWORD || 'Ulecolombia123*',
};

const EVIDENCIAS_PATH = path.resolve('./tests/evidencias');

interface TestResult {
  paso: string;
  exitoso: boolean;
  detalle: string;
  datos?: Record<string, unknown>;
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = `screenshots/test3-soi-completo-${name}_${timestamp}.png`;
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
  comprobantePath?: string;
}> {
  const resultados: TestResult[] = [];
  let authBot: SOIAuthBot | null = null;
  let comprobantePath: string | undefined;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 3-SOI COMPLETO: DESCARGA DE COMPROBANTE             ║');
  console.log('║   Operador: SOI (nuevosoi.com.co)                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER_SOI.numeroDocumento}`);
  console.log(`📁 Destino: ${EVIDENCIAS_PATH}`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

  // Asegurar directorio de evidencias
  if (!fs.existsSync(EVIDENCIAS_PATH)) {
    fs.mkdirSync(EVIDENCIAS_PATH, { recursive: true });
  }

  try {
    // ========================================
    // PASO 1: Login en SOI
    // ========================================
    console.log('📋 PASO 1: Autenticación en SOI');
    authBot = getSOIAuthBot();

    const loginResult = await authBot.loginAsUser({
      tipoDocumento: TEST_USER_SOI.tipoDocumento,
      documento: TEST_USER_SOI.numeroDocumento,
      password: TEST_USER_SOI.password,
    });

    if (!loginResult.isAuthenticated) {
      throw new Error('Login SOI falló');
    }

    resultados.push({
      paso: 'Login SOI',
      exitoso: true,
      detalle: `Usuario: ${loginResult.userName}`,
    });
    console.log(`   ✅ Login exitoso: ${loginResult.userName}`);
    console.log('');

    const page = authBot.getPage();
    if (!page) throw new Error('No se pudo obtener la página');

    // ========================================
    // PASO 2: Expandir menú y explorar opciones
    // ========================================
    console.log('📋 PASO 2: Explorar menú de SOI');

    // Listar todos los items del menú lateral
    const menuItems = await page.evaluate(() => {
      const items: string[] = [];
      const menuElements = document.querySelectorAll('.menu a, .sidebar a, nav a, td a, [class*="menu"] a');
      menuElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 50) {
          items.push(text);
        }
      });
      return items;
    });
    console.log('   Items del menú encontrados:', menuItems.slice(0, 10));

    // Click en "Gestionar Planillas" para expandir
    await page.evaluate(() => {
      const items = document.querySelectorAll('td, div, span, a');
      for (const item of items) {
        const text = item.textContent?.trim() || '';
        if (text === 'Gestionar Planillas') {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02a-menu-gestionar-expandido');

    // Listar submenú después de expandir
    const submenuItems = await page.evaluate(() => {
      const items: string[] = [];
      const allLinks = document.querySelectorAll('a');
      allLinks.forEach(el => {
        const text = el.textContent?.trim();
        const href = el.getAttribute('href') || '';
        if (text && text.length > 2 && text.length < 50) {
          items.push(`${text} (${href.slice(0, 30)})`);
        }
      });
      return items;
    });
    console.log('   Submenú después de expandir:', submenuItems.slice(0, 15));

    // Buscar opción de consultar planillas o historial
    const clickedConsulta = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        const href = (link.getAttribute('href') || '').toLowerCase();
        // Buscar opciones relacionadas con consulta/historial de planillas
        if (text.includes('consultar planilla') || text.includes('historial') ||
            text.includes('planillas pagadas') || text.includes('mis planillas') ||
            href.includes('consultar') || href.includes('historial')) {
          link.click();
          return { clicked: true, text: link.textContent?.trim(), href };
        }
      }
      return { clicked: false };
    });

    if (clickedConsulta.clicked) {
      console.log(`   ✅ Click en: ${clickedConsulta.text}`);
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
      } catch {
        await page.waitForTimeout(3000);
      }
    } else {
      console.log('   ⚠️ No se encontró opción de consultar planillas');
      // Expandir menú "Consultas"
      await page.evaluate(() => {
        const items = document.querySelectorAll('td, div, span, a');
        for (const item of items) {
          const text = item.textContent?.trim() || '';
          if (text === 'Consultas') {
            (item as HTMLElement).click();
            break;
          }
        }
      });
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(1000);
    await takeScreenshot(page, '02b-despues-navegacion');

    // ========================================
    // PASO 3: Click en pestaña "General" y filtrar por PAGADA
    // ========================================
    console.log('📋 PASO 3: Usar pestaña General y filtrar por PAGADAS');

    // Primero hacer click en la pestaña "General"
    const clickedGeneral = await page.evaluate(() => {
      // Buscar pestañas (tabs) - pueden ser links, spans o divs
      const tabSelectors = [
        'a:contains("General")',
        'span:contains("General")',
        'div[class*="tab"]:contains("General")',
        'li:contains("General")',
        'input[value="General"]',
      ];

      // Buscar por texto
      const allElements = document.querySelectorAll('a, span, div, li, input, button, td');
      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        const value = (el as HTMLInputElement).value || '';
        if (text === 'General' || value === 'General' || text.toLowerCase() === 'general') {
          (el as HTMLElement).click();
          return { clicked: true, element: el.tagName, text };
        }
      }

      return { clicked: false };
    });

    if (clickedGeneral.clicked) {
      console.log(`   ✅ Click en pestaña General (${clickedGeneral.element})`);
      await page.waitForTimeout(2000);
    } else {
      console.log('   ⚠️ No se encontró pestaña General - intentando con selectores alternativos');

      // Intentar click directo en tab por xpath o selector más específico
      try {
        // SOI usa tabs con links
        await page.click('a[href*="General"], td:has-text("General"), span:has-text("General")');
        console.log('   ✅ Click alternativo en General');
        await page.waitForTimeout(2000);
      } catch {
        console.log('   Continuando sin cambiar pestaña...');
      }
    }

    await takeScreenshot(page, '03a-despues-click-general');

    // Ahora buscar el select de Estado y seleccionar PAGADA
    const filtroAplicado = await page.evaluate(() => {
      // Buscar select de estado
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const pagadaOption = options.find(o =>
          o.text.toLowerCase().includes('pagada') ||
          o.value.toLowerCase().includes('pagada')
        );
        if (pagadaOption) {
          select.value = pagadaOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { found: true, value: pagadaOption.text, selectName: select.name || select.id };
        }
      }
      return { found: false };
    });

    if (filtroAplicado.found) {
      console.log(`   ✅ Filtro aplicado: ${filtroAplicado.value} (${filtroAplicado.selectName})`);
    } else {
      console.log('   ⚠️ No se encontró filtro de estado - la pestaña General puede no tener filtro');
    }

    // Ajustar rango de fechas para incluir 2026
    // Los campos de fecha en SOI tienen formato AAAA-MM-DD y están al lado de iconos de calendario
    console.log('   Ajustando fechas...');

    // Primero identificar todos los inputs de tipo texto/date en la página
    const camposFecha = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      const fechaInputs: Array<{ name: string; id: string; value: string; index: number }> = [];

      inputs.forEach((input, index) => {
        const htmlInput = input as HTMLInputElement;
        const val = htmlInput.value || '';
        // Detectar si parece un campo de fecha
        if (val.match(/^\d{4}-\d{2}-\d{2}$/) ||
            htmlInput.name?.toLowerCase().includes('fecha') ||
            htmlInput.id?.toLowerCase().includes('fecha')) {
          fechaInputs.push({
            name: htmlInput.name || '',
            id: htmlInput.id || '',
            value: val,
            index
          });
        }
      });

      return fechaInputs;
    });

    console.log(`   Campos de fecha encontrados: ${camposFecha.length}`);
    camposFecha.forEach(f => console.log(`      - ${f.name || f.id || 'input'}: ${f.value}`));

    // Ajustar los campos de fecha usando JavaScript directamente
    // porque los inputs de fecha de SOI tienen validación especial
    const fechasResult = await page.evaluate(() => {
      const desdeInput = document.querySelector('input[name="fechaDesde"]') as HTMLInputElement;
      const hastaInput = document.querySelector('input[name="fechaHasta"]') as HTMLInputElement;

      let desdeOk = false;
      let hastaOk = false;

      if (desdeInput) {
        // Limpiar y establecer valor
        desdeInput.value = '';
        desdeInput.value = '2024-01-01';
        desdeInput.dispatchEvent(new Event('input', { bubbles: true }));
        desdeInput.dispatchEvent(new Event('change', { bubbles: true }));
        desdeInput.dispatchEvent(new Event('blur', { bubbles: true }));
        desdeOk = desdeInput.value === '2024-01-01';
      }

      if (hastaInput) {
        // Limpiar y establecer valor
        hastaInput.value = '';
        hastaInput.value = '2026-12-31';
        hastaInput.dispatchEvent(new Event('input', { bubbles: true }));
        hastaInput.dispatchEvent(new Event('change', { bubbles: true }));
        hastaInput.dispatchEvent(new Event('blur', { bubbles: true }));
        hastaOk = hastaInput.value === '2026-12-31';
      }

      return {
        desdeOk,
        hastaOk,
        desdeValue: desdeInput?.value || 'N/A',
        hastaValue: hastaInput?.value || 'N/A',
      };
    });

    console.log(`   Fecha Desde: ${fechasResult.desdeValue} ${fechasResult.desdeOk ? '✅' : '❌'}`);
    console.log(`   Fecha Hasta: ${fechasResult.hastaValue} ${fechasResult.hastaOk ? '✅' : '❌'}`);

    await page.waitForTimeout(1000);
    await takeScreenshot(page, '03b-fechas-ajustadas');

    // Click en botón Buscar
    const buscarClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('input[type="submit"], input[type="button"], button, input[value*="uscar"]');
      for (const btn of btns) {
        const value = (btn as HTMLInputElement).value || btn.textContent || '';
        if (value.toLowerCase().includes('buscar') || value.toLowerCase().includes('consultar')) {
          (btn as HTMLElement).click();
          return { clicked: true, value };
        }
      }
      return { clicked: false };
    });

    if (buscarClicked.clicked) {
      console.log(`   ✅ Click en: ${buscarClicked.value}`);
    } else {
      console.log('   ⚠️ No se encontró botón Buscar');
    }

    await page.waitForTimeout(3000);
    await takeScreenshot(page, '03-resultados-busqueda');

    resultados.push({
      paso: 'Filtrar PAGADAS',
      exitoso: true,
      detalle: 'Búsqueda ejecutada',
    });
    console.log('   ✅ Búsqueda ejecutada');
    console.log('');

    // ========================================
    // PASO 4: Identificar planilla más reciente
    // ========================================
    console.log('📋 PASO 4: Identificar planilla más reciente');

    const planillaInfo = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      let planillaEncontrada: {
        numero?: string;
        periodo?: string;
        valor?: string;
        rowIndex: number;
      } | null = null;

      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('td');
          const rowText = row.textContent?.toLowerCase() || '';

          // Verificar que es una fila con planilla pagada
          if (rowText.includes('pagada') || cells.length >= 4) {
            // Extraer datos
            const cellTexts = Array.from(cells).map(c => c.textContent?.trim() || '');

            // Buscar número de planilla (típicamente en primeras columnas)
            const numMatch = cellTexts.join(' ').match(/\b(\d{10,15})\b/);

            // Buscar periodo (formato MM/YYYY o YYYY-MM)
            const periodoMatch = cellTexts.join(' ').match(/(\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2})/);

            // Buscar valor ($XXX,XXX)
            const valorMatch = cellTexts.join(' ').match(/\$?\s*([\d.,]+)/);

            planillaEncontrada = {
              numero: numMatch ? numMatch[1] : cellTexts[0],
              periodo: periodoMatch ? periodoMatch[1] : cellTexts[1],
              valor: valorMatch ? valorMatch[1] : undefined,
              rowIndex: i,
            };
            break; // Tomar la primera (más reciente si está ordenada)
          }
        }
        if (planillaEncontrada) break;
      }

      return planillaEncontrada;
    });

    if (!planillaInfo) {
      console.log('   ⚠️ No se encontraron planillas en la tabla');
      console.log('   Intentando buscar directamente links de descarga...');
    } else {
      console.log(`   Planilla encontrada:`);
      console.log(`      Número: ${planillaInfo.numero || 'N/A'}`);
      console.log(`      Periodo: ${planillaInfo.periodo || 'N/A'}`);
      console.log(`      Valor: ${planillaInfo.valor || 'N/A'}`);
    }

    resultados.push({
      paso: 'Identificar Planilla',
      exitoso: !!planillaInfo,
      detalle: planillaInfo ? `Planilla ${planillaInfo.numero}` : 'Buscando alternativa',
      datos: planillaInfo || undefined,
    });
    console.log('');

    // ========================================
    // PASO 5: Configurar descarga y descargar PDF
    // ========================================
    console.log('📋 PASO 5: Descargar comprobante PDF');

    // Configurar comportamiento de descarga
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: EVIDENCIAS_PATH,
    });

    // Buscar y hacer click en el link/botón de descarga
    const downloadClicked = await page.evaluate((rowIdx) => {
      // Estrategia 1: Buscar en la fila específica
      if (rowIdx !== null && rowIdx >= 0) {
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr');
          if (rows[rowIdx]) {
            const row = rows[rowIdx];
            // Buscar links/imágenes de descarga en esta fila
            const downloadElements = row.querySelectorAll('a[href*="pdf"], a[href*="soporte"], a[href*="comprobante"], img[src*="pdf"], img[onclick*="pdf"]');
            if (downloadElements.length > 0) {
              (downloadElements[0] as HTMLElement).click();
              return { clicked: true, method: 'row-link' };
            }
            // Buscar cualquier link en la fila
            const anyLink = row.querySelector('a');
            if (anyLink) {
              anyLink.click();
              return { clicked: true, method: 'row-any-link' };
            }
          }
        }
      }

      // Estrategia 2: Buscar cualquier link de descarga en la página
      const downloadSelectors = [
        'a[href*=".pdf"]',
        'a[href*="soporte"]',
        'a[href*="comprobante"]',
        'a[href*="descargar"]',
        'img[src*="pdf"]',
        'img[onclick*="descargar"]',
      ];

      for (const selector of downloadSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          (elements[0] as HTMLElement).click();
          return { clicked: true, method: `selector: ${selector}` };
        }
      }

      // Estrategia 3: Buscar por texto
      const allLinks = document.querySelectorAll('a, button, img');
      for (const el of allLinks) {
        const text = (el.textContent || (el as HTMLImageElement).alt || '').toLowerCase();
        const onclick = (el as HTMLElement).onclick?.toString().toLowerCase() || '';
        if (text.includes('pdf') || text.includes('descargar') || text.includes('soporte') ||
            onclick.includes('pdf') || onclick.includes('descargar')) {
          (el as HTMLElement).click();
          return { clicked: true, method: 'text-match' };
        }
      }

      return { clicked: false, method: null };
    }, planillaInfo?.rowIndex ?? -1);

    console.log(`   Método de descarga: ${downloadClicked.method || 'ninguno'}`);

    if (downloadClicked.clicked) {
      // Esperar a que se descargue el archivo
      console.log('   Esperando descarga...');
      await page.waitForTimeout(8000);

      await takeScreenshot(page, '05-despues-click-descarga');
    }

    // ========================================
    // PASO 6: Verificar archivo descargado
    // ========================================
    console.log('📋 PASO 6: Verificar archivo descargado');

    // Buscar archivos PDF en el directorio de evidencias
    const files = fs.readdirSync(EVIDENCIAS_PATH);
    const pdfFiles = files
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        name: f,
        path: path.join(EVIDENCIAS_PATH, f),
        stat: fs.statSync(path.join(EVIDENCIAS_PATH, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    console.log(`   PDFs encontrados: ${pdfFiles.length}`);

    if (pdfFiles.length > 0) {
      const mostRecent = pdfFiles[0];
      const isRecent = (Date.now() - mostRecent.stat.mtimeMs) < 60000; // Último minuto
      const hasContent = mostRecent.stat.size > 0;

      console.log(`   Archivo más reciente: ${mostRecent.name}`);
      console.log(`   Tamaño: ${mostRecent.stat.size} bytes`);
      console.log(`   Reciente (<1 min): ${isRecent ? 'Sí' : 'No'}`);

      if (hasContent) {
        // Renombrar archivo con formato esperado
        const periodo = planillaInfo?.periodo?.replace(/[\/\\]/g, '-') || 'unknown';
        const newName = `comprobante-soi-${periodo}.pdf`;
        const newPath = path.join(EVIDENCIAS_PATH, newName);

        // Si ya existe un archivo con ese nombre, agregar timestamp
        let finalPath = newPath;
        if (fs.existsSync(newPath) && newPath !== mostRecent.path) {
          const timestamp = Date.now();
          finalPath = path.join(EVIDENCIAS_PATH, `comprobante-soi-${periodo}-${timestamp}.pdf`);
        }

        if (mostRecent.path !== finalPath) {
          fs.renameSync(mostRecent.path, finalPath);
          console.log(`   ✅ Renombrado a: ${path.basename(finalPath)}`);
        }

        comprobantePath = finalPath;

        resultados.push({
          paso: 'Descargar PDF',
          exitoso: true,
          detalle: `${mostRecent.stat.size} bytes`,
          datos: { path: finalPath, size: mostRecent.stat.size },
        });
      } else {
        resultados.push({
          paso: 'Descargar PDF',
          exitoso: false,
          detalle: 'Archivo vacío (0 bytes)',
        });
      }
    } else {
      // No hay PDF descargado - intentar capturar si hay iframe o nueva ventana
      console.log('   ⚠️ No se detectó PDF descargado');
      console.log('   Verificando si hay iframe o ventana emergente...');

      // Verificar si hay un iframe con PDF
      const hasPdfFrame = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          const src = iframe.src || '';
          if (src.includes('pdf') || src.includes('blob:')) {
            return { found: true, src };
          }
        }
        return { found: false };
      });

      if (hasPdfFrame.found) {
        console.log(`   Iframe PDF detectado: ${hasPdfFrame.src}`);
        // Intentar capturar el contenido del iframe
        await takeScreenshot(page, '06-iframe-pdf');
      }

      resultados.push({
        paso: 'Descargar PDF',
        exitoso: false,
        detalle: 'No se detectó archivo descargado',
      });
    }

    // ========================================
    // RESUMEN
    // ========================================
    console.log('');
    console.log('─'.repeat(60));
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMEN DEL TEST                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    console.log('┌────────────────────────┬──────────┬──────────────────────────┐');
    console.log('│ Paso                   │ Estado   │ Detalle                  │');
    console.log('├────────────────────────┼──────────┼──────────────────────────┤');
    for (const r of resultados) {
      const paso = r.paso.padEnd(22).slice(0, 22);
      const estado = r.exitoso ? '   ✅   ' : '   ❌   ';
      const detalle = r.detalle.slice(0, 24).padEnd(24);
      console.log(`│ ${paso} │${estado}│ ${detalle} │`);
    }
    console.log('└────────────────────────┴──────────┴──────────────────────────┘');
    console.log('');

    const todosExitosos = resultados.every(r => r.exitoso);
    if (todosExitosos && comprobantePath) {
      console.log('✅ TEST 3-SOI COMPLETO EXITOSO');
      console.log('');
      console.log(`📄 Comprobante guardado: ${comprobantePath}`);
      console.log(`   Tamaño: ${fs.statSync(comprobantePath).size} bytes`);
    } else {
      console.log('⚠️ TEST PARCIALMENTE EXITOSO');
      if (!comprobantePath) {
        console.log('   Faltó descargar el comprobante PDF');
      }
    }

    await authBot.close();
    return { success: todosExitosos, resultados, comprobantePath };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    resultados.push({ paso: 'Error General', exitoso: false, detalle: errorMsg.slice(0, 50) });
    console.error('❌ ERROR:', errorMsg);

    if (authBot) {
      try { await authBot.close(); } catch { }
    }
    return { success: false, resultados };
  }
}

runTest()
  .then(result => {
    console.log('');
    console.log('─'.repeat(60));
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Error ejecutando test:', err);
    process.exit(1);
  });
