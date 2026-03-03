/**
 * Test: Validar credenciales SOI
 * Paso 1 de prueba multi-usuario
 *
 * Este script valida que las credenciales de Camilo son correctas
 * usando el nuevo método validateCredentials()
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi';

async function testValidateCredentials() {
  console.log('========================================');
  console.log('TEST: Validación de Credenciales SOI');
  console.log('========================================\n');

  // Usar las credenciales de Camilo desde el .env
  const credentials = {
    tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
    documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
    password: process.env.SOI_PASSWORD || '',
  };

  console.log('📋 Credenciales a validar:');
  console.log(`   Tipo: ${credentials.tipoDocumento}`);
  console.log(`   Documento: ${credentials.documento}`);
  console.log(`   Password: ${'*'.repeat(credentials.password.length)}`);
  console.log('');

  if (!credentials.documento || !credentials.password) {
    console.error('❌ Error: Faltan credenciales en .env');
    console.error('   Verifica SOI_USUARIO_NUMERO_DOC y SOI_PASSWORD');
    process.exit(1);
  }

  const authBot = new SOIAuthBot();

  try {
    console.log('🔄 Iniciando validación...\n');

    const result = await authBot.validateCredentials(credentials);

    console.log('\n========================================');
    console.log('RESULTADO:');
    console.log('========================================');

    if (result.valid) {
      console.log('✅ Credenciales VÁLIDAS');
      console.log(`   Usuario: ${result.userName}`);
      console.log(`   Tipo cuenta: ${result.accountType}`);
      console.log(`   Mensaje: ${result.message}`);
    } else {
      console.log('❌ Credenciales INVÁLIDAS');
      console.log(`   Error: ${result.error}`);
      console.log(`   Mensaje: ${result.message}`);
    }

    console.log('\n========================================');
    console.log('TEST COMPLETADO');
    console.log('========================================\n');

    return result;
  } catch (error) {
    console.error('\n❌ ERROR durante la validación:');
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Ejecutar
testValidateCredentials()
  .then((result) => {
    console.log('\n📊 Resumen JSON:', JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
