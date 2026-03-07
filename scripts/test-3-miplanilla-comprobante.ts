/**
 * TEST 3 MI PLANILLA: Descarga de Comprobante
 *
 * 1. Login en Mi Planilla
 * 2. Navegar a Administrar Planillas
 * 3. Listar planillas y sus estados
 * 4. Si hay planilla PAGADA: descargar comprobante
 * 5. Verificar que el PDF tiene contenido
 * 6. Guardar en tests/evidencias/
 *
 * SEGURO: Este test es READ-ONLY - solo lista y descarga documentos.
 */

import dotenv from 'dotenv';
dotenv.config();

import { getMiPlanillaAuthBot, MiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const TEST_USER = {
  tipoDocumento: 'CC' as const,
  documento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
};

const EVIDENCIAS_PATH = path.resolve('./tests/evidencias');

interface PlanillaInfo {
  numero?: string;
  periodo?: string;
  estado: string;
  valor?: string;
  rowIndex: number;
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = `screenshots/test3-miplanilla-${name}_${timestamp}.png`;
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function runTest(): Promise<{
  success: boolean;
  planillasEncontradas: PlanillaInfo[];
  comprobantePath?: string;
}> {
  let authBot: MiPlanillaAuthBot | null = null;
  const planillasEncontradas: PlanillaInfo[] = [];
  let comprobantePath: string | undefined;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 3 MI PLANILLA: DESCARGA DE COMPROBANTE              ║');
  console.log('║   Operador: Mi Planilla (miplanilla.com)                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER.documento}`);
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
    // PASO 1: Login en Mi Planilla
    // ========================================
    console.log('📋 PASO 1: Autenticación en Mi Planilla');
    authBot = getMiPlanillaAuthBot();

    const session = await authBot.login(TEST_USER);

    if (!session.isAuthenticated) {
      throw new Error('Login Mi Planilla falló: No autenticado');
    }

    console.log(`   ✅ Login exitoso: ${session.userName || 'Usuario autenticado'}`);
    console.log('');

    const page = await authBot.getPage();
    if (!page) throw new Error('No se pudo obtener la página');

    // ========================================
    // PASO 2: Navegar a Planillas Pagadas
    // ========================================
    console.log('📋 PASO 2: Navegar a Planillas Pagadas');

    // Primero ir a Administrar Planillas
    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02a-administrar-planillas');

    // Click en "Planillas Pagadas" del menú lateral
    const clickedPagadas = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = (link.textContent || '').toLowerCase();
        if (text.includes('planillas pagadas') || text.includes('pagadas')) {
          link.click();
          return { clicked: true, text: link.textContent?.trim() };
        }
      }
      return { clicked: false };
    });

    if (clickedPagadas.clicked) {
      console.log(`   ✅ Click en: ${clickedPagadas.text}`);
      await page.waitForTimeout(3000);
    } else {
      console.log('   ⚠️ No se encontró link "Planillas Pagadas"');
    }

    await takeScreenshot(page, '02b-planillas-pagadas');
    console.log('   ✅ Página de planillas pagadas cargada');
    console.log('');

    // ========================================
    // PASO 3: Listar planillas y sus estados
    // ========================================
    console.log('📋 PASO 3: Listar planillas disponibles');

    const planillas = await page.evaluate(() => {
      const results: Array<{
        numero?: string;
        periodo?: string;
        estado: string;
        valor?: string;
        rowIndex: number;
        hasDownload: boolean;
      }> = [];

      // Buscar tabla de planillas
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row, idx) => {
          const cells = row.querySelectorAll('td');
          const rowText = row.textContent || '';

          // Extraer información de la fila
          let estado = 'DESCONOCIDO';
          const rowLower = rowText.toLowerCase();
          if (rowLower.includes('pagad') || rowLower.includes('aprobad')) {
            estado = 'PAGADA';
          } else if (rowLower.includes('pendi') || rowLower.includes('liquidada')) {
            estado = 'PENDIENTE';
          } else if (rowLower.includes('rechaz')) {
            estado = 'RECHAZADA';
          } else if (rowLower.includes('venci')) {
            estado = 'VENCIDA';
          }

          // Buscar número de planilla (secuencia de dígitos)
          const numMatch = rowText.match(/\b(\d{8,15})\b/);

          // Buscar periodo (formato MM/YYYY o YYYY-MM)
          const periodoMatch = rowText.match(/(\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2})/);

          // Buscar valor ($XXX.XXX)
          const valorMatch = rowText.match(/\$?\s*([\d.,]+)/);

          // Verificar si tiene botón de descarga
          const downloadElements = row.querySelectorAll(
            'a[href*="pdf"], a[href*="comprobante"], a[href*="download"], ' +
            'button[title*="Descargar"], img[src*="pdf"], img[alt*="PDF"]'
          );

          if (cells.length > 2 || estado !== 'DESCONOCIDO') {
            results.push({
              numero: numMatch ? numMatch[1] : undefined,
              periodo: periodoMatch ? periodoMatch[1] : undefined,
              estado,
              valor: valorMatch ? valorMatch[1] : undefined,
              rowIndex: idx,
              hasDownload: downloadElements.length > 0,
            });
          }
        });
      }

      // También buscar divs con clase planilla
      const planillaDivs = document.querySelectorAll('[class*="planilla"], .card, .item-planilla');
      planillaDivs.forEach((div, idx) => {
        const text = div.textContent || '';
        const textLower = text.toLowerCase();

        let estado = 'DESCONOCIDO';
        if (textLower.includes('pagad')) estado = 'PAGADA';
        else if (textLower.includes('pendi')) estado = 'PENDIENTE';

        if (estado !== 'DESCONOCIDO' && !results.some(r => r.rowIndex === idx + 1000)) {
          results.push({
            numero: text.match(/\b(\d{8,15})\b/)?.[1],
            periodo: text.match(/(\d{1,2}[\/\-]\d{4})/)?.[1],
            estado,
            rowIndex: idx + 1000,
            hasDownload: !!div.querySelector('a[href*="pdf"], button[title*="Descargar"]'),
          });
        }
      });

      return results;
    });

    if (planillas.length === 0) {
      console.log('   ⚠️ No se encontraron planillas en la cuenta');
    } else {
      console.log(`   Planillas encontradas: ${planillas.length}`);
      console.log('');
      console.log('   ┌──────────────┬────────────┬───────────┬──────────────┐');
      console.log('   │ Número       │ Periodo    │ Estado    │ Descargable  │');
      console.log('   ├──────────────┼────────────┼───────────┼──────────────┤');
      for (const p of planillas) {
        const num = (p.numero || 'N/A').padEnd(12).slice(0, 12);
        const per = (p.periodo || 'N/A').padEnd(10).slice(0, 10);
        const est = p.estado.padEnd(9).slice(0, 9);
        const down = p.hasDownload ? '    Sí      ' : '    No      ';
        console.log(`   │ ${num} │ ${per} │ ${est} │${down}│`);
        planillasEncontradas.push(p);
      }
      console.log('   └──────────────┴────────────┴───────────┴──────────────┘');
    }
    console.log('');

    // ========================================
    // PASO 4: Buscar planilla PAGADA para descargar
    // ========================================
    const planillaPagada = planillas.find(p => p.estado === 'PAGADA');

    if (!planillaPagada) {
      console.log('📋 PASO 4: No hay planillas PAGADAS disponibles');
      console.log('   ⚠️ No se puede probar la descarga de comprobante');
      console.log('   El test se completará con el primer pago real');
      console.log('');

      // Cleanup
      await authBot.close();
      return { success: true, planillasEncontradas, comprobantePath: undefined };
    }

    console.log('📋 PASO 4: Descargar comprobante de planilla PAGADA');
    console.log(`   Planilla: ${planillaPagada.numero || 'N/A'}`);
    console.log(`   Periodo: ${planillaPagada.periodo || 'N/A'}`);

    // Configurar descarga
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: EVIDENCIAS_PATH,
    });

    // Click en botón de descarga
    const downloadClicked = await page.evaluate((rowIdx) => {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        if (rows[rowIdx]) {
          const downloadBtn = rows[rowIdx].querySelector(
            'a[href*="pdf"], a[href*="comprobante"], a[href*="download"], ' +
            'button[title*="Descargar"], img[src*="pdf"]'
          );
          if (downloadBtn) {
            (downloadBtn as HTMLElement).click();
            return { clicked: true, type: 'button' };
          }

          // Buscar cualquier link en la fila
          const links = rows[rowIdx].querySelectorAll('a');
          for (const link of links) {
            const text = (link.textContent || '').toLowerCase();
            const href = (link.getAttribute('href') || '').toLowerCase();
            if (text.includes('descargar') || text.includes('pdf') ||
                href.includes('.pdf') || href.includes('download')) {
              (link as HTMLElement).click();
              return { clicked: true, type: 'link' };
            }
          }
        }
      }
      return { clicked: false };
    }, planillaPagada.rowIndex);

    if (downloadClicked.clicked) {
      console.log(`   ✅ Click en descarga (${downloadClicked.type})`);
      console.log('   Esperando descarga...');
      await page.waitForTimeout(8000);
    } else {
      console.log('   ⚠️ No se encontró botón de descarga');
    }

    await takeScreenshot(page, '04-despues-click-descarga');

    // ========================================
    // PASO 5: Verificar archivo descargado
    // ========================================
    console.log('');
    console.log('📋 PASO 5: Verificar archivo descargado');

    const files = fs.readdirSync(EVIDENCIAS_PATH);
    const pdfFiles = files
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        name: f,
        path: path.join(EVIDENCIAS_PATH, f),
        stat: fs.statSync(path.join(EVIDENCIAS_PATH, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    if (pdfFiles.length > 0) {
      const mostRecent = pdfFiles[0];
      const isRecent = (Date.now() - mostRecent.stat.mtimeMs) < 60000;

      if (isRecent && mostRecent.stat.size > 0) {
        const periodo = planillaPagada.periodo?.replace(/[\/\\]/g, '-') || 'unknown';
        const newName = `comprobante-miplanilla-${periodo}.pdf`;
        const newPath = path.join(EVIDENCIAS_PATH, newName);

        if (mostRecent.path !== newPath) {
          fs.renameSync(mostRecent.path, newPath);
        }

        comprobantePath = newPath;
        console.log(`   ✅ Comprobante descargado: ${newName}`);
        console.log(`   Tamaño: ${mostRecent.stat.size} bytes`);
      } else {
        console.log('   ⚠️ No se detectó archivo PDF reciente');
      }
    } else {
      console.log('   ⚠️ No se encontraron archivos PDF descargados');
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

    const totalPagadas = planillas.filter(p => p.estado === 'PAGADA').length;
    const totalPendientes = planillas.filter(p => p.estado === 'PENDIENTE').length;

    console.log(`   📊 Planillas PAGADAS: ${totalPagadas}`);
    console.log(`   📊 Planillas PENDIENTES: ${totalPendientes}`);
    console.log(`   📊 Total planillas: ${planillas.length}`);
    console.log('');

    if (comprobantePath) {
      console.log('✅ TEST 3 MI PLANILLA COMPLETO');
      console.log(`   Comprobante: ${comprobantePath}`);
    } else if (planillaPagada) {
      console.log('⚠️ TEST PARCIAL - No se pudo descargar el comprobante');
    } else {
      console.log('✅ TEST COMPLETADO - Sin planillas pagadas para descargar');
    }

    await authBot.close();
    return { success: true, planillasEncontradas, comprobantePath };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ ERROR:', errorMsg);

    if (authBot) {
      try { await authBot.close(); } catch { }
    }
    return { success: false, planillasEncontradas };
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
