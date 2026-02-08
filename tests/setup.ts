/**
 * Jest Setup File
 * Global configuration and setup for all tests
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Increase test timeout globally
jest.setTimeout(120000); // 2 minutes

// Global setup
beforeAll(() => {
  console.log('🧪 Starting test suite...');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Puppeteer Headless:', process.env.PUPPETEER_HEADLESS);
});

// Global teardown
afterAll(() => {
  console.log('✅ Test suite completed');
});

// Suppress console warnings in tests (optional)
// global.console = {
//   ...console,
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Add custom matchers (optional)
expect.extend({
  toBeValidTaskId(received) {
    const pass = typeof received === 'string' && received.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid task ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid task ID`,
        pass: false,
      };
    }
  },

  toBeEnlaceUserId(received) {
    const pass = typeof received === 'string' && /^\d+$/.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Enlace user ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Enlace user ID (numeric string)`,
        pass: false,
      };
    }
  },

  toBePlanillaNumber(received) {
    const pass = typeof received === 'string' && received.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid planilla number`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid planilla number`,
        pass: false,
      };
    }
  },
});

// Extend Jest matchers type definitions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTaskId(): R;
      toBeEnlaceUserId(): R;
      toBePlanillaNumber(): R;
    }
  }
}

export {};
