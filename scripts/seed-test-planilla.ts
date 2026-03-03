/**
 * Script para crear datos de prueba para testing del flujo de pago
 *
 * Crea:
 * 1. Usuario de prueba (EnlaceUser)
 * 2. Planilla pendiente de pago (PilaPlanilla)
 *
 * Uso: npx tsx scripts/seed-test-planilla.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestData() {
  console.log('🌱 Creando datos de prueba para Centro de Pagos...\n');

  // 1. Crear usuario de prueba
  const testUser = await prisma.enlaceUser.upsert({
    where: { uleUserId: 'test-user-001' },
    update: {},
    create: {
      uleUserId: 'test-user-001',
      tipoDocumento: 'CC',
      numeroDocumento: '1234567890',
      nombre: 'Usuario',
      apellidos: 'De Prueba',
      email: 'test@ule.com.co',
      telefono: '3001234567',
      departamento: 'Antioquia',
      municipio: 'Medellín',
      enlaceStatus: 'REGISTERED',
      soiAccountStatus: 'ACTIVE',
    },
  });

  console.log('✅ Usuario de prueba creado:');
  console.log(`   ID: ${testUser.id}`);
  console.log(`   uleUserId: ${testUser.uleUserId}`);
  console.log(`   Documento: ${testUser.tipoDocumento} ${testUser.numeroDocumento}`);
  console.log(`   Nombre: ${testUser.nombre} ${testUser.apellidos}\n`);

  // 2. Crear planilla pendiente de pago
  const periodoActual = new Date().toISOString().slice(0, 7); // "2026-02"
  const numeroPlanilla = `TEST-${Date.now()}`;

  // Fecha límite: fin del mes actual
  const fechaLimite = new Date();
  fechaLimite.setMonth(fechaLimite.getMonth() + 1);
  fechaLimite.setDate(0); // Último día del mes actual

  const planilla = await prisma.pilaPlanilla.create({
    data: {
      uleUserId: testUser.uleUserId,
      enlaceUserId: testUser.id,
      taskId: 'test-task-001',
      paymentId: 'test-payment-001',
      numeroPlanilla,
      periodo: periodoActual,
      ingresoBase: 1300000, // 1 SMLV
      ibc: 1300000,
      salud: 52000,    // 4%
      pension: 52000,  // 4%
      arl: 6760,       // 0.52%
      total: 110760,
      estadoPago: 'PENDIENTE',
      fechaLiquidacion: new Date(),
      fechaLimite,
    },
  });

  console.log('✅ Planilla de prueba creada:');
  console.log(`   ID: ${planilla.id}`);
  console.log(`   Número: ${planilla.numeroPlanilla}`);
  console.log(`   Periodo: ${planilla.periodo}`);
  console.log(`   Total: $${planilla.total.toLocaleString('es-CO')}`);
  console.log(`   Estado: ${planilla.estadoPago}`);
  console.log(`   Fecha límite: ${fechaLimite.toLocaleDateString('es-CO')}\n`);

  // 3. Crear una segunda planilla "urgente" (vence pronto)
  const fechaLimiteUrgente = new Date();
  fechaLimiteUrgente.setDate(fechaLimiteUrgente.getDate() + 2); // Vence en 2 días

  const planillaUrgente = await prisma.pilaPlanilla.create({
    data: {
      uleUserId: testUser.uleUserId,
      enlaceUserId: testUser.id,
      taskId: 'test-task-002',
      paymentId: 'test-payment-002',
      numeroPlanilla: `URGENTE-${Date.now()}`,
      periodo: periodoActual,
      ingresoBase: 2600000, // 2 SMLV
      ibc: 2600000,
      salud: 104000,
      pension: 104000,
      arl: 13520,
      total: 221520,
      estadoPago: 'PENDIENTE',
      fechaLiquidacion: new Date(),
      fechaLimite: fechaLimiteUrgente,
    },
  });

  console.log('✅ Planilla URGENTE creada:');
  console.log(`   ID: ${planillaUrgente.id}`);
  console.log(`   Número: ${planillaUrgente.numeroPlanilla}`);
  console.log(`   Total: $${planillaUrgente.total.toLocaleString('es-CO')}`);
  console.log(`   Fecha límite: ${fechaLimiteUrgente.toLocaleDateString('es-CO')} (¡URGENTE!)\n`);

  console.log('─'.repeat(50));
  console.log('📊 Resumen:');
  console.log(`   Usuarios creados: 1`);
  console.log(`   Planillas pendientes: 2`);
  console.log(`   Total a pagar: $${(planilla.total + planillaUrgente.total).toLocaleString('es-CO')}`);
  console.log('─'.repeat(50));
  console.log('\n🎉 Datos de prueba listos. Refresca el Centro de Pagos en ULE.');
}

async function cleanTestData() {
  console.log('🧹 Limpiando datos de prueba...\n');

  // Eliminar planillas de prueba
  const deletedPlanillas = await prisma.pilaPlanilla.deleteMany({
    where: {
      OR: [
        { numeroPlanilla: { startsWith: 'TEST-' } },
        { numeroPlanilla: { startsWith: 'URGENTE-' } },
      ],
    },
  });
  console.log(`   Planillas eliminadas: ${deletedPlanillas.count}`);

  // Eliminar usuario de prueba
  const deletedUsers = await prisma.enlaceUser.deleteMany({
    where: { uleUserId: 'test-user-001' },
  });
  console.log(`   Usuarios eliminados: ${deletedUsers.count}`);

  console.log('\n✅ Datos de prueba eliminados.');
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--clean')) {
    await cleanTestData();
  } else {
    await seedTestData();
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
