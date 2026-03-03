import { validateEncryptionSetup, encrypt, decrypt } from '../utils/crypto';

async function validateEncryption() {
  console.log('🔐 Validating encryption system...\n');

  try {
    // Test básico
    console.log('1. Basic encryption test...');
    const isValid = await validateEncryptionSetup();

    if (!isValid) {
      console.error('❌ Basic encryption test FAILED');
      process.exit(1);
    }

    console.log('✅ Basic encryption test PASSED\n');

    // Test con código PSE
    console.log('2. PSE code encryption test...');
    const testCode = '123456';
    console.log(`   Original code: ${testCode}`);

    const encrypted = await encrypt(testCode);
    console.log(`   Encrypted: ${encrypted.substring(0, 50)}...`);

    const decrypted = await decrypt(encrypted);
    console.log(`   Decrypted: ${decrypted}`);

    if (decrypted !== testCode) {
      console.error('❌ PSE code test FAILED');
      process.exit(1);
    }

    console.log('✅ PSE code encryption test PASSED\n');

    // Test con múltiples códigos
    console.log('3. Multiple codes test...');
    const testCodes = ['123456', '654321', '999999', '000000'];

    for (const code of testCodes) {
      const enc = await encrypt(code);
      const dec = await decrypt(enc);

      if (dec !== code) {
        console.error(`❌ Failed for code: ${code}`);
        process.exit(1);
      }
    }

    console.log('✅ Multiple codes test PASSED\n');

    console.log('========================================');
    console.log('✅ ALL ENCRYPTION TESTS PASSED');
    console.log('========================================');
  } catch (error) {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  }
}

validateEncryption();
