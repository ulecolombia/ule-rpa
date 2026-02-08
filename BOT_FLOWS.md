# Bot Execution Flows

Visual representation of each bot's execution flow with decision points, error handling, and screenshots.

---

## 1. Authentication Bot (`auth.bot.ts`)

### Purpose
Establish and maintain authenticated session for all other bots

### Entry Point
```typescript
await enlaceAuth.login()
// or
await enlaceAuth.ensureAuthenticated()
```

### Full Flow Diagram

```
START: login()
     │
     ▼
┌──────────────────────────────────────┐
│ Check if session already exists      │
│ and is valid                         │
└──────┬───────────────────────────────┘
       │
       ├─── YES ──▶ Return existing session
       │
       ▼ NO
┌──────────────────────────────────────┐
│ Launch browser with Stealth plugin   │
│ - Viewport: 1920x1080                │
│ - User Agent: Chrome 120 macOS       │
│ - Locale: es-CO                      │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Navigate to LOGIN_URL                │
│ waitUntil: networkidle0              │
│ 📸 Screenshot: login-page            │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Select Document Type                 │
│ page.select(TIPO_DOC, tipoDocumento) │
│ Delay: 500ms                         │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Enter Document Number                │
│ waitAndType(USERNAME, documento)     │
│ Delay: 100ms per character           │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Enter Password                       │
│ waitAndType(PASSWORD, password)      │
│ Delay: 100ms per character           │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Check for reCAPTCHA                  │
│ elementExists(RECAPTCHA_FRAME)       │
└──────┬───────────────────────────────┘
       │
       ├─── reCAPTCHA Found ─────┐
       │                         │
       │                         ▼
       │              ┌──────────────────────────┐
       │              │ Wait for manual solve    │
       │              │ Monitor: 120 seconds     │
       │              │ Check button enabled     │
       │              │ every 1 second           │
       │              └──────┬───────────────────┘
       │                     │
       │ ◀───────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Click Submit Button                  │
│ waitAndClick(SUBMIT_BUTTON)          │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Wait for Navigation                  │
│ waitUntil: networkidle0              │
│ Timeout: 30 seconds                  │
│ 📸 Screenshot: after-login           │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Verify Authentication                │
│ - Check URL contains '/home'         │
│ - Check element: user menu           │
│ - Check cookies present              │
└──────┬───────────────────────────────┘
       │
       ├─── Failed ──▶ ❌ Throw AuthenticationError
       │               📸 Screenshot: login-failed
       │
       ▼ Success
┌──────────────────────────────────────┐
│ Save Session                         │
│ - Store page reference               │
│ - Store browser reference            │
│ - Record timestamp                   │
│ - Set authenticated = true           │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Return EnlaceSession                 │
│ {                                    │
│   page: Page,                        │
│   browser: Browser,                  │
│   authenticated: true,               │
│   sessionStartTime: Date             │
│ }                                    │
└──────────────────────────────────────┘
       │
       ▼
    END
```

### Session Timeout Check (`ensureAuthenticated`)

```
START: ensureAuthenticated()
     │
     ▼
┌────────────────────────────┐
│ Check session exists       │
└───┬────────────────────────┘
    │
    ├─── NO ──▶ Call login() ──▶ Return page
    │
    ▼ YES
┌────────────────────────────┐
│ Check session age          │
│ Age = Now - sessionStart   │
└───┬────────────────────────┘
    │
    ├─── Age > 30 min ──▶ Call login() ──▶ Return page
    │
    ▼ Valid
┌────────────────────────────┐
│ Check page still open      │
│ page.isClosed()            │
└───┬────────────────────────┘
    │
    ├─── Closed ──▶ Call login() ──▶ Return page
    │
    ▼ Open
┌────────────────────────────┐
│ Check URL still valid      │
│ page.url() contains 'home' │
└───┬────────────────────────┘
    │
    ├─── Invalid ──▶ Call login() ──▶ Return page
    │
    ▼ Valid
┌────────────────────────────┐
│ Return existing page       │
└────────────────────────────┘
    │
    ▼
  END
```

