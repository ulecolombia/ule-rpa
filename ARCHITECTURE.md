# ULE RPA Service - Technical Architecture

## System Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────────────────┐
│   ULE API   │─────▶│   BullMQ    │─────▶│   Worker    │─────▶│  Enlace Bots     │
│  (External) │      │   Queue     │      │ Orchestrator│      │  (Puppeteer)     │
└─────────────┘      └─────────────┘      └─────────────┘      └──────────────────┘
                            │                                             │
                            ▼                                             ▼
                     ┌─────────────┐                            ┌──────────────────┐
                     │    Redis    │                            │ Enlace Operativo │
                     │   (Queue    │                            │  (suaporte.com)  │
                     │   Storage)  │                            └──────────────────┘
                     └─────────────┘                                       │
                                                                           ▼
      ┌────────────────────────────────────────────────────────────────────────┐
      │                         Bot Results & Screenshots                       │
      ▼                                                                         ▼
┌─────────────┐                                                        ┌─────────────┐
│ PostgreSQL  │                                                        │ File System │
│  Database   │                                                        │ ./uploads/  │
│  (Prisma)   │                                                        │./screenshots│
└─────────────┘                                                        └─────────────┘
```

---

## Layer Architecture

### Layer 1: API Layer (Entry Point)
**File**: `src/api/routes/enlace.routes.ts`

**Responsibilities**:
- Receive HTTP requests from ULE platform
- Validate request payloads
- Add jobs to BullMQ queue
- Return job IDs to caller
- Handle webhooks for status updates

**Endpoints**:
```typescript
POST /api/enlace/register
POST /api/enlace/liquidar
POST /api/enlace/comprobante
GET  /api/enlace/status/:jobId
```

**Pattern**: Fire-and-forget (async processing)
```typescript
router.post('/register', async (req, res) => {
  // 1. Validate payload
  const userData = validateUserData(req.body);

  // 2. Add to queue
  const job = await enlaceQueue.add('registro', userData);

  // 3. Return immediately
  res.json({ jobId: job.id, status: 'queued' });
});
```

---

### Layer 2: Queue Layer (BullMQ + Redis)
**File**: `src/orchestrator/queue.ts`

**Responsibilities**:
- Job persistence
- Retry logic
- Priority management
- Job scheduling
- Dead letter queue

**Queue Configuration**:
```typescript
const enlaceQueue = new Queue('enlace-operations', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 86400, // Keep 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 604800, // Keep 7 days
    },
  },
});
```

**Job Types**:
- `registro` - User registration
- `liquidacion` - PILA liquidation
- `comprobante` - Receipt download
- `batch-registro` - Bulk registration

---

### Layer 3: Worker Layer (Orchestrator)
**File**: `src/orchestrator/worker.ts`

**Responsibilities**:
- Process jobs from queue
- Execute appropriate bot
- Handle errors and retries
- Update database with results
- Send webhooks on completion

**Worker Pattern**:
```typescript
const worker = new Worker('enlace-operations', async (job) => {
  const { type, data } = job;

  switch (type) {
    case 'registro':
      return await handleRegistroJob(job);
    case 'liquidacion':
      return await handleLiquidacionJob(job);
    case 'comprobante':
      return await handleComprobanteJob(job);
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}, {
  connection: redisConnection,
  concurrency: 3, // Max 3 bots running simultaneously
  limiter: {
    max: 10,
    duration: 60000, // Max 10 jobs per minute
  },
});
```

**Job Handler Pattern**:
```typescript
async function handleRegistroJob(job: Job): Promise<any> {
  const { uleUserId, userData } = job.data;

  // 1. Update job progress
  await job.updateProgress(10);

  // 2. Execute bot
  logger.info('Starting registration bot', { uleUserId });
  const result = await registrarUsuario(userData);

  // 3. Update database
  await job.updateProgress(80);
  if (result.success) {
    await prisma.enlaceUser.upsert({
      where: { uleUserId },
      update: {
        enlaceUserId: result.enlaceUserId,
        status: result.alreadyExists ? 'active' : 'registered',
        lastSyncAt: new Date(),
      },
      create: {
        uleUserId,
        enlaceUserId: result.enlaceUserId,
        numeroDocumento: userData.numeroDocumento,
        nombre: userData.nombre,
        status: 'registered',
      },
    });
  } else {
    await prisma.enlaceUser.update({
      where: { uleUserId },
      data: {
        status: 'registration_failed',
        errorMessage: result.error,
      },
    });
  }

  // 4. Send webhook
  await job.updateProgress(90);
  await sendWebhook({
    event: 'registration_complete',
    uleUserId,
    success: result.success,
    enlaceUserId: result.enlaceUserId,
  });

  // 5. Return result
  await job.updateProgress(100);
  return result;
}
```

---

### Layer 4: Bot Layer (RPA Execution)
**Directory**: `src/bots/enlace/`

**Responsibilities**:
- Browser automation (Puppeteer)
- Page interaction (click, type, select)
- Data extraction
- Screenshot capture
- Error handling

**Bot Structure**:
```
src/bots/
├── enlace/
│   ├── auth.bot.ts          (Session management)
│   ├── search.bot.ts        (User search)
│   ├── registro.bot.ts      (Registration)
│   ├── liquidacion.bot.ts   (PILA liquidation)
│   └── comprobante.bot.ts   (Receipt download)
├── utils/
│   ├── browser.ts           (BrowserManager)
│   ├── wait.ts              (Helper functions)
│   └── selectors.ts         (CSS/XPath selectors)
└── README.md
```

**Bot Lifecycle**:
```typescript
// 1. Get authenticated session
const page = await enlaceAuth.ensureAuthenticated();

// 2. Navigate to section
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(2000);
await browserManager.takeScreenshot(page, 'step-1-navigation');

// 3. Interact with page
await waitAndType(page, SELECTOR, value, { delay: 100 });
await randomDelay(500, 1500);
await waitAndClick(page, BUTTON_SELECTOR);

// 4. Verify result
const success = await checkResult(page);
await browserManager.takeScreenshot(page, 'step-2-result');

// 5. Return structured response
return {
  success,
  data: extractedData,
  screenshot: screenshotPath,
  duration: Date.now() - startTime,
};
```

---

## Anti-Detection Strategy

### Browser Configuration
**File**: `src/bots/utils/browser.ts`

```typescript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080',
  ],
});

