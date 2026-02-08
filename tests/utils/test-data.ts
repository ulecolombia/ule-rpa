/**
 * Test Data Factory
 * Generate test data for RPA tests
 */

import { UserData, PilaData } from '../../src/types';

/**
 * Generate random test user data
 */
export function generateTestUser(overrides?: Partial<UserData>): UserData {
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 10000);

  return {
    tipoDocumento: 'CC',
    numeroDocumento: `99${timestamp}${randomNum}`.slice(0, 10), // Ensure 10 digits
    nombre: `Usuario Test ${randomNum}`,
    email: `test${randomNum}@uletest.app`,
    telefono: `300${randomNum}`.slice(0, 10),
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
    ...overrides,
  };
}

/**
 * Fixed test user for deterministic tests
 */
export const FIXED_TEST_USER: UserData = {
  tipoDocumento: 'CC',
  numeroDocumento: '9999999999',
  nombre: 'Usuario Test Fijo',
  email: 'test-fixed@uletest.app',
  telefono: '3001234567',
  eps: 'Sanitas EPS',
  pension: 'Porvenir',
  arl: 'SURA',
};

/**
 * Generate test PILA data
 */
export function generateTestPilaData(overrides?: Partial<PilaData>): PilaData {
  const currentDate = new Date();
  const periodo = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const ibc = 1300000; // 1 SMLMV aproximado

  return {
    periodo,
    ingresoBase: ibc,
    ibc,
    salud: Math.round(ibc * 0.125), // 12.5%
    pension: Math.round(ibc * 0.16), // 16%
    arl: Math.round(ibc * 0.00522), // 0.522%
    total: Math.round(ibc * (0.125 + 0.16 + 0.00522)),
    ...overrides,
  };
}

/**
 * Test user variations for different scenarios
 */
export const TEST_USERS = {
  // User that definitely doesn't exist
  nonExistent: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '0000000001',
    nombre: 'Usuario No Existe',
    email: 'noexiste@test.app',
    telefono: '3000000001',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  // User with minimum valid data
  minimal: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '1234567890',
    nombre: 'Usuario Minimo',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  // User with all fields
  complete: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '9876543210',
    nombre: 'Usuario Completo Test',
    email: 'completo@test.app',
    telefono: '3009876543',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  // Foreign user (CE)
  foreigner: {
    tipoDocumento: 'CE' as const,
    numeroDocumento: '1111111111',
    nombre: 'Usuario Extranjero',
    email: 'extranjero@test.app',
    telefono: '3001111111',
    eps: 'Nueva EPS',
    pension: 'Colfondos',
    arl: 'Positiva',
  },
};

/**
 * Expected validation errors for testing
 */
export const VALIDATION_ERRORS = {
  missingDocumento: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '',
    nombre: 'Test User',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  shortDocumento: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '12345', // Less than 6 chars
    nombre: 'Test User',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  missingNombre: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '1234567890',
    nombre: '',
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  invalidEmail: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '1234567890',
    nombre: 'Test User',
    email: 'invalid-email', // Invalid format
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },

  shortTelefono: {
    tipoDocumento: 'CC' as const,
    numeroDocumento: '1234567890',
    nombre: 'Test User',
    telefono: '123', // Less than 7 chars
    eps: 'Sanitas EPS',
    pension: 'Porvenir',
    arl: 'SURA',
  },
};

/**
 * Sleep helper for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry helper for flaky tests
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        await sleep(delayMs * attempt); // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Generate unique test ID
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