### Key Decision Points
1. **Session exists?** → Reuse or create new
2. **Session age < 30 min?** → Reuse or re-authenticate
3. **reCAPTCHA present?** → Wait for manual solve
4. **Authentication successful?** → Continue or throw error

### Error Scenarios
- **Network timeout**: Login page doesn't load
- **Wrong credentials**: Auth fails, error message shown
- **reCAPTCHA timeout**: Not solved within 2 minutes
- **Navigation timeout**: Post-login redirect fails

### Screenshots Captured
1. `login-page` - Initial login page
2. `after-login` - Post-authentication home page
3. `login-failed` - If authentication fails (error)

---

## 2. Search Bot (`search.bot.ts`)

### Purpose
Search for existing users by document number

### Entry Point
```typescript
await buscarUsuario(numeroDocumento)
// or
await usuarioExiste(numeroDocumento)
```

### Full Flow Diagram

```
START: buscarUsuario(numeroDocumento)
     │
     ▼
┌──────────────────────────────────────┐
│ Get authenticated page               │
│ page = enlaceAuth.ensureAuthenticated()│
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Navigate to Administrar Aportantes   │
│ URL: /home/administrar-aportantes    │
│ waitUntil: networkidle0              │
│ Delay: 2000ms                        │
│ 📸 Screenshot: search-aportantes-page│
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Check search input exists            │
│ elementExists(BUSCAR_INPUT)          │
└──────┬───────────────────────────────┘
       │
       ├─── Not Found ──▶ ❌ Throw Error: "Search input not found"
       │                  📸 Screenshot: search-input-not-found
       │
       ▼ Found
┌──────────────────────────────────────┐
│ Wait for search input                │
│ waitForSelector(BUSCAR_INPUT, 10s)   │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Clear and type document number       │
│ waitAndType(BUSCAR_INPUT, documento) │
│ Options: { clear: true, delay: 100 } │
│ Random delay: 500-1000ms             │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Submit search                        │
│ page.keyboard.press('Enter')         │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Wait for results                     │
│ Delay: 3000ms                        │
│ 📸 Screenshot: search-results        │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Check for "no results" message       │
│ elementExists(NO_RESULTS)            │
└──────┬───────────────────────────────┘
       │
       ├─── Found ──▶ Return { found: false }
       │
       ▼ No message
┌──────────────────────────────────────┐
│ Check if results table exists        │
│ elementExists(TABLE)                 │
└──────┬───────────────────────────────┘
       │
       ├─── Not Found ─────┐
       │                   │
       │                   ▼
       │        ┌──────────────────────────┐
       │        │ Check page text for      │
       │        │ "resultado" or "aportante"│
       │        └──┬───────────────────────┘
       │           │
       │           ├─── Found ──▶ Return { found: true }
       │           │               (no detailed data)
       │           │
       │           ▼ Not found
       │        Return { found: false }
       │
       ▼ Table exists
┌──────────────────────────────────────┐
│ Extract user data from table         │
│ page.evaluate(() => {                │
│   Find table → tbody → rows          │
│   Search for row with documento      │
│   Extract: enlaceUserId, nombre,     │
│            documento, estado         │
│ })                                   │
└──────┬───────────────────────────────┘
       │
       ├─── No data extracted ──▶ Return { found: true }
       │                          (conservative approach)
       │                          📸 Screenshot: search-extraction-failed
       │
       ▼ Data extracted
┌──────────────────────────────────────┐
│ Return SearchResult                  │
│ {                                    │
│   found: true,                       │
│   enlaceUserId: "xxx",               │
│   nombre: "Juan Pérez",              │
│   documento: "1234567890",           │
│   estado: "ACTIVO"                   │
│ }                                    │
└──────────────────────────────────────┘
       │
       ▼
    END
```

