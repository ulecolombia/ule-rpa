# Architecture Decision Log

Record of all significant architectural and design decisions made in the ULE RPA Service project.

Format: [ADR Template](https://github.com/joelparkerhenderson/architecture-decision-record)

---

## ADR-001: Use Puppeteer over Playwright for Browser Automation

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Need to choose between Puppeteer and Playwright for RPA automation of Enlace Operativo.

**Decision**:
Use Puppeteer with puppeteer-extra-plugin-stealth.

**Rationale**:
- **Stealth plugin**: Better anti-detection capabilities with puppeteer-extra ecosystem
- **Maturity**: Puppeteer has been around longer, more stable
- **Community**: Larger community for RPA-specific use cases
- **Performance**: Slightly lighter than Playwright for our single-browser use case
- **Compatibility**: Better tested against Colombian government websites

**Consequences**:
- ✅ Good anti-detection for Enlace platform
- ✅ Extensive stealth plugin ecosystem
- ❌ Playwright has better cross-browser support (not needed for us)
- ❌ Playwright has slightly better async handling (marginal for our case)

**Alternatives Considered**:
1. Playwright - More modern, better multi-browser, but less stealthy
2. Selenium - Too heavy, worse performance
3. Cypress - E2E testing focus, not suitable for RPA

---

## ADR-002: Singleton Pattern for Authentication Session

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Multiple bots need to interact with Enlace Operativo. Each bot could manage its own session, or share a single session.

**Decision**:
Use singleton pattern with shared session managed by `EnlaceAuthBot`.

**Rationale**:
- **Performance**: Avoid repeated logins (15-20s each)
- **Resource efficiency**: Single browser instance instead of multiple
- **Consistency**: Same cookies and session state across all bots
- **Simplicity**: Single point of authentication management

**Implementation**:
```typescript
export class EnlaceAuthBot {
  private static instance: EnlaceAuthBot;
  private session: EnlaceSession | null = null;

  public static getInstance(): EnlaceAuthBot {
    if (!EnlaceAuthBot.instance) {
      EnlaceAuthBot.instance = new EnlaceAuthBot();
    }
    return EnlaceAuthBot.instance;
  }

  async ensureAuthenticated(): Promise<Page> {
    if (!this.isSessionValid()) {
      await this.login();
    }
    return this.session.page;
  }
}

export const enlaceAuth = EnlaceAuthBot.getInstance();
```

**Consequences**:
- ✅ Significant performance improvement (no repeated logins)
- ✅ Lower memory footprint
- ✅ Simpler bot implementation (just call `ensureAuthenticated()`)
- ⚠️ All bots share same session (not parallelizable within single worker)
- ⚠️ Session timeout affects all bots simultaneously

**Alternatives Considered**:
1. **Session per bot**: More parallel but wasteful (multiple logins)
2. **Browser pool**: Complex, overkill for current scale
3. **Session cache**: Complex state management

**Migration Path** (if needed in future):
If we need parallel execution within same worker, implement browser pool:
```typescript
class BrowserPool {
  private sessions: Map<string, EnlaceSession> = new Map();
  async getSession(): Promise<EnlaceSession> { ... }
  async releaseSession(id: string): Promise<void> { ... }
}
```

---

## ADR-003: Function-Based vs Class-Based Bot Design

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Need consistent pattern for bot implementation. Some bots are simple (search), others complex (liquidation).

**Decision**:
Use **class-based** for stateful bots, **function-based** for stateless bots.

**Guidelines**:

**Use Class When**:
- Bot maintains state (downloads, calculations, multi-step flows)
- Bot has configuration options
- Bot has multiple related methods
- Examples: `EnlaceAuthBot`, `EnlaceLiquidacionBot`, `EnlaceComprobanteBot`

**Use Function When**:
- Bot is stateless (pure input → output)
- Single primary operation
- No configuration needed
- Examples: `buscarUsuario()`, `registrarUsuario()`

**Rationale**:
- **Flexibility**: Choose pattern based on complexity
- **Simplicity**: Functions are simpler when state not needed
- **Maintainability**: Classes organize related methods
- **Testability**: Both patterns are testable

**Implementation Examples**:

```typescript
// Class-based (stateful)
export class EnlaceComprobanteBot {
  private readonly DOWNLOADS_PATH = './uploads/comprobantes';
  private readonly TIMEOUT_MS = 60000;

  async descargarComprobante(planilla: string): Promise<Result> {
    // Can access instance properties
    const filePath = path.join(this.DOWNLOADS_PATH, `${planilla}.pdf`);
    // ...
  }

  async cleanupOldFiles(days: number): Promise<number> {
    // Related method in same class
  }
}

// Function-based (stateless)
export async function buscarUsuario(documento: string): Promise<SearchResult> {
  const page = await enlaceAuth.ensureAuthenticated();
  // Direct execution, no state
  return result;
}
```

**Consequences**:
- ✅ Clear guidelines for developers
- ✅ Appropriate complexity for each bot
- ⚠️ Need to document when to use each pattern

**Alternatives Considered**:
1. **Always use classes**: Overkill for simple operations
2. **Always use functions**: Hard to organize complex bots
3. **Always use modules**: Middle ground but less clear ownership

---

## ADR-004: BullMQ for Queue Management

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Need queue system for async RPA job processing with retry logic.

**Decision**:
Use BullMQ (successor to Bull) with Redis as storage.

**Rationale**:
- **Modern**: BullMQ is the maintained successor to Bull
- **Features**: Built-in retry, backoff, priority, scheduling
- **Reliability**: Redis persistence for job state
- **Scalability**: Can add workers horizontally
- **Monitoring**: BullBoard for queue visualization
- **Community**: Large community, well-documented

**Configuration**:
```typescript
const queue = new Queue('enlace-operations', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

**Consequences**:
- ✅ Reliable job processing with retry
- ✅ Easy to scale workers
- ✅ Job progress tracking
- ⚠️ Requires Redis infrastructure
- ⚠️ Need monitoring for queue depth

**Alternatives Considered**:
1. **Kafka**: Overkill, too complex for our scale
2. **RabbitMQ**: More complex setup, less JS-native
3. **AWS SQS**: Vendor lock-in, higher latency
4. **Database queue**: No retry logic, hard to scale

---

## ADR-005: Manual reCAPTCHA Resolution

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Enlace Operativo login has reCAPTCHA. Need to handle it.

**Decision**:
Detect reCAPTCHA and wait 2 minutes for manual resolution.

**Rationale**:
- **Legal**: Automated CAPTCHA solving is in gray area legally
- **Reliability**: Automated solutions (2captcha, anticaptcha) are unreliable
- **Cost**: CAPTCHA solving services cost $1-3 per 1000 solves
- **Frequency**: Login happens once per 30-minute session (low frequency)
- **Simplicity**: No external dependencies

**Implementation**:
```typescript
// Detect reCAPTCHA
const recaptchaExists = await elementExists(page, SELECTORS.LOGIN.RECAPTCHA_FRAME);

if (recaptchaExists) {
  logger.warn('reCAPTCHA detected, waiting for manual resolution');

  // Wait up to 2 minutes, checking button enabled state
  const solved = await waitForRecaptchaSolution(page, 120000);

  if (!solved) {
    throw new BotError('reCAPTCHA not solved within timeout');
  }
}
```

**Consequences**:
- ✅ Legal compliance
- ✅ Reliable (100% success when solved)
- ✅ No external dependencies
- ❌ Requires manual intervention (but only once per 30 min)
- ⚠️ Not fully automated

**Alternatives Considered**:
1. **2captcha/anticaptcha**: Legal gray area, costs money, unreliable
2. **Audio reCAPTCHA + speech-to-text**: Complex, unreliable, may be blocked
3. **Puppeteer stealth + hCaptcha-solver**: Doesn't work for reCAPTCHA v3
4. **Different authentication method**: Not available in Enlace

**Future Consideration**:
If Enlace adds API key authentication or OAuth, migrate to that.

---

## ADR-006: Validate Before Registration, Search Before Registration

**Date**: 2026-02-08

**Status**: Accepted

**Context**:
Registration bot must handle duplicates and validation errors gracefully.

**Decision**:
1. **Validate all required fields** before any network operation
2. **Search for existing user** before attempting registration
3. Return success with `alreadyExists: true` if user found

**Rationale**:
- **Efficiency**: Avoid unnecessary navigation if data invalid
- **Idempotency**: Multiple calls with same data return same result
- **User experience**: Clear error messages for validation vs network errors
- **Data integrity**: Prevent duplicate registrations

**Implementation Flow**:
```
1. validateUserData() → Return error if invalid
2. buscarUsuario()     → Return success if found
3. navigate()          → Only if user doesn't exist
4. fillForm()
5. submit()
6. verify()            → Search again to confirm registration
```

**Consequences**:
- ✅ Idempotent operations
- ✅ Clear error messages
- ✅ No duplicate registrations
- ✅ Faster failures for validation errors
- ⚠️ Extra search call (but fast, ~5s)

**Alternatives Considered**:
1. **Just try registration**: Would create duplicates
2. **Only search if registration fails**: Wastes time on duplicate attempt
3. **Database-only duplicate check**: Enlace is source of truth

---

## ADR-007: Screenshot Everything

**Date**: 2026-02-08

**Status**: Accepted

**Context**:
Debugging RPA failures is difficult without visual state.

**Decision**:
Capture screenshots at every major step and all errors.

**Guidelines**:
- **After navigation**: `screenshot-page-loaded`
- **Before submission**: `screenshot-before-submit`
- **After submission**: `screenshot-after-submit`
- **On error**: `screenshot-error-{context}`
- **On verification**: `screenshot-verification`

**Naming Convention**:
```
{bot-name}-{step-description}
Examples:
- search-aportantes-page
- registro-form-loaded
- registro-before-submit
- registro-error-no-button
```

**Storage**:
- Development: `./screenshots/`
- Production: Upload to S3 or database BLOB

**Retention**:
- Keep for 7 days
- Delete older screenshots to save space

**Rationale**:
- **Debugging**: See exact state when error occurred
- **Audit trail**: Proof of execution for compliance
- **Selector updates**: Easy to inspect what changed
- **Low cost**: Screenshots are small (~50-200KB each)

**Consequences**:
- ✅ Much easier debugging
- ✅ Audit trail for operations
- ✅ Helps identify Enlace UI changes
- ⚠️ Disk space usage (~1-2MB per job)
- ⚠️ May contain PII (need privacy controls)

**Privacy Considerations**:
- Blur sensitive data before storing
- Implement retention policy
- Restrict access to screenshots

---

## ADR-008: Prisma ORM for Database

**Date**: 2026-02-07

**Status**: Accepted

**Context**:
Need type-safe database access for PostgreSQL.

**Decision**:
Use Prisma ORM with PostgreSQL.

**Rationale**:
- **Type safety**: Auto-generated TypeScript types
- **Migrations**: Built-in migration system
- **Developer experience**: Excellent DX with Prisma Studio
- **Performance**: Optimized queries
- **Maturity**: Production-ready, widely adopted

**Consequences**:
- ✅ Type-safe database access
- ✅ Easy migrations
- ✅ Great developer experience
- ⚠️ Learning curve for Prisma-specific patterns

**Alternatives Considered**:
1. **TypeORM**: More complex, less modern
2. **Sequelize**: Older, less type-safe
3. **Knex**: Too low-level, no types
4. **Raw SQL**: No type safety, error-prone

---

## ADR-009: Structured Logging with Context

**Date**: 2026-02-08

**Status**: Accepted

**Context**:
Need comprehensive logging for debugging and monitoring.

**Decision**:
Use structured logging with Winston, always include context.

**Format**:
```typescript
logger.info('Operation description', {
  botType: 'registro',
  documento: '1234567890',
  step: 'form-submission',
  timestamp: Date.now(),
});
```

**Log Levels**:
- `debug`: Detailed flow (selector checks, delays)
- `info`: Major steps (navigation, submission)
- `warn`: Recoverable issues (fallback used)
- `error`: Failures (operation failed)

**Required Context**:
- `botType`: Which bot is running
- `step`: Current step in flow
- `documento/planilla/etc`: Identifier being processed
- `timestamp`: When event occurred

**Rationale**:
- **Searchability**: JSON logs can be queried
- **Debugging**: Context helps trace issues
- **Monitoring**: Can aggregate by bot type, error type, etc.
- **Correlation**: Trace entire flow with identifiers

**Consequences**:
- ✅ Easy to search and filter logs
- ✅ Better debugging with context
- ✅ Can build dashboards from structured logs
- ⚠️ Slightly more verbose code

---

## ADR-010: Multiple Selector Fallbacks

**Date**: 2026-02-08

**Status**: Accepted

**Context**:
Enlace UI may have different selectors in different sections or after updates.

**Decision**:
Always provide 2-3 fallback selectors for critical elements.

**Pattern**:
```typescript
const buttonSelectors = [
  SELECTORS.PRIMARY,      // Best selector (ID)
  SELECTORS.SECONDARY,    // Backup selector (class)
  SELECTORS.FALLBACK,     // Last resort (text-based)
];

for (const selector of buttonSelectors) {
  if (await elementExists(page, selector)) {
    await waitAndClick(page, selector);
    break;
  }
}
```

**Rationale**:
- **Resilience**: Works even if UI changes
- **Adaptability**: Handles different page versions
- **Self-healing**: Bots can adapt without code changes

**Consequences**:
- ✅ More resilient bots
- ✅ Fewer failures due to selector changes
- ⚠️ More selectors to maintain
- ⚠️ Slightly slower (tries multiple)

**Guidelines**:
- Primary: Use ID or unique class
- Secondary: Use name attribute or common class
- Fallback: Use text content or position

---

## Deprecated Decisions

### ~~ADR-XXX: Use Headless: True Always~~

**Status**: Deprecated (2026-02-08)

**Reason**: Need headless: false for development and selector updates.

**Replacement**: Use environment variable to control headless mode.

---

## Decision Template

```markdown
## ADR-XXX: [Title]

**Date**: YYYY-MM-DD

**Status**: [Proposed | Accepted | Deprecated | Superseded]

**Context**:
[Describe the problem and why a decision is needed]

**Decision**:
[State the decision clearly]

**Rationale**:
[Explain why this decision was made]

**Consequences**:
- ✅ [Positive consequence]
- ❌ [Negative consequence]
- ⚠️ [Neutral consequence / consideration]

**Alternatives Considered**:
1. [Alternative 1] - [Why not chosen]
2. [Alternative 2] - [Why not chosen]

**Implementation Notes**:
[Any code examples or specific implementation guidance]
```

---

**Last Updated**: 2026-02-08
