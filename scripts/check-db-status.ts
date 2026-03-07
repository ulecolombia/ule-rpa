/**
 * Quick script to check database status
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DATABASE STATUS ===\n');

  // Check users (EnlaceUser)
  const users = await prisma.enlaceUser.findMany({
    select: {
      id: true,
      uleUserId: true,
      numeroDocumento: true,
      nombre: true,
      operador: true,
      soiAccountStatus: true,
    },
  });
  console.log(`Users (EnlaceUser): ${users.length}`);
  users.forEach(u => {
    console.log(`  - ${u.numeroDocumento} | ${u.nombre} | ${u.operador} | ${u.soiAccountStatus}`);
  });

  // Check planillas
  const planillas = await prisma.pilaPlanilla.findMany({
    select: {
      id: true,
      numeroPlanilla: true,
      periodo: true,
      estadoPago: true,
      total: true,
    },
  });
  console.log(`\nPlanillas (PilaPlanilla): ${planillas.length}`);
  planillas.forEach(p => {
    console.log(`  - ${p.numeroPlanilla} | ${p.periodo} | ${p.estadoPago} | $${p.total}`);
  });

  // Check tasks
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`\nRecent Tasks: ${tasks.length}`);
  tasks.forEach(t => {
    console.log(`  - ${t.type} | ${t.status} | ${t.createdAt.toISOString()}`);
  });

  // Check comprobantes
  const comprobantes = await prisma.comprobante.findMany({
    select: {
      id: true,
      fileName: true,
      createdAt: true,
    },
  });
  console.log(`\nComprobantes: ${comprobantes.length}`);

  // Check pago admin sessions
  const pagoSessions = await prisma.pagoAdminSession.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
    take: 5,
  });
  console.log(`\nPago Admin Sessions: ${pagoSessions.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