### Data Extraction Strategy

```
Table Structure Discovery:
     │
     ▼
┌──────────────────────────────────────┐
│ Find all rows in tbody               │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ For each row:                        │
│   Check if any cell contains         │
│   the searched documento number      │
└──────┬───────────────────────────────┘
       │
       ├─── Not found ──▶ Next row
       │
       ▼ Found
┌──────────────────────────────────────┐
│ Extract data from row:               │
│ - Try row.getAttribute('data-id')    │
│ - Try cells[0], cells[1], cells[2]   │
│   in different orders                │
│ - Use fallback values if missing     │
└──────────────────────────────────────┘
```

### Key Decision Points
1. **Search input exists?** → Continue or error
2. **"No results" message?** → Return not found
3. **Table exists?** → Extract data or check text
4. **Data extracted?** → Return details or just "found"

### Error Scenarios
- **Search input not found**: Page structure changed
- **Network timeout**: Search takes too long
- **Table structure unknown**: Can't extract data (return found: true)

### Screenshots Captured
1. `search-aportantes-page` - Aportantes management page
2. `search-results` - After search execution
3. `search-input-not-found` - Error: input not found
4. `search-extraction-failed` - Warning: data extraction failed
5. `search-critical-error` - Critical error during search

---

## 3. Registration Bot (`registro.bot.ts`)

### Purpose
Register new users with complete validation and duplicate detection

### Entry Point
```typescript
await registrarUsuario(userData)
```

### Full Flow Diagram

```
START: registrarUsuario(userData)
     │
     ▼
┌──────────────────────────────────────┐
│ STEP 1: Validate User Data           │
│ validateUserData(userData)           │
│ Check:                               │
│ - numeroDocumento (required, min 6)  │
│ - nombre (required)                  │
│ - tipoDocumento (required)           │
│ - email (format)                     │
│ - telefono (min 7)                   │
└──────┬───────────────────────────────┘
       │
       ├─── Invalid ──▶ Return { success: false, error: "Validation failed: ..." }
       │
       ▼ Valid
┌──────────────────────────────────────┐
│ STEP 2: Check if user exists         │
│ searchResult = buscarUsuario()       │
└──────┬───────────────────────────────┘
       │
       ├─── Found ──▶ Return {
       │               success: true,
       │               alreadyExists: true,
       │               enlaceUserId: searchResult.enlaceUserId
       │             }
       │
       ▼ Not found
┌──────────────────────────────────────┐
│ STEP 3: Get authenticated page       │
│ page = enlaceAuth.ensureAuthenticated()│
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ STEP 4: Navigate to Aportantes       │
│ URL: /home/administrar-aportantes    │
│ waitUntil: networkidle0              │
│ Delay: 2000ms                        │
│ 📸 Screenshot: registro-aportantes-page│
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ STEP 5: Click "Add" button           │
│ Try selectors in order:              │
│ 1. AGREGAR_BUTTON                    │
│ 2. AGREGAR_APORTANTE                 │
│ 3. NUEVO_APORTANTE                   │
└──────┬───────────────────────────────┘
       │
       ├─── Not found ──▶ ❌ Throw BotError: "Add button not found"
       │                  📸 Screenshot: registro-no-add-button
       │
       ▼ Clicked
┌──────────────────────────────────────┐
│ STEP 6: Wait for form to load        │
│ Delay: 2000ms                        │
│ Check: elementExists(NUMERO_DOC)     │
└──────┬───────────────────────────────┘
       │
       ├─── Not found ──▶ ❌ Throw BotError: "Form did not appear"
       │                  📸 Screenshot: registro-no-form
       │
       ▼ Form loaded
┌──────────────────────────────────────┐
│ 📸 Screenshot: registro-form-loaded  │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ STEP 7: Fill Registration Form      │
│ fillRegistrationForm(page, userData) │
│ (See detailed flow below)            │
└──────┬───────────────────────────────┘
       │
       ├─── Error ──▶ ❌ Throw BotError: "Failed to fill form"
       │              📸 Screenshot: registro-fill-error
       │
       ▼ Success
┌──────────────────────────────────────┐
│ 📸 Screenshot: registro-before-submit│
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ STEP 8: Submit Form                  │
│ submitRegistrationForm(page)         │
│ Try selectors:                       │
│ 1. GUARDAR                           │
│ 2. GUARDAR_TEXT                      │
└──────┬───────────────────────────────┘
       │
       ├─── Failed ──▶ ❌ Throw BotError: "Form submission failed"
       │
       ▼ Submitted
┌──────────────────────────────────────┐
│ Wait for response                    │
│ Delay: 3000ms                        │
│ 📸 Screenshot: registro-after-submit │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ STEP 9: Check Registration Result   │
│ checkRegistrationResult(page)        │
│ (See detailed flow below)            │
└──────┬───────────────────────────────┘
       │
       ├─── Error ──▶ ❌ Throw BotError: result.error
       │              📸 Screenshot: registro-error-message
       │
       ▼ Success
┌──────────────────────────────────────┐
│ STEP 10: Verify by searching         │
│ Delay: 2000ms                        │
│ verifyResult = buscarUsuario()       │
└──────┬───────────────────────────────┘
       │
       ├─── Not found ──▶ Return {
       │                   success: true,
       │                   alreadyExists: false,
       │                   warnings: ["Could not verify immediately"]
       │                 }
       │                 📸 Screenshot: registro-verification-failed
       │
       ▼ Found
┌──────────────────────────────────────┐
│ Return RegistroResult                │
│ {                                    │
│   success: true,                     │
│   enlaceUserId: verifyResult.enlaceUserId,│
│   alreadyExists: false               │
│ }                                    │
└──────────────────────────────────────┘
       │
       ▼
    END
```

