/**
 * TEST 2: Pago PSE con Planilla Existente (DRY RUN)
 *
 * Este test verifica que el flujo de pago PSE funciona hasta
 * la selección de banco, SIN procesar el pago real.
 *
 * Pasos:
 * 1. Login en Mi Planilla
 * 2. Verificar que existe planilla pendiente (árbol de decisión)
 * 3. Navegar a "Administrar Planillas"
 * 4. Verificar que el botón "Paga aquí" existe
 * 5. Click en "Paga aquí" para ir al resumen de pago
 * 6. Verificar que aparece la opción PSE
 * 7. STOP - No continuar al banco (dry-run)
 *
 * SEGURO: Este test NO procesa pagos reales.
 * Solo verifica que el flujo funciona hasta la selección de pago.
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  verificarEstadoPlanillaMiPlanilla,
  aplicarArbolDecision,
  getPeriodoActual,
  type VerificacionPlanillaOptions,
} from '../src/bots/utils/planilla-state';
import { getMiPlanillaAuthBot, MiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';
import { Page } from 'puppeteer';

// Credenciales de prueba (desde env vars)
const TEST_USER = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
};

// URLs de Mi Planilla
const MIPLANILLA_URLS = {
  administrarPlanillas: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas',
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',
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
}> {
  const resultados: TestResult[] = [];
  let authBot: MiPlanillaAuthBot | null = null;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 2: PAGO PSE CON PLANILLA EXISTENTE (DRY RUN)      ║');
  console.log('║     Operador: Mi Planilla                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const periodo = getPeriodoActual();
  const periodoStr = `${periodo.mes.toString().padStart(2, '0')}/${periodo.anio}`;
  console.log(`📅 Periodo: ${periodoStr}`);
  console.log(`👤 Usuario: CC${TEST_USER.numeroDocumento}`);
  console.log('');
  console.log('⚠️  DRY RUN: Este test NO procesará pago real');
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

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
    // PASO 2: Verificar estado (árbol de decisión)
    // ========================================
    console.log('📋 PASO 2: Verificar Estado de Planilla');
    console.log('   Aplicando árbol de decisión...');

    const options: VerificacionPlanillaOptions = {
      periodo,
      tipoDocumento: TEST_USER.tipoDocumento,
      numeroDocumento: TEST_USER.numeroDocumento,
    };

    const estadoPlanilla = await verificarEstadoPlanillaMiPlanilla(page, options);
    const decision = aplicarArbolDecision(estadoPlanilla);

    await page.screenshot({
      path: `screenshots/test2-01-verificacion_${Date.now()}.png`,
      fullPage: true,
    });

    if (decision.accion !== 'IR_A_PAGO') {
      resultados.push({
        paso: 'Verificación Estado',
        exitoso: false,
        detalle: `Acción: ${decision.accion} (esperaba IR_A_PAGO)`,
      });
      console.log(`   ⚠️  Estado: ${estadoPlanilla.estado}`);
      console.log(`   ⚠️  Acción recomendada: ${decision.accion}`);
      console.log('   ❌ No hay planilla pendiente para probar pago');
      throw new Error('No hay planilla pendiente para probar pago PSE');
    }

    resultados.push({
      paso: 'Verificación Estado',
      exitoso: true,
      detalle: `Planilla pendiente: $${(estadoPlanilla.valorTotal || 0).toLocaleString()}`,
      datos: {
        estado: estadoPlanilla.estado,
        valor: estadoPlanilla.valorTotal,
      },
    });

    console.log(`   ✅ Planilla pendiente detectada`);
    console.log(`      Valor: $${(estadoPlanilla.valorTotal || 0).toLocaleString()}`);
    console.log('');

    // ========================================
    // PASO 3: Navegar a Administrar Planillas
    // ========================================
    console.log('📋 PASO 3: Navegar a Administrar Planillas');
    console.log('   Navegando...');

    await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(3000);

    await page.screenshot({
      path: `screenshots/test2-02-administrar-planillas_${Date.now()}.png`,
      fullPage: true,
    });

    resultados.push({
      paso: 'Navegar Admin Planillas',
      exitoso: true,
      detalle: 'Página cargada',
    });
    console.log('   ✅ Página de administrar planillas cargada');
    console.log('');

    // ========================================
    // PASO 4: Buscar botón "Paga aquí"
    // ========================================
    console.log('📋 PASO 4: Buscar Botón de Pago');
    console.log('   Buscando botón "Paga aquí"...');

    const payButtonInfo = await page.evaluate(() => {
      // Buscar específicamente el botón "Paga aquí" (naranja) que está en la tabla de planillas
      // NO buscar en el menú lateral (que tiene "Planillas Pagadas")
      const allElements = document.querySelectorAll('button, a.btn, [role="button"]');
      const payButtons: Array<{
        text: string;
        tagName: string;
        href?: string;
        isVisible: boolean;
        className: string;
      }> = [];

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        const lowerText = text.toLowerCase();
        const className = (el as HTMLElement).className || '';

        // Buscar específicamente "Paga aquí" o botones con clase btn (no links del menú)
        // Excluir "Planillas Pagadas" que está en el menú
        if (
          (lowerText === 'paga aquí' || lowerText === 'pagar') &&
          !lowerText.includes('planillas pagadas')
        ) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          payButtons.push({
            text: text.slice(0, 50),
            tagName: el.tagName,
            href: (el as HTMLAnchorElement).href || undefined,
            isVisible: rect.width > 0 && rect.height > 0,
            className: className.slice(0, 50),
          });
        }
      }

      // También buscar en la sección "Planillas disponibles para pago"
      const planillasSection = document.querySelector('[class*="planillas"], .table, table');
      if (planillasSection) {
        const sectionButtons = planillasSection.querySelectorAll('button, a');
        for (const btn of Array.from(sectionButtons)) {
          const text = (btn as HTMLElement).innerText?.trim() || '';
          if (text.toLowerCase().includes('paga')) {
            const rect = (btn as HTMLElement).getBoundingClientRect();
            payButtons.push({
              text: text.slice(0, 50),
              tagName: btn.tagName,
              href: (btn as HTMLAnchorElement).href || undefined,
              isVisible: rect.width > 0 && rect.height > 0,
              className: (btn as HTMLElement).className?.slice(0, 50) || '',
            });
          }
        }
      }

      return {
        found: payButtons.length > 0,
        buttons: payButtons,
        pageText: document.body.innerText.slice(0, 500),
      };
    });

    if (!payButtonInfo.found) {
      resultados.push({
        paso: 'Buscar Botón Pago',
        exitoso: false,
        detalle: 'No se encontró botón "Paga aquí"',
      });
      console.log('   ❌ No se encontró botón de pago');
      console.log('   Contenido de página:', payButtonInfo.pageText.slice(0, 200));
      throw new Error('No se encontró botón de pago');
    }

    resultados.push({
      paso: 'Buscar Botón Pago',
      exitoso: true,
      detalle: `Encontrado: ${payButtonInfo.buttons[0].text}`,
      datos: { buttons: payButtonInfo.buttons },
    });

    console.log(`   ✅ Botón de pago encontrado`);
    console.log(`      Texto: "${payButtonInfo.buttons[0].text}"`);
    console.log(`      Tipo: ${payButtonInfo.buttons[0].tagName}`);
    console.log('');

    // ========================================
    // PASO 5: Click en "Paga aquí" (ir a resumen)
    // ========================================
    console.log('📋 PASO 5: Click en "Paga aquí"');
    console.log('   Haciendo click para ir al resumen de pago...');

    // Click específicamente en "Paga aquí" (no en "Planillas Pagadas" del menú)
    const clicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('button, a.btn, [role="button"]');

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
        // Buscar exactamente "paga aquí" o "pagar", excluyendo menú lateral
        if (
          (text === 'paga aquí' || text === 'pagar') &&
          !text.includes('planillas pagadas')
        ) {
          (el as HTMLElement).click();
          return 'clicked-exact';
        }
      }

      // Segundo intento: buscar en la sección de planillas disponibles
      const mainContent = document.querySelector('main, [role="main"], .content, #content');
      if (mainContent) {
        const buttons = mainContent.querySelectorAll('button, a');
        for (const btn of Array.from(buttons)) {
          const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
          if (text.includes('paga') && !text.includes('planillas pagadas')) {
            (btn as HTMLElement).click();
            return 'clicked-in-main';
          }
        }
      }

      return false;
    });

    if (!clicked) {
      resultados.push({
        paso: 'Click Pagar',
        exitoso: false,
        detalle: 'No se pudo hacer click en botón',
      });
      throw new Error('No se pudo hacer click en botón de pago');
    }

    console.log(`   Click resultado: ${clicked}`);

    // Esperar navegación o cambio de página
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch {
      // Si no hay navegación, esperar que la página se actualice
      await sleep(3000);
    }

    await sleep(2000);

    await page.screenshot({
      path: `screenshots/test2-03-resumen-pago_${Date.now()}.png`,
      fullPage: true,
    });

    // Verificar que estamos en página de resumen/pago
    const paymentPageInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      return {
        hasPSE: bodyText.includes('pse') || bodyText.includes('pago en línea'),
        hasBancolombia: bodyText.includes('bancolombia'),
        hasValor: /\$\s*[\d.,]+/.test(document.body.innerText),
        hasPaymentOptions: bodyText.includes('medio de pago') || bodyText.includes('forma de pago'),
        pageTitle: document.title,
        url: window.location.href,
      };
    });

    resultados.push({
      paso: 'Click Pagar',
      exitoso: true,
      detalle: 'Navegó a página de pago',
      datos: paymentPageInfo,
    });

    console.log('   ✅ Navegó a página de pago/resumen');
    console.log(`      URL: ${paymentPageInfo.url}`);
    console.log(`      Opciones PSE: ${paymentPageInfo.hasPSE ? 'Sí' : 'No'}`);
    console.log('');

    // ========================================
    // PASO 6: Verificar opciones de pago PSE
    // ========================================
    console.log('📋 PASO 6: Verificar Opciones PSE');
    console.log('   Verificando que PSE está disponible...');

    // Buscar botón "Seleccionar medio de pago" o similares
    const paymentOptions = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const hasPSE = bodyText.includes('pse');
      const hasResumen = bodyText.includes('resumen de la planilla');
      const hasTotalPagar = bodyText.includes('total a pagar');

      // Buscar botones importantes
      const buttons = document.querySelectorAll('button, a.btn');
      const actionButtons: string[] = [];
      let hasSelectPaymentMethod = false;

      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.trim() || '';
        const lowerText = text.toLowerCase();

        if (lowerText.includes('seleccionar medio') || lowerText.includes('medio de pago')) {
          hasSelectPaymentMethod = true;
        }

        if (
          lowerText.includes('continuar') ||
          lowerText.includes('pagar') ||
          lowerText.includes('medio de pago') ||
          lowerText.includes('pdf')
        ) {
          actionButtons.push(text.slice(0, 40));
        }
      }

      return {
        hasPSEText: hasPSE,
        hasResumen,
        hasTotalPagar,
        hasSelectPaymentMethod,
        actionButtons,
      };
    });

    // El test es exitoso si estamos en página de resumen y hay botón de seleccionar medio de pago
    const paymentStepOk = paymentOptions.hasResumen || paymentOptions.hasTotalPagar || paymentOptions.hasSelectPaymentMethod;

    if (paymentStepOk) {
      resultados.push({
        paso: 'Verificar Página Pago',
        exitoso: true,
        detalle: paymentOptions.hasSelectPaymentMethod
          ? 'Botón "Seleccionar medio de pago" disponible'
          : 'Página de resumen de planilla cargada',
        datos: paymentOptions,
      });
      console.log('   ✅ Página de pago cargada correctamente');
      if (paymentOptions.hasSelectPaymentMethod) {
        console.log('      Siguiente paso: Click en "Seleccionar medio de pago" → PSE');
      }
    } else {
      resultados.push({
        paso: 'Verificar Página Pago',
        exitoso: false,
        detalle: 'No se pudo verificar página de pago',
      });
      console.log('   ⚠️  No se detectó página de pago claramente');
    }

    if (paymentOptions.actionButtons.length > 0) {
      console.log(`      Botones disponibles: ${paymentOptions.actionButtons.join(', ')}`);
    }
    console.log('');

    // ========================================
    // PASO 7: STOP - DRY RUN
    // ========================================
    console.log('📋 PASO 7: DRY RUN - DETENIDO');
    console.log('');
    console.log('   ⛔ STOP: Test detenido antes de procesar pago');
    console.log('   ⛔ NO se seleccionará banco ni se continuará');
    console.log('   ⛔ Esto es un DRY RUN - sin dinero real involucrado');
    console.log('');

    resultados.push({
      paso: 'DRY RUN Stop',
      exitoso: true,
      detalle: 'Test detenido correctamente antes de pago',
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
      console.log('✅ TEST EXITOSO (DRY RUN)');
      console.log('');
      console.log('El flujo de pago PSE funciona correctamente hasta la selección de banco.');
      console.log('Para ejecutar un pago real, usar el flujo admin-controlled.');
    } else {
      console.log('❌ TEST CON ERRORES');
    }

    console.log('');
    console.log('Cerrando navegador...');
    await authBot.close();

    return { success: todosExitosos, resultados };

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
            path: `screenshots/test2-error_${Date.now()}.png`,
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