const page = await browser.newPage();

// Set realistic viewport
await page.setViewport({ width: 1920, height: 1080 });

// Set realistic user agent
await page.setUserAgent(
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
);

// Set locale and timezone
await page.setExtraHTTPHeaders({
  'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
});
```

### Human-Like Behavior
```typescript
// Random delays between actions
await randomDelay(500, 1500);

// Variable typing speed
await waitAndType(page, selector, text, { delay: 80 }); // 80ms per char

// Scroll before click (more natural)
await scrollToElement(page, selector);
await randomDelay(300, 700);
await waitAndClick(page, selector);

// Mouse movement simulation
await page.mouse.move(x, y);
await page.mouse.click(x, y);
```

### Stealth Features
- **webdriver** property hidden
- **chrome** object present
- **permissions** realistic
- **plugins** realistic array
- **languages** matches headers
- **screen** resolution realistic

---

## Session Management Architecture

### Singleton Pattern
```typescript
export class EnlaceAuthBot {
  private static instance: EnlaceAuthBot;
  private session: EnlaceSession | null = null;

  private constructor() {} // Prevent direct instantiation

  public static getInstance(): EnlaceAuthBot {
    if (!EnlaceAuthBot.instance) {
      EnlaceAuthBot.instance = new EnlaceAuthBot();
    }
    return EnlaceAuthBot.instance;
  }
}

