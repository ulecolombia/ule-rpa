/**
 * Test script para probar el flujo completo de liquidación con usuario real
 *
 * Uso: npx tsx scripts/test-liquidacion-real.ts
 */

import { liquidarPlanillaAsUser } from '../src/bots/soi';

async function main() {
  console.log('🚀 Iniciando prueba de liquidación con usuario real...\n');
  console.log('📋 Flujo:');
  console.log('   1. Login en SOI');
  console.log('   2. Navegar a "Crear Planilla en Línea"');
  console.log('   3. Llenar Paso 1 (Info Aportante)');
  console.log('   4. Agregar Cotizante (5 pasos)');
  console.log('   5. Liquidar planilla');
  console.log('');

  try {
    const result = await liquidarPlanillaAsUser({
      tipoDocumento: 'CC',
      documento: '1018482146',
      soiPassword: 'Ulecolombia123*',
      periodoMes: 2,
      periodoAno: 2026,
      ibc: 1423500, // Salario mínimo 2026
      diasCotizados: 30,
      // Datos opcionales del cotizante (se pueden obtener de la BD)
      primerNombre: 'Camilo',
      primerApellido: 'Torres',
      departamento: 'BOGOTA', // O "11" - BOGOTA DISTRITO CAPITAL
      municipio: 'BOGOTA',    // El municipio carga dinámicamente
    });

    console.log('\n📊 Resultado:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Planilla creada exitosamente!');
      console.log(`   Número: ${result.numeroPlanilla}`);
      console.log(`   Total: $${result.valorTotal?.toLocaleString('es-CO')}`);
    } else {
      console.log('\n❌ Error:', result.error || result.message);
    }
  } catch (error) {
    console.error('\n❌ Error no manejado:', error);
  }
}

main();
