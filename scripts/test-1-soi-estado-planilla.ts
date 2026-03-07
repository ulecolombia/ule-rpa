/**
 * TEST 1-SOI: Verificación de Estado de Planilla en SOI
 *
 * Este test verifica que verificarEstadoPlanillaSOI() funciona correctamente:
 *
 * 1. Login en SOI
 * 2. Verificar estado de planilla para el periodo actual
 * 3. Aplicar árbol de decisión
 * 4. Reportar acción recomendada
 *
 * SEGURO: Este test es READ-ONLY - solo verifica estado, no modifica nada.
 */

import {
  verificarEstadoPlanillaSOI,
  aplicarArbolDecision,
  getPeriodoActual,
  type VerificacionPlanillaOptions,
  type PlanillaStateResult,
  type DecisionResult,
} from '../src/bots/utils/planilla-state';
import { getSOIAuthBot, SOIAuthBot } from '../src/bots/soi/auth.bot';
import { Page } from 'puppeteer';

// Credenciales de prueba SOI (de .env)
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

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
  decision: DecisionResult | null;
}> {
  const resultados: TestResult[] = [];
  let authBot: SOIAuthBot | null = null;
  let decision: DecisionResult | null = null;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 1-SOI: VERIFICACIÓN DE ESTADO DE PLANILLA         ║');
  console.log('║     Operador: SOI (nuevosoi.com.co)                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const periodo = getPeriodoActual();
  const periodoStr = `${periodo.mes.toString().padStart(2, '0')}/${periodo.anio}`;
  console.log(`📅 Periodo a verificar: ${periodoStr}`);
  console.log(`👤 Usuario: CC${TEST_USER_SOI.numeroDocumento}`);
  console.log('');
  console.log('ℹ️  Este test es READ-ONLY - solo verifica estado');
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
        detalle: 'Login falló',
      });
      throw new Error('Login SOI falló: No se pudo autenticar');
    }

    resultados.push({
      paso: 'Login SOI',
      exitoso: true,
      detalle: 'Autenticación exitosa',
    });
    console.log('   ✅ Login exitoso en SOI');
    console.log('');

    // Obtener página (ya estamos autenticados)
    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener la página después del login');
    }

    // Screenshot del dashboard
    await page.screenshot({
      path: `screenshots/test1-soi-01-dashboard_${Date.now()}.png`,
      fullPage: true,
    });

    // ========================================
    // PASO 2: Verificar estado de planilla
    // ========================================
    console.log('📋 PASO 2: Verificación de Estado');
    console.log('   Navegando a consulta de planillas...');

    const options: VerificacionPlanillaOptions = {
      periodo,
      tipoDocumento: TEST_USER_SOI.tipoDocumento,
      numeroDocumento: TEST_USER_SOI.numeroDocumento,
    };

    const estadoPlanilla: PlanillaStateResult = await verificarEstadoPlanillaSOI(
      page,
      options
    );

    // Screenshot después de verificar
    await page.screenshot({
      path: `screenshots/test1-soi-02-verificacion_${Date.now()}.png`,
      fullPage: true,
    });

    resultados.push({
      paso: 'Verificación Estado',
      exitoso: estadoPlanilla.estado !== 'ERROR_VERIFICACION',
      detalle: `Estado: ${estadoPlanilla.estado}`,
      datos: {
        estado: estadoPlanilla.estado,
        numeroPlanilla: estadoPlanilla.numeroPlanilla,
        valorTotal: estadoPlanilla.valorTotal,
        mensaje: estadoPlanilla.mensaje,
      },
    });

    console.log(`   ✅ Estado detectado: ${estadoPlanilla.estado}`);
    if (estadoPlanilla.numeroPlanilla) {
      console.log(`      Número: ${estadoPlanilla.numeroPlanilla}`);
    }
    if (estadoPlanilla.valorTotal) {
      console.log(`      Valor: $${estadoPlanilla.valorTotal.toLocaleString()}`);
    }
    if (estadoPlanilla.mensaje) {
      console.log(`      Mensaje: ${estadoPlanilla.mensaje}`);
    }
    console.log('');

    // ========================================
    // PASO 3: Aplicar árbol de decisión
    // ========================================
    console.log('📋 PASO 3: Árbol de Decisión');

    decision = aplicarArbolDecision(estadoPlanilla);

    resultados.push({
      paso: 'Árbol de Decisión',
      exitoso: true,
      detalle: `Acción: ${decision.accion}`,
      datos: {
        accion: decision.accion,
        mensaje: decision.mensaje,
      },
    });

    console.log(`   ✅ Acción determinada: ${decision.accion}`);
    console.log(`      ${decision.mensaje}`);
    console.log('');

    // ========================================
    // PASO 4: Interpretación
    // ========================================
    console.log('📋 PASO 4: Interpretación');
    console.log('');

    switch (decision.accion) {
      case 'CREAR_PLANILLA':
        console.log('   📝 El bot debería CREAR una nueva planilla');
        console.log(`      Periodo: ${periodoStr}`);
        break;

      case 'IR_A_PAGO':
        console.log('   💳 El bot debería IR DIRECTO AL PAGO');
        console.log(`      Planilla: ${estadoPlanilla.numeroPlanilla || 'existente'}`);
        console.log(`      Valor: $${(estadoPlanilla.valorTotal || 0).toLocaleString()}`);
        break;

      case 'DESCARGAR_COMPROBANTE':
        console.log('   📄 El bot debería DESCARGAR COMPROBANTE');
        console.log(`      Planilla: ${estadoPlanilla.numeroPlanilla || 'pagada'}`);
        break;

      case 'REINTENTAR':
        console.log('   ⚠️  Error de verificación, reintentar');
        console.log(`      Error: ${estadoPlanilla.mensaje}`);
        break;

      default:
        console.log('   ❓ Acción no reconocida');
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
      console.log('✅ TEST 1-SOI EXITOSO');
      console.log('');
      console.log('verificarEstadoPlanillaSOI() funciona correctamente.');
      console.log(`Acción recomendada para este usuario: ${decision.accion}`);
    } else {
      console.log('❌ TEST CON ERRORES');
    }

    // Cleanup
    console.log('');
    console.log('Cerrando navegador...');
    await authBot.close();

    return {
      success: todosExitosos,
      resultados,
      decision,
    };

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

    return {
      success: false,
      resultados,
      decision: null,
    };
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
