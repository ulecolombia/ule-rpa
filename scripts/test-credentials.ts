/**
 * Test Credentials Configuration
 *
 * All test scripts should import credentials from this file.
 * Credentials are read from environment variables.
 *
 * Required env vars in .env:
 * - TEST_SOI_DOCUMENTO
 * - TEST_SOI_PASSWORD
 * - TEST_MIPLANILLA_DOCUMENTO
 * - TEST_MIPLANILLA_PASSWORD
 */

import * as dotenv from 'dotenv';
dotenv.config();

// SOI Test Credentials
export const SOI_TEST_CREDENTIALS = {
  tipoDocumento: 'CC' as const,
  documento: process.env.TEST_SOI_DOCUMENTO || '',
  password: process.env.TEST_SOI_PASSWORD || '',
};

// Mi Planilla Test Credentials
export const MIPLANILLA_TEST_CREDENTIALS = {
  tipoDocumento: 'CC' as const,
  documento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
  // Full usuario format: CC + documento
  get usuario(): string {
    return `CC${this.documento}`;
  },
};

// Validate credentials are set
export function validateTestCredentials(platform: 'SOI' | 'MIPLANILLA'): void {
  if (platform === 'SOI') {
    if (!SOI_TEST_CREDENTIALS.documento || !SOI_TEST_CREDENTIALS.password) {
      throw new Error(
        'Missing SOI test credentials. Set TEST_SOI_DOCUMENTO and TEST_SOI_PASSWORD in .env'
      );
    }
  } else {
    if (!MIPLANILLA_TEST_CREDENTIALS.documento || !MIPLANILLA_TEST_CREDENTIALS.password) {
      throw new Error(
        'Missing Mi Planilla test credentials. Set TEST_MIPLANILLA_DOCUMENTO and TEST_MIPLANILLA_PASSWORD in .env'
      );
    }
  }
}

// PSE Test Data (not sensitive)
export const PSE_TEST_DATA = {
  tipoPersona: 'JURIDICA' as const,
  nit: '9020190314',
  email: 'ulecolombia@gmail.com',
  banco: 'BANCOLOMBIA',
};
