# Testing Guide - ULE RPA Service

Comprehensive guide for testing the RPA service.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The RPA service includes comprehensive integration tests that verify bot functionality against the real Enlace Operativo website.

### Test Types

**Integration Tests** (`tests/integration/`)
- Test complete bot flows end-to-end
- Interact with real Enlace Operativo website
- Require authentication and may need manual reCAPTCHA solving
- Run sequentially to avoid conflicts

**Unit Tests** (`tests/unit/`)
- Test individual functions and utilities
- Mock external dependencies
- Fast execution

---

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Test Environment

Copy `.env.test` and update with your test credentials:

```bash
cp .env.test .env.test.local
```

**Important Variables**:
```bash
# Set to 'false' to watch tests execute (recommended first time)
PUPPETEER_HEADLESS=false

# Test credentials (use test account, NOT production!)
ENLACE_ADMIN_DOC=YOUR_TEST_DOC
ENLACE_ADMIN_USER=YOUR_TEST_USER
ENLACE_ADMIN_PASS=YOUR_TEST_PASS

# Known test users (optional, for faster testing)
TEST_EXISTING_USER_DOC=1234567890
TEST_REGISTERED_USER_DOC=1234567890
```

### 3. Setup Test Database

```bash
# Create test database
createdb ule_rpa_test

# Run migrations
DATABASE_URL=postgresql://user:pass@localhost:5432/ule_rpa_test npx prisma migrate deploy

# Generate Prisma client
npm run prisma:generate
```

### 4. Start Redis (Required)

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or using local installation
redis-server
```

---

## 🚀 Running Tests

### Run All Tests

```bash
npm test
```

### Run Integration Tests Only

```bash
npm run test:integration
```

### Run Specific Bot Tests

```bash
# Registration bot
npm run test:integration:registro

# Search bot
npm run test:integration:search

# Liquidacion bot
npm run test:integration:liquidacion
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Debug Mode

```bash
npm run test:debug
```

Then open `chrome://inspect` in Chrome and attach to the debugger.

---

## 📁 Test Structure

```
tests/
├── setup.ts                    # Global test configuration
├── utils/
│   └── test-data.ts           # Test data factories and helpers
├── integration/
│   ├── registro.test.ts       # Registration bot tests
│   ├── search.test.ts         # Search bot tests
│   └── liquidacion.test.ts    # Liquidation bot tests
├── unit/
│   └── (unit tests)
└── TESTING.md                 # This file
```

---

## 📝 Writing Tests

### Test Template

```typescript
import { enlaceAuth } from '../../src/bots/enlace/auth.bot';
import { generateTestUser } from '../utils/test-data';

describe('My Bot Tests', () => {
  // Setup: Login before all tests
  beforeAll(async () => {
    await enlaceAuth.login();
  }, 180000); // 3 minutes for manual reCAPTCHA

  // Cleanup: Logout after all tests
  afterAll(async () => {
    await enlaceAuth.logout();
    await enlaceAuth.cleanup();
  }, 60000);

  describe('Feature Name', () => {
    it('should do something', async () => {
      // Arrange
      const testData = generateTestUser();

      // Act
      const result = await myBot.doSomething(testData);

      // Assert
      expect(result.success).toBe(true);
    }, 60000); // Timeout for this specific test
  });
});
```

### Using Test Data

```typescript
import {
  generateTestUser,
  generateTestPilaData,
  TEST_USERS,
  VALIDATION_ERRORS,
  retryOperation,
  sleep
} from '../utils/test-data';

// Generate random user
const user = generateTestUser();

// Generate user with overrides
const user = generateTestUser({
  nombre: 'Custom Name',
  tipoDocumento: 'CE'
});

// Use predefined test users
const user = TEST_USERS.nonExistent;
const user = TEST_USERS.complete;

// Generate PILA data
const pilaData = generateTestPilaData();

// Use validation error cases
const invalidUser = VALIDATION_ERRORS.missingDocumento;

// Retry flaky operations
const result = await retryOperation(
  () => myBot.doSomething(),
  3, // max retries
  1000 // delay ms
);

// Sleep between operations
await sleep(2000); // 2 seconds
```

### Custom Matchers

```typescript
// Check if value is valid task ID
expect(taskId).toBeValidTaskId();

// Check if value is valid Enlace user ID
expect(enlaceUserId).toBeEnlaceUserId();

// Check if value is valid planilla number
expect(numeroPlanilla).toBePlanillaNumber();
```

---

## 🔍 Test Scenarios

### Registration Tests

**File**: `tests/integration/registro.test.ts`

- ✅ Search for non-existent user
- ✅ Validate user data
- ✅ Register new user
- ✅ Find registered user
- ✅ Detect duplicate registration
- ✅ Handle different document types (CC, CE)
- ✅ Handle minimal vs complete data
- ✅ Error handling and screenshots

### Search Tests

**File**: `tests/integration/search.test.ts`

