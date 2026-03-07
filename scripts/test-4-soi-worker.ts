/**
 * TEST 4-SOI: Worker BullMQ con Job SOI
 *
 * Este test verifica que el sistema de colas BullMQ puede procesar jobs SOI:
 *
 * 1. Verificar conexión a Redis
 * 2. Agregar un job de prueba tipo SOI_VERIFICAR_ESTADO
 * 3. Verificar que el job se agregó correctamente
 * 4. Limpiar job de prueba
 *
 * SEGURO: Este test solo verifica infraestructura, no ejecuta tareas RPA reales.
 */

import { Redis } from 'ioredis';
import { Queue, Job } from 'bullmq';
import { config } from '../src/utils/config';

interface TestResult {
  paso: string;
  exitoso: boolean;
  detalle: string;
  datos?: Record<string, unknown>;
}

async function runTest(): Promise<{
  success: boolean;
  resultados: TestResult[];
}> {
  const resultados: TestResult[] = [];
  let redis: Redis | null = null;
  let queue: Queue | null = null;
  let testJob: Job | null = null;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST 4-SOI: WORKER BULLMQ CON JOB SOI                  ║');
  console.log('║     Infraestructura de Colas para SOI                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('ℹ️  Este test verifica la infraestructura, NO ejecuta tareas RPA');
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

  try {
    // ========================================
    // PASO 1: Verificar conexión a Redis
    // ========================================
    console.log('📋 PASO 1: Conexión a Redis');
    console.log(`   Host: ${config.redis.host}:${config.redis.port}`);
    console.log('   Conectando...');

    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
    });

    const pingResult = await redis.ping();

    if (pingResult !== 'PONG') {
      resultados.push({
        paso: 'Conexión Redis',
        exitoso: false,
        detalle: `Ping falló: ${pingResult}`,
      });
      throw new Error('Redis ping failed');
    }

    resultados.push({
      paso: 'Conexión Redis',
      exitoso: true,
      detalle: 'PONG recibido',
    });
    console.log('   ✅ Redis conectado (PONG)');
    console.log('');

    // ========================================
    // PASO 2: Conectar a cola BullMQ
    // ========================================
    console.log('📋 PASO 2: Verificar Cola BullMQ');
    console.log('   Conectando a cola "ule-rpa-tasks"...');

    queue = new Queue('ule-rpa-tasks', {
      connection: redis,
    });

    const jobCounts = await queue.getJobCounts();

    resultados.push({
      paso: 'Cola BullMQ',
      exitoso: true,
      detalle: `Cola activa: ${jobCounts.waiting + jobCounts.active} jobs`,
      datos: jobCounts,
    });

    console.log('   ✅ Cola "ule-rpa-tasks" accesible');
    console.log(`      Esperando: ${jobCounts.waiting}`);
    console.log(`      Activos: ${jobCounts.active}`);
    console.log(`      Completados: ${jobCounts.completed}`);
    console.log(`      Fallidos: ${jobCounts.failed}`);
    console.log('');

    // ========================================
    // PASO 3: Agregar job SOI de prueba
    // ========================================
    console.log('📋 PASO 3: Agregar Job SOI de Prueba');
    console.log('   Agregando job tipo SOI_VERIFICAR_ESTADO...');

    const testJobId = `test-soi-job-${Date.now()}`;
    const soiJobData = {
      type: 'SOI_VERIFICAR_ESTADO',
      operator: 'SOI',
      uleUserId: 'test-user-soi',
      userData: {
        tipoDocumento: 'CC',
        numeroDocumento: '1018482146',
        nombre: 'Test User SOI',
      },
      pilaData: {
        periodo: '2026-02',
        ibc: 1423500,
        diasCotizados: 30,
      },
      timestamp: new Date().toISOString(),
      description: 'Job de prueba SOI para verificar infraestructura',
      isTest: true,
    };

    testJob = await queue.add(
      'soi-verificar-estado-test',
      soiJobData,
      {
        jobId: testJobId,
        removeOnComplete: true,
        removeOnFail: true,
        // Job con delay muy largo - nunca se ejecutará
        delay: 999999999,
      }
    );

    resultados.push({
      paso: 'Agregar Job SOI',
      exitoso: true,
      detalle: `Job ID: ${testJob.id}`,
      datos: {
        jobId: testJob.id,
        name: testJob.name,
        type: soiJobData.type,
        operator: soiJobData.operator,
      },
    });

    console.log('   ✅ Job SOI de prueba agregado');
    console.log(`      ID: ${testJob.id}`);
    console.log(`      Nombre: ${testJob.name}`);
    console.log(`      Tipo: ${soiJobData.type}`);
    console.log(`      Operador: ${soiJobData.operator}`);
    console.log('');

    // ========================================
    // PASO 4: Verificar estructura del job
    // ========================================
    console.log('📋 PASO 4: Verificar Estructura del Job');
    console.log('   Recuperando job de la cola...');

    const retrievedJob = await queue.getJob(testJobId);

    if (!retrievedJob) {
      resultados.push({
        paso: 'Verificar Job',
        exitoso: false,
        detalle: 'Job no encontrado',
      });
      throw new Error('Job not found after adding');
    }

    const jobState = await retrievedJob.getState();
    const jobData = retrievedJob.data;

    // Verificar que tiene los campos SOI correctos
    const hasCorrectFields =
      jobData.type === 'SOI_VERIFICAR_ESTADO' &&
      jobData.operator === 'SOI' &&
      jobData.userData?.tipoDocumento === 'CC' &&
      jobData.pilaData?.periodo === '2026-02';

    resultados.push({
      paso: 'Verificar Job',
      exitoso: hasCorrectFields,
      detalle: hasCorrectFields
        ? 'Estructura correcta'
        : 'Campos incorrectos',
      datos: {
        state: jobState,
        hasCorrectFields,
        type: jobData.type,
        operator: jobData.operator,
      },
    });

    console.log('   ✅ Job recuperado correctamente');
    console.log(`      Estado: ${jobState}`);
    console.log(`      Tipo: ${jobData.type}`);
    console.log(`      Operador: ${jobData.operator}`);
    console.log(`      Documento: ${jobData.userData?.tipoDocumento}${jobData.userData?.numeroDocumento}`);
    console.log(`      Periodo: ${jobData.pilaData?.periodo}`);
    console.log('');

    // ========================================
    // PASO 5: Verificar que SOI es diferente de Mi Planilla
    // ========================================
    console.log('📋 PASO 5: Verificar Separación de Operadores');

    // Agregar un job Mi Planilla para comparar
    const miplanillaJobId = `test-miplanilla-job-${Date.now()}`;
    const miplanillaJob = await queue.add(
      'miplanilla-test',
      {
        type: 'MIPLANILLA_VERIFICAR',
        operator: 'MI_PLANILLA',
        uleUserId: 'test-user-miplanilla',
        isTest: true,
      },
      {
        jobId: miplanillaJobId,
        removeOnComplete: true,
        removeOnFail: true,
        delay: 999999999,
      }
    );

    // Verificar que ambos jobs existen y tienen operadores diferentes
    const soiJobCheck = await queue.getJob(testJobId);
    const mpJobCheck = await queue.getJob(miplanillaJobId);

    const operatorsDistinct =
      soiJobCheck?.data.operator === 'SOI' &&
      mpJobCheck?.data.operator === 'MI_PLANILLA';

    resultados.push({
      paso: 'Separación Operadores',
      exitoso: operatorsDistinct,
      detalle: operatorsDistinct
        ? 'SOI y MI_PLANILLA diferenciados'
        : 'Error en diferenciación',
      datos: {
        soiOperator: soiJobCheck?.data.operator,
        mpOperator: mpJobCheck?.data.operator,
      },
    });

    console.log('   ✅ Operadores correctamente separados');
    console.log(`      Job SOI: operator=${soiJobCheck?.data.operator}`);
    console.log(`      Job Mi Planilla: operator=${mpJobCheck?.data.operator}`);
    console.log('');

    // Limpiar job Mi Planilla
    await miplanillaJob.remove();

    // ========================================
    // PASO 6: Limpiar job SOI de prueba
    // ========================================
    console.log('📋 PASO 6: Limpiar Jobs de Prueba');
    console.log('   Eliminando jobs de prueba...');

    await retrievedJob.remove();

    const deletedJob = await queue.getJob(testJobId);

    if (deletedJob) {
      resultados.push({
        paso: 'Limpiar Jobs',
        exitoso: false,
        detalle: 'Jobs no se eliminaron',
      });
    } else {
      resultados.push({
        paso: 'Limpiar Jobs',
        exitoso: true,
        detalle: 'Jobs eliminados correctamente',
      });
      console.log('   ✅ Jobs de prueba eliminados');
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
      console.log('✅ TEST 4-SOI EXITOSO');
      console.log('');
      console.log('La infraestructura BullMQ para SOI está funcionando:');
      console.log('- Redis conectado y respondiendo');
      console.log('- Cola de tareas accesible');
      console.log('- Jobs SOI se pueden agregar con estructura correcta');
      console.log('- Operadores SOI y MI_PLANILLA están diferenciados');
      console.log('- Jobs se pueden eliminar correctamente');
    } else {
      console.log('❌ TEST CON ERRORES');
    }

    // Cleanup
    console.log('');
    console.log('Cerrando conexiones...');
    await queue.close();
    await redis.quit();

    return { success: todosExitosos, resultados };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    resultados.push({
      paso: 'Error General',
      exitoso: false,
      detalle: errorMsg.slice(0, 40),
    });

    console.error('');
    console.error('❌ ERROR:', errorMsg);
    console.error('');

    // Cleanup
    if (testJob) {
      try {
        await testJob.remove();
      } catch { /* ignore */ }
    }
    if (queue) {
      try {
        await queue.close();
      } catch { /* ignore */ }
    }
    if (redis) {
      try {
        await redis.quit();
      } catch { /* ignore */ }
    }

    return { success: false, resultados };
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
