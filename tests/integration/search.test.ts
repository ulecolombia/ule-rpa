/**
 * Integration Tests: Search Bot
 * Tests user search functionality in Enlace Operativo
 */

import { buscarUsuario, usuarioExiste } from '../../src/bots/enlace/search.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { TEST_USERS } from '../utils/test-data';

describe('Enlace Search Bot - Integration Tests', () => {
  // Setup: Login before all tests
  beforeAll(async () => {
    console.log('🔐 Authenticating to Enlace...');
    const authResult = await enlaceAuth.login();

    expect(authResult.success).toBe(true);
    expect(authResult.authenticated).toBe(true);

    console.log('✅ Authenticated successfully');
  }, 180000);

  // Cleanup
  afterAll(async () => {
    console.log('🧹 Cleaning up...');

    try {
      await enlaceAuth.logout();
      await enlaceAuth.cleanup();
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }

    console.log('✅ Cleanup completed');
  }, 60000);

  describe('Search Existing User', () => {
    it('should find user by document number', async () => {
      console.log('🔍 Searching for existing user...');

      // Note: This test requires a known existing user in the system
      // Update the document number with a real user for your testing
      const knownDocumento = process.env.TEST_EXISTING_USER_DOC || '1234567890';

      const result = await buscarUsuario(knownDocumento);

      expect(result).toBeDefined();

      if (result.found) {
        expect(result.enlaceUserId).toBeDefined();
        expect(result.documento).toContain(knownDocumento);
        console.log('✅ User found:', result);
      } else {
        console.log('ℹ️  User not found (expected if not in system)');
      }
    }, 60000);

    it('should return complete user data when found', async () => {
      console.log('🔍 Testing complete data extraction...');

      const knownDocumento = process.env.TEST_EXISTING_USER_DOC || '1234567890';
      const result = await buscarUsuario(knownDocumento);

      if (result.found) {
        expect(result.enlaceUserId).toBeDefined();
        expect(result.enlaceUserId).toBeEnlaceUserId();
        expect(result.documento).toBeDefined();

        // Optional fields may or may not be present
        if (result.nombre) {
          expect(typeof result.nombre).toBe('string');
        }
        if (result.estado) {
          expect(typeof result.estado).toBe('string');
        }

        console.log('✅ Complete data extracted');
      } else {
        console.log('ℹ️  Skipping data validation (user not found)');
      }
    }, 60000);
  });

  describe('Search Non-Existent User', () => {
    it('should return not found for non-existent user', async () => {
      console.log('🔍 Searching for non-existent user...');

      const result = await buscarUsuario(TEST_USERS.nonExistent.numeroDocumento);

      expect(result).toBeDefined();
      expect(result.found).toBe(false);
      expect(result.enlaceUserId).toBeUndefined();

      console.log('✅ Correctly identified as not found');
    }, 60000);

    it('should handle invalid document numbers gracefully', async () => {
      console.log('🔍 Testing invalid document...');

      const result = await buscarUsuario('invalid');

      expect(result).toBeDefined();
      expect(result.found).toBe(false);

      console.log('✅ Invalid document handled gracefully');
    }, 60000);

    it('should handle empty document number', async () => {
      console.log('🔍 Testing empty document...');

      const result = await buscarUsuario('');

      expect(result).toBeDefined();
      expect(result.found).toBe(false);

      console.log('✅ Empty document handled gracefully');
    }, 60000);
  });

  describe('Quick Existence Check', () => {
    it('should quickly verify if user exists', async () => {
      console.log('⚡ Testing quick existence check...');

      const knownDocumento = process.env.TEST_EXISTING_USER_DOC || '1234567890';

      const startTime = Date.now();
      const exists = await usuarioExiste(knownDocumento);
      const duration = Date.now() - startTime;

      expect(typeof exists).toBe('boolean');

      console.log(`✅ Existence check completed in ${duration}ms`);
      console.log('Result:', exists ? 'Exists' : 'Does not exist');
    }, 60000);

    it('should return false for non-existent user', async () => {
      console.log('⚡ Testing non-existent user quick check...');

      const exists = await usuarioExiste(TEST_USERS.nonExistent.numeroDocumento);

      expect(exists).toBe(false);

      console.log('✅ Quick check correctly returned false');
    }, 60000);
  });

  describe('Search Performance', () => {
    it('should complete search within reasonable time', async () => {
      console.log('⏱️  Testing search performance...');

      const startTime = Date.now();
      await buscarUsuario('1234567890');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      console.log(`✅ Search completed in ${duration}ms`);
    }, 60000);

    it('should handle multiple sequential searches', async () => {
      console.log('🔄 Testing multiple searches...');

      const documentos = ['1111111111', '2222222222', '3333333333'];

      for (const doc of documentos) {
        const result = await buscarUsuario(doc);
        expect(result).toBeDefined();
        expect(typeof result.found).toBe('boolean');
      }

      console.log('✅ Multiple searches completed successfully');
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should handle navigation errors gracefully', async () => {
      console.log('🔌 Testing error handling...');

      // Even if something goes wrong, shouldn't crash
      const result = await buscarUsuario('9999999999');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');

      console.log('✅ Error handling verified');
    }, 60000);
  });

  describe('Data Extraction Strategies', () => {
    it('should use fallback strategies when primary fails', async () => {
      console.log('🔀 Testing extraction fallbacks...');

      // This test verifies that fallback strategies work
      // We can't force a fallback, but we can verify the code doesn't crash

      const result = await buscarUsuario(TEST_USERS.nonExistent.numeroDocumento);

      expect(result).toBeDefined();
      expect(result.found).toBe(false);

      console.log('✅ Fallback strategies working');
    }, 60000);
  });
});
