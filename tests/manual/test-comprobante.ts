/**
 * Test Manual: Descarga de Comprobantes
 *
 * Este script permite probar el flujo completo de descarga de comprobantes:
 * 1. Verificar estado de planilla en Enlace
 * 2. Descargar PDF si está pagada
 * 3. Subir a storage
 *
 * Uso:
 *   PUPPETEER_HEADLESS=false tsx tests/manual/test-comprobante.ts
 *
 * Con número de planilla específico:
 *   PLANILLA=123456 tsx tests/manual/test-comprobante.ts
 */

import {
  verificarEstadoPlanilla,
  descargarComprobante,
} from '../../src/bots/enlace/comprobante.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { browserManager } from '../../src/bots/utils/browser';
import { storageUploader } from '../../src/storage/uploader';
import { logger } from '../../src/utils/logger';

// Configuración
const TEST_PLANILLA = process.env.PLANILLA || '123456789';
const TEST_USER_ID = process.env.USER_ID || 'test-user-001';
const TEST_PERIODO = process.env.PERIODO || '2026-02';

async function testComprobante() {
  console.log('\n========================================');
  console.log('🧪 TEST: Descarga de Comprobantes PILA');
  console.log('========================================\n');

  console.log('📋 Configuración:');
  console.log(`   - Número de Planilla: ${TEST_PLANILLA}`);
  console.log(`   - User ID: ${TEST_USER_ID}`);
  console.log(`   - Periodo: ${TEST_PERIODO}`);
  console.log(`   - Headless: ${process.env.PUPPETEER_HEADLESS !== 'false'}`);
  console.log('');

  try {
    // ========================================
    // PASO 1: Login a Enlace
    // ========================================
    console.log('🔐 PASO 1: Autenticando en Enlace Operativo...');
    const startLogin = Date.now();

    await enlaceAuth.login();

    console.log(`   ✅ Login exitoso (${Date.now() - startLogin}ms)`);
    console.log('');

    // ========================================
    // PASO 2: Verificar estado de planilla
    // ========================================
    console.log('🔍 PASO 2: Verificando estado de planilla...');
    const startStatus = Date.now();

    const status = await verificarEstadoPlanilla(TEST_PLANILLA);

    console.log(`   ✅ Estado obtenido (${Date.now() - startStatus}ms)`);
    console.log('   📊 Resultado:');
    console.log(`      - Número: ${status.numeroPlanilla}`);
    console.log(`      - Estado: ${status.estado}`);
    console.log(`      - Fecha Pago: ${status.fechaPago || 'N/A'}`);
    console.log(`      - Valor: ${status.valor ? `$${status.valor.toLocaleString()}` : 'N/A'}`);
    console.log(`      - PDF URL: ${status.comprobantePdfUrl || 'N/A'}`);
    console.log('');

    // ========================================
    // PASO 3: Descargar si está pagada
    // ========================================
    if (status.estado === 'PAGADA') {
      console.log('📥 PASO 3: Descargando comprobante PDF...');
      const startDownload = Date.now();

      const downloadResult = await descargarComprobante(TEST_PLANILLA);

      if (downloadResult.success && downloadResult.localPath) {
        console.log(`   ✅ Descarga exitosa (${Date.now() - startDownload}ms)`);
        console.log('   📄 Archivo:');
        console.log(`      - Path: ${downloadResult.localPath}`);
        console.log(`      - Nombre: ${downloadResult.fileName}`);
        console.log(`      - Tamaño: ${downloadResult.fileSize} bytes`);
        console.log('');

        // ========================================
        // PASO 4: Subir a storage
        // ========================================
        console.log('☁️  PASO 4: Subiendo a storage...');
        const startUpload = Date.now();

        const uploadResult = await storageUploader.uploadComprobante(
          downloadResult.localPath,
          {
            userId: TEST_USER_ID,
            numeroPlanilla: TEST_PLANILLA,
            periodo: TEST_PERIODO,
            valor: status.valor || 0,
            fechaPago: status.fechaPago || new Date(),
          }
        );

        if (uploadResult.success) {
          console.log(`   ✅ Upload exitoso (${Date.now() - startUpload}ms)`);
          console.log('   🔗 URL pública:');
          console.log(`      ${uploadResult.url}`);
          console.log('');

          // Cleanup archivo local
          console.log('🧹 PASO 5: Limpiando archivo local...');
          await storageUploader.cleanupLocalFile(downloadResult.localPath);
          console.log('   ✅ Archivo local eliminado');
        } else {
          console.log(`   ❌ Error en upload: ${uploadResult.error}`);
        }
      } else {
        console.log(`   ❌ Error en descarga: ${downloadResult.error}`);
      }
    } else {
      console.log(`⚠️  PASO 3: Planilla NO está pagada (estado: ${status.estado})`);
      console.log('   Saltando descarga y upload...');
    }

    // ========================================
    // RESUMEN
    // ========================================
    console.log('\n========================================');
    console.log('✅ TEST COMPLETADO EXITOSAMENTE');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ ERROR EN TEST');
    console.error('========================================');
    console.error('Error:', error instanceof Error ? error.message : error);

    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    console.error('');
  } finally {
    // Cleanup
    console.log('🧹 Cerrando browser...');
    await browserManager.close();
    console.log('   ✅ Browser cerrado\n');
  }
}

// ========================================
// TEST ADICIONALES
// ========================================

/**
 * Test solo de verificación de estado (sin descarga)
 */
async function testStatusOnly() {
  console.log('\n🔍 TEST: Solo verificación de estado\n');

  try {
    await enlaceAuth.login();

    const status = await verificarEstadoPlanilla(TEST_PLANILLA);

    console.log('📊 Estado de planilla:');
    console.log(JSON.stringify(status, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browserManager.close();
  }
}

/**
 * Test de múltiples planillas
 */
async function testMultiplePlanillas() {
  const planillas = process.env.PLANILLAS?.split(',') || [
    '123456789',
    '987654321',
    '111222333',
  ];

  console.log(`\n🔍 TEST: Verificando ${planillas.length} planillas\n`);

  try {
    await enlaceAuth.login();

    for (const numeroPlanilla of planillas) {
      console.log(`\n--- Planilla: ${numeroPlanilla} ---`);

      try {
        const status = await verificarEstadoPlanilla(numeroPlanilla);
        console.log(`   Estado: ${status.estado}`);
        console.log(`   Valor: ${status.valor || 'N/A'}`);
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
      }

      // Delay entre planillas para no sobrecargar
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browserManager.close();
  }
}

// ========================================
// MAIN
// ========================================

const testType = process.env.TEST_TYPE || 'full';

switch (testType) {
  case 'status':
    testStatusOnly();
    break;
  case 'multiple':
    testMultiplePlanillas();
    break;
  default:
    testComprobante();
}
