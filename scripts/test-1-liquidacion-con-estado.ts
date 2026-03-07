/**
 * TEST 1: Liquidación con Detección de Estado
 *
 * Este test verifica que el sistema respete el árbol de decisión
 * antes de intentar crear una planilla:
 *
 * 1. Login en Mi Planilla
 * 2. Verificar estado de planilla para el periodo
 * 3. Aplicar árbol de decisión
 * 4. Ejecutar acción correspondiente (sin crear planilla real)
 *
 * SEGURO: Este test NO crea planillas reales.
 * Solo verifica el estado y reporta qué HARÍA el bot.
 */

import {
  verificarEstadoPlanillaMiPlanilla,
  aplicarArbolDecision,
  getPeriodoActual,
  type VerificacionPlanillaOptions,
  type PlanillaStateResult,
  type DecisionResult,
} from '../src/bots/utils/planilla-state';
import { getMiPlanillaAuthBot, MiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';
import { Page } from 'puppeteer';

import dotenv from 'dotenv';
dotenv.config();

// Credenciales de prueba (desde env vars)
const TEST_USER = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
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
  let authBot: MiPlanillaAuthBot | null = null;
  let decision: DecisionResult | null = null;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 1: LIQUIDACIÓN CON DETECCIÓN DE ESTADO            ║');
  console.log('║     Operador: Mi Planilla                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const periodo = getPeriodoActual();
  const periodoStr = `${periodo.mes.toString().padStart(2, '0')}/${periodo.anio}`;
  console.log(`📅 Periodo a verificar: ${periodoStr}`);
  console.log(`👤 Usuario: CC${TEST_USER.numeroDocumento}`);
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
      throw new Error('Login falló - sesión no autenticada');
    }

    resultados.push({
      paso: 'Login',
      exitoso: true,
      detalle: `Usuario: ${session.userName}`,
      datos: { userName: session.userName, lastLogin: session.lastLogin },
    });
    console.log(`   ✅ Login exitoso - Usuario: ${session.userName}`);
    console.log('');

    // Obtener página
    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener la página después del login');
    }

    // Screenshot del dashboard
    await page.screenshot({
      path: `screenshots/test1-01-dashboard_${Date.now()}.png`,
      fullPage: true,
    });

    // ========================================
    // PASO 2: Verificar estado de planilla
    // ========================================
    console.log('📋 PASO 2: Verificación de Estado');
    console.log('   Navegando a administrar planillas...');

    const options: VerificacionPlanillaOptions = {
      periodo,
      tipoDocumento: TEST_USER.tipoDocumento,
      numeroDocumento: TEST_USER.numeroDocumento,
    };

    const estadoPlanilla: PlanillaStateResult = await verificarEstadoPlanillaMiPlanilla(
      page,
      options
    );

    // Screenshot después de verificar
    await page.screenshot({
      path: `screenshots/test1-02-verificacion_${Date.now()}.png`,
      fullPage: true,
    });

    resultados.push({
      paso: 'Verificación de Estado',
      exitoso: true,
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
    // PASO 4: Simular acción (sin ejecutar)
    // ========================================
    console.log('📋 PASO 4: Simulación de Acción');
    console.log('   ⚠️  Modo seguro: NO se ejecutará la acción real');
    console.log('');

    let simulacionExitosa = true;
    let detalleSimulacion = '';

    switch (decision.accion) {
      case 'CREAR_PLANILLA':
        detalleSimulacion = `El bot CREARÍA una nueva planilla para periodo ${periodoStr}`;
        console.log('   📝 SIMULAR: El bot navegaría a "Generar Planilla"');
        console.log('      - Seleccionaría "Pagos de mis propios aportes"');
        console.log('      - Verificaría "Personas incluidas" > 0');
        console.log('      - Llenaría datos de IBC');
        console.log('      - Generaría la planilla');
        console.log('');
        console.log('   ⛔ ACCIÓN BLOQUEADA: No se crea planilla en test');
        break;

      case 'IR_A_PAGO':
        detalleSimulacion = `El bot iría DIRECTO al pago de planilla ${estadoPlanilla.numeroPlanilla || 'existente'}`;
        console.log('   💳 SIMULAR: El bot navegaría a la planilla pendiente');
        console.log(`      - Planilla: ${estadoPlanilla.numeroPlanilla || 'detectada'}`);
        console.log(`      - Valor: $${(estadoPlanilla.valorTotal || 0).toLocaleString()}`);
        console.log('      - Iniciaría proceso PSE');
        console.log('      - Seleccionaría Bancolombia');
        console.log('');
        console.log('   ⛔ ACCIÓN BLOQUEADA: No se inicia pago en test');
        break;

      case 'DESCARGAR_COMPROBANTE':
        detalleSimulacion = `El bot descargaría comprobante de planilla ${estadoPlanilla.numeroPlanilla || 'pagada'}`;
        console.log('   📄 SIMULAR: El bot navegaría a comprobantes');
        console.log(`      - Buscaría planilla: ${estadoPlanilla.numeroPlanilla || 'pagada'}`);
        console.log('      - Descargaría PDF');
        console.log('      - Subiría a storage');
        console.log('');
        // Este SÍ podría ejecutarse en un test más avanzado (es read-only)
        console.log('   ℹ️  Esta acción es segura (read-only), podría ejecutarse');
        break;

      case 'REINTENTAR':
        detalleSimulacion = `Error de verificación: ${estadoPlanilla.mensaje}`;
        simulacionExitosa = false;
        console.log('   ⚠️  SIMULAR: Hubo un error, se reintentaría');
        console.log(`      Error: ${estadoPlanilla.mensaje}`);
        break;

      default:
        detalleSimulacion = 'Estado no manejado';
        simulacionExitosa = false;
        console.log('   ❌ ERROR: Estado no manejado');
    }

    resultados.push({
      paso: 'Simulación',
      exitoso: simulacionExitosa,
      detalle: detalleSimulacion,
    });
    console.log('');

    // ========================================
    // RESUMEN FINAL
    // ========================================
    console.log('─'.repeat(60));
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMEN DEL TEST                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    // Tabla de resultados
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

    // Veredicto final
    const todosExitosos = resultados.every(r => r.exitoso);
    if (todosExitosos) {
      console.log('✅ TEST EXITOSO');
      console.log('');
      console.log('El árbol de decisión funciona correctamente.');
      console.log(`Para este usuario/periodo, la acción correcta es: ${decision.accion}`);
    } else {
      console.log('❌ TEST CON ERRORES');
      console.log('');
      console.log('Revisar los pasos marcados con ❌');
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
      detalle: errorMsg,
    });

    console.error('');
    console.error('❌ ERROR FATAL:', errorMsg);
    console.error('');

    // Cleanup
    if (authBot) {
      try {
        const page = authBot.getPage();
        if (page) {
          await page.screenshot({
            path: `screenshots/test1-error_${Date.now()}.png`,
            fullPage: true,
          });
        }
        await authBot.close();
      } catch {
        // Ignorar errores de cleanup
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

    if (result.success) {
      console.log('🎉 Test completado exitosamente');
      process.exit(0);
    } else {
      console.log('💥 Test fallido');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Error ejecutando test:', err);
    process.exit(1);
  });
