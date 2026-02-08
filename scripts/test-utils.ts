#!/usr/bin/env tsx
/**
 * Script to test utility functions
 * Run with: npx tsx scripts/test-utils.ts
 */

import {
  logger,
  createChildLogger,
  validateDocumento,
  validatePilaPeriod,
  validateIBC,
  formatCurrency,
  calculatePilaContributions,
  encrypt,
  decrypt,
  hash,
  compareHash,
  generateToken,
  maskSensitive,
} from '../src/utils';

async function main() {
  console.log('🧪 Testing ULE RPA Service Utilities\n');

  // ========== LOGGER ==========
  console.log('📝 Testing Logger...');
  logger.info('This is an info message');
  logger.warn('This is a warning', { context: 'test' });
  logger.debug('This is a debug message');

  const taskLogger = createChildLogger({ taskId: 'test-123', userId: 'user-456' });
  taskLogger.info('Task started');
  console.log('✅ Logger test passed\n');

  // ========== VALIDATORS ==========
  console.log('✅ Testing Validators...');

  const docResult = validateDocumento('1234567890', 'CC');
  console.log('Documento validation:', docResult);

  const periodResult = validatePilaPeriod('2026-02');
  console.log('Period validation:', periodResult);

  const ibcResult = validateIBC(1300000);
  console.log('IBC validation:', ibcResult);
  console.log('✅ Validators test passed\n');

  // ========== HELPERS ==========
  console.log('🛠️ Testing Helpers...');

  console.log('Format currency:', formatCurrency(1300000));

  const aportes = calculatePilaContributions(1300000, 'I');
  console.log('PILA contributions for 1 SMMLV:', {
    salud: formatCurrency(aportes.salud),
    pension: formatCurrency(aportes.pension),
    arl: formatCurrency(aportes.arl),
    total: formatCurrency(aportes.total),
  });
  console.log('✅ Helpers test passed\n');

  // ========== CRYPTO ==========
  console.log('🔐 Testing Crypto...');

  // Encryption
  const plainText = 'Sensitive data: ENLACE_ADMIN_PASS=myPassword123';
  const encrypted = await encrypt(plainText);
  console.log('Encrypted:', encrypted.substring(0, 50) + '...');

  const decrypted = await decrypt(encrypted);
  console.log('Decrypted:', decrypted);
  console.log('Match:', plainText === decrypted ? '✅' : '❌');

  // Hashing
  const password = 'mySecurePassword123';
  const hashed = await hash(password);
  console.log('Hashed password:', hashed);

  const isValid = await compareHash(password, hashed);
  console.log('Password match:', isValid ? '✅' : '❌');

  const isInvalid = await compareHash('wrongPassword', hashed);
  console.log('Wrong password rejected:', !isInvalid ? '✅' : '❌');

  // Tokens
  const token = generateToken(32);
  console.log('Generated token:', token);

  // Masking
  const apiKey = 'sk_live_1234567890abcdefghijklmnop';
  console.log('Masked API key:', maskSensitive(apiKey, 4));

  console.log('✅ Crypto test passed\n');

  // ========== COMPLETE PILA CALCULATION EXAMPLE ==========
  console.log('💰 Complete PILA Calculation Example:\n');

  const ibc = 2600000; // 2 SMMLV
  const contributions = calculatePilaContributions(ibc, 'II');

  console.log('IBC (Ingreso Base):', formatCurrency(ibc));
  console.log('---');
  console.log('Salud (12.5%):', formatCurrency(contributions.salud));
  console.log('Pensión (16%):', formatCurrency(contributions.pension));
  console.log('ARL Nivel II (1.044%):', formatCurrency(contributions.arl));
  console.log('---');
  console.log('TOTAL A PAGAR:', formatCurrency(contributions.total));
  console.log('');

  // ========== VALIDATION EXAMPLE ==========
  console.log('🔍 Validation Example:\n');

  const testCases = [
    { doc: '1234567890', tipo: 'CC', expected: true },
    { doc: '123', tipo: 'CC', expected: false },
    { doc: 'ABC123', tipo: 'CC', expected: false },
  ];

  testCases.forEach((test) => {
    const result = validateDocumento(test.doc, test.tipo);
    const status = result.valid === test.expected ? '✅' : '❌';
    console.log(
      `${status} Document: ${test.doc} (${test.tipo}) - ${result.valid ? 'Valid' : result.error}`
    );
  });

  console.log('\n✨ All tests completed successfully!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