### Sub-Flow: Fill Registration Form

```
fillRegistrationForm(page, userData)
     │
     ▼
┌────────────────────────────────┐
│ Tipo Documento (select)        │
│ if exists: page.select()       │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Número Documento (input)       │
│ waitAndType({ clear, delay })  │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Nombre Completo (input)        │
│ waitAndType({ clear, delay })  │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Email (input, optional)        │
│ if userData.email exists:      │
│   if elementExists: type       │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Teléfono (input, optional)     │
│ Try: TELEFONO or CELULAR       │
│ if userData.telefono exists:   │
│   type into found field        │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Dirección (input, optional)    │
│ if userData.direccion exists:  │
│   if elementExists: type       │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Ciudad (select or input)       │
│ if userData.ciudad exists:     │
│   Try select first, then input │
│ Delay: 300-500ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ EPS (select, optional)         │
│ if userData.eps exists:        │
│   if elementExists: select     │
│ Delay: 500-800ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Pensión (select, optional)     │
│ Try: PENSION or AFP            │
│ if userData.pension exists:    │
│   select into found field      │
│ Delay: 500-800ms               │
└────┬───────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ ARL (select, optional)         │
│ if userData.arl exists:        │
│   if elementExists: select     │
│ Delay: 500-800ms               │
└────┬───────────────────────────┘
     │
     ▼
  Return
```

### Sub-Flow: Check Registration Result

