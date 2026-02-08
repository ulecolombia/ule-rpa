/**
 * Jest Configuration
 * Testing configuration for RPA service
 */

module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',

  // Node environment (not browser)
  testEnvironment: 'node',

  // Root directories for tests
  roots: ['<rootDir>/tests'],

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],

  // Transform files with ts-jest
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/types/**',
  ],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // Test timeout (default: 5 seconds, extended for RPA tests)
  testTimeout: 120000, // 2 minutes for RPA tests (auth, navigation, etc.)

  // Setup files to run after environment setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Reset mocks after each test
  resetMocks: true,

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Globals for ts-jest
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },

  // Bail on first test failure (useful for integration tests)
  // bail: true,

  // Max workers (useful for integration tests that may interfere)
  maxWorkers: 1, // Run tests sequentially for RPA tests
};
