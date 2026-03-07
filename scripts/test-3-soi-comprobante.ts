/**
 * TEST 3-SOI: Descarga de Comprobante
 *
 * Este test verifica la descarga de comprobantes de planillas pagadas en SOI:
 *
 * 1. Login en SOI
 * 2. Navegar a consulta de planillas pagadas
 * 3. Si existe planilla pagada → descargar comprobante PDF
 * 4. Si no existe planilla pagada → reportar como OMITIDO
 *
 * SEGURO: Este test es READ-ONLY - solo descarga documentos.
 */

import { getSOIAuthBot, SOIAuthBot } from '../src/bots/soi/auth.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Credenciales de prueba SOI
const TEST_USER_SOI = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: '1018482146',
  password: process.env.SOI_PASSWORD || 'Ulecolombia123*',
};

interface TestResult {
  paso: string;
  exitoso: boolean;
  detalle: string;
  datos?: Record<string, unknown>;
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `screenshots/test3-soi-${name}_${timestamp}.png`,
    fullPage: true,
  });
}

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
  comprobante?: string;
}> {
  const resultados: TestResult[] = [];
  let authBot: SOIAuthBot | null = null;
  let comprobanteDescargado: string | undefined;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 3-SOI: DESCARGA DE COMPROBANTE                    ║');
  console.log('║     Operador: SOI (nuevosoi.com.co)                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER_SOI.numeroDocumento}`);
  console.log('');
  console.log('ℹ️  Este test es READ-ONLY - solo descarga comprobantes');
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

  try {
    // ========================================
    // PASO 1: Login en SOI
    // ========================================
    console.log('📋 PASO 1: Autenticación en SOI');
    console.log('   Iniciando login...');

    authBot = getSOIAuthBot();

    const loginResult = await authBot.loginAsUser({
      tipoDocumento: TEST_USER_SOI.tipoDocumento,
      documento: TEST_USER_SOI.numeroDocumento,
      password: TEST_USER_SOI.password,
    });

    if (!loginResult.isAuthenticated) {
      resultados.push({
        paso: 'Login SOI',
        exitoso: false,
        detalle: 'No se pudo autenticar',
      });
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
    if (!page) {
      throw new Error('No se pudo obtener la página');
    }

    await takeScreenshot(page, '01-dashboard');

    // ========================================
    // PASO 2: Buscar planillas pagadas
    // ========================================
    console.log('📋 PASO 2: Buscar Planillas Pagadas');
    console.log('   Navegando a consultas...');

    // Click en menú Consultas
    const clickedConsultas = await page.evaluate(() => {
      const items = document.querySelectorAll('a, button, span');
      for (const item of items) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes('consulta') || text.includes('soportes')) {
          (item as HTMLElement).click();
          return { clicked: true, text: item.textContent?.trim() };
        }
      }
      return { clicked: false, text: null };
    });

    if (clickedConsultas.clicked) {
      console.log(`   Click en: ${clickedConsultas.text}`);
      await page.waitForTimeout(3000);
    } else {
      // Intentar navegar a soportes de pago
      console.log('   Intentando navegar a soportes de pago...');
      try {
        await page.goto(SOI_SELECTORS.URLS.SOPORTES_PAGO, {
          waitUntil: 'networkidle0',
          timeout: 15000,
        });
      } catch {
        // Intentar consultar planillas
        await page.goto(SOI_SELECTORS.URLS.CONSULTAR_PLANILLAS, {
          waitUntil: 'networkidle0',
          timeout: 15000,
        }).catch(() => {});
      }
    }

    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02-consultas');

    // Buscar información sobre planillas pagadas
    const planillasPagadas = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const tables = document.querySelectorAll('table');
      const pagadasEncontradas: Array<{
        numero?: string;
        periodo?: string;
        valor?: string;
        fecha?: string;
      }> = [];

      // Buscar en tablas
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const rowText = row.innerText.toLowerCase();
          // Buscar filas con estado PAGADA
          if (rowText.includes('pagada') ||
              rowText.includes('pago exitoso') ||
              rowText.includes('aprobad')) {
            const cells = row.querySelectorAll('td');
            pagadasEncontradas.push({
              numero: cells[0]?.innerText?.trim(),
              periodo: cells[1]?.innerText?.trim(),
              valor: cells[2]?.innerText?.trim(),
              fecha: cells[3]?.innerText?.trim(),
            });
          }
        });
      });

      // Buscar keywords de planillas pagadas en texto
      const hasPagadas = bodyText.includes('PAGADA') ||
                        bodyText.includes('Comprobante') ||
                        bodyText.includes('Soporte de pago');

      return {
        encontradas: pagadasEncontradas,
        count: pagadasEncontradas.length,
        hasPagadasKeywords: hasPagadas,
        snippet: bodyText.substring(0, 600),
      };
    });

    console.log(`   Planillas pagadas encontradas: ${planillasPagadas.count}`);

    resultados.push({
      paso: 'Buscar Pagadas',
      exitoso: true,
      detalle: `${planillasPagadas.count} planillas pagadas`,
      datos: planillasPagadas,
    });

    if (planillasPagadas.count === 0) {
      console.log('   ⚠️  No hay planillas pagadas para este usuario');
      console.log('');
      console.log('─'.repeat(60));
      console.log('');
      console.log('⚠️  TEST 3-SOI OMITIDO: Sin planillas pagadas');
      console.log('');
      console.log('Para probar la descarga de comprobantes, primero debe');
      console.log('existir al menos una planilla en estado PAGADA.');

      resultados.push({
        paso: 'Descargar Comprobante',
        exitoso: true, // No es error, solo no hay datos
        detalle: 'Sin planillas pagadas (OMITIDO)',
      });

      await authBot.close();
      return { success: true, resultados };
    }

    // ========================================
    // PASO 3: Descargar comprobante
    // ========================================
    console.log('📋 PASO 3: Descargar Comprobante');
    console.log('');

    const primeraPlanilla = planillasPagadas.encontradas[0];
    console.log(`   Planilla a descargar:`);
    console.log(`      Número: ${primeraPlanilla?.numero || 'N/A'}`);
    console.log(`      Periodo: ${primeraPlanilla?.periodo || 'N/A'}`);
    console.log('');

    // Configurar la descarga
    const downloadPath = path.resolve('./downloads/comprobantes');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Habilitar descargas
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });

    // Buscar y hacer click en botón de descargar/imprimir comprobante
    const clickedDescargar = await page.evaluate(() => {
      const selectors = [
        'a[href*="comprobante"]',
        'a[href*="soporte"]',
        'a[href*="pdf"]',
        'button:has-text("Descargar")',
        'a:has-text("Descargar")',
        'img[alt*="descargar"]',
        'img[src*="pdf"]',
        'a:has-text("Imprimir")',
      ];

      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            (el as HTMLElement).click();
            return { clicked: true, selector };
          }
        } catch { continue; }
      }

      // Buscar por texto
      const allLinks = document.querySelectorAll('a, button');
      for (const link of allLinks) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('comprobante') ||
            text.includes('descargar') ||
            text.includes('pdf') ||
            text.includes('soporte')) {
          (link as HTMLElement).click();
          return { clicked: true, selector: 'text-match' };
        }
      }

      return { clicked: false, selector: null };
    });

    if (clickedDescargar.clicked) {
      console.log(`   Click en descargar: ${clickedDescargar.selector}`);
      await page.waitForTimeout(5000); // Esperar descarga

      // Verificar si se descargó algo
      const files = fs.readdirSync(downloadPath);
      const pdfFiles = files.filter(f => f.endsWith('.pdf'));

      if (pdfFiles.length > 0) {
        comprobanteDescargado = path.join(downloadPath, pdfFiles[pdfFiles.length - 1]);
        console.log(`   ✅ Comprobante descargado: ${pdfFiles[pdfFiles.length - 1]}`);

        resultados.push({
          paso: 'Descargar Comprobante',
          exitoso: true,
          detalle: `PDF: ${pdfFiles[pdfFiles.length - 1]}`,
          datos: { filePath: comprobanteDescargado },
        });
      } else {
        console.log('   ⚠️  No se detectó archivo descargado');
        resultados.push({
          paso: 'Descargar Comprobante',
          exitoso: false,
          detalle: 'Descarga no completada',
        });
      }
    } else {
      console.log('   ⚠️  No se encontró botón de descarga');
      resultados.push({
        paso: 'Descargar Comprobante',
        exitoso: false,
        detalle: 'Botón no encontrado',
      });
    }

    await takeScreenshot(page, '03-descarga');

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
    if (todosExitosos) {
      console.log('✅ TEST 3-SOI EXITOSO');
      if (comprobanteDescargado) {
        console.log(`   Comprobante: ${comprobanteDescargado}`);
      }
    } else {
      console.log('❌ TEST CON ERRORES');
    }

    // Cleanup
    console.log('');
    console.log('Cerrando navegador...');
    await authBot.close();

    return { success: todosExitosos, resultados, comprobante: comprobanteDescargado };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    resultados.push({
      paso: 'Error General',
      exitoso: false,
      detalle: errorMsg.slice(0, 50),
    });

    console.error('');
    console.error('❌ ERROR:', errorMsg);
    console.error('');

    if (authBot) {
      try {
        await authBot.close();
      } catch {
        // Ignorar
      }
    }

    return { success: false, resultados };
  }
}

// Ejecutar
runTest()
  .then(result => {
    console.log('');
    console.log('─'.repeat(60));
    console.log('');
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Error ejecutando test:', err);
    process.exit(1);
  });