```
checkRegistrationResult(page)
     │
     ▼
┌────────────────────────────────┐
│ Check for success messages     │
│ Try selectors:                 │
│ - ALERT_SUCCESS                │
│ - TOAST_SUCCESS                │
└────┬───────────────────────────┘
     │
     ├─── Found ──▶ Return { success: true }
     │
     ▼ Not found
┌────────────────────────────────┐
│ Check for error messages       │
│ Try selectors:                 │
│ - ALERT_ERROR                  │
│ - TOAST_ERROR                  │
│ - .error, .alert-danger        │
└────┬───────────────────────────┘
     │
     ├─── Found ──▶ Extract text
     │              Return { success: false, error: text }
     │
     ▼ Not found
┌────────────────────────────────┐
│ Check page text for keywords   │
│ Success words:                 │
│ - "exitosamente", "éxito"      │
│ - "registrado", "creado"       │
└────┬───────────────────────────┘
     │
     ├─── Found ──▶ Return { success: true }
     │
     ▼ Not found
┌────────────────────────────────┐
│ Check page text for errors     │
│ Error words:                   │
│ - "error", "falló"             │
│ - "no se pudo"                 │
└────┬───────────────────────────┘
     │
     ├─── Found ──▶ Return { success: false, error: "..." }
     │
     ▼ No indicators
┌────────────────────────────────┐
│ Assume success                 │
│ Return { success: true }       │
│ (Conservative approach)        │
└────────────────────────────────┘
     │
     ▼
  Return
```

### Key Decision Points
1. **Validation passes?** → Continue or return error
2. **User already exists?** → Return success with flag or continue
3. **Add button found?** → Continue or error
4. **Form appears?** → Continue or error
5. **Form submission succeeds?** → Continue or error
6. **Success message detected?** → Continue or error
7. **User found in verification?** → Return success or warning

### All 5 Handled Cases
1. ✅ **User already exists**: Detected in Step 2, return `{ success: true, alreadyExists: true }`
2. ✅ **Validation fails**: Detected in Step 1, return `{ success: false, error: "..." }`
3. ✅ **Network timeout**: Caught in try/catch, return `{ success: false, error: "..." }`
4. ✅ **Server rejection**: Detected in Step 9, throw BotError
5. ✅ **Registered but not found**: Detected in Step 10, return `{ success: true, warnings: [...] }`

### Screenshots Captured
1. `registro-aportantes-page` - Aportantes management page
2. `registro-no-add-button` - Error: add button not found
3. `registro-no-form` - Error: form did not appear
4. `registro-form-loaded` - Form successfully loaded
5. `registro-fill-error` - Error filling form
6. `registro-before-submit` - Before clicking submit
7. `registro-after-submit` - After submission
8. `registro-error-message` - Server error detected
9. `registro-verification-failed` - Could not verify after registration

---

## 4. Liquidation Bot (`liquidacion.bot.ts`)

### Purpose
Calculate and submit PILA contributions to generate planilla

### Entry Point
```typescript
await enlaceLiquidacion.liquidarPila(numeroDocumento, pilaData)
```

### Flow Diagram (Simplified)

```
START
 │
 ▼
Get authenticated page
 │
 ▼
Navigate to Liquidación section
 📸 liquidacion-page
 │
 ▼
Search for user by documento
 │
 ├─── Not found ──▶ ❌ Error
 │
 ▼ Found
Select user from results
 │
 ▼
Fill liquidation form:
 - IBC (Ingreso Base)
 - Días cotizados
 - EPS
 - Pensión
 - ARL
 - Nivel de riesgo
 📸 liquidacion-form-filled
 │
 ▼
Click "Calcular" button
Wait for auto-calculation
 │
 ▼
Verify calculated values:
 - Valor Salud
 - Valor Pensión
 - Valor ARL
 - Valor Total
 📸 liquidacion-calculated
 │
 ▼
Click "Generar Planilla" button
 │
 ▼
Wait for planilla generation
 │
 ▼
Extract from page:
 - Número de Planilla
 - Fecha límite de pago
 📸 liquidacion-planilla-generated
 │
 ▼
Return {
  success: true,
  numeroPlanilla: "xxxx-xxxxxxxx-x",
  fechaLimite: "2026-03-10",
  valorTotal: 580440
}
 │
 ▼
END
```

### Key Decision Points
1. **User exists?** → Continue or error
2. **Calculation completes?** → Continue or retry
3. **Planilla generated?** → Extract number or error

