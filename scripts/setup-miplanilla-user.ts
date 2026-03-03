/**
 * Setup Mi Planilla User
 *
 * Configura un usuario de prueba con credenciales de Mi Planilla
 */

import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

// Credenciales Mi Planilla
const MIPLANILLA_CREDENTIALS = {
  documento: '1047484978',
  password: 'Ulecolombia123',
};

async function main() {
  console.log('='.repeat(50));
  console.log('SETUP: Mi Planilla User');
  console.log('='.repeat(50));

  try {
    // Buscar usuario existente
    let user = await prisma.enlaceUser.findFirst({
      where: { numeroDocumento: MIPLANILLA_CREDENTIALS.documento },
    });

    if (!user) {
      // Crear usuario si no existe
      console.log('\nCreando usuario de prueba...');
      user = await prisma.enlaceUser.create({
        data: {
          tipoDocumento: 'CC',
          numeroDocumento: MIPLANILLA_CREDENTIALS.documento,
          nombre: 'Usuario ULE Test',
          uleUserId: 'ule-test-' + Date.now(),
        },
      });
      console.log('✅ Usuario creado');
    } else {
      console.log(`\n✅ Usuario existente: ${user.nombre}`);
    }

    // Encriptar password
    console.log('\nEncriptando contraseña Mi Planilla...');
    const { encrypted, iv } = await encryptPassword(MIPLANILLA_CREDENTIALS.password);

    // Actualizar usuario con credenciales Mi Planilla
    await prisma.enlaceUser.update({
      where: { id: user.id },
      data: {
        miplanillaPassword: encrypted,
        miplanillaPasswordIV: iv,
        operador: 'MI_PLANILLA',
      },
    });

    console.log('✅ Credenciales Mi Planilla configuradas');
    console.log(`   Usuario: CC${MIPLANILLA_CREDENTIALS.documento}`);
    console.log(`   Password: ${'*'.repeat(MIPLANILLA_CREDENTIALS.password.length)}`);

    // Verificar si tiene planilla
    const planilla = await prisma.pilaPlanilla.findFirst({
      where: { enlaceUserId: user.id },
    });

    if (planilla) {
      console.log(`\n✅ Planilla encontrada: ${planilla.numeroPlanilla}`);
    } else {
      console.log('\n⚠️  No tiene planilla. Creando planilla de prueba...');

      await prisma.pilaPlanilla.create({
        data: {
          uleUserId: user.uleUserId,
          enlaceUserId: user.id,
          taskId: 'task-test-' + Date.now(),
          paymentId: 'payment-test-' + Date.now(),
          numeroPlanilla: 'TEST-' + Date.now(),
          periodo: '2026-02',
          ingresoBase: 1600000,
          ibc: 1600000,
          salud: 64000,
          pension: 64000,
          arl: 8352,
          total: 136352,
          estadoPago: 'PENDIENTE',
          fechaLiquidacion: new Date(),
          fechaLimite: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      console.log('✅ Planilla de prueba creada');
    }

    console.log('\n' + '='.repeat(50));
    console.log('LISTO - Ahora puedes ejecutar:');
    console.log('npx tsx scripts/test-miplanilla-pago-admin.ts');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