// Export singleton instance
export const enlaceAuth = EnlaceAuthBot.getInstance();
```

### Session Lifecycle
```
┌──────────────────────────────────────────────────────────┐
│                     Session Start                         │
│  enlaceAuth.login() → Creates browser + page + session   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│                  Active Session                           │
│  - Browser running                                        │
│  - Page authenticated                                     │
│  - Session timestamp tracked                             │
│  - Shared by all bots                                    │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │   Bot requests page via   │
         │ ensureAuthenticated()     │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │  Check session validity:  │
         │  - Age < 30 min?          │
         │  - Page still open?       │
         │  - URL still valid?       │
         └───────────┬───────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌────────┐            ┌──────────┐
    │ Valid  │            │ Invalid  │
    │ Return │            │ Re-login │
    │ page   │            │ Refresh  │
    └────────┘            └──────────┘
```

### Session Sharing Benefit
- **Single browser instance** for all bots
- **No repeated logins** (faster execution)
- **Consistent cookies** across operations
- **Lower memory footprint**

---

## Data Flow Architecture

### Registration Flow
```
User Data → API Validation → Queue → Worker → Bot Pipeline
                                              ↓
                              ┌───────────────────────────────┐
                              │ 1. validateUserData()         │
                              │    - Check required fields    │
                              │    - Validate formats         │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 2. buscarUsuario()            │
                              │    - Search by documento      │
                              │    - Return if exists         │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 3. navigateToAportantes()     │
                              │    - Click "Add" button       │
                              │    - Wait for form            │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 4. fillRegistrationForm()     │
                              │    - Fill all fields          │
                              │    - Handle optional fields   │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 5. submitRegistrationForm()   │
                              │    - Click save button        │
                              │    - Wait for response        │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 6. checkRegistrationResult()  │
                              │    - Check success messages   │
                              │    - Check error messages     │
                              └──────────┬────────────────────┘
                                         │
                              ┌──────────▼────────────────────┐
                              │ 7. verifyBySearch()           │
                              │    - Search for created user  │
                              │    - Extract enlaceUserId     │
                              └──────────┬────────────────────┘
                                         │
                                         ▼
                              ┌────────────────────────────────┐
                              │ Return RegistroResult          │
                              │ - success: true                │
                              │ - enlaceUserId: "XXX"          │
                              │ - alreadyExists: false         │
                              └────────────────────────────────┘
```

---

## Error Handling Architecture

### Error Hierarchy
```
Error (base)
├── BotError (src/utils/errors.ts)
│   ├── NavigationError
│   ├── ElementNotFoundError
│   ├── FormSubmissionError
│   └── ValidationError
├── AuthenticationError
├── NetworkError
└── TimeoutError
```

### Error Handling Layers

**Layer 1: Bot Level**
```typescript
try {
  await executeOperation();
} catch (error) {
  await browserManager.takeScreenshot(page, 'error-state');
  logger.error('Operation failed', { error, context });
  throw new BotError('Specific error message', { originalError: error });
}
```

**Layer 2: Worker Level**
```typescript
try {
  const result = await botFunction();
  return result;
} catch (error) {
  // Log to database
  await logError(job.id, error);

  // Send alert
  await sendAlert('bot_failure', { jobId: job.id, error });

  // Let BullMQ retry
  throw error; // BullMQ will retry based on job options
}
```

**Layer 3: Queue Level**
```typescript
// BullMQ automatic retry
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
}

// After max attempts → Dead Letter Queue
worker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-job', {
      originalJob: job.data,
      error: error.message,
      attempts: job.attemptsMade,
    });
  }
});
```

---

## Database Schema (Prisma)

### Core Models
```prisma
model EnlaceUser {
  id              String   @id @default(uuid())
  uleUserId       String   @unique
  enlaceUserId    String?  @unique
  numeroDocumento String
  nombre          String
  tipoDocumento   String
  email           String?
  telefono        String?
  status          String   // 'pending', 'registered', 'active', 'failed'
  errorMessage    String?
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  liquidaciones   Liquidacion[]
  comprobantes    Comprobante[]
}

model Liquidacion {
  id              String   @id @default(uuid())
  enlaceUser      EnlaceUser @relation(fields: [enlaceUserId], references: [id])
  enlaceUserId    String
  numeroPlanilla  String   @unique
  periodo         String   // YYYY-MM
  ibc             Int      // Ingreso Base de Cotización
  diasCotizados   Int
  valorSalud      Int
  valorPension    Int
  valorArl        Int
  valorTotal      Int
  fechaLimite     DateTime
  status          String   // 'generated', 'paid', 'failed'
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  comprobante     Comprobante?
}

