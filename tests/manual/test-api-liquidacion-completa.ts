/**
 * Test Manual: API Liquidación Completa
 *
 * Este test verifica el endpoint POST /api/soi/liquidar-planilla-completa
 *
 * Prerrequisitos:
 * 1. El servidor debe estar corriendo: npm run dev
 * 2. Redis debe estar activo
 *
 * Uso: npx tsx tests/manual/test-api-liquidacion-completa.ts
 */

import dotenv from 'dotenv';
dotenv.config();

// ============================================
// CONFIGURACIÓN
// ============================================
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || '';

// Datos de prueba
const TEST_DATA = {
  // Credenciales SOI
  documento: process.env.TEST_SOI_DOCUMENTO || '',
  password: process.env.TEST_SOI_PASSWORD || '',

  // Periodo
  mes: new Date().getMonth() || 12,
  anio: new Date().getMonth() === 0
    ? new Date().getFullYear() - 1
    : new Date().getFullYear(),

  // IBC
  ibc: 1300000,
};

// ============================================
// HELPERS
// ============================================
async function apiCall(endpoint: string, method: string, body?: object) {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`\n📡 ${method} ${endpoint}`);

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    console.log(`   ❌ Error ${response.status}:`, data);
    return { success: false, error: data };
  }

  console.log(`   ✅ Status: ${response.status}`);
  return { success: true, data };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// TEST: Crear liquidación y verificar estado
// ============================================
async function testLiquidacionCompleta() {
  console.log('========================================');
  console.log('Test: API Liquidación Completa');
  console.log('========================================');

  // Validar configuración
  if (!TEST_DATA.documento || !TEST_DATA.password) {
    console.error('\n❌ Error: Faltan credenciales de prueba');
    console.log('   Configura TEST_SOI_DOCUMENTO y TEST_SOI_PASSWORD en .env');
    return;
  }

  if (!API_KEY) {
    console.error('\n❌ Error: Falta API_KEY');
    return;
  }

  console.log('\n📋 Configuración:');
  console.log(`   API: ${API_BASE_URL}`);
  console.log(`   Documento: ${TEST_DATA.documento}`);
  console.log(`   Periodo: ${TEST_DATA.mes}/${TEST_DATA.anio}`);

  // PASO 1: Crear solicitud de liquidación
  console.log('\n────────────────────────────────────');
  console.log('PASO 1: Enviar solicitud de liquidación');
  console.log('────────────────────────────────────');

  const requestBody = {
    userId: TEST_DATA.documento,
    periodo: {
      mes: TEST_DATA.mes,
      anio: TEST_DATA.anio,
    },
    tipoAportante: 3,
    cotizantes: [
      {
        identificacion: {
          tipoDocumento: 'CC',
          numeroDocumento: TEST_DATA.documento,
        },
        tipoCotizante: '3',
        subTipoCotizante: '',
        ubicacion: {
          departamento: 'BOGOTA D.C.',
          municipio: 'BOGOTA D.C.',
        },
        seguridadSocial: {
          salarioBasico: TEST_DATA.ibc,
          pension: {
            ibc: TEST_DATA.ibc,
            diasCotizados: 30,
          },
          salud: {
            ibc: TEST_DATA.ibc,
            diasCotizados: 30,
          },
          arl: {
            ibc: TEST_DATA.ibc,
            diasCotizados: 30,
            nivelRiesgo: 'I',
          },
        },
      },
    ],
    soiPassword: TEST_DATA.password,
  };

  console.log('   Request body preparado');
  console.log(`   IBC: $${TEST_DATA.ibc.toLocaleString()}`);

  const createResult = await apiCall('/api/soi/liquidar-planilla-completa', 'POST', requestBody);

  if (!createResult.success) {
    console.log('\n❌ Falló al crear solicitud de liquidación');
    return;
  }

  const taskId = createResult.data.data?.taskId;
  console.log(`   TaskId: ${taskId}`);
  console.log(`   Status: ${createResult.data.data?.status}`);

  if (!taskId) {
    console.log('\n❌ No se recibió taskId');
    return;
  }

  // PASO 2: Polling del estado
  console.log('\n────────────────────────────────────');
  console.log('PASO 2: Verificar estado de la tarea');
  console.log('────────────────────────────────────');

  let attempts = 0;
  const maxAttempts = 60; // 5 minutos máximo
  let lastStatus = '';

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n   Intento ${attempts}/${maxAttempts}...`);

    const statusResult = await apiCall(`/api/soi/task/${taskId}`, 'GET');

    if (!statusResult.success) {
      console.log('   Error al obtener estado, reintentando...');
      await sleep(5000);
      continue;
    }

    const status = statusResult.data.data?.status;
    const progress = statusResult.data.data?.progress;

    if (status !== lastStatus) {
      console.log(`   📊 Estado: ${status}`);
      if (progress) {
        console.log(`   📈 Progreso: ${progress}%`);
      }
      lastStatus = status;
    }

    if (status === 'COMPLETED') {
      console.log('\n────────────────────────────────────');
      console.log('✅ TAREA COMPLETADA EXITOSAMENTE');
      console.log('────────────────────────────────────');

      const result = statusResult.data.data?.result;
      if (result) {
        console.log(`   Número de planilla: ${result.numeroPlanilla || 'N/A'}`);
        console.log(`   Valor total: $${result.valorTotal?.toLocaleString() || 'N/A'}`);
        if (result.desglose) {
          console.log('   ────────────────');
          console.log(`   Salud:   $${result.desglose.salud?.toLocaleString() || 'N/A'}`);
          console.log(`   Pensión: $${result.desglose.pension?.toLocaleString() || 'N/A'}`);
          console.log(`   ARL:     $${result.desglose.arl?.toLocaleString() || 'N/A'}`);
        }
      }
      return;
    }

    if (status === 'FAILED') {
      console.log('\n────────────────────────────────────');
      console.log('❌ TAREA FALLÓ');
      console.log('────────────────────────────────────');
      console.log(`   Error: ${statusResult.data.data?.failedReason || 'Desconocido'}`);
      console.log(`   Intentos: ${statusResult.data.data?.attemptsMade || 'N/A'}`);
      return;
    }

    // Esperar antes del siguiente intento
    await sleep(5000);
  }

  console.log('\n⏰ Timeout: La tarea no completó en el tiempo esperado');
}

// ============================================
// MAIN
// ============================================
async function main() {
  try {
    await testLiquidacionCompleta();
  } catch (error) {
    console.error('\n❌ Error inesperado:', error);
  }

  console.log('\n========================================');
  console.log('Test completado');
  console.log('========================================');
}

main();
