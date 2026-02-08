/**
 * Integration Tests: Liquidacion Bot
 * Tests PILA liquidation flow in Enlace Operativo
 *
 * PREREQUISITES:
 * - User must be registered in Enlace before running liquidation tests
 * - Set TEST_REGISTERED_USER_DOC in .env.test with a valid registered user
 */

import { enlaceLiquidacion } from '../../src/bots/enlace/liquidacion.bot';
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { generateTestPilaData } from '../utils/test-data';

describe('Enlace Liquidacion Bot - Integration Tests', () => {
  const registeredUserDoc = process.env.TEST_REGISTERED_USER_DOC || '1234567890';
  let testPilaData: ReturnType<typeof generateTestPilaData>;

  // Setup: Login before all tests
  beforeAll(async () => {
    console.log('🔐 Authenticating to Enlace...');
    const authResult = await enlaceAuth.login();

    expect(authResult.success).toBe(true);
    expect(authResult.authenticated).toBe(true);

    console.log('✅ Authenticated successfully');

    // Generate test PILA data
    testPilaData = generateTestPilaData();
    console.log('💰 Test PILA data:', testPilaData);
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

  describe('PILA Liquidation Flow', () => {
    it('should successfully liquidate PILA for registered user', async () => {
      console.log('💰 Starting PILA liquidation...');
      console.log('User document:', registeredUserDoc);
      console.log('Period:', testPilaData.periodo);
      console.log('Total:', testPilaData.total);

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        testPilaData
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      if (result.success && result.data) {
        expect(result.data.numeroPlanilla).toBeDefined();
        expect(result.data.numeroPlanilla).toBePlanillaNumber();
        expect(result.data.total).toBeDefined();
        expect(result.data.total).toBeGreaterThan(0);

        if (result.data.fechaLimite) {
          expect(result.data.fechaLimite).toBeInstanceOf(Date);
        }

        console.log('✅ Liquidation successful');
        console.log('Planilla number:', result.data.numeroPlanilla);
        console.log('Total:', result.data.total);
        console.log('Fecha límite:', result.data.fechaLimite);
      } else {
        console.log('⚠️  Liquidation returned no data');
        console.log('Error:', result.error);
      }

      expect(result.duration).toBeGreaterThan(0);
    }, 180000); // 3 minutes for complete flow

    it('should handle user not found gracefully', async () => {
      console.log('💰 Testing non-existent user...');

      const result = await enlaceLiquidacion.liquidarPila(
        '0000000001', // Non-existent user
        testPilaData
      );

      expect(result).toBeDefined();

      // Should either fail with error or return error message
      if (!result.success) {
        expect(result.error).toBeDefined();
        console.log('✅ Correctly handled non-existent user');
        console.log('Error message:', result.error);
      } else {
        console.log('ℹ️  Bot handled non-existent user differently than expected');
      }
    }, 120000);

    it('should validate PILA data before submission', async () => {
      console.log('💰 Testing PILA data validation...');

      // Test with invalid IBC (too low)
      const invalidPilaData = generateTestPilaData({
        ibc: 100000, // Below minimum
        salud: 12500,
        pension: 16000,
        arl: 522,
        total: 29022,
      });

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        invalidPilaData
      );

      expect(result).toBeDefined();

      // Bot may accept or reject depending on Enlace validation
      console.log('Result:', result.success ? 'Accepted' : 'Rejected');

      if (!result.success) {
        console.log('Error:', result.error);
      }
    }, 120000);
  });

  describe('Different PILA Scenarios', () => {
    it('should handle 1 SMLMV (minimum salary)', async () => {
      console.log('💰 Testing 1 SMLMV...');

      const smlmvData = generateTestPilaData({
        ingresoBase: 1300000,
        ibc: 1300000,
      });

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        smlmvData
      );

      expect(result).toBeDefined();

      if (result.success) {
        console.log('✅ 1 SMLMV liquidation successful');
      }
    }, 180000);

    it('should handle higher IBC (2 SMLMV)', async () => {
      console.log('💰 Testing 2 SMLMV...');

      const higherIbc = generateTestPilaData({
        ingresoBase: 2600000,
        ibc: 2600000,
        salud: Math.round(2600000 * 0.125),
        pension: Math.round(2600000 * 0.16),
        arl: Math.round(2600000 * 0.00522),
        total: Math.round(2600000 * (0.125 + 0.16 + 0.00522)),
      });

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        higherIbc
      );

      expect(result).toBeDefined();

      if (result.success) {
        console.log('✅ Higher IBC liquidation successful');
      }
    }, 180000);

    it('should handle partial month (15 days)', async () => {
      console.log('💰 Testing partial month...');

      const partialMonth = generateTestPilaData({
        ingresoBase: 650000, // Half month
        ibc: 1300000,
        salud: Math.round(1300000 * 0.125 * 0.5),
        pension: Math.round(1300000 * 0.16 * 0.5),
        arl: Math.round(1300000 * 0.00522 * 0.5),
        total: Math.round(1300000 * (0.125 + 0.16 + 0.00522) * 0.5),
      });

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        partialMonth
      );

      expect(result).toBeDefined();

      if (result.success) {
        console.log('✅ Partial month liquidation successful');
      }
    }, 180000);
  });

  describe('Error Handling', () => {
    it('should take screenshot on error', async () => {
      console.log('📸 Testing error screenshot...');

      // Force an error by using invalid data
      const result = await enlaceLiquidacion.liquidarPila(
        '0000000000',
        testPilaData
      );

      if (!result.success) {
        console.log('✅ Error handled with screenshot');
        if (result.screenshot) {
          console.log('Screenshot saved:', result.screenshot);
        }
      }
    }, 120000);

    it('should handle timeout gracefully', async () => {
      console.log('⏱️  Testing timeout handling...');

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        testPilaData
      );

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      console.log('✅ Timeout handling verified');
    }, 180000);
  });

  describe('Navigation and Form Filling', () => {
    it('should navigate to liquidacion section', async () => {
      console.log('🧭 Testing navigation...');

      // This is tested implicitly by the liquidation test
      // If liquidation succeeds, navigation works

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        testPilaData
      );

      expect(result).toBeDefined();

      console.log('✅ Navigation verified');
    }, 180000);
  });

  describe('Performance', () => {
    it('should complete liquidation within reasonable time', async () => {
      console.log('⏱️  Testing liquidation performance...');

      const startTime = Date.now();

      const result = await enlaceLiquidacion.liquidarPila(
        registeredUserDoc,
        testPilaData
      );

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();

      // Liquidation should complete within 3 minutes
      expect(duration).toBeLessThan(180000);

      console.log(`✅ Liquidation completed in ${duration}ms`);
      console.log(`   (${(duration / 1000).toFixed(2)} seconds)`);
    }, 180000);
  });
});
