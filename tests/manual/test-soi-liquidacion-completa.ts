/**
 * Test Manual: SOI Liquidación Completa
 *
 * Este test verifica el flujo completo de liquidación SOI con datos IBC.
 *
 * Uso: npx tsx tests/manual/test-soi-liquidacion-completa.ts
 */

import { SOIAuthBot, SOICrearPlanillaBot } from '../../src/bots/soi';
import type { SOIPlanillaLiquidacion } from '../../src/types/soi-planilla.types';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURACIÓN DE TEST
// ============================================

// Datos del usuario de prueba (usar credenciales reales para test)
const TEST_CONFIG = {
  // Credenciales SOI del usuario
  tipoDocumento: 'CC' as const,
  documento: process.env.TEST_SOI_DOCUMENTO || '',
  password: process.env.TEST_SOI_PASSWORD || '',

  // Periodo de liquidación (mes anterior por defecto)
  mes: new Date().getMonth() || 12, // Si es enero, usar diciembre
  anio: new Date().getMonth() === 0
    ? new Date().getFullYear() - 1
    : new Date().getFullYear(),

  // IBC para independiente (mínimo 1 SMLV 2024 = $1,300,000)
  ibc: 1300000,
  diasCotizados: 30,
};

// ============================================
// HELPER: Crear datos de planilla
// ============================================
function crearDatosPlanilla(): SOIPlanillaLiquidacion {
  return {
    userId: TEST_CONFIG.documento,
    periodo: {
      mes: TEST_CONFIG.mes,
      anio: TEST_CONFIG.anio,
    },
    tipoAportante: 3, // Independiente
    cotizantes: [
      {
        identificacion: {
          tipoDocumento: TEST_CONFIG.tipoDocumento,
          numeroDocumento: TEST_CONFIG.documento,
        },
        tipoCotizante: '3', // Independiente
        subTipoCotizante: '', // IMPORTANTE: Dejar vacío

        ubicacion: {
          departamento: 'BOGOTA D.C.',
          municipio: 'BOGOTA D.C.',
        },

        seguridadSocial: {
          salarioBasico: TEST_CONFIG.ibc,

          pension: {
            ibc: TEST_CONFIG.ibc,
            diasCotizados: TEST_CONFIG.diasCotizados,
          },

          salud: {
            ibc: TEST_CONFIG.ibc,
            diasCotizados: TEST_CONFIG.diasCotizados,
          },

          arl: {
            ibc: TEST_CONFIG.ibc,
            diasCotizados: TEST_CONFIG.diasCotizados,
            nivelRiesgo: 'I',
          },
        },
      },
    ],
  };
}

// ============================================
// MAIN TEST
// ============================================
async function main() {
  console.log('========================================');
  console.log('Test: SOI Liquidación Completa');
  console.log('========================================\n');

  // Validar configuración
  if (!TEST_CONFIG.documento || !TEST_CONFIG.password) {
    console.error('❌ Error: Faltan variables de entorno');
    console.log('   Configura TEST_SOI_DOCUMENTO y TEST_SOI_PASSWORD en .env');
    process.exit(1);
  }

  console.log('📋 Configuración:');
  console.log(`   Documento: ${TEST_CONFIG.documento}`);
  console.log(`   Periodo: ${TEST_CONFIG.mes}/${TEST_CONFIG.anio}`);
  console.log(`   IBC: $${TEST_CONFIG.ibc.toLocaleString()}`);
  console.log('');

  let authBot: SOIAuthBot | null = null;

  try {
    // PASO 1: Login en SOI
    console.log('🔐 Paso 1: Iniciando sesión en SOI...');
    authBot = new SOIAuthBot();

    await authBot.loginAsUser({
      tipoDocumento: TEST_CONFIG.tipoDocumento,
      documento: TEST_CONFIG.documento,
      password: TEST_CONFIG.password,
    });

    console.log('   ✅ Login exitoso\n');

    // Obtener página
    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener página después del login');
    }

    // PASO 2: Crear planilla
    console.log('📝 Paso 2: Creando planilla con datos IBC...');

    const crearPlanillaBot = new SOICrearPlanillaBot(page, {
      takeScreenshots: true,
      screenshotPrefix: `test-liquidacion-${Date.now()}`,
    });

    const planillaData = crearDatosPlanilla();
    console.log('   Datos preparados:', JSON.stringify(planillaData.periodo));

    const result = await crearPlanillaBot.crearPlanilla(planillaData);

    // PASO 3: Verificar resultado
    console.log('\n📊 Paso 3: Verificando resultado...');

    if (result.success) {
      console.log('   ✅ Planilla creada exitosamente!');
      console.log('   ════════════════════════════════');
      console.log(`   Número de planilla: ${result.numeroPlanilla}`);
      console.log(`   Valor total: $${result.valorTotal?.toLocaleString() || 'N/A'}`);

      if (result.desglose) {
        console.log('   ────────────────────────────────');
        console.log(`   Salud:   $${result.desglose.salud?.toLocaleString() || 'N/A'}`);
        console.log(`   Pensión: $${result.desglose.pension?.toLocaleString() || 'N/A'}`);
        console.log(`   ARL:     $${result.desglose.arl?.toLocaleString() || 'N/A'}`);
      }
      console.log('   ════════════════════════════════');
    } else {
      console.log('   ❌ Error al crear planilla:');
      console.log(`      ${result.error}`);
    }

    // Esperar antes de cerrar para ver resultado
    console.log('\n⏳ Esperando 5 segundos antes de cerrar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('\n❌ Error durante el test:');
    console.error(error instanceof Error ? error.message : error);

    // Tomar screenshot de error
    if (authBot) {
      try {
        const page = authBot.getPage();
        if (page) {
          await page.screenshot({
            path: `./screenshots/error-test-${Date.now()}.png`,
            fullPage: true,
          });
          console.log('   Screenshot de error guardado');
        }
      } catch {
        // Ignorar error de screenshot
      }
    }

  } finally {
    // Cerrar sesión
    if (authBot) {
      console.log('\n🔒 Cerrando sesión...');
      await authBot.close();
    }

    console.log('\n✅ Test completado');
  }
}

// Ejecutar
main().catch(console.error);
