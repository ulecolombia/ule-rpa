# ULE RPA Service - Master Context File

## Purpose
This file maintains **perfect context** for AI sessions working on this RPA project. Read this file at the start of every session to understand the complete project state.

---

## Project Overview

### What is ULE RPA Service?
An **automated RPA (Robotic Process Automation) service** that handles Colombian social security (PILA) payments for independent workers through **Enlace Operativo** (suaporte.com.co).

### Why does it exist?
Colombian independent workers must pay monthly PILA contributions (health, pension, ARL). ULE provides a platform to manage these payments, and this RPA service automates the manual process of:
1. Registering workers in Enlace Operativo
2. Calculating PILA contributions
3. Generating payment slips (planillas)
4. Downloading payment receipts (comprobantes)

### Tech Stack
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ + Redis
- **RPA**: Puppeteer + puppeteer-extra-plugin-stealth
- **Architecture**: Microservices (API → Queue → Worker → Bots)

---

## Current Project State (as of 2026-02-08)

### Phase Completed: FASE 2 - Bot System Implementation ✅

**5 Bots Implemented (100% Complete)**:
1. ✅ **EnlaceAuthBot** - Session-based authentication with reCAPTCHA handling
2. ✅ **Search Bot** - User search by document number
3. ✅ **Registration Bot** - New user registration with validation
4. ✅ **EnlaceLiquidacionBot** - PILA liquidation and planilla generation
5. ✅ **EnlaceComprobanteBot** - PDF receipt downloads

**Statistics**:
- 56 files modified/created
- 11,591+ lines of code
- 750+ lines of documentation
- 3 commits pushed to GitHub

**Git Commits**:
- `e8e5012` - Complete RPA bot system implementation
- `91aa0ce` - Comprehensive registration bot with validation
- `5047e74` - Add comprehensive progress documentation

---

## Critical Files Map

### Authentication & Session Management
**File**: `src/bots/enlace/auth.bot.ts` (418 lines)
- **Class**: `EnlaceAuthBot` (singleton: `enlaceAuth`)
- **Purpose**: Central authentication for all bots
- **Key Method**: `ensureAuthenticated()` - Returns authenticated page
- **Session**: 30-minute timeout with auto re-authentication
- **reCAPTCHA**: Manual resolution with 2-minute wait

### User Search
**File**: `src/bots/enlace/search.bot.ts` (258 lines)
- **Main Function**: `buscarUsuario(numeroDocumento): Promise<SearchResult>`
- **Purpose**: Find existing users to prevent duplicates
- **Used By**: Registration bot (pre-check), Liquidation bot (user selection)

### User Registration
**File**: `src/bots/enlace/registro.bot.ts` (522 lines)
- **Main Function**: `registrarUsuario(userData: UserData): Promise<RegistroResult>`
- **Critical Flow**: ALWAYS search first → validate → register → verify
- **Handles 5 Cases**:
  1. User already exists (return success with `alreadyExists: true`)
  2. Validation fails (return error before attempting)
  3. Network timeout (catch and return error)
  4. Server rejection (detect error messages)
  5. Registration success but verification fails (return with warnings)

### PILA Liquidation
**File**: `src/bots/enlace/liquidacion.bot.ts` (575 lines)
- **Class**: `EnlaceLiquidacionBot` (singleton: `enlaceLiquidacion`)
- **Purpose**: Calculate and submit PILA contributions
- **Output**: Planilla number + fecha límite pago

### Receipt Downloads
**File**: `src/bots/enlace/comprobante.bot.ts` (409 lines)
- **Class**: `EnlaceComprobanteBot` (singleton: `enlaceComprobante`)
- **Purpose**: Download PDF receipts for completed payments
- **Downloads Path**: `./uploads/comprobantes`
- **Timeout**: 60 seconds for download completion

### Infrastructure
**File**: `src/bots/utils/browser.ts` (145 lines)
- **BrowserManager**: Puppeteer with Stealth plugin
- **Anti-Detection**: User agent, viewport, delays

**File**: `src/bots/utils/wait.ts` (221 lines)
- **15+ Helper Functions**: `waitAndClick()`, `waitAndType()`, `elementExists()`, etc.

