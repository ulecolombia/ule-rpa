/**
 * Script: Test Login SOI para CC 1047478670
 *
 * Uso: npx tsx scripts/test-login-camilo.ts
 */

import { SOIAuthBot } from '../src/bots/soi/auth.bot';

async function main() {
  console.log('\n=== TEST LOGIN SOI ===\n');
  console.log('Documento: CC 1047478670');
  console.log('Password: Pruebaule123*');
  console.log('');

  const authBot = new SOIAuthBot();

  try {
    const session = await authBot.loginAsUser({
      tipoDocumento: 'CC',
      documento: '1047478670',
      password: 'Pruebaule123*',
    });

    console.log('\n--- RESULTADO ---');
    console.log('isAuthenticated:', session.isAuthenticated);
    console.log('userName:', session.userName || 'N/A');
    console.log('documento:', session.documento || 'N/A');

    if (session.isAuthenticated) {
      console.log('\n✅ LOGIN EXITOSO');
    } else {
      console.log('\n❌ LOGIN FALLIDO');
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error);
  } finally {
    await authBot.close();
  }
}

main();
