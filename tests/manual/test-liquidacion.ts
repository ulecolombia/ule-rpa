/**
 * Manual Test Script - PILA Liquidation Bot
 *
 * Este script prueba el flujo completo de liquidación de PILA:
 * 1. Login a Enlace Operativo
 * 2. Navegación a generador de planillas
 * 3. Selección de usuario
 * 4. Llenado de formulario PILA
 * 5. Confirmación y obtención de número de planilla
 * 6. Navegación a PSE (DETIENE antes de pagar)
 *
 * USO:
 * PUPPETEER_HEADLESS=false tsx tests/manual/test-liquidacion.ts
 *
 * IMPORTANTE:
 * - Debes tener credenciales de Enlace configuradas en .env
 * - Deberás resolver el CAPTCHA manualmente al login
 * - El navegador se abrirá y podrás ver cada paso
 * - El script se detendrá en PSE (NO hace el pago)
 */

import { liquidarPilaConConfirmacion } from '../../src/bots/enlace/liquidacion.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { browserManager } from '../../src/bots/utils/browser';
import { logger } from '../../src/utils/logger';

/**
 * Datos de prueba para liquidación
 * IMPORTANTE: Actualiza el numeroDocumento con un usuario real registrado en Enlace
 */
const TEST_DATA = {
  numeroDocumento: '1047484978', // ← CAMBIAR por documento real
  pilaData: {
    periodo: '2026-02',
    ingresoBase: 2000000,
    ibc: 2000000,
    diasCotizados: 30,
    salud: 250000, // 12.5% de 2,000,000
    pension: 320000, // 16% de 2,000,000
    arl: 10440, // 0.522% de 2,000,000 (nivel I)
    nivelRiesgoARL: 'I' as const,
    total: 580440, // salud + pensión + arl
  },
};

/**
 * Test principal
 */
async function testLiquidacion() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PRUEBA MANUAL: Liquidación de PILA');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ========================================================================
    // PASO 1: Login a Enlace
    // ========================================================================
    console.log('📍 PASO 1/5: Login a Enlace Operativo');
    console.log('─────────────────────────────────────────────────────────');
    console.log('⏳ Iniciando sesión...');
    console.log('⚠️  ATENCIÓN: Deberás resolver el CAPTCHA manualmente\n');

    await enlaceAuth.login();

    console.log('✅ Login exitoso\n');

    // Esperar un momento para ver el dashboard
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ========================================================================
    // PASO 2: Ejecutar liquidación completa
    // ========================================================================
    console.log('📍 PASO 2/5: Iniciando liquidación de PILA');
    console.log('─────────────────────────────────────────────────────────');
    console.log('Documento:', TEST_DATA.numeroDocumento);
    console.log('Período:', TEST_DATA.pilaData.periodo);
    console.log('IBC:', TEST_DATA.pilaData.ibc.toLocaleString('es-CO'));
    console.log('Total:', TEST_DATA.pilaData.total.toLocaleString('es-CO'));
    console.log('');

    const result = await liquidarPilaConConfirmacion(
      TEST_DATA.numeroDocumento,
      TEST_DATA.pilaData
    );

    // ========================================================================
    // PASO 3: Verificar resultado
    // ========================================================================
    console.log('\n📍 PASO 3/5: Verificando resultado');
    console.log('─────────────────────────────────────────────────────────');

    if (result.success) {
      console.log('✅ Liquidación EXITOSA!\n');

      console.log('📋 DATOS DE LA PLANILLA:');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  Número de planilla: ${result.numeroPlanilla || 'N/A'}`);
      console.log(`  Valor total:        $${result.valorTotal?.toLocaleString('es-CO') || 'N/A'}`);
      console.log(
        `  Fecha límite:       ${result.fechaLimite?.toLocaleDateString('es-CO') || 'N/A'}`
      );
      console.log(`  Estado:             ${result.estadoPago}`);

      if (result.urlPSE) {
        console.log(`  URL PSE:            ${result.urlPSE}`);
      }

      console.log('═══════════════════════════════════════════════════════════\n');

      // Advertencias si las hay
      if (result.warnings && result.warnings.length > 0) {
        console.log('⚠️  ADVERTENCIAS:');
        result.warnings.forEach((warning, index) => {
          console.log(`  ${index + 1}. ${warning}`);
        });
        console.log('');
      }
    } else {
      console.log('❌ Liquidación FALLÓ\n');
      console.log('Error:', result.error);
      console.log('');
    }

    // ========================================================================
    // PASO 4: Instrucciones de verificación
    // ========================================================================
    console.log('📍 PASO 4/5: Verificación manual requerida');
    console.log('─────────────────────────────────────────────────────────');
    console.log('Por favor, verifica manualmente en Enlace Operativo:');
    console.log('');
    console.log('1. ¿Se creó la planilla con el número indicado?');
    console.log('2. ¿Los valores coinciden (IBC, salud, pensión, ARL)?');
    console.log('3. ¿El estado es "Pendiente de pago"?');
    console.log('4. ¿La fecha límite es correcta?');
    console.log('5. ¿El navegador está en la página de PSE?');
    console.log('');

    // ========================================================================
    // PASO 5: Esperar antes de cerrar
    // ========================================================================
    console.log('📍 PASO 5/5: Finalizando');
    console.log('─────────────────────────────────────────────────────────');
    console.log('⏳ Esperando 30 segundos para que puedas revisar...');
    console.log('   (Puedes cerrar el navegador antes si ya verificaste)\n');

    await new Promise((resolve) => setTimeout(resolve, 30000));

    console.log('✅ Test finalizado\n');
  } catch (error) {
    console.log('\n❌ ERROR DURANTE EL TEST');
    console.log('═══════════════════════════════════════════════════════════');
    console.error('Error:', error instanceof Error ? error.message : error);

    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    console.log('');
    console.log('💡 TROUBLESHOOTING:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('1. Verifica que las credenciales en .env sean correctas');
    console.log('2. Verifica que el usuario existe en Enlace');
    console.log('3. Revisa los screenshots en ./screenshots/');
    console.log('4. Verifica que los selectores no hayan cambiado');
    console.log('5. Ejecuta con PUPPETEER_HEADLESS=false para ver el error');
    console.log('');
  } finally {
    // Cerrar navegador
    console.log('🔄 Cerrando navegador...\n');
    await browserManager.close();
  }
}

/**
 * Ejecutar test
 */
console.log('🚀 Iniciando prueba manual de liquidación...\n');
console.log('⚙️  CONFIGURACIÓN:');
console.log(`   Headless: ${process.env.PUPPETEER_HEADLESS !== 'false' ? 'SÍ' : 'NO'}`);
console.log(`   Timeout:  ${process.env.PUPPETEER_TIMEOUT || '30000'}ms`);
console.log('');

testLiquidacion()
  .then(() => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Script completado exitosamente');
    console.log('═══════════════════════════════════════════════════════════\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('  ❌ Script falló con error fatal');
    console.error('═══════════════════════════════════════════════════════════\n');
    console.error(error);
    process.exit(1);
  });
