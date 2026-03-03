/**
 * Test: Mi Planilla Pago Admin-Controlled Bot
 *
 * Prueba el flujo completo de pago hasta Bancolombia Negocios:
 * 1. Login en Mi Planilla
 * 2. Navegar a planillas pendientes
 * 3. Click "Paga aquí"
 * 4. Seleccionar PSE + Bancolombia
 * 5. Manejar ventana PSE
 * 6. Llenar formulario PSE (NIT + Email)
 * 7. Ir al banco
 * 8. Seleccionar Bancolombia Negocios
 * 9. Llenar usuario (Lbrochet01)
 * 10. STOP - Admin toma control
 *
 * Uso: npx tsx scripts/test-miplanilla-pago-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { ejecutarPagoMiPlanillaHastaBancolombia } from '../src/bots/miplanilla/pago-admin-controlled.bot';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('TEST: Mi Planilla Pago Admin-Controlled Bot');
  console.log('='.repeat(60));

  try {
    // Buscar usuario con credenciales de Mi Planilla
    const user = await prisma.enlaceUser.findFirst({
      where: {
        miplanillaPassword: { not: null },
        miplanillaPasswordIV: { not: null },
      },
      include: {
        planillas: {
          where: {
            estadoPago: 'PENDIENTE', // Planillas listas para pagar
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!user) {
      console.log('❌ No se encontró usuario con credenciales de Mi Planilla');
      console.log('\nPara configurar un usuario de prueba:');
      console.log('1. Agregar miplanillaPassword y miplanillaPasswordIV en la DB');
      console.log('2. O usar el script scripts/setup-real-user.ts');
      return;
    }

    console.log(`\n✅ Usuario encontrado: ${user.nombre}`);
    console.log(`   Documento: ${user.tipoDocumento}${user.numeroDocumento}`);

    // Buscar planilla para pagar
    let planillaId: string;

    if (user.planillas.length > 0) {
      const planilla = user.planillas[0];
      planillaId = planilla.id;
      console.log(`\n✅ Planilla encontrada: ${planilla.numeroPlanilla}`);
      console.log(`   Periodo: ${planilla.periodo}`);
      console.log(`   Valor: $${planilla.valorTotal?.toLocaleString() || 'N/A'}`);
    } else {
      // Buscar cualquier planilla del usuario
      const anyPlanilla = await prisma.pilaPlanilla.findFirst({
        where: { enlaceUserId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!anyPlanilla) {
        console.log('❌ No se encontró ninguna planilla para este usuario');
        console.log('\nPara crear una planilla de prueba:');
        console.log('1. Ejecutar scripts/test-miplanilla-liquidacion-dry-run.ts');
        console.log('2. O agregar una planilla manualmente en la DB');
        return;
      }

      planillaId = anyPlanilla.id;
      console.log(`\n⚠️  Usando planilla (status: ${anyPlanilla.status}): ${anyPlanilla.numeroPlanilla}`);
    }

    // Generar sessionId
    const sessionId = `test-pago-admin-${uuidv4().slice(0, 8)}`;
    console.log(`\n🔑 Session ID: ${sessionId}`);

    console.log('\n' + '='.repeat(60));
    console.log('INICIANDO BOT DE PAGO ADMIN-CONTROLLED');
    console.log('='.repeat(60));
    console.log('\n⚠️  El navegador se abrirá en modo visible');
    console.log('⚠️  El bot se detendrá en el login de Bancolombia');
    console.log('⚠️  El admin debe ingresar la contraseña manualmente\n');

    // Ejecutar bot
    const result = await ejecutarPagoMiPlanillaHastaBancolombia({
      sessionId,
      planillaId,
      enlaceUserId: user.id,
    });

    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('\n✅ Bot ejecutado exitosamente');
      console.log(`   Llegó al banco: ${result.reachedBank ? 'Sí' : 'No'}`);
      if (result.screenshotUrl) {
        console.log(`   Screenshot: ${result.screenshotUrl}`);
      }
      console.log('\n🎯 El navegador está esperando que el admin ingrese la contraseña');
      console.log('   Usuario ya llenado: Lbrochet01');
    } else {
      console.log('\n❌ Bot falló');
      console.log(`   Error: ${result.error}`);
      if (result.errorAt) {
        console.log(`   Falló en: ${result.errorAt}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
