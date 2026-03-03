/**
 * Test: Flujo Completo de Pago PILA (Integrado)
 *
 * Este script prueba el flujo completo como si fuera producción:
 * 1. Login en SOI con credenciales del usuario
 * 2. Crear planilla en línea
 * 3. Agregar cotizante (5 pasos del popup)
 * 4. Liquidar planilla
 * 5. Desde la misma sesión, iniciar pago PSE
 * 6. Seleccionar Bancolombia
 * 7. Llegar hasta la página de Bancolombia (sin pagar)
 *
 * NOTA: Este script usa una sesión continua (no cierra el navegador entre pasos)
 *
 * Credenciales de prueba:
 * - SOI Usuario: CC 1018482146, Password: Ulecolombia123*
 */

import { Page, Browser } from 'puppeteer';
import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import { crearPlanillaSOI } from '../src/bots/soi/crear-planilla.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { logger } from '../src/utils/logger';

// Configuración de prueba
const TEST_CONFIG = {
  // Credenciales SOI
  tipoDocumento: 'CC' as const,
  documento: '1018482146',
  soiPassword: 'Ulecolombia123*',

  // Periodo a liquidar (Febrero 2026 tiene 28 días)
  periodoMes: 2,
  periodoAno: 2026,

  // IBC (Ingreso Base de Cotización)
  ibc: 1423500,

  // Datos PSE/Bancolombia
  pse: {
    tipoPersona: 'Natural' as const,
    banco: 'BANCOLOMBIA',
  },
};

// Función helper para calcular días del mes
function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `screenshots/flujo-completo-${name}_${timestamp}.png`;
  await page.screenshot({ path, fullPage: true });
  logger.info(`Screenshot saved: ${path}`);
}

