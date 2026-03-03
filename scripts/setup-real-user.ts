/**
 * Script para configurar usuario real con credenciales SOI
 * para hacer simulacro completo del flujo de pago
 *
 * Uso: npx tsx scripts/setup-real-user.ts
 */

import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

// Datos del usuario real para simulacro
const REAL_USER = {
  documento: '1018482146',
  password: 'Ulecolombia123*',
  nombre: 'Usuario Simulacro',
  uleUserId: 'simulacro-user-001',
};

async function setupRealUser() {
  console.log('🔧 Configurando usuario real para simulacro...\n');

  // Encriptar password
  const { encrypted, iv } = encryptPassword(REAL_USER.password);

  // Crear o actualizar usuario
  const user = await prisma.enlaceUser.upsert({
    where: { numeroDocumento: REAL_USER.documento },
    update: {
      soiPassword: encrypted,
      soiPasswordIV: iv,
      soiAccountStatus: 'ACTIVE',
      soiLinkedAt: new Date(),
    },
    create: {
      uleUserId: REAL_USER.uleUserId,
      tipoDocumento: 'CC',
      numeroDocumento: REAL_USER.documento,
      nombre: REAL_USER.nombre,
      departamento: 'Cundinamarca',
      municipio: 'Bogotá D.C.',
      enlaceStatus: 'REGISTERED',
      soiAccountStatus: 'ACTIVE',
      soiPassword: encrypted,
      soiPasswordIV: iv,
      soiLinkedAt: new Date(),
    },
  });

  console.log('✅ Usuario configurado:');
  console.log(`   ID: ${user.id}`);
  console.log(`   uleUserId: ${user.uleUserId}`);
  console.log(`   Documento: ${user.tipoDocumento} ${user.numeroDocumento}`);
  console.log(`   SOI Status: ${user.soiAccountStatus}`);
  console.log(`   Password encriptado: ${encrypted.substring(0, 20)}...`);
  console.log('');

  // Limpiar planillas de prueba anteriores
  const deletedPlanillas = await prisma.pilaPlanilla.deleteMany({
    where: {
      OR: [
        { numeroPlanilla: { startsWith: 'TEST-' } },
        { numeroPlanilla: { startsWith: 'URGENTE-' } },
        { numeroPlanilla: { startsWith: 'SIMULACRO-' } },
      ],
    },
  });
  console.log(`🧹 Planillas de prueba eliminadas: ${deletedPlanillas.count}`);

  // Crear planilla para simulacro
  // NOTA: Esta planilla es solo para que aparezca en el dashboard
  // El bot creará una planilla REAL en SOI
  const periodo = new Date().toISOString().slice(0, 7);
  const fechaLimite = new Date();
  fechaLimite.setMonth(fechaLimite.getMonth() + 1);
  fechaLimite.setDate(0);

  const planilla = await prisma.pilaPlanilla.create({
    data: {
      uleUserId: user.uleUserId,
      enlaceUserId: user.id,
      taskId: 'simulacro-task-001',
      paymentId: 'simulacro-payment-001',
      numeroPlanilla: `SIMULACRO-${Date.now()}`,
      periodo,
      ingresoBase: 1300000,
      ibc: 1300000,
      salud: 52000,
      pension: 52000,
      arl: 6760,
      total: 110760,
      estadoPago: 'PENDIENTE',
      fechaLiquidacion: new Date(),
      fechaLimite,
    },
  });

  console.log('');
  console.log('✅ Planilla para simulacro creada:');
  console.log(`   ID: ${planilla.id}`);
  console.log(`   Número: ${planilla.numeroPlanilla}`);
  console.log(`   Total: $${planilla.total.toLocaleString('es-CO')}`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('⚠️  IMPORTANTE:');
  console.log('   Este simulacro CREARÁ una planilla REAL en SOI');
  console.log('   Si completas el pago, se pagará dinero REAL (~$110,760 COP)');
  console.log('─'.repeat(60));
  console.log('');
  console.log('🎯 Próximo paso: Refresca ULE y haz clic en "Iniciar"');
}

async function main() {
  await setupRealUser();
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
