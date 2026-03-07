/**
 * TEST 3: Descarga de Comprobante de Planilla Pagada
 *
 * Este test verifica que se puede descargar el comprobante PDF
 * de una planilla que YA está pagada.
 *
 * Pasos:
 * 1. Login en Mi Planilla
 * 2. Navegar a "Planillas Pagadas"
 * 3. Verificar que hay planillas pagadas
 * 4. Descargar PDF de una planilla
 * 5. Verificar que el archivo se descargó correctamente
 *
 * SEGURO: Este test es READ-ONLY - solo descarga PDFs existentes.
 */

import dotenv from 'dotenv';
dotenv.config();

import { getMiPlanillaAuthBot, MiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Credenciales de prueba (desde env vars)
const TEST_USER = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
};

// URLs de Mi Planilla
const MIPLANILLA_URLS = {
  planillasPagadas: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/PlanillasPagadas',
};

interface TestResult {
  paso: string;
  exitoso: boolean;
  detalle: string;
  datos?: Record<string, unknown>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
  archivoDescargado?: string;
}> {
  const resultados: TestResult[] = [];
  let authBot: MiPlanillaAuthBot | null = null;
  let archivoDescargado: string | undefined;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 3: COMPROBANTE DE PLANILLA PAGADA                 ║');
  console.log('║     Operador: Mi Planilla                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER.numeroDocumento}`);
  console.log('');
  console.log('ℹ️  Este test es READ-ONLY - solo descarga PDFs existentes');
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

  // Crear directorio de descargas si no existe
  const downloadsDir = path.resolve('./downloads/comprobantes-test');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  try {
    // ========================================
    // PASO 1: Login
    // ========================================
    console.log('📋 PASO 1: Autenticación');
    console.log('   Iniciando login en Mi Planilla...');

    authBot = getMiPlanillaAuthBot();
    const session = await authBot.login({
      tipoDocumento: TEST_USER.tipoDocumento,
      documento: TEST_USER.numeroDocumento,
      password: TEST_USER.password,
    });

    if (!session.isAuthenticated) {
      resultados.push({
        paso: 'Login',
        exitoso: false,
        detalle: 'Sesión no autenticada',
      });
      throw new Error('Login falló');
    }

    resultados.push({
      paso: 'Login',
      exitoso: true,
      detalle: `Usuario: ${session.userName}`,
    });
    console.log(`   ✅ Login exitoso - Usuario: ${session.userName}`);
    console.log('');

    const page = authBot.getPage();
    if (!page) throw new Error('No se pudo obtener página');

    // ========================================
    // PASO 2: Navegar a Planillas Pagadas
    // ========================================
    console.log('📋 PASO 2: Navegar a Planillas Pagadas');
    console.log('   Navegando...');

    await page.goto(MIPLANILLA_URLS.planillasPagadas, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(3000);

    await page.screenshot({
      path: `screenshots/test3-01-planillas-pagadas_${Date.now()}.png`,
      fullPage: true,
    });

    resultados.push({
      paso: 'Navegar Planillas Pagadas',
      exitoso: true,
      detalle: 'Página cargada',
    });
    console.log('   ✅ Página de planillas pagadas cargada');
    console.log('');

    // ========================================
    // PASO 3: Verificar que hay planillas pagadas
    // ========================================
    console.log('📋 PASO 3: Verificar Planillas Pagadas');
    console.log('   Buscando planillas pagadas...');

    const planillasInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();

      // Verificar si hay mensaje de "no hay planillas"
      const noHayPlanillas =
        bodyText.includes('no tienes planillas pagadas') ||
        bodyText.includes('no hay planillas pagadas') ||
        bodyText.includes('no se encontraron planillas');

      // Buscar filas de planillas o cards
      const rows = document.querySelectorAll('tr, [class*="planilla"], [class*="row"]');
      const planillas: Array<{
        numero?: string;
        periodo?: string;
        valor?: string;
        tieneDescarga: boolean;
      }> = [];

      for (const row of Array.from(rows)) {
        const rowText = row.textContent || '';
        // Buscar patrones de planilla (número de 8+ dígitos)
        const numeroMatch = rowText.match(/\b(\d{8,})\b/);

        // Buscar botón de descarga PDF
        const downloadBtn = row.querySelector('a[href*="pdf"], button[onclick*="pdf"], [title*="PDF"], [title*="descargar"]');
        const hasDownload = downloadBtn !== null;

        // Buscar enlace o botón que diga "Ver" o "Descargar"
        const links = row.querySelectorAll('a, button');
        let tieneDescarga = hasDownload;
        for (const link of Array.from(links)) {
          const text = (link as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('ver') || text.includes('descargar') || text.includes('pdf')) {
            tieneDescarga = true;
            break;
          }
        }

        if (numeroMatch || tieneDescarga) {
          // Extraer valor
          const valorMatch = rowText.match(/\$\s*([\d.,]+)/);

          planillas.push({
            numero: numeroMatch ? numeroMatch[1] : undefined,
            valor: valorMatch ? valorMatch[0] : undefined,
            tieneDescarga,
          });
        }
      }

      return {
        noHayPlanillas,
        planillas: planillas.slice(0, 5), // Solo primeras 5
        total: planillas.length,
      };
    });

    if (planillasInfo.noHayPlanillas || planillasInfo.total === 0) {
      resultados.push({
        paso: 'Verificar Planillas',
        exitoso: false,
        detalle: 'No hay planillas pagadas disponibles',
      });
      console.log('   ⚠️  No se encontraron planillas pagadas');
      console.log('   ℹ️  Este usuario no tiene historial de pagos completados');

      // Aún así, el test es "parcialmente exitoso" si llegamos aquí
      resultados.push({
        paso: 'Descarga PDF',
        exitoso: false,
        detalle: 'No hay planillas para descargar',
      });

      console.log('');
      console.log('─'.repeat(60));
      console.log('');
      console.log('⚠️  TEST PARCIAL: No hay planillas pagadas para probar descarga');
      console.log('   El flujo de navegación funciona, pero no hay datos de prueba.');

      await authBot.close();
      return { success: false, resultados };
    }

    resultados.push({
      paso: 'Verificar Planillas',
      exitoso: true,
      detalle: `${planillasInfo.total} planillas encontradas`,
      datos: planillasInfo,
    });

    console.log(`   ✅ ${planillasInfo.total} planillas pagadas encontradas`);
    for (const p of planillasInfo.planillas.slice(0, 3)) {
      console.log(`      - Planilla ${p.numero || '?'}: ${p.valor || '?'} ${p.tieneDescarga ? '(descargable)' : ''}`);
    }
    console.log('');

    // ========================================
    // PASO 4: Buscar botón de descarga PDF
    // ========================================
    console.log('📋 PASO 4: Buscar Botón de Descarga');
    console.log('   Buscando botón "Ver PDF" o similar...');

    const downloadButtonInfo = await page.evaluate(() => {
      // Buscar botones/links de descarga PDF
      const allElements = document.querySelectorAll('a, button');
      const downloadButtons: Array<{
        text: string;
        href?: string;
        tagName: string;
      }> = [];

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        const href = (el as HTMLAnchorElement).href || '';
        const title = (el as HTMLElement).title || '';
        const lowerText = text.toLowerCase();
        const lowerHref = href.toLowerCase();
        const lowerTitle = title.toLowerCase();

        if (
          lowerText.includes('pdf') ||
          lowerText.includes('ver') ||
          lowerText.includes('descargar') ||
          lowerHref.includes('pdf') ||
          lowerTitle.includes('pdf')
        ) {
          downloadButtons.push({
            text: text.slice(0, 40) || title.slice(0, 40) || 'Sin texto',
            href: href.slice(0, 100) || undefined,
            tagName: el.tagName,
          });
        }
      }

      return {
        found: downloadButtons.length > 0,
        buttons: downloadButtons.slice(0, 5),
      };
    });

    if (!downloadButtonInfo.found) {
      resultados.push({
        paso: 'Buscar Descarga',
        exitoso: false,
        detalle: 'No se encontró botón de descarga PDF',
      });
      console.log('   ⚠️  No se encontró botón de descarga PDF');

      // Tomar screenshot para debug
      await page.screenshot({
        path: `screenshots/test3-02-no-download-btn_${Date.now()}.png`,
        fullPage: true,
      });

      await authBot.close();
      return { success: false, resultados };
    }

    resultados.push({
      paso: 'Buscar Descarga',
      exitoso: true,
      detalle: `${downloadButtonInfo.buttons.length} botones encontrados`,
      datos: downloadButtonInfo,
    });

    console.log(`   ✅ Botones de descarga encontrados`);
    for (const btn of downloadButtonInfo.buttons.slice(0, 3)) {
      console.log(`      - ${btn.tagName}: "${btn.text}"`);
    }
    console.log('');

    // ========================================
    // PASO 5: Intentar descargar PDF
    // ========================================
    console.log('📋 PASO 5: Descargar PDF');
    console.log('   Intentando descargar comprobante...');

    // Configurar descarga
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadsDir,
    });

    // Contar archivos antes
    const filesBefore = fs.readdirSync(downloadsDir);

    // Click en el primer botón de descarga
    const downloadClicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('a, button');

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
        const href = (el as HTMLAnchorElement).href?.toLowerCase() || '';

        if (text.includes('pdf') || text.includes('ver') || href.includes('pdf')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!downloadClicked) {
      resultados.push({
        paso: 'Descargar PDF',
        exitoso: false,
        detalle: 'No se pudo hacer click en descarga',
      });
      console.log('   ❌ No se pudo hacer click en botón de descarga');
      await authBot.close();
      return { success: false, resultados };
    }

    // Esperar descarga (máximo 15 segundos)
    console.log('   ⏳ Esperando descarga...');
    let downloadSuccess = false;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const filesAfter = fs.readdirSync(downloadsDir);
      const newFiles = filesAfter.filter(f => !filesBefore.includes(f) && !f.endsWith('.crdownload'));

      if (newFiles.length > 0) {
        archivoDescargado = path.join(downloadsDir, newFiles[0]);
        downloadSuccess = true;
        break;
      }
    }

    await page.screenshot({
      path: `screenshots/test3-03-post-download_${Date.now()}.png`,
      fullPage: true,
    });

    if (downloadSuccess && archivoDescargado) {
      const stats = fs.statSync(archivoDescargado);
      resultados.push({
        paso: 'Descargar PDF',
        exitoso: true,
        detalle: `Archivo: ${path.basename(archivoDescargado)} (${Math.round(stats.size / 1024)} KB)`,
        datos: {
          archivo: archivoDescargado,
          tamaño: stats.size,
        },
      });
      console.log(`   ✅ PDF descargado exitosamente`);
      console.log(`      Archivo: ${path.basename(archivoDescargado)}`);
      console.log(`      Tamaño: ${Math.round(stats.size / 1024)} KB`);
    } else {
      resultados.push({
        paso: 'Descargar PDF',
        exitoso: false,
        detalle: 'Descarga no completó en tiempo esperado',
      });
      console.log('   ⚠️  La descarga no completó (puede haber abierto en nueva pestaña)');
      console.log('   ℹ️  Algunos navegadores abren PDFs en vez de descargarlos');
    }

    console.log('');

    // ========================================
    // RESUMEN
    // ========================================
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
      console.log('✅ TEST EXITOSO');
      console.log('');
      console.log('El flujo de descarga de comprobantes funciona correctamente.');
      if (archivoDescargado) {
        console.log(`Comprobante guardado en: ${archivoDescargado}`);
      }
    } else {
      const exitosos = resultados.filter(r => r.exitoso).length;
      console.log(`⚠️  TEST PARCIAL: ${exitosos}/${resultados.length} pasos exitosos`);
    }

    console.log('');
    console.log('Cerrando navegador...');
    await authBot.close();

    return { success: todosExitosos, resultados, archivoDescargado };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    resultados.push({
      paso: 'Error General',
      exitoso: false,
      detalle: errorMsg,
    });

    console.error('');
    console.error('❌ ERROR:', errorMsg);
    console.error('');

    if (authBot) {
      try {
        const page = authBot.getPage();
        if (page) {
          await page.screenshot({
            path: `screenshots/test3-error_${Date.now()}.png`,
            fullPage: true,
          });
        }
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
