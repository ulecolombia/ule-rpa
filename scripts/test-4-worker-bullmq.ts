/**
 * TEST 4: Worker BullMQ
 *
 * Este test verifica que el sistema de colas BullMQ funciona correctamente.
 * NO usa Puppeteer - solo verifica la infraestructura de jobs.
 *
 * Pasos:
 * 1. Verificar conexión a Redis
 * 2. Verificar que la cola existe
 * 3. Agregar un job de prueba (tipo TEST, no real)
 * 4. Verificar que el job se agregó
 * 5. Verificar estado de la cola
 * 6. Limpiar job de prueba
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  console.log('║     TEST 4: WORKER BULLMQ                                  ║');
  console.log('║     Infraestructura de Colas                               ║');
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

    // Test de ping
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
    // PASO 2: Verificar cola BullMQ
    // ========================================
    console.log('📋 PASO 2: Verificar Cola BullMQ');
    console.log('   Conectando a cola "ule-rpa-tasks"...');

    queue = new Queue('ule-rpa-tasks', {
      connection: redis,
    });

    // Verificar estado de la cola
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
    // PASO 3: Agregar job de prueba
    // ========================================
    console.log('📋 PASO 3: Agregar Job de Prueba');
    console.log('   Agregando job tipo TEST (no se ejecutará)...');

    const testJobId = `test-job-${Date.now()}`;
    testJob = await queue.add(
      'test-infrastructure',
      {
        type: 'TEST',
        uleUserId: 'test-user-infrastructure',
        timestamp: new Date().toISOString(),
        description: 'Job de prueba para verificar infraestructura',
      },
      {
        jobId: testJobId,
        removeOnComplete: true,
        removeOnFail: true,
        // No procesable - solo para verificar que se puede agregar
        delay: 999999999, // 11+ días - nunca se ejecutará
      }
    );

    resultados.push({
      paso: 'Agregar Job Test',
      exitoso: true,
      detalle: `Job ID: ${testJob.id}`,
      datos: {
        jobId: testJob.id,
        name: testJob.name,
        delay: 999999999,
      },
    });

    console.log(`   ✅ Job de prueba agregado`);
    console.log(`      ID: ${testJob.id}`);
    console.log(`      Nombre: ${testJob.name}`);
    console.log('');

    // ========================================
    // PASO 4: Verificar que el job existe
    // ========================================
    console.log('📋 PASO 4: Verificar Job Existe');
    console.log('   Buscando job en la cola...');

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

    resultados.push({
      paso: 'Verificar Job',
      exitoso: true,
      detalle: `Estado: ${jobState}`,
      datos: {
        id: retrievedJob.id,
        state: jobState,
        data: retrievedJob.data,
      },
    });

    console.log(`   ✅ Job encontrado`);
    console.log(`      Estado: ${jobState}`);
    console.log(`      Tipo: ${retrievedJob.data.type}`);
    console.log('');

    // ========================================
    // PASO 5: Verificar estado actualizado de cola
    // ========================================
    console.log('📋 PASO 5: Estado de Cola');
    console.log('   Verificando contadores actualizados...');

    const newJobCounts = await queue.getJobCounts();
    const delayedIncrease = newJobCounts.delayed - (jobCounts.delayed || 0);

    resultados.push({
      paso: 'Estado Cola',
      exitoso: delayedIncrease >= 1,
      detalle: `Delayed: +${delayedIncrease}`,
      datos: newJobCounts,
    });

    console.log(`   ✅ Cola actualizada`);
    console.log(`      Delayed: ${newJobCounts.delayed} (+${delayedIncrease})`);
    console.log('');

    // ========================================
    // PASO 6: Limpiar job de prueba
    // ========================================
    console.log('📋 PASO 6: Limpiar Job de Prueba');
    console.log('   Eliminando job de prueba...');

    await retrievedJob.remove();

    // Verificar que se eliminó
    const deletedJob = await queue.getJob(testJobId);

    if (deletedJob) {
      resultados.push({
        paso: 'Limpiar Job',
        exitoso: false,
        detalle: 'Job no se eliminó',
      });
    } else {
      resultados.push({
        paso: 'Limpiar Job',
        exitoso: true,
        detalle: 'Job eliminado correctamente',
      });
      console.log('   ✅ Job de prueba eliminado');
    }
    console.log('');

    // ========================================
    // PASO 7: Verificar Dead Letter Queue
    // ========================================
    console.log('📋 PASO 7: Dead Letter Queue');
    console.log('   Verificando cola de errores...');

    const dlq = new Queue('ule-rpa-dead-letter', { connection: redis });
    const dlqCounts = await dlq.getJobCounts();

    resultados.push({
      paso: 'Dead Letter Queue',
      exitoso: true,
      detalle: `${dlqCounts.waiting + dlqCounts.failed} jobs`,
      datos: dlqCounts,
    });

    console.log(`   ✅ Dead Letter Queue accesible`);
    console.log(`      Jobs en DLQ: ${dlqCounts.waiting + dlqCounts.failed}`);
    console.log('');

    await dlq.close();

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
      console.log('✅ TEST EXITOSO');
      console.log('');
      console.log('La infraestructura BullMQ está funcionando correctamente:');
      console.log('- Redis conectado y respondiendo');
      console.log('- Cola de tareas accesible');
      console.log('- Jobs se pueden agregar y eliminar');
      console.log('- Dead Letter Queue disponible');
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
      detalle: errorMsg,
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
