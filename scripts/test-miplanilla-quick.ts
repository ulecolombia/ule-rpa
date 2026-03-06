/**
 * Mi Planilla Login - Quick Test
 */
import { MiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';

async function test() {
  console.log('\n========== MI PLANILLA LOGIN TEST ==========\n');

  const credentials = {
    tipoDocumento: 'CC' as const,
    documento: '1047484978',
    password: 'Ulecolombia123',
  };

  console.log('Usuario: CC' + credentials.documento);
  console.log('Password: ******\n');

  const authBot = new MiPlanillaAuthBot();

  try {
    console.log('🔄 Intentando login...\n');
    const result = await authBot.login(credentials);

    console.log('========== RESULTADO ==========');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ LOGIN EXITOSO');
      await authBot.logout();
    } else {
      console.log('\n❌ LOGIN FALLIDO');
      console.log('Error: ' + result.message);
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await authBot.close();
  }
}

test().catch(console.error);
