# Implementation Guide

Complete guide for implementing new features, modifying existing bots, and following best practices in the ULE RPA Service.

---

## Table of Contents
1. [Adding a New Bot](#adding-a-new-bot)
2. [Modifying Existing Bots](#modifying-existing-bots)
3. [Adding New Selectors](#adding-new-selectors)
4. [Implementing New API Endpoints](#implementing-new-api-endpoints)
5. [Adding Worker Tasks](#adding-worker-tasks)
6. [Best Practices](#best-practices)
7. [Testing Guide](#testing-guide)
8. [Deployment Checklist](#deployment-checklist)

---

## Adding a New Bot

### Step 1: Plan the Bot

**Questions to answer**:
- What is the bot's purpose?
- What page/section does it interact with?
- What inputs does it need?
- What outputs should it return?
- Does it need authentication? (Answer: Always yes for Enlace)
- Should it be a class or function?

**Decision: Class vs Function**
- **Use Class** if:
  - Bot maintains state (session, downloads, etc.)
  - Bot has multiple related methods
  - Bot needs configuration
  - Example: `EnlaceComprobanteBot` (download tracking state)

- **Use Function** if:
  - Bot is stateless
  - Single primary operation
  - Simple input → output
  - Example: `buscarUsuario()`, `registrarUsuario()`

### Step 2: Create Bot File

**Location**: `src/bots/enlace/[name].bot.ts`

**Template for Function-Based Bot**:
```typescript
/**
 * [Name] Bot for Enlace Operativo
 * [Description of what this bot does]
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { enlaceAuth } from './auth.bot';
import { waitAndType, waitAndClick, sleep, elementExists, randomDelay } from '../utils/wait';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import { browserManager } from '../utils/browser';
import { BotError } from '../../utils/errors';

/**
 * Result interface
 */
export interface MyBotResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Main bot function
 * @param input - Input parameters
 * @returns Bot result
 */
export async function myBotFunction(input: string): Promise<MyBotResult> {
  logger.info('Starting [bot name]', { input });

  try {
    // 1. Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    // 2. Navigate to section
    logger.info('Navigating to [section]');
    await page.goto(URL_PATTERNS.MY_SECTION, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await sleep(2000);
    await browserManager.takeScreenshot(page, 'mybot-section');

    // 3. Execute bot logic
    logger.info('Executing [operation]');
    const result = await executeOperation(page, input);

    // 4. Verify result
    logger.info('Verifying result');
    const verified = await verifyResult(page, result);

    if (!verified) {
      throw new BotError('Result verification failed');
    }

    logger.info('✅ [Bot name] completed successfully', { result });

    return {
      success: true,
      data: result,
    };

  } catch (error) {
    logger.error('❌ [Bot name] failed', { error });
    await browserManager.takeScreenshot(page, 'mybot-error');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Helper function: execute operation
 */
async function executeOperation(page: Page, input: string): Promise<any> {
  // Implementation
}

/**
 * Helper function: verify result
 */
async function verifyResult(page: Page, result: any): Promise<boolean> {
  // Implementation
}
```

**Template for Class-Based Bot**:
```typescript
/**
 * [Name] Bot for Enlace Operativo
 * [Description]
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { BotResponse } from '../../types';
import { enlaceAuth } from './auth.bot';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import { waitAndClick, sleep } from '../utils/wait';
import { browserManager } from '../utils/browser';
import { BotError } from '../../utils/errors';

export interface MyBotResult {
  data: string;
}

/**
 * My Bot Class
 */
export class MyBot {
  private config: any;

  constructor(config?: any) {
    this.config = config || {};
  }

  /**
   * Main operation
   */
  async executeOperation(input: string): Promise<BotResponse<MyBotResult>> {
    const startTime = Date.now();

    logger.info('Starting operation', { input });

    const page = await enlaceAuth.ensureAuthenticated();

    try {
      // Bot logic here

      return {
        success: true,
        data: { data: 'result' },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const screenshot = await browserManager.takeScreenshot(page, 'mybot-error');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        screenshot,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Helper method
   */
  private async helperMethod(page: Page): Promise<void> {
    // Implementation
  }
}

/**
 * Singleton instance
 */
export const myBot = new MyBot();

/**
 * Quick function for convenience
 */
export async function myQuickFunction(input: string): Promise<BotResponse<MyBotResult>> {
  return myBot.executeOperation(input);
}
```

### Step 3: Add Selectors

**File**: `src/bots/utils/selectors.ts`

```typescript
export const SELECTORS = {
  // ... existing selectors

  MY_SECTION: {
    MENU_ITEM: 'a[href*="my-section"]',
    INPUT_FIELD: '#my-input',
    SUBMIT_BUTTON: 'button.btn-submit',
    RESULT_MESSAGE: '.result-message',
  },
};

export const URL_PATTERNS = {
  // ... existing patterns
  MY_SECTION: '/gestion/#/home/my-section',
};
```

### Step 4: Add Tests

**File**: `src/bots/enlace/__tests__/mybot.test.ts`

```typescript
import { myBotFunction } from '../mybot.bot';

describe('MyBot', () => {
  it('should execute successfully with valid input', async () => {
    const result = await myBotFunction('test-input');
    expect(result.success).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    const result = await myBotFunction('invalid-input');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Step 5: Document the Bot

**File**: `src/bots/README.md`

Add section:
```markdown
### MyBot

**Purpose**: [Description]

**File**: `src/bots/enlace/mybot.bot.ts`

**Usage**:
\`\`\`typescript
import { myBotFunction } from './bots/enlace/mybot.bot';

const result = await myBotFunction('input-data');

if (result.success) {
  console.log('Result:', result.data);
} else {
  console.error('Error:', result.error);
}
\`\`\`

**Input**:
- `input`: Description

**Output**:
- `success`: boolean
- `data`: Result data
- `error`: Error message (if failed)
```

### Step 6: Update Context Files

1. **CONTEXT.md**: Add bot to "Critical Files Map"
2. **BOT_FLOWS.md**: Add flow diagram
3. **PROGRESS.md**: Update statistics

### Step 7: Test & Commit

```bash
# Test locally
npm run test:mybot

# Commit
git add .
git commit -m "feat: Implement [MyBot] for [purpose]

- Add mybot.bot.ts with [functionality]
- Add selectors for [section]
- Add tests
- Update documentation

Implements feature #XXX"

git push origin main
```

---

## Modifying Existing Bots

### Step 1: Understand Current Implementation

1. Read bot file: `src/bots/enlace/[name].bot.ts`
2. Check flow: `BOT_FLOWS.md`
3. Review selectors: `SELECTORS_MAP.md`
4. Check tests: `src/bots/enlace/__tests__/[name].test.ts`

### Step 2: Make Changes

**Always follow this pattern**:

```typescript
// BEFORE: Old implementation
export async function oldImplementation(input: string): Promise<Result> {
  // ... old code
}

// AFTER: Improved implementation
export async function oldImplementation(input: string): Promise<Result> {
  // 1. Add pre-flight validation
  if (!input || input.length < 3) {
    return { success: false, error: 'Invalid input' };
  }

  // 2. Add detailed logging
  logger.info('Starting operation', { input });

  try {
    // 3. Improve error handling
    const result = await executeWithRetry(input);

    // 4. Add result verification
    if (!verifyResult(result)) {
      throw new BotError('Result verification failed');
    }

    return { success: true, data: result };

  } catch (error) {
    // 5. Capture screenshot on error
    await browserManager.takeScreenshot(page, 'operation-error');

    // 6. Return structured error
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### Step 3: Update Tests

Add tests for new behavior:

```typescript
describe('Modified behavior', () => {
  it('should handle new edge case', async () => {
    // Test new functionality
  });

  it('should maintain backward compatibility', async () => {
    // Ensure old behavior still works
  });
});
```

### Step 4: Update Documentation

- Update `BOT_FLOWS.md` if flow changed
- Update `README.md` if interface changed
- Update `SELECTORS_MAP.md` if selectors changed
- Add note to `DECISION_LOG.md` if architecture changed

### Step 5: Version & Commit

```bash
git add .
git commit -m "refactor: Improve [bot name] error handling

- Add pre-flight validation
- Improve error messages
- Add retry logic for transient failures
- Update tests and documentation

Closes #XXX"
```

---

## Adding New Selectors

### Step 1: Inspect Element in Real Site

1. Set `headless: false` in `browser.ts`
2. Run bot
3. Open DevTools (F12)
4. Inspect target element
5. Find best selector (priority: ID > class > name > XPath)

### Step 2: Add to selectors.ts

```typescript
export const SELECTORS = {
  MY_SECTION: {
    // Existing selectors
    OLD_FIELD: '#old-field',

    // NEW: Add your selector with comment
    NEW_FIELD: '#new-field', // Description of field
    NEW_BUTTON: 'button.btn-new', // Fallback for new button
    NEW_BUTTON_ALT: 'button:contains("New")', // Text-based fallback
  },
};
```

### Step 3: Document in SELECTORS_MAP.md

Add detailed documentation:

```markdown
#### NEW_FIELD

**Current Selector**: `#new-field`

**How to Find**:
1. Navigate to [section]
2. [Description of where element is]
3. Inspect element
4. Look for `<input id="new-field">`

**Usage**:
\`\`\`typescript
await waitAndType(page, SELECTORS.MY_SECTION.NEW_FIELD, value);
\`\`\`
```

### Step 4: Test Selector

```typescript
// In bot code
const exists = await elementExists(page, SELECTORS.MY_SECTION.NEW_FIELD);
if (!exists) {
  logger.error('NEW_FIELD selector not working');
  // Try fallback
}
```

---

## Implementing New API Endpoints

### Step 1: Add Route

**File**: `src/api/routes/enlace.routes.ts`

```typescript
import { Router } from 'express';
import { myBotFunction } from '../../bots/enlace/mybot.bot';
import { enlaceQueue } from '../../orchestrator/queue';

const router = Router();

/**
 * POST /api/enlace/my-operation
 * Execute my bot operation
 */
router.post('/my-operation', async (req, res) => {
  try {
    // 1. Validate request
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: input',
      });
    }

    // 2. Add to queue
    const job = await enlaceQueue.add('my-operation', {
      input,
      userId: req.user?.id,
    });

    // 3. Return job ID
    res.json({
      success: true,
      jobId: job.id,
      status: 'queued',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### Step 2: Add Validation Schema

**File**: `src/api/validators/enlace.validators.ts`

```typescript
import Joi from 'joi';

export const myOperationSchema = Joi.object({
  input: Joi.string().required().min(3).max(100),
});

export function validateMyOperation(data: any) {
  return myOperationSchema.validate(data);
}
```

### Step 3: Add Worker Handler

**File**: `src/orchestrator/worker.ts`

```typescript
async function handleMyOperationJob(job: Job): Promise<any> {
  const { input } = job.data;

  // 1. Execute bot
  await job.updateProgress(20);
  const result = await myBotFunction(input);

  // 2. Update database if needed
  await job.updateProgress(80);
  if (result.success) {
    await prisma.myTable.create({
      data: {
        input,
        output: result.data,
      },
    });
  }

  // 3. Send webhook if needed
  await job.updateProgress(90);
  await sendWebhook({
    event: 'my-operation-complete',
    success: result.success,
    data: result.data,
  });

  await job.updateProgress(100);
  return result;
}

// Add to worker switch statement
worker.on('job', async (job) => {
  switch (job.name) {
    case 'my-operation':
      return await handleMyOperationJob(job);
    // ... other cases
  }
});
```

### Step 4: Add Database Schema (if needed)

**File**: `prisma/schema.prisma`

```prisma
model MyTable {
  id        String   @id @default(uuid())
  input     String
  output    String?
  status    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Then run:
```bash
npx prisma migrate dev --name add_my_table
```

### Step 5: Test Endpoint

```bash
curl -X POST http://localhost:3000/api/enlace/my-operation \
  -H "Content-Type: application/json" \
  -d '{"input": "test-value"}'
```

---

## Adding Worker Tasks

### Step 1: Define Job Type

**File**: `src/types/jobs.ts`

```typescript
export interface MyOperationJobData {
  input: string;
  userId: string;
  options?: {
    retries?: number;
    timeout?: number;
  };
}
```

### Step 2: Create Job Handler

**File**: `src/orchestrator/handlers/myoperation.handler.ts`

```typescript
import { Job } from 'bullmq';
import { logger } from '../../utils/logger';
import { myBotFunction } from '../../bots/enlace/mybot.bot';
import { MyOperationJobData } from '../../types/jobs';

export async function handleMyOperation(job: Job<MyOperationJobData>): Promise<any> {
  const { input, userId, options } = job.data;

  logger.info('Processing my-operation job', { jobId: job.id, input });

  try {
    // Update progress
    await job.updateProgress(10);
    await job.log('Starting bot execution');

    // Execute bot
    const result = await myBotFunction(input);

    if (!result.success) {
      throw new Error(result.error || 'Bot execution failed');
    }

    await job.updateProgress(80);
    await job.log('Bot execution successful');

    // Store result
    await storeResult(userId, result.data);

    await job.updateProgress(100);

    return {
      success: true,
      data: result.data,
    };

  } catch (error) {
    logger.error('Job failed', { jobId: job.id, error });

    await job.log(`Error: ${error.message}`);

    throw error; // Let BullMQ handle retry
  }
}

async function storeResult(userId: string, data: any): Promise<void> {
  // Store in database
}
```

### Step 3: Register Handler in Worker

**File**: `src/orchestrator/worker.ts`

```typescript
import { handleMyOperation } from './handlers/myoperation.handler';

const worker = new Worker('enlace-operations', async (job) => {
  switch (job.name) {
    case 'my-operation':
      return await handleMyOperation(job);

    // ... other cases

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}, workerConfig);
```

### Step 4: Configure Job Options

```typescript
// In queue.ts or when adding job
const job = await enlaceQueue.add('my-operation', data, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: false,
});
```

---

## Best Practices

### 1. Error Handling

**Always use try/catch**:
```typescript
try {
  await operation();
} catch (error) {
  await captureScreenshot();
  logger.error('Operation failed', { error });
  throw new BotError('Specific error message');
}
```

**Never swallow errors**:
```typescript
// ❌ BAD
try {
  await operation();
} catch (error) {
  // Silent failure
}

// ✅ GOOD
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', { error });
  throw error;
}
```

### 2. Logging

**Use structured logging**:
```typescript
// ✅ GOOD
logger.info('User registration started', {
  documento: userData.numeroDocumento,
  nombre: userData.nombre,
  timestamp: Date.now(),
});

// ❌ BAD
logger.info(`Starting registration for ${userData.numeroDocumento}`);
```

**Log at appropriate levels**:
- `debug`: Detailed flow (selector checks, delays)
- `info`: Major steps (navigation, form submission)
- `warn`: Recoverable issues (fallback selector used)
- `error`: Failures (operation failed)

### 3. Screenshots

**Capture at key points**:
```typescript
// After navigation
await browserManager.takeScreenshot(page, 'step-1-navigation');

// Before submission
await browserManager.takeScreenshot(page, 'step-2-before-submit');

// On error
await browserManager.takeScreenshot(page, 'error-state');
```

### 4. Selectors

**Use fallbacks**:
```typescript
const selectors = [PRIMARY, SECONDARY, FALLBACK];
for (const selector of selectors) {
  if (await elementExists(page, selector)) {
    await waitAndClick(page, selector);
    break;
  }
}
```

**Never hardcode selectors**:
```typescript
// ❌ BAD
await page.click('#submit-button');

// ✅ GOOD
await waitAndClick(page, SELECTORS.FORM.SUBMIT_BUTTON);
```

### 5. Delays

**Use appropriate delays**:
```typescript
// Random delay for human-like behavior
await randomDelay(500, 1500);

// Fixed delay for page load
await sleep(2000);

// Wait for specific element
await page.waitForSelector(selector, { timeout: 10000 });
```

**Never use arbitrary long delays**:
```typescript
// ❌ BAD
await sleep(10000); // Why 10 seconds?

// ✅ GOOD
await page.waitForNavigation({ waitUntil: 'networkidle0' });
```

### 6. Validation

**Validate early**:
```typescript
// Validate at function entry
if (!input || !input.trim()) {
  return { success: false, error: 'Invalid input' };
}

// Validate before expensive operations
const validation = validateData(data);
if (!validation.valid) {
  return { success: false, error: validation.errors.join(', ') };
}
```

### 7. Code Organization

**Keep functions focused**:
```typescript
// ✅ GOOD - Single responsibility
async function fillForm(page: Page, data: FormData): Promise<void> {
  await fillField1(page, data.field1);
  await fillField2(page, data.field2);
}

async function submitForm(page: Page): Promise<boolean> {
  await clickSubmit(page);
  return await checkSuccess(page);
}

// ❌ BAD - Doing too much
async function fillAndSubmitAndVerify(page: Page, data: any): Promise<any> {
  // 200 lines of mixed concerns
}
```

### 8. Documentation

**Document complex logic**:
```typescript
/**
 * Extract user ID from table row
 *
 * The Enlace platform uses different attributes for user ID:
 * 1. Try `data-user-id` (new UI)
 * 2. Try `data-id` (old UI)
 * 3. Try `id` attribute
 * 4. Try first cell text (fallback)
 */
function extractUserId(row: Element): string | undefined {
  return (
    row.getAttribute('data-user-id') ||
    row.getAttribute('data-id') ||
    row.getAttribute('id') ||
    row.querySelector('td:first-child')?.textContent
  );
}
```

---

## Testing Guide

### Unit Tests

**File**: `src/bots/enlace/__tests__/[name].test.ts`

```typescript
import { myBotFunction } from '../mybot.bot';
import { enlaceAuth } from '../auth.bot';

// Mock authentication
jest.mock('../auth.bot');

describe('MyBot', () => {
  beforeEach(() => {
    // Setup mocks
    (enlaceAuth.ensureAuthenticated as jest.Mock).mockResolvedValue(mockPage);
  });

  it('should execute successfully', async () => {
    const result = await myBotFunction('valid-input');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should handle invalid input', async () => {
    const result = await myBotFunction('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
  });
});
```

### Integration Tests

**File**: `src/bots/__tests__/integration/mybot.integration.test.ts`

```typescript
import { myBotFunction } from '../../enlace/mybot.bot';

// NOTE: These tests require real Enlace credentials
// Only run in CI/staging environment

describe('MyBot Integration', () => {
  it('should work end-to-end', async () => {
    const result = await myBotFunction('real-input');
    expect(result.success).toBe(true);
  }, 60000); // 60s timeout
});
```

### Manual Testing

```bash
# 1. Set headless to false
# In src/bots/utils/browser.ts: headless: false

# 2. Run specific bot
npm run test:mybot

# 3. Watch execution
# Browser will open and execute bot

# 4. Check screenshots
ls -la screenshots/
```

---

## Deployment Checklist

### Before Deployment

- [ ] **Selectors updated** from real site inspection
- [ ] **All tests passing** (`npm test`)
- [ ] **TypeScript compiles** (`npm run build`)
- [ ] **Environment variables** configured in `.env.production`
- [ ] **Database migrations** applied (`npx prisma migrate deploy`)
- [ ] **Redis connection** tested
- [ ] **Credentials** verified (test login manually)
- [ ] **Error handling** added for all operations
- [ ] **Logging** configured (log level, destination)
- [ ] **Screenshots** directory configured
- [ ] **Downloads** directory configured
- [ ] **Documentation** updated (README, CONTEXT, PROGRESS)

### Deployment Steps

1. **Build**:
   ```bash
   npm run build
   ```

2. **Database**:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

3. **Start Services**:
   ```bash
   # API
   npm run start:api

   # Worker
   npm run start:worker
   ```

4. **Verify**:
   ```bash
   # Health check
   curl http://localhost:3000/health

   # Test endpoint
   curl -X POST http://localhost:3000/api/enlace/test
   ```

### Post-Deployment

- [ ] **Monitor logs** for errors
- [ ] **Check queue** is processing jobs
- [ ] **Verify screenshots** are being captured
- [ ] **Test critical flows** (auth, search, registro)
- [ ] **Monitor performance** (execution times)
- [ ] **Set up alerts** for failures

---

**Last Updated**: 2026-02-08
