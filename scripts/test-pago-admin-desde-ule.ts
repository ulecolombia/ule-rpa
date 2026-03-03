/**
 * Test: Simular flujo de pago desde Centro de Pagos ULE
 *
 * Este script simula lo que pasa cuando el admin hace click en "Iniciar"
 * desde el Centro de Pagos PILA de ULE (localhost:3000/rpa).
 *
 * Flujo:
 * 1. Obtener planilla pendiente de la BD
 * 2. Llamar POST /api/admin/pago/iniciar con el planillaId
 * 3. Monitorear el progreso de la sesión
 * 4. Ver los screenshots generados
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = 'ule-rpa-dev-key-12345678901234567890123456789012';
const BASE_URL = 'http://localhost:3001';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  return fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
}

async function getPlanillasPendientes() {
  const response = await fetchWithAuth('/api/admin/pago/planillas-pendientes');
  if (!response.ok) {
    throw new Error(`Failed to get planillas: ${response.statusText}`);
  }
  return response.json();
}

async function iniciarPagoRPA(planillaId: string) {
  const response = await fetchWithAuth('/api/admin/pago/iniciar', {
    method: 'POST',
    body: JSON.stringify({ planillaId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to start RPA: ${JSON.stringify(error)}`);
  }
  return response.json();
}

async function getSessionStatus(sessionId: string) {
  const response = await fetchWithAuth(`/api/admin/pago/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.statusText}`);
  }
  return response.json();
}

async function monitorSession(sessionId: string, maxWaitMs: number = 300000) {
  const startTime = Date.now();
  let lastProgress = -1;

  while (Date.now() - startTime < maxWaitMs) {
    const session = await getSessionStatus(sessionId);

    if (session.progress !== lastProgress) {
      console.log(`[${new Date().toISOString()}] Progress: ${session.progress}% - ${session.progressMessage || session.message}`);
      lastProgress = session.progress;
    }

    // Estados finales
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'AWAITING_ADMIN_INPUT'].includes(session.status)) {
      console.log(`\n✅ Session reached final state: ${session.status}`);
      return session;
    }

    await sleep(2000);
  }

  throw new Error('Session monitoring timeout');
}

async function main() {
  console.log('🚀 Simulando flujo de pago desde Centro de Pagos ULE\n');

  try {
    // 1. Obtener planillas pendientes
    console.log('📋 Obteniendo planillas pendientes...');
    const { planillas, total, totalMonto } = await getPlanillasPendientes();

    console.log(`   Encontradas: ${total} planillas`);
    console.log(`   Monto total: $${totalMonto.toLocaleString()}\n`);

    if (planillas.length === 0) {
      console.log('❌ No hay planillas pendientes de pago');
      return;
    }

    // Mostrar planillas disponibles
    console.log('📃 Planillas disponibles:');
    planillas.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ${p.numeroPlanilla}`);
      console.log(`      Usuario: ${p.enlaceUser.nombre} (${p.enlaceUser.numeroDocumento})`);
      console.log(`      Periodo: ${p.periodo}`);
      console.log(`      Valor: $${p.total.toLocaleString()}`);
      console.log(`      Vence: ${p.fechaLimite} (${p.urgencia})`);
      console.log(`      ID: ${p.id}\n`);
    });

    // 2. Seleccionar la primera planilla (o la que el usuario especifique)
    const planilla = planillas[0];
    console.log(`🎯 Seleccionando planilla: ${planilla.numeroPlanilla}\n`);

    // 3. Iniciar el RPA (equivalente a click en "Iniciar" en ULE)
    console.log('🤖 Iniciando RPA de pago...');
    const result = await iniciarPagoRPA(planilla.id);

    console.log(`   Session ID: ${result.sessionId}`);
    console.log(`   Mensaje: ${result.message}`);
    console.log(`   Tiempo estimado: ${result.estimatedTimeToBank}\n`);

    // 4. Monitorear progreso
    console.log('📊 Monitoreando progreso del RPA...\n');
    const finalSession = await monitorSession(result.sessionId);

    // 5. Mostrar resultado final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESULTADO FINAL:');
    console.log('='.repeat(60));
    console.log(`   Status: ${finalSession.status}`);
    console.log(`   Progreso: ${finalSession.progress}%`);
    console.log(`   Mensaje: ${finalSession.progressMessage || finalSession.message}`);

    if (finalSession.lastScreenshot) {
      console.log(`   Último Screenshot: ${finalSession.lastScreenshot}`);
    }

    if (finalSession.status === 'AWAITING_ADMIN_INPUT') {
      console.log('\n🏦 El RPA llegó a Bancolombia.');
      console.log('   El admin debe completar el pago manualmente en el navegador.');
      console.log('   Luego llamar POST /api/admin/pago/confirmar para verificar el resultado.');

      if (finalSession.timeoutAt) {
        const timeoutIn = Math.round((new Date(finalSession.timeoutAt).getTime() - Date.now()) / 1000 / 60);
        console.log(`\n⏱️ Tiempo restante: ${timeoutIn} minutos`);
      }
    }

    if (finalSession.error) {
      console.log(`\n❌ Error: ${finalSession.error}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
main();