async function testFlujoCompletoPago() {
  console.log('🚀 Iniciando prueba de flujo completo de pago PILA...\n');

  const diasMes = getDaysInMonth(TEST_CONFIG.periodoMes, TEST_CONFIG.periodoAno);

  console.log('📋 Flujo a ejecutar:');
  console.log('   1. Login en SOI');
  console.log('   2. Crear planilla en línea');
  console.log('   3. Agregar cotizante (5 pasos)');
  console.log('   4. Liquidar planilla');
  console.log('   5. Ir a pagar → PSE');
  console.log('   6. Seleccionar Bancolombia');
  console.log('   7. Llegar a página de Bancolombia\n');

  console.log('📊 Configuración:');
  console.log(`   Documento: ${TEST_CONFIG.documento}`);
  console.log(`   Periodo: ${TEST_CONFIG.periodoMes}/${TEST_CONFIG.periodoAno} (${diasMes} días)`);
  console.log(`   IBC: $${TEST_CONFIG.ibc.toLocaleString()}`);
  console.log(`   Banco: ${TEST_CONFIG.pse.banco}\n`);

  let authBot: SOIAuthBot | null = null;

  try {
    // ============================================================
    // PASO 1: Login en SOI
    // ============================================================
    console.log('🔐 PASO 1: Login en SOI...');

    authBot = new SOIAuthBot();
    await authBot.loginAsUser({
      tipoDocumento: TEST_CONFIG.tipoDocumento,
      documento: TEST_CONFIG.documento,
      password: TEST_CONFIG.soiPassword,
    });

    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener la página después del login');
    }

    console.log('✅ Login exitoso\n');
    await takeScreenshot(page, '01-login-exitoso');

    // ============================================================
    // PASO 2-4: Crear y Liquidar Planilla
    // ============================================================
    console.log('📝 PASO 2-4: Creando y liquidando planilla...');

    // Navegar a Crear Planilla en Línea
    await page.goto(SOI_SELECTORS.URLS.CREAR_PLANILLA_EN_LINEA, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Preparar datos de planilla
    const planillaData = {
      userId: TEST_CONFIG.documento,
      periodo: {
        mes: TEST_CONFIG.periodoMes,
        anio: TEST_CONFIG.periodoAno,
      },
      aportante: {
        tipoAportante: '02' as const,
        claseAportante: 'I',
      },
      cotizantes: [{
        identificacion: {
          tipoDocumento: TEST_CONFIG.tipoDocumento,
          numeroDocumento: TEST_CONFIG.documento,
        },
        nombres: {},
        clasificacion: {
          tipoCotizante: '3' as const,
          subTipoCotizante: '',
        },
        ubicacion: {
          departamento: 'BOGOTA',
          municipio: 'BOGOTA',
        },
        seguridadSocial: {
          salarioBasico: TEST_CONFIG.ibc,
          pension: {
            administradora: { codigo: '' },
            diasCotizados: diasMes,
            ibc: TEST_CONFIG.ibc,
          },
          salud: {
            administradora: { codigo: '' },
            diasCotizados: diasMes,
            ibc: TEST_CONFIG.ibc,
          },
        },
      }],
    };

    const liquidacionResult = await crearPlanillaSOI(page, planillaData as any, {
      takeScreenshots: true,
      screenshotPrefix: 'flujo-completo',
    });

    console.log('\n📊 Resultado liquidación:', JSON.stringify(liquidacionResult, null, 2));

    if (!liquidacionResult.success || !liquidacionResult.numeroPlanilla) {
      console.error('❌ Error en liquidación:', liquidacionResult.error);
      await takeScreenshot(page, 'error-liquidacion');
      return;
    }

    console.log(`\n✅ Planilla liquidada: ${liquidacionResult.numeroPlanilla}`);
    await takeScreenshot(page, '04-planilla-liquidada');

    // ============================================================
    // PASO 5: Ir a Pagar la Planilla
    // ============================================================
    console.log('\n💳 PASO 5: Iniciando proceso de pago...');

    // Después de liquidar, estamos en la página de validación
    // Necesitamos ir al dashboard y buscar la planilla para pagar

    // Ir al inicio/dashboard
    await page.goto(SOI_SELECTORS.URLS.BASE + '/inicio.do', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '05-dashboard');

    // Buscar el botón de pagar (imagen con icono $)
    const pagarBtn = await page.$('img[src*="pagar.png"]');
    if (pagarBtn) {
      console.log('   Encontrado botón de pagar, haciendo click...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
        pagarBtn.click(),
      ]);
    } else {
      // Buscar planilla para pago de otra forma
      console.log('   Buscando planilla para pago...');
      await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent?.includes('Unificar para pago') ||
              link.textContent?.includes('pagar') ||
              link.getAttribute('onclick')?.includes('pago')) {
            link.click();
            return;
          }
        }
      });
      await page.waitForTimeout(3000);
    }

    await takeScreenshot(page, '06-pagina-pago');

    // ============================================================
    // PASO 6: Seleccionar PSE y Bancolombia
    // ============================================================
    console.log('\n🏦 PASO 6: Seleccionando PSE → Bancolombia...');

    // Buscar imagen PSE y hacer click
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const pseImg = await page.$('img[src*="pse"]');
    if (pseImg) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
        pseImg.click(),
      ]);
    }

    await page.waitForTimeout(2000);
    await takeScreenshot(page, '07-form-pse');

    // Manejar diálogo de advertencia si existe
    const hayAdvertencia = await page.evaluate(() => {
      return document.body.innerText.includes('Advertencia') &&
             document.body.innerText.includes('Desea continuar');
    });

    if (hayAdvertencia) {
      console.log('   Confirmando advertencia...');
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        for (const btn of buttons) {
          const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
          if (texto.includes('sí') || texto.includes('si')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
      await page.waitForTimeout(2000);
    }

    // Seleccionar tipo persona y banco
    await page.evaluate(() => {
      // Tipo: Natural
      const tipoSelect = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
      if (tipoSelect) {
        const opt = Array.from(tipoSelect.options).find(o =>
          o.text.toUpperCase().includes('NATURAL')
        );
        if (opt) {
          tipoSelect.value = opt.value;
          tipoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      // Banco: Bancolombia
      const bancoSelect = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
      if (bancoSelect) {
        const opt = Array.from(bancoSelect.options).find(o =>
          o.text.toUpperCase().includes('BANCOLOMBIA')
        );
        if (opt) {
          bancoSelect.value = opt.value;
          bancoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(500);

    await takeScreenshot(page, '08-pse-datos-llenos');

    // Click en Pagar
    console.log('   Haciendo click en Pagar...');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
      for (const btn of btns) {
        const text = ((btn as HTMLInputElement).value || (btn as HTMLElement).innerText || '').toLowerCase();
        if (text.includes('pagar')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await takeScreenshot(page, '09-despues-pagar');

    const urlActual = page.url();
    console.log(`   URL actual: ${urlActual}`);

    // ============================================================
    // PASO 7: Página PSE → Bancolombia
    // ============================================================
    if (urlActual.includes('pse.com.co')) {
      console.log('\n🏦 PASO 7: En página PSE, llenando datos...');

      // Seleccionar persona jurídica/natural si aplica
      await page.evaluate(() => {
        const tabs = document.querySelectorAll('[role="tab"], button, a');
        for (const tab of tabs) {
          if ((tab as HTMLElement).innerText?.toLowerCase().includes('natural')) {
            (tab as HTMLElement).click();
            return;
          }
        }
      });
      await page.waitForTimeout(1000);

      // Llenar documento
      const docInput = await page.$('input[placeholder*="documento"], input[name*="documento"], input[id*="documento"]');
      if (docInput) {
        await docInput.click({ clickCount: 3 });
        await docInput.type(TEST_CONFIG.documento, { delay: 50 });
      }
      await page.waitForTimeout(500);

      // Llenar email (usar email de prueba)
      const emailInput = await page.$('input[type="email"], input[name*="email"], input[placeholder*="correo"]');
      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type('test@ule.co', { delay: 50 });
      }

      await takeScreenshot(page, '10-pse-datos');

      // Click en "Ir al Banco"
      console.log('   Haciendo click en "Ir al Banco"...');
      await page.evaluate(() => {
        const elements = document.querySelectorAll('button, a, input[type="submit"]');
        for (const el of elements) {
          const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || '').toLowerCase();
          if (text.includes('ir al banco')) {
            (el as HTMLElement).click();
            return;
          }
        }
      });

      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }

    const urlFinal = page.url();
    await takeScreenshot(page, '11-bancolombia');

    console.log(`\n✅ FLUJO COMPLETADO!`);
    console.log(`   Planilla: ${liquidacionResult.numeroPlanilla}`);
    console.log(`   URL Final: ${urlFinal}`);

    if (urlFinal.includes('bancolombia')) {
      console.log('\n📌 El navegador está en la página de Bancolombia.');
      console.log('   Solo falta que el usuario ingrese sus credenciales bancarias y confirme el pago.');
    }

    // Mantener el navegador abierto para que el usuario pueda ver
    console.log('\n⏳ El navegador se mantendrá abierto por 5 minutos...');
    console.log('   (Puedes cerrar manualmente o esperar)');

    await page.waitForTimeout(300000); // 5 minutos

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error fatal:', errorMsg);
    logger.error('Test flujo completo failed', { error: errorMsg });

    if (authBot) {
      const page = authBot.getPage();
      if (page) {
        await takeScreenshot(page, 'error-fatal');
      }
    }
  } finally {
    // No cerrar el navegador para que el usuario pueda interactuar
    console.log('\n🏁 Script finalizado');
  }
}

// Ejecutar
testFlujoCompletoPago();