- ✅ Find existing user
- ✅ Handle non-existent user
- ✅ Quick existence check
- ✅ Performance testing
- ✅ Multiple sequential searches
- ✅ Data extraction strategies

### Liquidation Tests

**File**: `tests/integration/liquidacion.test.ts`

- ✅ Liquidate PILA for registered user
- ✅ Handle different IBC amounts (1 SMLMV, 2 SMLMV)
- ✅ Handle partial month
- ✅ Validate PILA data
- ✅ Extract planilla number
- ✅ Extract fecha límite
- ✅ Performance testing

---

## ⚙️ Configuration

### Jest Configuration

**File**: `jest.config.js`

Key settings:
- **Timeout**: 120 seconds (2 minutes) for RPA tests
- **Max Workers**: 1 (sequential execution)
- **Coverage**: Enabled for src/ files
- **Setup**: Loads `tests/setup.ts` before tests

### Test Timeouts

Different tests have different timeouts:
- **Authentication**: 180 seconds (3 minutes for manual reCAPTCHA)
- **Registration**: 120 seconds (2 minutes)
- **Search**: 60 seconds (1 minute)
- **Liquidation**: 180 seconds (3 minutes)

Override in test:
```typescript
it('slow test', async () => {
  // test code
}, 300000); // 5 minutes
```

---

## 🐛 Troubleshooting

### Tests Fail with Authentication Error

**Problem**: Can't login to Enlace

**Solutions**:
1. Check credentials in `.env.test`
2. Run with `PUPPETEER_HEADLESS=false` to see what's happening
3. Solve reCAPTCHA manually when prompted
4. Check if Enlace website is accessible

```bash
PUPPETEER_HEADLESS=false npm run test:integration:search
```

### Tests Timeout

**Problem**: Tests exceed timeout

**Solutions**:
1. Increase timeout in test
2. Check network connection
3. Check if Enlace website is slow
4. Run tests with `--verbose` to see progress

```bash
npm run test:verbose
```

### Random Test Failures

**Problem**: Tests pass sometimes, fail other times

**Solutions**:
1. Use `retryOperation` helper for flaky operations
2. Add delays between operations with `sleep()`
3. Check if selectors are correct
4. Run with `PUPPETEER_HEADLESS=false` to debug

### Selector Not Found

**Problem**: Bot can't find element

**Solutions**:
1. Update selectors in `src/bots/utils/selectors.ts`
2. Run with `PUPPETEER_HEADLESS=false` to inspect page
3. Check if Enlace website HTML changed
4. Add fallback selectors

### Database Connection Error

**Problem**: Can't connect to test database

**Solutions**:
1. Create test database: `createdb ule_rpa_test`
2. Check `DATABASE_URL` in `.env.test`
3. Run migrations: `npx prisma migrate deploy`
4. Check PostgreSQL is running

### Redis Connection Error

**Problem**: Can't connect to Redis

**Solutions**:
1. Start Redis: `redis-server`
2. Or use Docker: `docker run -d -p 6379:6379 redis:latest`
3. Check `REDIS_HOST` and `REDIS_PORT` in `.env.test`

---

## 📊 Coverage Reports

Generate coverage report:
```bash
npm run test:coverage
```

View HTML report:
```bash
open coverage/lcov-report/index.html
```

Coverage is collected from:
- `src/**/*.ts`
- Excludes: `*.d.ts`, `*.test.ts`, `*.spec.ts`, `__tests__/`, `types/`

---

## 🎯 Best Practices

### 1. Always Use Test Environment

Never run tests against production! Always use `.env.test` with test credentials.

### 2. Clean Up After Tests

Always include cleanup in `afterAll`:
```typescript
afterAll(async () => {
  await enlaceAuth.logout();
  await enlaceAuth.cleanup();
});
```

### 3. Use Descriptive Test Names

```typescript
// ❌ Bad
it('test 1', async () => { ... });

// ✅ Good
it('should register new user and return enlaceUserId', async () => { ... });
```

### 4. Test One Thing Per Test

```typescript
// ❌ Bad - Testing multiple things
it('should do everything', async () => {
  const user = await register();
  const search = await searchUser();
  const liquidation = await liquidate();
});

// ✅ Good - One responsibility
it('should register new user', async () => {
  const result = await registerUser();
  expect(result.success).toBe(true);
});
```

### 5. Use Test Data Factories

```typescript
// ❌ Bad - Hardcoded data
const user = {
  tipoDocumento: 'CC',
  numeroDocumento: '1234567890',
  // ...
};

// ✅ Good - Use factory
const user = generateTestUser();
```

### 6. Handle Flaky Tests

```typescript
// Use retry for operations that might be flaky
const result = await retryOperation(
  () => myBot.doSomething(),
  3, // max retries
  1000 // delay
);
```

### 7. Add Delays When Needed

```typescript
// Wait for database sync
await sleep(3000);

// Then verify
const result = await searchUser();
```

---

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Last Updated**: 2026-02-08
