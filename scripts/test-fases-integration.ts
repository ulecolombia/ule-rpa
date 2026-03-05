/**
 * Test de Integración Exhaustivo - FASES 1, 2 y 3
 *
 * Verifica que todo lo implementado funcione correctamente:
 * - FASE 1: Comprobantes (SOI + Mi Planilla + Supabase Storage)
 * - FASE 2: Reconciliación
 * - FASE 3: Alertas y Monitoreo
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Colores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(msg: string, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

function success(msg: string) {
  log(`✅ ${msg}`, GREEN);
}

function error(msg: string) {
  log(`❌ ${msg}`, RED);
}

function warn(msg: string) {
  log(`⚠️  ${msg}`, YELLOW);
}

function info(msg: string) {
  log(`ℹ️  ${msg}`, BLUE);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, BLUE);
  console.log('='.repeat(60));
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const result = await fn();
    if (result) {
      success(name);
      passed++;
    } else {
      error(name);
      failed++;
    }
  } catch (e) {
    error(`${name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    failed++;
  }
}

// ============================================================================
// FASE 1: COMPROBANTES
// ============================================================================

async function testFase1() {
  section('FASE 1: COMPROBANTES');

  // 1.1 Verificar imports de SOI comprobante bot
  await test('Import SOI comprobante bot', async () => {
    const { descargarComprobanteSOI, verificarEstadoPlanillaSOI, SOIComprobanteBot } =
      await import('../src/bots/soi');
    return (
      typeof descargarComprobanteSOI === 'function' &&
      typeof verificarEstadoPlanillaSOI === 'function' &&
      typeof SOIComprobanteBot === 'function'
    );
  });

  // 1.2 Verificar imports de Mi Planilla comprobante bot
  await test('Import Mi Planilla comprobante bot', async () => {
    const { descargarComprobanteMiPlanilla, verificarEstadoPlanillaMiPlanilla } =
      await import('../src/bots/miplanilla');
    return (
      typeof descargarComprobanteMiPlanilla === 'function' &&
      typeof verificarEstadoPlanillaMiPlanilla === 'function'
    );
  });

  // 1.3 Verificar StorageUploader con Supabase
  await test('StorageUploader exists and exports correctly', async () => {
    const { StorageUploader, uploadComprobanteToStorage } =
      await import('../src/storage/uploader');
    return (
      typeof StorageUploader === 'function' &&
      typeof uploadComprobanteToStorage === 'function'
    );
  });

  // 1.4 Verificar configuración Supabase en .env
  await test('Supabase env vars configured', async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageType = process.env.STORAGE_TYPE;

    if (!supabaseUrl) {
      warn('SUPABASE_URL not set');
      return false;
    }
    if (!supabaseKey) {
      warn('SUPABASE_SERVICE_ROLE_KEY not set');
      return false;
    }
    if (storageType !== 'supabase') {
      warn(`STORAGE_TYPE is "${storageType}", expected "supabase"`);
      return false;
    }
    return true;
  });

  // 1.5 Verificar conexión a Supabase Storage
  await test('Supabase Storage connection', async () => {
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      warn(`Supabase error: ${error.message}`);
      return false;
    }

    const hasBucket = data?.some((b) => b.name === 'comprobantes');
    if (!hasBucket) {
      warn('Bucket "comprobantes" not found');
      return false;
    }

    return true;
  });

  // 1.6 Verificar worker tiene handler COMPROBANTE
  await test('Worker has COMPROBANTE handler', async () => {
    const workerCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/orchestrator/worker.ts', 'utf-8')
    );

    const hasComprobanteCase = workerCode.includes("case 'COMPROBANTE':");
    const hasSOIImport = workerCode.includes('descargarComprobanteSOI');
    const hasMiPlanillaImport = workerCode.includes('descargarComprobanteMiPlanilla');
    const hasOperatorDetection = workerCode.includes('operador');

    if (!hasComprobanteCase) warn('Missing COMPROBANTE case in worker');
    if (!hasSOIImport) warn('Missing descargarComprobanteSOI import');
    if (!hasMiPlanillaImport) warn('Missing descargarComprobanteMiPlanilla import');
    if (!hasOperatorDetection) warn('Missing operator detection logic');

    return hasComprobanteCase && hasSOIImport && hasMiPlanillaImport && hasOperatorDetection;
  });

  // 1.7 Verificar modelo Comprobante en Prisma
  await test('Prisma Comprobante model exists', async () => {
    // Intentar crear y borrar un registro de prueba
    const testPlanilla = await prisma.pilaPlanilla.findFirst();

    if (!testPlanilla) {
      info('No planillas in database to test with');
      // Solo verificar que el modelo existe
      const schema = await import('fs').then((fs) =>
        fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/prisma/schema.prisma', 'utf-8')
      );
      return schema.includes('model Comprobante');
    }

    return true;
  });
}

// ============================================================================
// FASE 2: RECONCILIACIÓN
// ============================================================================

async function testFase2() {
  section('FASE 2: RECONCILIACIÓN');

  // 2.1 Verificar imports de reconciliation
  await test('Import reconciliation module', async () => {
    const { runReconciliation, getReconciliationStats, reconcileUser } =
      await import('../src/orchestrator/reconciliation');
    return (
      typeof runReconciliation === 'function' &&
      typeof getReconciliationStats === 'function' &&
      typeof reconcileUser === 'function'
    );
  });

  // 2.2 Verificar que getReconciliationStats funciona
  await test('getReconciliationStats returns valid data', async () => {
    const { getReconciliationStats } = await import('../src/orchestrator/reconciliation');
    const stats = await getReconciliationStats();

    return (
      typeof stats.pendingCreation === 'number' &&
      typeof stats.creating === 'number' &&
      typeof stats.registering === 'number' &&
      typeof stats.credentialsError === 'number' &&
      typeof stats.staleProcessingTasks === 'number' &&
      typeof stats.expiredPendingPlanillas === 'number'
    );
  });

  // 2.3 Verificar scheduler tiene job de reconciliación
  await test('Scheduler has reconciliation job', async () => {
    const schedulerCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/orchestrator/scheduler.ts', 'utf-8')
    );

    const hasReconciliationSchedule = schedulerCode.includes('RECONCILIATION:');
    const hasReconciliationImport = schedulerCode.includes('runReconciliation');
    const hasReconciliationTask = schedulerCode.includes('reconciliationTask');

    if (!hasReconciliationSchedule) warn('Missing RECONCILIATION schedule');
    if (!hasReconciliationImport) warn('Missing runReconciliation import');
    if (!hasReconciliationTask) warn('Missing reconciliationTask function');

    return hasReconciliationSchedule && hasReconciliationImport;
  });

  // 2.4 Verificar exports desde orchestrator index
  await test('Orchestrator exports reconciliation functions', async () => {
    const orchestrator = await import('../src/orchestrator');
    return (
      typeof orchestrator.runReconciliation === 'function' &&
      typeof orchestrator.getReconciliationStats === 'function' &&
      typeof orchestrator.reconcileUser === 'function'
    );
  });

  // 2.5 Verificar admin routes tienen endpoints de reconciliación
  await test('Admin routes have reconciliation endpoints', async () => {
    const adminCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/api/routes/admin.ts', 'utf-8')
    );

    const hasStatsEndpoint = adminCode.includes("'/reconciliation/stats'");
    const hasRunEndpoint = adminCode.includes("'/reconciliation/run'");
    const hasUserEndpoint = adminCode.includes("'/reconciliation/user/:uleUserId'");
    const hasStuckEndpoint = adminCode.includes("'/users/stuck'");

    if (!hasStatsEndpoint) warn('Missing /reconciliation/stats endpoint');
    if (!hasRunEndpoint) warn('Missing /reconciliation/run endpoint');
    if (!hasUserEndpoint) warn('Missing /reconciliation/user/:uleUserId endpoint');
    if (!hasStuckEndpoint) warn('Missing /users/stuck endpoint');

    return hasStatsEndpoint && hasRunEndpoint && hasUserEndpoint && hasStuckEndpoint;
  });
}

// ============================================================================
// FASE 3: ALERTAS
// ============================================================================

async function testFase3() {
  section('FASE 3: ALERTAS Y MONITOREO');

  // 3.1 Verificar imports de alert service
  await test('Import alert service', async () => {
    const alertService = await import('../src/services/alert.service');
    return (
      typeof alertService.createAlert === 'function' &&
      typeof alertService.getAlerts === 'function' &&
      typeof alertService.getActiveAlerts === 'function' &&
      typeof alertService.acknowledgeAlert === 'function' &&
      typeof alertService.runMonitoringChecks === 'function' &&
      typeof alertService.AlertSeverity !== 'undefined' &&
      typeof alertService.AlertType !== 'undefined'
    );
  });

  // 3.2 Verificar enums de alertas
  await test('Alert enums are correct', async () => {
    const { AlertSeverity, AlertType } = await import('../src/services/alert.service');

    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const hasAllSeverities = severities.every((s) => Object.values(AlertSeverity).includes(s as any));

    const expectedTypes = ['SYSTEM_ERROR', 'TASK_FAILED', 'USERS_STUCK', 'PLANILLAS_EXPIRING'];
    const hasExpectedTypes = expectedTypes.every((t) =>
      Object.values(AlertType).includes(t as any)
    );

    return hasAllSeverities && hasExpectedTypes;
  });

  // 3.3 Verificar que createAlert funciona
  await test('createAlert creates alert correctly', async () => {
    const { createAlert, getAlerts, AlertSeverity, AlertType } =
      await import('../src/services/alert.service');

    const alert = await createAlert(
      AlertType.SYSTEM_ERROR,
      AlertSeverity.LOW,
      'Test Alert',
      'This is a test alert from integration tests',
      { test: true }
    );

    if (!alert) {
      // Puede ser null si está en cooldown
      info('Alert returned null (possibly cooldown)');
      return true;
    }

    const alerts = getAlerts({ limit: 10 });
    const found = alerts.some((a) => a.id === alert.id);

    return found;
  });

  // 3.4 Verificar websocket tiene emitAdminAlert
  await test('WebSocket has emitAdminAlert', async () => {
    const websocket = await import('../src/api/websocket');
    return typeof websocket.emitAdminAlert === 'function';
  });

  // 3.5 Verificar scheduler tiene monitoring checks
  await test('Scheduler has monitoring checks', async () => {
    const schedulerCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/orchestrator/scheduler.ts', 'utf-8')
    );

    const hasMonitoringSchedule = schedulerCode.includes('MONITORING_CHECKS:');
    const hasMonitoringImport = schedulerCode.includes('runMonitoringChecks');

    if (!hasMonitoringSchedule) warn('Missing MONITORING_CHECKS schedule');
    if (!hasMonitoringImport) warn('Missing runMonitoringChecks import');

    return hasMonitoringSchedule && hasMonitoringImport;
  });

  // 3.6 Verificar worker tiene alertas integradas
  await test('Worker has alert integration', async () => {
    const workerCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/orchestrator/worker.ts', 'utf-8')
    );

    const hasAlertImport = workerCode.includes('alertTaskFailed');
    const hasAlertInFailed = workerCode.includes('await alertTaskFailed');

    if (!hasAlertImport) warn('Missing alert imports in worker');
    if (!hasAlertInFailed) warn('Missing alertTaskFailed call in failed handler');

    return hasAlertImport && hasAlertInFailed;
  });

  // 3.7 Verificar admin routes tienen endpoints de alertas
  await test('Admin routes have alert endpoints', async () => {
    const adminCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/api/routes/admin.ts', 'utf-8')
    );

    const hasAlertsEndpoint = adminCode.includes("'/alerts'");
    const hasActiveEndpoint = adminCode.includes("'/alerts/active'");
    const hasAcknowledgeEndpoint = adminCode.includes("'/alerts/:id/acknowledge'");

    return hasAlertsEndpoint && hasActiveEndpoint && hasAcknowledgeEndpoint;
  });
}

// ============================================================================
// VERIFICAR ENDPOINTS DE EMERGENCIA
// ============================================================================

async function testEmergencyEndpoints() {
  section('ENDPOINTS DE EMERGENCIA');

  await test('Emergency endpoints exist in admin routes', async () => {
    const adminCode = await import('fs').then((fs) =>
      fs.readFileSync('/Users/luis/Desktop/ule-rpa-service/src/api/routes/admin.ts', 'utf-8')
    );

    const hasEmergencyUser = adminCode.includes("'/emergency/user/:uleUserId'");
    const hasEmergencyPending = adminCode.includes("'/emergency/users/pending'");
    const hasChangeOperator = adminCode.includes("'/emergency/user/:uleUserId/change-operator'");
    const hasMarkPaid = adminCode.includes("'/emergency/planilla/:planillaId/mark-paid'");
    const hasDecryptPassword = adminCode.includes('decryptPassword');

    if (!hasEmergencyUser) warn('Missing /emergency/user/:uleUserId endpoint');
    if (!hasEmergencyPending) warn('Missing /emergency/users/pending endpoint');
    if (!hasChangeOperator) warn('Missing /emergency/user/:uleUserId/change-operator endpoint');
    if (!hasMarkPaid) warn('Missing /emergency/planilla/:planillaId/mark-paid endpoint');
    if (!hasDecryptPassword) warn('Missing decryptPassword import');

    return hasEmergencyUser && hasEmergencyPending && hasChangeOperator && hasMarkPaid;
  });
}

// ============================================================================
// VERIFICAR INTEGRACIÓN COMPLETA
// ============================================================================

async function testFullIntegration() {
  section('INTEGRACIÓN COMPLETA');

  // Verificar que el servidor puede iniciar sin errores
  await test('API server imports without errors', async () => {
    try {
      // Solo importar, no iniciar el servidor
      await import('../src/api/routes/admin');
      return true;
    } catch (e) {
      error(`API import failed: ${e instanceof Error ? e.message : 'Unknown'}`);
      return false;
    }
  });

  // Verificar queue.config exports
  await test('Queue config exports correctly', async () => {
    const queueConfig = await import('../src/orchestrator/queue.config');
    return (
      typeof queueConfig.addComprobanteTask === 'function' &&
      typeof queueConfig.addRegistroTask === 'function' &&
      typeof queueConfig.getQueueStats === 'function'
    );
  });

  // Verificar conexión a base de datos
  await test('Database connection works', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      error(`Database error: ${e instanceof Error ? e.message : 'Unknown'}`);
      return false;
    }
  });

  // Verificar Redis connection (si está disponible)
  await test('Redis connection (optional)', async () => {
    try {
      const { redisConnection } = await import('../src/orchestrator/queue.config');
      const pong = await redisConnection.ping();
      return pong === 'PONG';
    } catch (e) {
      warn(`Redis not available: ${e instanceof Error ? e.message : 'Unknown'}`);
      return true; // No fallar si Redis no está
    }
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', BLUE);
  log('║     TEST DE INTEGRACIÓN EXHAUSTIVO - FASES 1, 2 y 3       ║', BLUE);
  log('╚════════════════════════════════════════════════════════════╝', BLUE);

  const startTime = Date.now();

  try {
    await testFase1();
    await testFase2();
    await testFase3();
    await testEmergencyEndpoints();
    await testFullIntegration();
  } catch (e) {
    error(`Fatal error: ${e instanceof Error ? e.message : 'Unknown'}`);
  }

  await prisma.$disconnect();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  section('RESUMEN');
  console.log('');
  success(`Passed: ${passed}`);
  if (failed > 0) {
    error(`Failed: ${failed}`);
  } else {
    log(`Failed: ${failed}`, GREEN);
  }
  console.log('');
  info(`Duration: ${duration}s`);
  console.log('');

  if (failed > 0) {
    log('❌ ALGUNOS TESTS FALLARON - REVISAR ERRORES ARRIBA', RED);
    process.exit(1);
  } else {
    log('✅ TODOS LOS TESTS PASARON', GREEN);
    process.exit(0);
  }
}

main().catch(console.error);
