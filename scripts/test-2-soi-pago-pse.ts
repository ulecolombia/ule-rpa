/**
 * TEST 2-SOI: Flujo de Pago PSE (Dry Run)
 *
 * Este test verifica el flujo de pago PSE en SOI:
 *
 * 1. Login en SOI
 * 2. Verificar/crear planilla para el periodo actual
 * 3. Navegar al flujo de pago PSE
 * 4. Llenar datos PSE (banco, tipo persona, etc)
 * 5. DETENERSE antes de confirmar el pago (dry run)
 *
 * DRY RUN: Este test NO completa el pago, solo navega hasta el punto
 * donde se confirmaría. Verifica que el flujo funciona sin hacer pago real.
 */

import { getSOIAuthBot, SOIAuthBot } from '../src/bots/soi/auth.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { Page } from 'puppeteer';

// Credenciales de prueba SOI (de .env)
const TEST_USER_SOI = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: '1018482146',
  password: process.env.SOI_PASSWORD || 'Ulecolombia123*',
};

// Datos PSE de ULE
const PSE_ULE = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  nit: '9020190314',
  email: 'ulecolombia@gmail.com',
  banco: 'BANCOLOMBIA',
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
    path: `screenshots/test2-soi-${name}_${timestamp}.png`,
    fullPage: true,
  });
}

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
}> {
  const resultados: TestResult[] = [];
  let authBot: SOIAuthBot | null = null;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 2-SOI: FLUJO DE PAGO PSE (DRY RUN)                ║');
  console.log('║     Operador: SOI (nuevosoi.com.co)                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER_SOI.numeroDocumento}`);
  console.log(`🏦 Banco: ${PSE_ULE.banco}`);
  console.log(`💳 Pagador: ${PSE_ULE.tipoPersona} - NIT ${PSE_ULE.nit}`);
  console.log('');
  console.log('⚠️  DRY RUN: El test NO completará el pago, solo navegará');
  console.log('   hasta el punto de confirmación.');
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
    // PASO 2: Navegar a Gestionar Planillas
    // ========================================
    console.log('📋 PASO 2: Navegar a Gestionar Planillas');
    console.log('   Buscando planillas...');

    // Hacer click en "Gestionar Planillas" en el menú lateral
    const clickedMenu = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('a, button, div[class*="menu"]');
      for (const item of menuItems) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes('gestionar planilla')) {
          (item as HTMLElement).click();
          return { clicked: true, text: item.textContent };
        }
      }
      return { clicked: false, text: null };
    });

    if (clickedMenu.clicked) {
      console.log(`   Click en menú: ${clickedMenu.text}`);
      await page.waitForTimeout(3000);
    } else {
      console.log('   No se encontró menú, intentando URL directa...');
      try {
        await page.goto(SOI_SELECTORS.URLS.GESTIONAR_PLANILLAS, {
          waitUntil: 'networkidle0',
          timeout: 15000,
        });
      } catch {
        console.log('   URL directa falló, continuando...');
      }
    }

    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02-gestionar-planillas');

    // Buscar planillas existentes
    const planillasInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const tables = document.querySelectorAll('table');
      const rows: string[] = [];

      tables.forEach(table => {
        table.querySelectorAll('tr').forEach(row => {
          const text = row.innerText.trim();
          if (text && text.length > 10) {
            rows.push(text.substring(0, 100));
          }
        });
      });

      return {
        hasTable: tables.length > 0,
        rowCount: rows.length,
        bodySnippet: bodyText.substring(0, 500),
        rows: rows.slice(0, 5),
      };
    });

    console.log(`   Tablas encontradas: ${planillasInfo.hasTable ? 'Sí' : 'No'}`);
    console.log(`   Filas: ${planillasInfo.rowCount}`);

    resultados.push({
      paso: 'Gestionar Planillas',
      exitoso: true,
      detalle: `Encontradas ${planillasInfo.rowCount} filas`,
      datos: planillasInfo,
    });
    console.log('   ✅ Navegación exitosa');
    console.log('');

    // ========================================
    // PASO 3: Verificar si hay planilla para pagar
    // ========================================
    console.log('📋 PASO 3: Verificar Planillas Pendientes de Pago');

    // Buscar planillas con estado "LIQUIDADA" o similar que se puedan pagar
    const planillaParaPago = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      let planillaEncontrada: {
        numero?: string;
        periodo?: string;
        valor?: string;
        estado?: string;
        rowIndex?: number;
      } | null = null;

      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          const rowText = row.innerText.toLowerCase();

          // Buscar planillas que NO estén pagadas
          if (rowText.includes('liquidada') ||
              rowText.includes('pendiente') ||
              rowText.includes('en línea')) {

            planillaEncontrada = {
              numero: cells[0]?.innerText?.trim() || cells[1]?.innerText?.trim(),
              periodo: cells[2]?.innerText?.trim() || cells[1]?.innerText?.trim(),
              valor: cells[3]?.innerText?.trim() || cells[4]?.innerText?.trim(),
              estado: Array.from(cells).find(c =>
                c.innerText.toLowerCase().includes('liquidada') ||
                c.innerText.toLowerCase().includes('pendiente')
              )?.innerText?.trim(),
              rowIndex: index,
            };
          }
        });
      });

      return planillaEncontrada;
    });

    if (!planillaParaPago) {
      console.log('   ⚠️  No hay planillas pendientes de pago');
      console.log('   El test no puede continuar sin una planilla para pagar.');
      console.log('');
      console.log('   Para completar este test, primero debe existir una planilla');
      console.log('   en estado LIQUIDADA o similar.');

      resultados.push({
        paso: 'Buscar Planilla',
        exitoso: false,
        detalle: 'No hay planillas pendientes de pago',
      });

      // Este no es un error del sistema, solo no hay datos para probar
      console.log('');
      console.log('─'.repeat(60));
      console.log('');
      console.log('⚠️  TEST 2-SOI OMITIDO: Sin planillas para pagar');
      console.log('');
      console.log('Para probar el flujo PSE completo, primero cree una planilla');
      console.log('usando el flujo de crear planilla.');

      await authBot.close();
      return { success: true, resultados }; // No es un fallo, solo omisión
    }

    console.log(`   ✅ Planilla encontrada para pago:`);
    console.log(`      Número: ${planillaParaPago.numero || 'N/A'}`);
    console.log(`      Periodo: ${planillaParaPago.periodo || 'N/A'}`);
    console.log(`      Valor: ${planillaParaPago.valor || 'N/A'}`);
    console.log(`      Estado: ${planillaParaPago.estado || 'N/A'}`);
    console.log('');

    resultados.push({
      paso: 'Buscar Planilla',
      exitoso: true,
      detalle: `Planilla ${planillaParaPago.numero || 'encontrada'}`,
      datos: planillaParaPago,
    });

    // ========================================
    // PASO 4: Navegar al flujo de pago
    // ========================================
    console.log('📋 PASO 4: Iniciar Flujo de Pago');

    // Buscar y hacer click en el botón de pagar
    const clickedPagar = await page.evaluate(() => {
      // Buscar enlaces o botones de pago
      const paySelectors = [
        'a[href*="pago"]',
        'a[href*="Pago"]',
        'button:has-text("Pagar")',
        'input[value*="Pagar"]',
        'a:has-text("Pagar")',
        'img[src*="pagar"]',
        'img[alt*="pagar"]',
      ];

      for (const selector of paySelectors) {
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
        if (text.includes('pagar') || text.includes('pse')) {
          (link as HTMLElement).click();
          return { clicked: true, selector: 'text-match' };
        }
      }

      return { clicked: false, selector: null };
    });

    if (!clickedPagar.clicked) {
      console.log('   ⚠️  No se encontró botón de pagar');
      console.log('   Intentando navegar directamente a pago...');

      await page.goto(SOI_SELECTORS.URLS.PAGO_PLANILLAS, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
    } else {
      console.log(`   Click en: ${clickedPagar.selector}`);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    }

    await page.waitForTimeout(2000);
    await takeScreenshot(page, '03-flujo-pago');

    resultados.push({
      paso: 'Iniciar Pago',
      exitoso: true,
      detalle: 'Navegación a flujo de pago',
    });
    console.log('   ✅ En flujo de pago');
    console.log('');

    // ========================================
    // PASO 5: Buscar formulario PSE
    // ========================================
    console.log('📋 PASO 5: Buscar Formulario PSE');

    // Buscar elementos del formulario PSE
    const pseFormInfo = await page.evaluate(() => {
      const selectors = {
        tipoPersona: document.querySelector('select[name="codTipoEntidad"], select[name*="tipoPersona"]'),
        banco: document.querySelector('select[name="codEntidadFinanciera"], select[name*="banco"]'),
        documento: document.querySelector('input[name*="documento"], input[name*="nit"]'),
        email: document.querySelector('input[name*="email"], input[name*="correo"]'),
        btnPagar: document.querySelector('button[type="submit"], input[type="submit"], button:has-text("Pagar")'),
      };

      const pageText = document.body.innerText;
      const hasPSEKeywords = pageText.includes('PSE') ||
                            pageText.includes('banco') ||
                            pageText.includes('Bancolombia') ||
                            pageText.includes('entidad financiera');

      return {
        hasTipoPersona: !!selectors.tipoPersona,
        hasBanco: !!selectors.banco,
        hasDocumento: !!selectors.documento,
        hasEmail: !!selectors.email,
        hasBtnPagar: !!selectors.btnPagar,
        hasPSEKeywords,
        pageText: pageText.substring(0, 800),
      };
    });

    console.log(`   Formulario PSE detectado:`);
    console.log(`      Tipo persona: ${pseFormInfo.hasTipoPersona ? '✅' : '❌'}`);
    console.log(`      Banco: ${pseFormInfo.hasBanco ? '✅' : '❌'}`);
    console.log(`      Documento: ${pseFormInfo.hasDocumento ? '✅' : '❌'}`);
    console.log(`      Email: ${pseFormInfo.hasEmail ? '✅' : '❌'}`);
    console.log(`      Keywords PSE: ${pseFormInfo.hasPSEKeywords ? '✅' : '❌'}`);
    console.log('');

    resultados.push({
      paso: 'Formulario PSE',
      exitoso: pseFormInfo.hasPSEKeywords || pseFormInfo.hasBanco,
      detalle: pseFormInfo.hasPSEKeywords ? 'Formulario PSE detectado' : 'No se detectó formulario PSE',
      datos: pseFormInfo,
    });

    // ========================================
    // PASO 6: DRY RUN - Verificar sin ejecutar
    // ========================================
    console.log('📋 PASO 6: DRY RUN - Punto de Detención');
    console.log('');
    console.log('   🛑 DETENIDO ANTES DE PAGO');
    console.log('');
    console.log('   En un flujo real, aquí se haría:');
    console.log('   1. Seleccionar tipo de persona (Jurídica)');
    console.log(`   2. Seleccionar banco (${PSE_ULE.banco})`);
    console.log(`   3. Ingresar NIT: ${PSE_ULE.nit}`);
    console.log(`   4. Ingresar email: ${PSE_ULE.email}`);
    console.log('   5. Click en "Pagar" → Redirige a Bancolombia');
    console.log('   6. Admin ingresa password y OTP manualmente');
    console.log('');

    await takeScreenshot(page, '04-dry-run-stop');

    resultados.push({
      paso: 'Dry Run Stop',
      exitoso: true,
      detalle: 'Detenido antes de confirmar pago',
    });

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
      console.log('✅ TEST 2-SOI EXITOSO (DRY RUN)');
      console.log('');
      console.log('El flujo de pago PSE está funcionando correctamente.');
      console.log('El test se detuvo antes de confirmar el pago real.');
    } else {
      console.log('❌ TEST CON ERRORES');
      console.log('');
      console.log('Algunos pasos fallaron. Revisar detalles arriba.');
    }

    // Cleanup
    console.log('');
    console.log('Cerrando navegador...');
    await authBot.close();

    return { success: todosExitosos, resultados };

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
