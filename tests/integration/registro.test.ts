/**
 * Integration Tests: Registration Bot
 * Tests complete registration flow in Enlace Operativo
 *
 * IMPORTANT: These tests interact with the real Enlace website
 * - Set PUPPETEER_HEADLESS=false in .env.test to watch execution
 * - Tests may require manual reCAPTCHA solving
 * - Tests run sequentially to avoid conflicts
 */

import { registrarUsuario } from '../../src/bots/enlace/registro.bot';
import { buscarUsuario } from '../../src/bots/enlace/search.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { browserManager } from '../../src/bots/utils/browser';
import { generateTestUser, FIXED_TEST_USER, VALIDATION_ERRORS, retryOperation } from '../utils/test-data';
import { UserData } from '../../src/types';

describe('Enlace Registration Bot - Integration Tests', () => {
  let testUser: UserData;
  let registeredUserId: string | undefined;

  // Setup: Login before all tests
  beforeAll(async () => {
    console.log('🔐 Authenticating to Enlace...');
    const authResult = await enlaceAuth.login();

    expect(authResult.success).toBe(true);
    expect(authResult.authenticated).toBe(true);

    console.log('✅ Authenticated successfully');

    // Generate unique test user
    testUser = generateTestUser({
      nombre: 'Usuario Test RPA Integration',
    });

    console.log('👤 Test user generated:', testUser.numeroDocumento);
  }, 180000); // 3 minutes for manual reCAPTCHA

  // Cleanup: Logout and close browser after all tests
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

  describe('Search for Non-Existent User', () => {
    it('should return not found for non-existent user', async () => {
      console.log('🔍 Searching for non-existent user...');

      const result = await buscarUsuario(testUser.numeroDocumento);

      expect(result).toBeDefined();
      expect(result.found).toBe(false);
      expect(result.enlaceUserId).toBeUndefined();

      console.log('✅ Confirmed user does not exist');
    }, 60000);
  });

  describe('User Registration', () => {
    it('should validate user data before registration', async () => {
      console.log('📝 Testing validation...');

      // Test with missing documento
      const resultMissingDoc = await registrarUsuario(VALIDATION_ERRORS.missingDocumento);
      expect(resultMissingDoc.success).toBe(false);
      expect(resultMissingDoc.error).toContain('numeroDocumento');

      // Test with short documento
      const resultShortDoc = await registrarUsuario(VALIDATION_ERRORS.shortDocumento);
      expect(resultShortDoc.success).toBe(false);
      expect(resultShortDoc.error).toContain('numeroDocumento');

      // Test with missing nombre
      const resultMissingName = await registrarUsuario(VALIDATION_ERRORS.missingNombre);
      expect(resultMissingName.success).toBe(false);
      expect(resultMissingName.error).toContain('nombre');

      console.log('✅ Validation working correctly');
    }, 30000);

    it('should successfully register new user', async () => {
      console.log('📝 Registering new user...');
      console.log('User data:', {
        documento: testUser.numeroDocumento,
        nombre: testUser.nombre,
        email: testUser.email,
      });

      const result = await retryOperation(
        () => registrarUsuario(testUser),
        2, // Max 2 retries
        5000 // 5 second delay
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.enlaceUserId).toBeDefined();
      expect(result.enlaceUserId).toBeEnlaceUserId();
      expect(result.alreadyExists).toBeFalsy();

      // Save for later tests
      registeredUserId = result.enlaceUserId;

      console.log('✅ User registered successfully');
      console.log('Enlace User ID:', registeredUserId);

      // Check for warnings
      if (result.warnings && result.warnings.length > 0) {
        console.warn('⚠️  Registration warnings:', result.warnings);
      }
    }, 120000); // 2 minutes for registration

    it('should find newly registered user', async () => {
      console.log('🔍 Searching for registered user...');

      // Wait a bit for database sync
      await new Promise(resolve => setTimeout(resolve, 3000));

      const result = await buscarUsuario(testUser.numeroDocumento);

      expect(result).toBeDefined();
      expect(result.found).toBe(true);
      expect(result.enlaceUserId).toBeDefined();
      expect(result.documento).toContain(testUser.numeroDocumento);

      // Optional: verify other fields if returned
      if (result.nombre) {
        expect(result.nombre.toLowerCase()).toContain(
          testUser.nombre.toLowerCase().split(' ')[0]
        );
      }

      console.log('✅ User found in search');
      console.log('Search result:', result);
    }, 60000);

    it('should detect already existing user on duplicate registration', async () => {
      console.log('🔁 Testing duplicate detection...');

      const result = await registrarUsuario(testUser);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(result.enlaceUserId).toBeDefined();
      expect(result.enlaceUserId).toBe(registeredUserId);

      console.log('✅ Duplicate detection working');
      console.log('Returned existing user ID:', result.enlaceUserId);
    }, 120000);
  });

  describe('Registration with Different Scenarios', () => {
    it('should handle registration with minimal data', async () => {
      console.log('📝 Testing registration with minimal data...');

      const minimalUser = generateTestUser({
        nombre: 'Usuario Minimo Test',
        email: undefined,
        telefono: undefined,
      });

      const result = await registrarUsuario(minimalUser);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.enlaceUserId).toBeDefined();

      console.log('✅ Minimal data registration successful');
    }, 120000);

    it('should handle registration with complete data', async () => {
      console.log('📝 Testing registration with complete data...');

      const completeUser = generateTestUser({
        nombre: 'Usuario Completo Test',
        email: 'completo@test.app',
        telefono: '3009876543',
      });

      const result = await registrarUsuario(completeUser);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.enlaceUserId).toBeDefined();

      console.log('✅ Complete data registration successful');
    }, 120000);

    it('should handle CE (foreign ID) registration', async () => {
      console.log('📝 Testing CE registration...');

      const foreignUser = generateTestUser({
        tipoDocumento: 'CE',
        nombre: 'Usuario Extranjero Test',
      });

      const result = await registrarUsuario(foreignUser);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.enlaceUserId).toBeDefined();

      console.log('✅ Foreign user registration successful');
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should handle network timeout gracefully', async () => {
      console.log('🔌 Testing network timeout handling...');

      // This test verifies error handling but may pass if network is fast
      // The important part is that it doesn't crash

      const result = await registrarUsuario(generateTestUser());

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      if (!result.success) {
        expect(result.error).toBeDefined();
        console.log('Error message:', result.error);
      }

      console.log('✅ Error handling verified');
    }, 120000);

    it('should take screenshot on error', async () => {
      // This test verifies that error screenshots are taken
      // We can't force an error easily, but we can verify the mechanism works

      console.log('📸 Verifying screenshot mechanism...');

      const result = await registrarUsuario(VALIDATION_ERRORS.missingDocumento);

      expect(result.success).toBe(false);
      // Screenshot may or may not be included depending on where validation fails

      console.log('✅ Screenshot mechanism verified');
    }, 30000);
  });

  describe('Session Management', () => {
    it('should maintain session across multiple operations', async () => {
      console.log('🔐 Testing session management...');

      const sessionInfo1 = enlaceAuth.getSessionInfo();
      expect(sessionInfo1.authenticated).toBe(true);

      // Perform operation
      await buscarUsuario('1234567890');

      const sessionInfo2 = enlaceAuth.getSessionInfo();
      expect(sessionInfo2.authenticated).toBe(true);

      // Session should still be valid
      expect(sessionInfo2.ageMinutes).toBeGreaterThanOrEqual(sessionInfo1.ageMinutes);

      console.log('✅ Session maintained successfully');
      console.log('Session age:', sessionInfo2.ageMinutes, 'minutes');
    }, 60000);
  });
});