model Comprobante {
  id              String   @id @default(uuid())
  enlaceUser      EnlaceUser @relation(fields: [enlaceUserId], references: [id])
  enlaceUserId    String
  liquidacion     Liquidacion @relation(fields: [liquidacionId], references: [id])
  liquidacionId   String   @unique
  numeroPlanilla  String
  fileName        String
  filePath        String
  fileSize        Int
  downloadedAt    DateTime @default(now())
  createdAt       DateTime @default(now())
}

model JobLog {
  id              String   @id @default(uuid())
  jobId           String   @unique
  jobType         String   // 'registro', 'liquidacion', 'comprobante'
  status          String   // 'queued', 'processing', 'completed', 'failed'
  attempts        Int      @default(0)
  errorMessage    String?
  screenshot      String?
  duration        Int?     // milliseconds
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Scalability Considerations

### Horizontal Scaling
```typescript
// Multiple worker instances
const worker1 = new Worker('enlace-operations', processJob, {
  connection: redis1,
  concurrency: 3
});

const worker2 = new Worker('enlace-operations', processJob, {
  connection: redis2,
  concurrency: 3
});

// Result: 6 bots can run in parallel
```

### Browser Pool Pattern (Future)
```typescript
class BrowserPool {
  private browsers: Browser[] = [];
  private maxBrowsers = 5;

  async getBrowser(): Promise<Browser> {
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await puppeteer.launch();
      this.browsers.push(browser);
      return browser;
    }
    // Return least busy browser
    return this.getLeastBusyBrowser();
  }

  async releaseBrowser(browser: Browser): Promise<void> {
    // Close pages but keep browser alive
    const pages = await browser.pages();
    for (const page of pages) {
      await page.close();
    }
  }
}
```

### Rate Limiting
```typescript
// BullMQ limiter
{
  limiter: {
    max: 10,        // Max 10 jobs
    duration: 60000 // Per minute
  }
}

// API rate limiting (express-rate-limit)
const limiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 20,         // Max 20 requests per minute
});
app.use('/api/enlace', limiter);
```

---

## Monitoring & Observability

### Logging Strategy
```typescript
// Structured logging with Winston
logger.info('Bot execution started', {
  botType: 'registro',
  uleUserId: '123',
  timestamp: Date.now(),
});

logger.error('Bot execution failed', {
  botType: 'registro',
  uleUserId: '123',
  error: error.message,
  stack: error.stack,
  screenshot: 'error-123.png',
});
```

### Metrics to Track
- **Execution time** per bot type
- **Success rate** (successes / total attempts)
- **Error rate** by error type
- **Queue depth** (pending jobs)
- **Worker utilization** (active jobs / concurrency)
- **Session lifetime** (how often re-auth needed)

### Health Checks
```typescript
// API health endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    redis: await checkRedis(),
    database: await checkDatabase(),
    browser: await checkBrowser(),
    queue: await checkQueue(),
  };
  res.json(health);
});
```

---

## Security Considerations

### Credential Management
- Store in environment variables
- Never commit to git
- Use secret manager in production (AWS Secrets Manager, HashiCorp Vault)

### Screenshot Privacy
- Screenshots may contain PII (Personally Identifiable Information)
- Implement retention policy (delete after 7 days)
- Blur sensitive data before storing

### Network Security
- Use HTTPS for all external requests
- Implement request signing for webhooks
- Validate webhook signatures

---

## Deployment Architecture

### Docker Containers
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - redis
      - postgres

  worker:
    build: .
    command: npm run worker
    environment:
      - NODE_ENV=production
      - PUPPETEER_HEADLESS=true
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=ule_rpa
    volumes:
      - pgdata:/var/lib/postgresql/data
```

### Environment-Specific Config
- **Development**: headless: false, verbose logs, local DB
- **Staging**: headless: true, detailed logs, staging DB
- **Production**: headless: true, error logs only, production DB, monitoring

---

**Last Updated**: 2026-02-08