### Screenshots
1. `liquidacion-page` - Liquidation section
2. `liquidacion-form-filled` - Form with data
3. `liquidacion-calculated` - After calculation
4. `liquidacion-planilla-generated` - Planilla number shown

---

## 5. Comprobante Download Bot (`comprobante.bot.ts`)

### Purpose
Download PDF receipt for completed PILA payment

### Entry Point
```typescript
await enlaceComprobante.descargarComprobante(numeroPlanilla)
```

### Flow Diagram (Simplified)

```
START
 │
 ▼
Ensure downloads directory exists
 │
 ▼
Get authenticated page
 │
 ▼
Navigate to Comprobantes section
Try: menu item or direct URL
📸 comprobantes-section
 │
 ▼
Search for planilla:
 - numeroPlanilla (required)
 - numeroDocumento (optional)
 - periodo (optional)
📸 before-planilla-search
 │
 ▼
Submit search
 │
 ├─── Not found ──▶ ❌ Error: "Planilla not found"
 │
 ▼ Found
📸 planilla-search-results
 │
 ▼
Set up download tracking
Start monitoring downloads folder
 │
 ▼
Click download button
Try selectors:
 - DESCARGAR_PDF
 - DESCARGAR_BUTTON
 - VER_COMPROBANTE
📸 before-download-click
 │
 ▼
Wait for download (max 60s)
Monitor: Check for new .pdf files
every 1 second
 │
 ├─── Timeout ──▶ ❌ Error: "Download timeout"
 │
 ▼ Downloaded
Verify file:
 - Exists
 - Size > 0
 - Is valid PDF (%PDF header)
 │
 ▼
Return {
  success: true,
  fileName: "comprobante-xxx.pdf",
  filePath: "./uploads/comprobantes/xxx.pdf",
  fileSize: 45632
}
 │
 ▼
END
```

### Key Decision Points
1. **Planilla exists?** → Continue or error
2. **Download starts?** → Monitor or error
3. **Download completes?** → Verify or timeout
4. **File valid?** → Return success or error

### Screenshots
1. `comprobantes-section` - Comprobantes page
2. `before-planilla-search` - Before search
3. `planilla-search-results` - Search results
4. `before-download-click` - Before clicking download
5. `comprobante-error` - If download fails

---

## Error Handling Across All Bots

### Common Error Pattern

```
try {
  // Bot execution
  await executeStep1();
  await executeStep2();
  await executeStep3();
  return { success: true, data: result };

} catch (error) {
  // Capture state
  const screenshot = await browserManager.takeScreenshot(page, 'error-context');

  // Log error
  logger.error('Bot failed', {
    botType: 'registro',
    error: error.message,
    screenshot,
  });

  // Return structured error
  return {
    success: false,
    error: error.message,
    screenshot,
  };
}
```

### Retry Logic (Worker Level)

```
Job fails
 │
 ▼
BullMQ checks attempts
 │
 ├─── Attempts < 3 ──▶ Retry with backoff
 │                     Delay: 5s, 10s, 20s
 │
 ▼ Attempts = 3
Move to Dead Letter Queue
Send alert to admin
```

---

## Performance Metrics

### Typical Execution Times (Estimated)

| Bot | Avg Time | Max Time |
|-----|----------|----------|
| Auth (first login) | 15-20s | 30s |
| Auth (re-auth) | 10-15s | 25s |
| Search | 5-8s | 15s |
| Registration | 15-20s | 40s |
| Liquidation | 20-30s | 60s |
| Comprobante | 10-15s | 70s (download) |

### Optimization Opportunities
1. **Parallel searches**: Search multiple users concurrently
2. **Batch registration**: Register multiple users in one session
3. **Screenshot caching**: Only capture on errors in production
4. **Selector caching**: Cache frequently used selectors

---

**Last Updated**: 2026-02-08
