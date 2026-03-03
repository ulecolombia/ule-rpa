import { pseSessionManager } from '../../src/bots/enlace/pse-session.manager';
import { browserManager } from '../../src/bots/utils/browser';

async function testSessionManager() {
  console.log('🧪 Testing PSE Session Manager\n');

  try {
    // 1. Crear sesión mock
    console.log('1. Creating mock session...');
    const page = await browserManager.launch();

    const sessionId = await pseSessionManager.createSession({
      planillaId: 'test-planilla-123',
      taskId: 'test-task-456',
      valorTotal: 580000,
      numeroPlanilla: 'PL123456',
      page,
    });

    console.log('✅ Session created:', sessionId);

    // 2. Obtener info
    console.log('\n2. Getting session info...');
    const info = await pseSessionManager.getSessionInfo(sessionId);
    console.log('✅ Session info:', info);

    // 3. Guardar código
    console.log('\n3. Saving dynamic code...');
    const saved = await pseSessionManager.saveCode(sessionId, '123456');
    console.log(saved ? '✅ Code saved' : '❌ Failed to save code');

    // 4. Recuperar código
    console.log('\n4. Retrieving code...');
    const code = await pseSessionManager.getCode(sessionId);
    console.log('✅ Retrieved code:', code);

    // 5. Marcar como completada
    console.log('\n5. Marking as completed...');
    await pseSessionManager.markAsCompleted(sessionId);
    console.log('✅ Marked as completed');

    // 6. Verificar que se limpió
    console.log('\n6. Verifying cleanup...');
    const pageAfter = pseSessionManager.getPage(sessionId);
    console.log(pageAfter ? '❌ Page still exists' : '✅ Page cleaned up');

    console.log('\n========================================');
    console.log('✅ ALL SESSION MANAGER TESTS PASSED');
    console.log('========================================');
  } catch (error) {
    console.error('💥 Test failed:', error);
  } finally {
    await browserManager.closeBrowser();
  }
}

testSessionManager();
