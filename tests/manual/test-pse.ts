/**
 * Test Manual: Bot de Pago PSE
 *
 * Este script permite probar el flujo de pago PSE hasta la clave dinámica:
 * 1. Login en Enlace
 * 2. Navegar manualmente hasta el botón "Pagar con PSE"
 * 3. El bot selecciona Bancolombia
 * 4. El bot ingresa datos de cuenta
 * 5. El bot detecta la pantalla de clave dinámica
 * 6. El bot se detiene y reporta éxito
 *
 * Uso:
 *   PUPPETEER_HEADLESS=false tsx tests/manual/test-pse.ts
 *
 * IMPORTANTE:
 *   - Debes tener una planilla ya liquidada en Enlace
 *   - Configurar variables BANCOLOMBIA_* en .env
 */

import { procesarPSEHastaClaveDinamica } from '../../src/bots/enlace/pago-pse.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { browserManager } from '../../src/bots/utils/browser';
import { logger } from '../../src/utils/logger';
import * as readline from 'readline';

// Configuración de prueba
const TEST_PLANILLA_ID = process.env.PLANILLA_ID || 'test-planilla-001';
const TEST_TASK_ID = process.env.TASK_ID || 'test-task-001';
const TEST_VALOR = parseInt(process.env.VALOR || '580000');

/**
 * Helper para esperar input del usuario
 */
function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`\n${message}\nPresiona ENTER para continuar...`, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Función principal de prueba
 */
async function testPSE() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('🚀 TEST MANUAL: Bot de Pago PSE - Fase 6.1');
  console.log('='.repeat(60));
  console.log('\n');

  // Verificar configuración
  console.log('📋 Verificando configuración...\n');

  const config = {
    BANCOLOMBIA_CUENTA_NUMERO: process.env.BANCOLOMBIA_CUENTA_NUMERO,
    BANCOLOMBIA_CUENTA_TIPO: process.env.BANCOLOMBIA_CUENTA_TIPO,
    BANCOLOMBIA_TITULAR_DOCUMENTO: process.env.BANCOLOMBIA_TITULAR_DOCUMENTO,
  };

  console.log('Configuración actual:');
  console.log(`  - Cuenta: ${config.BANCOLOMBIA_CUENTA_NUMERO ? '✅ Configurada' : '❌ FALTA'}`);
  console.log(`  - Tipo: ${config.BANCOLOMBIA_CUENTA_TIPO || 'Ahorros (default)'}`);
  console.log(
    `  - Documento: ${config.BANCOLOMBIA_TITULAR_DOCUMENTO ? '✅ Configurado' : '❌ FALTA'}`
  );
  console.log('\n');

  if (!config.BANCOLOMBIA_CUENTA_NUMERO || !config.BANCOLOMBIA_TITULAR_DOCUMENTO) {
    console.log('❌ ERROR: Faltan variables de entorno de Bancolombia');
    console.log('Configura en .env:');
    console.log('  BANCOLOMBIA_CUENTA_NUMERO=1234567890');
    console.log('  BANCOLOMBIA_CUENTA_TIPO=Ahorros');
    console.log('  BANCOLOMBIA_TITULAR_DOCUMENTO=1234567890');
    process.exit(1);
  }

  try {
    // PASO 1: Login en Enlace
    console.log('📝 PASO 1: Iniciando sesión en Enlace...');
    const page = await enlaceAuth.ensureAuthenticated();
    console.log('✅ Sesión iniciada correctamente\n');

    // PASO 2: Navegación manual
    console.log('📝 PASO 2: Navegación manual requerida');
    console.log('-'.repeat(60));
    console.log('⚠️  IMPORTANTE:');
    console.log('    1. Navega a una planilla ya liquidada');
    console.log('    2. Haz clic en "Pagar" o "Pagar con PSE"');
    console.log('    3. Espera a que cargue la página de PSE');
    console.log('    4. Vuelve aquí y presiona ENTER');
    console.log('-'.repeat(60));

    await waitForEnter('👉 ¿Ya estás en la página de PSE (selección de banco)?');

    // Tomar screenshot del estado actual
    await browserManager.takeScreenshot(page, 'pse-00-initial-state');
    console.log('📸 Screenshot guardado: pse-00-initial-state.png\n');

    // PASO 3: Ejecutar bot PSE
    console.log('📝 PASO 3: Ejecutando bot PSE...');
    console.log('-'.repeat(60));

    const result = await procesarPSEHastaClaveDinamica({
      page,
      planillaId: TEST_PLANILLA_ID,
      taskId: TEST_TASK_ID,
      valorTotal: TEST_VALOR,
    });

    console.log('\n');
    console.log('='.repeat(60));
    console.log('📊 RESULTADO');
    console.log('='.repeat(60));
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(60));
    console.log('\n');

    if (result.success && result.awaitingCode) {
      console.log('✅ ¡ÉXITO!');
      console.log('✅ El bot llegó a la pantalla de clave dinámica');
      console.log(`✅ Session ID: ${result.sessionId}`);
      console.log('\n');
      console.log('🔍 El navegador permanecerá abierto para inspección');
      console.log('🔍 Revisa los screenshots en: ./screenshots/');
      console.log('\n');
      console.log('👉 Presiona Ctrl+C para cerrar');

      // Mantener navegador abierto indefinidamente
      await new Promise(() => {});
    } else {
      console.log('❌ FALLÓ');
      console.log(`❌ Error: ${result.error}`);
      console.log('\n');
      console.log('🔍 Revisa los screenshots en: ./screenshots/');
      console.log('🔍 Verifica que estabas en la página correcta de PSE');

      await waitForEnter('Presiona ENTER para cerrar el navegador');
      await browserManager.closeBrowser();
    }
  } catch (error) {
    console.error('\n💥 ERROR FATAL:', error);
    console.log('\n🔍 Revisa los screenshots en: ./screenshots/');

    try {
      await browserManager.closeBrowser();
    } catch {
      // Ignorar error al cerrar
    }

    process.exit(1);
  }
}

// Ejecutar
testPSE().catch((error) => {
  console.error('Error no manejado:', error);
  process.exit(1);
});
