/**
 * Test: Verificación de Estado de Planilla
 *
 * Este test es SEGURO - solo lee información, no crea ni modifica nada.
 *
 * Verifica:
 * 1. Login exitoso en Mi Planilla
 * 2. Navegar a administrar planillas
 * 3. Detectar estado de planilla para el periodo actual
 * 4. Aplicar árbol de decisión
 *
 * Resultado esperado:
 * - Si no hay planilla: accion = CREAR_PLANILLA
 * - Si hay planilla pendiente: accion = IR_A_PAGO
 * - Si hay planilla pagada: accion = DESCARGAR_COMPROBANTE
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

// Credenciales de prueba
const TEST_USER = {
  tipoDocumento: 'CC' as const,
  numeroDocumento: '1047484978',
  password: 'Ulecolombia123',
};

async function main() {
  console.log('='.repeat(60));
  console.log('TEST: Verificación de Estado de Planilla');
  console.log('='.repeat(60));
  console.log('');
  console.log('Este test es READ-ONLY - solo verifica estado, no modifica nada.');
  console.log('');

  const periodo = getPeriodoActual();
  console.log(`Periodo a verificar: ${periodo.mes.toString().padStart(2, '0')}/${periodo.anio}`);
  console.log('');

  let authBot: MiPlanillaAuthBot | null = null;

  try {
    // Paso 1: Login en Mi Planilla
    console.log('[1/4] Iniciando login en Mi Planilla...');
    authBot = getMiPlanillaAuthBot();
    const session = await authBot.login({
      tipoDocumento: TEST_USER.tipoDocumento,
      documento: TEST_USER.numeroDocumento,
      password: TEST_USER.password,
    });

    if (!session.isAuthenticated) {
      throw new Error(`Login falló - sesión no autenticada`);
    }
    console.log('   ✓ Login exitoso');
    console.log(`   Usuario: ${session.userName}`);

    // Obtener la página
    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener la página después del login');
    }

    // Tomar screenshot del dashboard
    await page.screenshot({ path: `screenshots/test-estado-01-dashboard_${Date.now()}.png`, fullPage: true });

    // Paso 2: Verificar estado de planilla
    console.log('[2/4] Verificando estado de planilla...');

    const options: VerificacionPlanillaOptions = {
      periodo,
      tipoDocumento: TEST_USER.tipoDocumento,
      numeroDocumento: TEST_USER.numeroDocumento,
    };

    const estadoPlanilla: PlanillaStateResult = await verificarEstadoPlanillaMiPlanilla(
      page,
      options
    );

    // Tomar screenshot después de verificar
    await page.screenshot({ path: `screenshots/test-estado-02-verificacion_${Date.now()}.png`, fullPage: true });

    console.log('   Estado detectado:', estadoPlanilla.estado);
    if (estadoPlanilla.numeroPlanilla) {
      console.log('   Número de planilla:', estadoPlanilla.numeroPlanilla);
    }
    if (estadoPlanilla.valorTotal) {
      console.log('   Valor total:', `$${estadoPlanilla.valorTotal.toLocaleString()}`);
    }
    if (estadoPlanilla.mensaje) {
      console.log('   Mensaje:', estadoPlanilla.mensaje);
    }

    // Paso 3: Aplicar árbol de decisión
    console.log('[3/4] Aplicando árbol de decisión...');

    const decision: DecisionResult = aplicarArbolDecision(estadoPlanilla);

    console.log('   Acción recomendada:', decision.accion);
    console.log('   Mensaje:', decision.mensaje);

    // Paso 4: Resumen
    console.log('[4/4] Resumen del test...');
    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTADO DEL TEST');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Estado de planilla: ${estadoPlanilla.estado}`);
    console.log(`Acción a tomar:     ${decision.accion}`);
    console.log('');

    // Interpretar resultado para el flujo del bot
    switch (decision.accion) {
      case 'CREAR_PLANILLA':
        console.log('INTERPRETACIÓN: El bot debe CREAR una nueva planilla para este periodo.');
        console.log('Siguiente paso: Navegar a "Generar planilla" y completar el flujo.');
        break;

      case 'IR_A_PAGO':
        console.log('INTERPRETACIÓN: Ya existe planilla. El bot debe IR DIRECTO AL PAGO.');
        console.log(`Planilla: ${estadoPlanilla.numeroPlanilla || 'detectada'}`);
        console.log(`Valor: $${(estadoPlanilla.valorTotal || 0).toLocaleString()}`);
        console.log('Siguiente paso: Navegar a "Pagar planilla" sin crear una nueva.');
        break;

      case 'DESCARGAR_COMPROBANTE':
        console.log('INTERPRETACIÓN: Planilla ya está PAGADA. Solo descargar comprobante.');
        console.log(`Planilla: ${estadoPlanilla.numeroPlanilla || 'detectada'}`);
        console.log('Siguiente paso: Navegar a "Comprobantes" y descargar PDF.');
        break;

      case 'REINTENTAR':
        console.log('INTERPRETACIÓN: Error de verificación. Reintentar.');
        console.log(`Error: ${estadoPlanilla.mensaje}`);
        break;

      default:
        console.log('INTERPRETACIÓN: Estado no manejado.');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('TEST COMPLETADO EXITOSAMENTE');
    console.log('='.repeat(60));

    // Cleanup
    if (authBot) {
      await authBot.close();
    }
    process.exit(0);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('');
    console.error('ERROR:', errorMsg);
    console.error('');

    // Cleanup
    if (authBot) {
      try {
        const page = authBot.getPage();
        if (page) {
          await page.screenshot({ path: `screenshots/test-estado-error_${Date.now()}.png`, fullPage: true });
        }
        await authBot.close();
      } catch {
        // Ignorar errores de cleanup
      }
    }

    process.exit(1);
  }
}

main();