**File**: `src/bots/utils/selectors.ts` (198 lines)
- **CRITICAL**: Selectors are ESTIMATED - must update with real site inspection
- **Organized By Section**: LOGIN, APORTANTES, LIQUIDACION, COMPROBANTE, COMMON

---

## Architecture Patterns (IMPORTANT)

### 1. Session Management Pattern
```typescript
// ALL bots use this pattern
const page = await enlaceAuth.ensureAuthenticated();
```
- Single shared session across all bots
- Automatic re-authentication on timeout
- Never create new browser instances per bot

### 2. Bot Design Patterns
**Class-Based** (for complex state):
- `EnlaceAuthBot` - Manages session state
- `EnlaceLiquidacionBot` - Multi-step flow with state
- `EnlaceComprobanteBot` - Download tracking state

**Function-Based** (for simple operations):
- `buscarUsuario()` - Stateless search
- `registrarUsuario()` - Stateless registration (uses search internally)

### 3. Error Handling Pattern
```typescript
try {
  // 1. Pre-flight validation
  const validation = validateData();
  if (!validation.valid) return { success: false, error: ... };

  // 2. Check existing state (e.g., user exists)
  const exists = await checkExists();
  if (exists) return { success: true, alreadyExists: true };

  // 3. Execute operation
  await executeOperation();

  // 4. Verify result
  const verified = await verifyResult();
  if (!verified) return { success: true, warnings: [...] };

  return { success: true };
} catch (error) {
  await browserManager.takeScreenshot(page, 'error-context');
  return { success: false, error: error.message };
}
```

### 4. Selector Fallback Pattern
```typescript
const selectors = [PRIMARY, SECONDARY, TERTIARY];
for (const selector of selectors) {
  if (await elementExists(page, selector)) {
    await waitAndClick(page, selector);
    break;
  }
}
```

### 5. Human-Like Behavior Pattern
```typescript
await randomDelay(500, 1500);  // Random delay between actions
await waitAndType(page, selector, text, { delay: 80 }); // Typing delay
await sleep(2000); // Fixed delay for page load
```

---

## Business Logic Rules

### Registration Rules
1. **MUST check if user exists** before attempting registration
2. **MUST validate** all required fields: `numeroDocumento` (min 6), `nombre`, `tipoDocumento`
3. **MUST return success** if user already exists (with `alreadyExists: true`)
4. **MUST verify** registration by searching for user after creation

### Liquidation Rules
1. User MUST exist in Enlace before liquidation
2. IBC (Ingreso Base de Cotización) determines contribution amounts
3. Minimum IBC is 1 SMLMV (Salario Mínimo Legal Mensual Vigente)
4. Days must be between 1-30
5. Salud (health) = 12.5% of IBC
6. Pension = 16% of IBC
7. ARL varies by risk level

### Colombian PILA Context
- **PILA** = Planilla Integrada de Liquidación de Aportes
- **Payment Deadline**: First 10 business days of next month
- **Entities**: EPS (health), Pensión (pension fund), ARL (occupational hazards)
- **Document Types**: CC (Cédula Ciudadanía), CE (Cédula Extranjería), TI, etc.

---

## Critical Pending Tasks

### 🔴 CRITICAL: Update Selectors
**File**: `src/bots/utils/selectors.ts`

Current selectors are ESTIMATED placeholders. Must update with real site:
1. Run bot in `headless: false` mode
2. Open DevTools (F12) on Enlace Operativo
3. Inspect each element (login form, search input, buttons, etc.)
4. Copy actual CSS selectors or create XPath
5. Update `SELECTORS` object
6. Test each bot flow

**Without this, bots will fail in production.**

### High Priority
1. E2E testing with real credentials
2. Worker integration (connect bots to BullMQ handlers)
3. Add retry logic in worker
4. Implement status updates to database

---

## How to Add New Features

### Adding a New Bot
1. **Create bot file**: `src/bots/enlace/[name].bot.ts`
2. **Import dependencies**: `enlaceAuth`, wait helpers, selectors
3. **Design pattern**: Choose class-based (stateful) or function-based (stateless)
4. **Implement flow**:
   - Get page: `const page = await enlaceAuth.ensureAuthenticated()`
   - Navigate to section
   - Take screenshots at each step
   - Use selector fallbacks
   - Add random delays
   - Return `BotResponse<T>` format
