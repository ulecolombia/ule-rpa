/**
 * Test: Flujo Completo Mi Planilla Admin-Controlled
 *
 * Prueba el flujo completo:
 * 1. Login en Mi Planilla
 * 2. Verificar si hay planilla pendiente
 * 3. Si NO hay → Generar nueva planilla
 * 4. Pagar (PSE → Bancolombia)
 * 5. STOP - Admin ingresa contraseña manualmente
 *
 * Uso: npx tsx scripts/test-flujo-completo-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { ejecutarFlujoCompletoMiPlanilla } from '../src/bots/miplanilla/flujo-completo-admin.bot';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(70));
  console.log('TEST: Flujo Completo Mi Planilla Admin-Controlled');
  console.log('='.repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│  1. Login en Mi Planilla                                    │
│                ↓                                            │
│  2. ¿Hay planilla pendiente de pago?                        │
│        │                                                    │
│        ├── SÍ ──→ 4. Pagar (PSE → Bancolombia)             │
│        │                                                    │
│        └── NO ──→ 3. Generar + Liquidar planilla           │
│                           ↓                                 │
│                   4. Pagar (PSE → Bancolombia)             │
│                           ↓                                 │
│                   5. STOP (Admin ingresa contraseña)        │
└─────────────────────────────────────────────────────────────┘
`);

  try {
    // Buscar usuario con credenciales de Mi Planilla
    const user = await prisma.enlaceUser.findFirst({
      where: {
        miplanillaPassword: { not: null },
        miplanillaPasswordIV: { not: null },
      },
    });

    if (!user) {
      console.log('❌ No se encontró usuario con credenciales de Mi Planilla');
      console.log('\nPara configurar un usuario de prueba:');
      console.log('  npx tsx scripts/setup-miplanilla-user.ts');
      return;
    }

    console.log(`\n✅ Usuario encontrado: ${user.nombre}`);
    console.log(`   Documento: ${user.tipoDocumento}${user.numeroDocumento}`);

    // Generar sessionId
    const sessionId = `flujo-completo-${uuidv4().slice(0, 8)}`;
    console.log(`\n🔑 Session ID: ${sessionId}`);

    console.log('\n' + '='.repeat(70));
    console.log('INICIANDO FLUJO COMPLETO');
    console.log('='.repeat(70));
    console.log('\n⚠️  El navegador se abrirá en modo visible');
    console.log('⚠️  Si no hay planilla, se generará una nueva');
    console.log('⚠️  El bot se detendrá en el login de Bancolombia');
    console.log('⚠️  El admin debe ingresar la contraseña manualmente\n');

    // Ejecutar flujo completo
    const result = await ejecutarFlujoCompletoMiPlanilla({
      sessionId,
      enlaceUserId: user.id,
      // IBC (Ingreso Base de Cotización) - determina el valor a pagar
      ibc: 1600000,
    });

    console.log('\n' + '='.repeat(70));
    console.log('RESULTADO');
    console.log('='.repeat(70));

    if (result.success) {
      console.log('\n✅ Flujo ejecutado exitosamente');
      console.log(`   Etapa alcanzada: ${result.etapa}`);
      console.log(`   Planilla existía: ${result.planillaExistia ? 'Sí' : 'No'}`);
      console.log(`   Planilla generada: ${result.planillaGenerada ? 'Sí' : 'No'}`);
      console.log(`   Llegó al banco: ${result.reachedBank ? 'Sí' : 'No'}`);

      if (result.numeroPlanilla) {
        console.log(`   Número planilla: ${result.numeroPlanilla}`);
      }
      if (result.valorPlanilla) {
        console.log(`   Valor planilla: $${result.valorPlanilla.toLocaleString()}`);
      }

      console.log('\n🎯 El navegador está esperando que el admin ingrese la contraseña');
      console.log('   Usuario ya llenado: Lbrochet01');
    } else {
      console.log('\n❌ Flujo falló');
      console.log(`   Etapa: ${result.etapa}`);
      console.log(`   Error: ${result.error}`);
      if (result.errorAt) {
        console.log(`   Falló en: ${result.errorAt}`);
      }
    }

    console.log('\n📸 Screenshots guardados en: screenshots/flujo-completo-*.png');

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
