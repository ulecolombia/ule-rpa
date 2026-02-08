import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Limpiar datos existentes (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    await prisma.comprobante.deleteMany();
    await prisma.pilaPlanilla.deleteMany();
    await prisma.taskLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.enlaceUser.deleteMany();
    await prisma.botSession.deleteMany();
    console.log('Cleared existing data');
  }

  // Crear usuario de ejemplo
  const testUser = await prisma.enlaceUser.create({
    data: {
      uleUserId: 'test-ule-user-1',
      tipoDocumento: 'CC',
      numeroDocumento: '1234567890',
      nombre: 'Juan Pérez',
      enlaceStatus: 'PENDING',
      eps: 'SANITAS',
      pension: 'PORVENIR',
      arl: 'SURA',
    },
  });

  console.log('Created test user:', testUser);

  // Crear tarea de registro
  const registroTask = await prisma.task.create({
    data: {
      type: 'REGISTRO',
      status: 'PENDING',
      priority: 5,
      uleUserId: testUser.uleUserId,
      enlaceUserId: testUser.id,
      inputData: {
        tipoDocumento: testUser.tipoDocumento,
        numeroDocumento: testUser.numeroDocumento,
        nombre: testUser.nombre,
        eps: testUser.eps,
        pension: testUser.pension,
        arl: testUser.arl,
      },
    },
  });

  console.log('Created registro task:', registroTask);

  // Crear log de ejemplo
  await prisma.taskLog.create({
    data: {
      taskId: registroTask.id,
      level: 'INFO',
      message: 'Task created and queued',
      details: {
        queueName: 'rpa-tasks',
        priority: registroTask.priority,
      },
    },
  });

  // Crear segunda tarea de liquidación (simulando flujo completo)
  const liquidacionTask = await prisma.task.create({
    data: {
      type: 'LIQUIDACION',
      status: 'PENDING',
      priority: 3,
      uleUserId: testUser.uleUserId,
      enlaceUserId: testUser.id,
      paymentId: 'payment_test_123',
      inputData: {
        periodo: '2026-02',
        ingresoBase: 1300000,
        ibc: 1300000,
        salud: 52000,
        pension: 52000,
        arl: 6944,
        total: 110944,
      },
    },
  });

  console.log('Created liquidacion task:', liquidacionTask);

  // Crear sesión de bot de ejemplo
  const botSession = await prisma.botSession.create({
    data: {
      sessionType: 'enlace_admin',
      cookies: {
        sessionId: 'example_session_id',
        token: 'example_token',
      },
      localStorage: {
        userId: 'admin_user',
      },
      sessionData: {
        lastLogin: new Date().toISOString(),
        browser: 'chromium',
      },
      isValid: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
    },
  });

  console.log('Created bot session:', botSession);

  console.log('\nSeed completed successfully!');
  console.log('\nCreated:');
  console.log('- 1 EnlaceUser');
  console.log('- 2 Tasks (REGISTRO, LIQUIDACION)');
  console.log('- 1 TaskLog');
  console.log('- 1 BotSession');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