5. **Add selectors**: Update `src/bots/utils/selectors.ts`
6. **Document**: Add to `src/bots/README.md` and `BOT_FLOWS.md`
7. **Test**: Run in headless: false first
8. **Commit**: Follow git workflow

### Adding a New Selector
1. **Inspect element** in real Enlace site
2. **Choose selector type**:
   - CSS if possible (faster)
   - XPath for complex traversal
3. **Add to correct section** in `src/bots/utils/selectors.ts`:
   ```typescript
   APORTANTES: {
     MY_NEW_FIELD: '#my-field-id',
   }
   ```
4. **Add fallback** selectors if element might vary
5. **Test** with `elementExists()` first

### Adding Error Handling
1. **Screenshot** on error: `await browserManager.takeScreenshot(page, 'context')`
2. **Log with context**: `logger.error('message', { documento, error })`
3. **Return structured error**: `{ success: false, error: string, screenshot?: string }`
4. **Never throw** unless unrecoverable

---

## Environment Configuration

### Required Variables
```bash
# Enlace Operativo
ENLACE_BASE_URL=https://suaporte.com.co
ENLACE_ADMIN_DOCUMENTO=XXXXXXXXXX
ENLACE_ADMIN_USERNAME=admin_user
ENLACE_ADMIN_PASSWORD=secure_password

# Puppeteer
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000

# Screenshots
SCREENSHOTS_PATH=./screenshots

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ule_rpa

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Testing Strategy

### Local Testing (Before Real Site)
1. Update selectors with real site inspection
2. Run in headless: false
3. Watch each bot execute
4. Verify screenshots in `./screenshots`
5. Check logs for errors

### E2E Testing Flow
```typescript
// 1. Test authentication
const session = await enlaceAuth.login();

// 2. Test search (existing user)
const searchResult = await buscarUsuario('existing-document');

// 3. Test registration (new user)
const regResult = await registrarUsuario(newUserData);

// 4. Test duplicate detection
const dupResult = await registrarUsuario(newUserData); // Should return alreadyExists: true

// 5. Test liquidation
const liqResult = await enlaceLiquidacion.liquidarPila(documento, pilaData);

// 6. Test comprobante download
const compResult = await enlaceComprobante.descargarComprobante(planillaNum);
```

---

## Common Issues & Solutions

### Issue: "Element not found"
- **Cause**: Selector is wrong or page not loaded
- **Solution**: Update selector, add `await sleep()` before interaction

### Issue: "reCAPTCHA timeout"
- **Cause**: reCAPTCHA not solved in 2 minutes
- **Solution**: Increase timeout or solve manually faster

### Issue: "User registered but not found"
- **Cause**: Enlace database sync delay
- **Solution**: Return success with warning (already implemented)

### Issue: "Session expired"
- **Cause**: 30-minute timeout reached
- **Solution**: Automatic re-auth (already implemented in `ensureAuthenticated()`)

### Issue: "Download not found"
- **Cause**: File saved to different location or name
- **Solution**: Configure Puppeteer CDP download path explicitly

---

## Next Phase: Worker Integration

### Worker Tasks to Implement
**File**: `src/orchestrator/worker.ts`

```typescript
// Handle registro task
async function handleRegistroTask(job: Job) {
  const { uleUserId, userData } = job.data;

  // 1. Execute bot
  const result = await registrarUsuario(userData);

  // 2. Update database
  await prisma.enlaceUser.upsert({
    where: { uleUserId },
    update: { enlaceUserId: result.enlaceUserId, status: 'active' },
    create: { uleUserId, enlaceUserId: result.enlaceUserId, ... },
  });

  // 3. Return result
  return result;
}
```

---

## Repository
- **GitHub**: https://github.com/lubroule/ule-rpa.git
- **Branch**: main
- **Last Commit**: 5047e74 (Add comprehensive progress documentation)

---

## How AI Should Use This File

1. **Start every session** by reading this file
2. **Understand current state** from "Current Project State" section
3. **Check pending tasks** before asking user what to do
4. **Follow patterns** documented in "Architecture Patterns"
5. **Reference file map** to know where to make changes
6. **Never create new patterns** without updating this file
7. **Update this file** after major changes

---

**Last Updated**: 2026-02-08
**Maintained By**: AI Sessions + Luis (User)
