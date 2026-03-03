/**
 * Test del bot de pago SOI actualizado
 * Prueba el flujo completo: Dashboard → pagar.png → PSE → Advertencia → Formulario
 */

import { SOIPagoBot } from '../src/bots/soi/pago.bot';

async function testPagoBot() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 TEST: SOI Pago Bot (Flujo Actualizado)                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const bot = new SOIPagoBot();

  try {
    // Probar el flujo de pago con datos de prueba
    const result = await bot.pagarPlanilla({
      numeroPlanilla: '6008280827',
      valorTotal: 570000,
      pse: {
        tipoPersona: 'Jurídica',  // ULE es persona jurídica
        banco: 'BANCOLOMBIA',
      },
    });

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESULTADO                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📋 Planilla: ${result.numeroPlanilla}`);
    console.log(`   💰 Valor: $${result.valorTotal.toLocaleString()}`);
    console.log(`   📊 Estado: ${result.estadoPago}`);
    console.log(`   💬 Mensaje: ${result.message}`);

    if (result.urlBanco) {
      console.log(`   🔗 URL: ${result.urlBanco}`);
    }
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    }

    console.log('\n   📸 Screenshots guardados en ./screenshots/pago-*.png');
    console.log('\n   ⏳ Esperando 30 segundos para revisar...\n');

    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('✅ Test finalizado');
}

testPagoBot().catch(console.error);
