# Enlace Operativo - Selectors Map

## ⚠️ CRITICAL IMPORTANCE

This file is **THE MOST IMPORTANT** for RPA bot maintenance.

**Current Status**: All selectors in `src/bots/utils/selectors.ts` are **ESTIMATED** and must be updated with real site inspection.

**Without correct selectors, ALL bots will fail.**

---

## How to Update Selectors

### Step 1: Enable Headless Mode Off
```typescript
// In src/bots/utils/browser.ts
const browser = await puppeteer.launch({
  headless: false, // ← Change to false
  // ...
});
```

### Step 2: Run Bot in Development
```bash
npm run dev:test-auth
```

### Step 3: Inspect Elements
1. Browser window will open
2. Press **F12** to open DevTools
3. Click **Select Element** tool (Ctrl+Shift+C)
4. Hover over the element you want to select
5. Right-click → Inspect

### Step 4: Find Best Selector
**Priority Order**:
1. ✅ **ID** (`#username`) - Most reliable
2. ✅ **Unique class** (`.btn-primary`) - Good if unique
3. ✅ **Name attribute** (`[name="documento"]`) - Good for forms
4. ✅ **Data attributes** (`[data-testid="submit"]`) - Very reliable
5. ⚠️ **CSS path** (`div > form > input:nth-child(2)`) - Fragile
6. ❌ **XPath** (`//div[@class='form']//input[1]`) - Last resort

### Step 5: Update selectors.ts
```typescript
export const SELECTORS = {
  LOGIN: {
    TIPO_DOC_SELECT: '#actual-id-here', // ← Update with real selector
    // ...
  }
};
```

### Step 6: Test
Run bot and verify it finds the element:
```typescript
const exists = await elementExists(page, SELECTORS.LOGIN.TIPO_DOC_SELECT);
console.log('Found:', exists); // Should be true
```

---

## Selector Organization

File: `src/bots/utils/selectors.ts`

### Structure:
```typescript
export const SELECTORS = {
  // Authentication
  LOGIN: { ... },

  // User Management
  APORTANTES: {
    // Search
    BUSCAR_INPUT: '...',

    // Results Table
    RESULTS: { ... },

    // Registration Form
    FORM: { ... },

    // Actions
    AGREGAR_BUTTON: '...',
  },

  // PILA Liquidation
  LIQUIDACION: { ... },

  // Receipt Downloads
  COMPROBANTE: { ... },

  // Common Elements
  COMMON: {
    ALERT_SUCCESS: '...',
    ALERT_ERROR: '...',
    // ...
  },

  // Navigation
  NAV: { ... },
};
```

---

## Detailed Selector Map

### 1. LOGIN Section (Authentication)

#### Current Selectors (ESTIMATED):
```typescript
LOGIN: {
  TIPO_DOC_SELECT: '#login-tipo-documento',
  USERNAME_INPUT: '#login-username',
  PASSWORD_INPUT: '#login-password',
  SUBMIT_BUTTON: 'button[type="submit"]',
  RECAPTCHA_FRAME: 'iframe[src*="recaptcha"]',
  RECAPTCHA_CHECKBOX: '.recaptcha-checkbox',
  ERROR_MESSAGE: '.login-error',
}
```

#### How to Find (Step-by-step):

**Tipo Documento Select**:
1. Navigate to login page
2. Inspect the document type dropdown
3. Look for:
   - `<select id="xxx">` → Use `#xxx`
   - `<select name="tipoDocumento">` → Use `[name="tipoDocumento"]`
   - `<select class="form-control">` → Use `.form-control` (if unique)

**Username Input**:
1. Inspect the username/document number field
2. Look for:
   - `<input id="documento">` → Use `#documento`
   - `<input name="username">` → Use `[name="username"]`
   - `<input type="text" placeholder="Documento">` → Use `[placeholder="Documento"]`

**Password Input**:
1. Inspect password field
2. Look for:
   - `<input type="password" id="pwd">` → Use `#pwd`
   - `<input type="password" name="password">` → Use `[name="password"]`

**Submit Button**:
1. Inspect login button
2. Look for:
   - `<button id="btn-login">` → Use `#btn-login`
   - `<button type="submit">` → Use `button[type="submit"]`
   - `<button class="btn-primary">Iniciar Sesión</button>` → Use `button.btn-primary`

**reCAPTCHA**:
1. Look for iframe containing "recaptcha"
2. Selector usually: `iframe[src*="recaptcha"]`
3. Inside iframe, checkbox: `.recaptcha-checkbox`

#### Usage in Bot:
**File**: `src/bots/enlace/auth.bot.ts:142-175`

```typescript
// Select document type
await page.select(SELECTORS.LOGIN.TIPO_DOC_SELECT, tipoDocumento);

// Enter username
await waitAndType(page, SELECTORS.LOGIN.USERNAME_INPUT, username);

// Enter password
await waitAndType(page, SELECTORS.LOGIN.PASSWORD_INPUT, password);

// Submit
await waitAndClick(page, SELECTORS.LOGIN.SUBMIT_BUTTON);
```

---

### 2. APORTANTES Section (User Management)

#### 2A. Search Functionality

**Current Selectors (ESTIMATED)**:
```typescript
APORTANTES: {
  BUSCAR_INPUT: 'input[name="buscar"]',
  BUSCAR_BUTTON: 'button.btn-buscar',
}
```

**How to Find**:
1. Navigate to "Administrar Aportantes" page
2. Look for search input field
3. Inspect and find:
   - `<input id="search">` → Use `#search`
   - `<input placeholder="Buscar por documento">` → Use `[placeholder*="Buscar"]`
   - `<input class="search-input">` → Use `.search-input`

**Usage in Bot**:
**File**: `src/bots/enlace/search.bot.ts:54-76`

```typescript
// Find search input
const searchInputExists = await elementExists(page, SELECTORS.APORTANTES.BUSCAR_INPUT);

// Type document number
await waitAndType(
  page,
  SELECTORS.APORTANTES.BUSCAR_INPUT,
  numeroDocumento,
  { clear: true, delay: 100 }
);

// Submit search (Enter key)
await page.keyboard.press('Enter');
```

#### 2B. Search Results Table

**Current Selectors (ESTIMATED)**:
```typescript
RESULTS: {
  TABLE: 'table.aportantes-table',
  NO_RESULTS: '.no-results',
  NO_RESULTS_ALT: '.empty-state',
  FIRST_ROW: 'table tbody tr:first-child',
}
```

**How to Find**:
1. Perform a search
2. Inspect results table
3. Look for:
   - `<table id="results">` → Use `#results`
   - `<table class="table-striped">` → Use `.table-striped`
   - Usually just `table` works if page has only one table

4. For "no results" message:
   - Inspect text shown when no results
   - `<div class="alert alert-info">No se encontraron resultados</div>`
   - Selector: `.alert-info` or use text content check

**Usage in Bot**:
**File**: `src/bots/enlace/search.bot.ts:84-114`

```typescript
// Check for no results
const noResultsExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.NO_RESULTS);
if (noResultsExists) {
  return { found: false };
}

// Check if table exists
const tableExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.TABLE);

// Extract data from table
const userData = await page.evaluate((docNum) => {
  const table = document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const rows = tbody?.querySelectorAll('tr');
  // ...
}, numeroDocumento);
```

#### 2C. Registration Form

**Current Selectors (ESTIMATED)**:
```typescript
FORM: {
  TIPO_DOC: 'select[name="tipoDocumento"]',
  NUMERO_DOC: 'input[name="numeroDocumento"]',
  NOMBRE: 'input[name="nombre"]',
  EMAIL: 'input[name="email"]',
  TELEFONO: 'input[name="telefono"]',
  CELULAR: 'input[name="celular"]',
  DIRECCION: 'input[name="direccion"]',
  CIUDAD: 'select[name="ciudad"]',
  EPS: 'select[name="eps"]',
  PENSION: 'select[name="pension"]',
  AFP: 'select[name="afp"]',
  ARL: 'select[name="arl"]',
  GUARDAR: 'button.btn-guardar',
  GUARDAR_TEXT: 'button:contains("Guardar")',
  CANCELAR: 'button.btn-cancelar',
}
```

**How to Find**:
1. Click "Add Aportante" button
2. Wait for form to appear
3. Inspect each field:

**Document Type Select**:
```html
<select id="tipoDocumento" name="tipoDocumento" class="form-control">
  <option value="CC">Cédula de Ciudadanía</option>
  <option value="CE">Cédula de Extranjería</option>
  ...
</select>
```
→ Best selector: `#tipoDocumento` or `[name="tipoDocumento"]`

**Document Number Input**:
```html
<input type="text" id="numeroDocumento" name="numeroDocumento" class="form-control">
```
→ Best selector: `#numeroDocumento` or `[name="numeroDocumento"]`

**Nombre Input**:
- Could be single field: `<input name="nombreCompleto">`
- Or split fields: `<input name="nombres">` + `<input name="apellidos">`
- **IMPORTANT**: Handle both cases in code

**Email Input**:
```html
<input type="email" name="email" placeholder="correo@example.com">
```
→ Selector: `[name="email"]` or `input[type="email"]`

**Phone/Celular**:
- Some forms have separate "Teléfono" and "Celular" fields
- Try both selectors with fallback (already implemented)

**EPS Select**:
```html
<select name="eps" id="eps">
  <option value="">Seleccione EPS</option>
  <option value="EPS001">SURA</option>
  <option value="EPS002">Sanitas</option>
  ...
</select>
```
→ Selector: `#eps` or `[name="eps"]`

**Save Button**:
```html
<button type="submit" class="btn btn-primary">Guardar</button>
```
→ Selectors to try:
- `button[type="submit"]`
- `.btn-primary`
- `button:contains("Guardar")` (text-based, less reliable)

**Usage in Bot**:
**File**: `src/bots/enlace/registro.bot.ts:236-389`

```typescript
async function fillRegistrationForm(page: Page, userData: UserData): Promise<void> {
  // Tipo documento
  if (await elementExists(page, SELECTORS.APORTANTES.FORM.TIPO_DOC)) {
    await page.select(SELECTORS.APORTANTES.FORM.TIPO_DOC, userData.tipoDocumento);
  }

  // Numero documento
  await waitAndType(
    page,
    SELECTORS.APORTANTES.FORM.NUMERO_DOC,
    userData.numeroDocumento,
    { clear: true, delay: 100 }
  );

  // Nombre
  await waitAndType(page, SELECTORS.APORTANTES.FORM.NOMBRE, userData.nombre, {
    clear: true,
    delay: 80,
  });

  // ... rest of fields
}
```

#### 2D. Add Aportante Button

**Current Selectors (ESTIMATED)**:
```typescript
AGREGAR_BUTTON: 'button.btn-agregar',
AGREGAR_APORTANTE: 'button:contains("Agregar Aportante")',
NUEVO_APORTANTE: 'button:contains("Nuevo")',
```

**How to Find**:
1. On "Administrar Aportantes" page
2. Look for button to add new user
3. Inspect:

```html
<button class="btn btn-success" id="btn-agregar-aportante">
  <i class="fa fa-plus"></i> Agregar Aportante
</button>
```

→ Selectors to try:
- `#btn-agregar-aportante` (best if ID exists)
- `.btn-success` (if unique)
- `button:contains("Agregar")` (text-based)

**Usage in Bot**:
**File**: `src/bots/enlace/registro.bot.ts:126-142`

```typescript
const addButtonSelectors = [
  SELECTORS.APORTANTES.AGREGAR_BUTTON,
  SELECTORS.APORTANTES.AGREGAR_APORTANTE,
  SELECTORS.APORTANTES.NUEVO_APORTANTE,
];

for (const selector of addButtonSelectors) {
  if (await elementExists(page, selector)) {
    await waitAndClick(page, selector);
    buttonClicked = true;
    break;
  }
}
```

---

### 3. LIQUIDACION Section (PILA Calculation)

**Current Selectors (ESTIMATED)**:
```typescript
LIQUIDACION: {
  MENU_ITEM: 'a[href*="liquidacion"]',
  BUSCAR_APORTANTE: 'input[name="buscarAportante"]',
  IBC_INPUT: 'input[name="ibc"]',
  DIAS_INPUT: 'input[name="diasCotizados"]',
  EPS_SELECT: 'select[name="eps"]',
  PENSION_SELECT: 'select[name="pension"]',
  ARL_SELECT: 'select[name="arl"]',
  NIVEL_RIESGO: 'select[name="nivelRiesgo"]',
  CALCULAR_BUTTON: 'button.btn-calcular',
  GENERAR_PLANILLA: 'button.btn-generar-planilla',
  PLANILLA_NUMERO: '.planilla-numero',
  FECHA_LIMITE: '.fecha-limite',
}
```

**How to Find**:

1. Navigate to Liquidación section
2. Search for aportante
3. Inspect liquidation form

**IBC Input**:
```html
<input type="number" name="ibc" id="ibc" placeholder="Ingreso Base de Cotización">
```
→ Selector: `#ibc` or `[name="ibc"]`

**Días Cotizados**:
```html
<input type="number" name="dias" min="1" max="30" value="30">
```
→ Selector: `[name="dias"]` or `[name="diasCotizados"]`

**Calculate Button**:
- Triggers automatic calculation
- Usually: `<button onclick="calcular()">Calcular</button>`
- Selector: `.btn-calcular` or `button:contains("Calcular")`

**Planilla Number Display**:
After generation, planilla number appears:
```html
<div class="alert alert-success">
  Planilla generada: <strong class="planilla-numero">1234-56789012-3</strong>
</div>
```
→ Selector: `.planilla-numero` or extract from alert text

**Usage in Bot**:
**File**: `src/bots/enlace/liquidacion.bot.ts`

---

### 4. COMPROBANTE Section (Receipt Download)

**Current Selectors (ESTIMATED)**:
```typescript
COMPROBANTE: {
  MENU_ITEM: 'a[href*="comprobante"]',
  BUSCAR_PLANILLA: 'input[name="numeroPlanilla"]',
  BUSCAR_PERIODO: 'input[name="periodo"]',
  BUSCAR_BUTTON: 'button.btn-buscar',
  DESCARGAR_PDF: 'button.btn-descargar-pdf',
  DESCARGAR_BUTTON: 'a.btn-download',
  VER_COMPROBANTE: 'a:contains("Ver Comprobante")',
}
```

**How to Find**:

1. Navigate to Comprobantes section
2. Search for planilla number
3. Find download button

**Planilla Search**:
```html
<input type="text" name="numeroPlanilla" placeholder="Número de Planilla">
```
→ Selector: `[name="numeroPlanilla"]`

**Download Button**:
```html
<a href="/api/comprobante/download/123" class="btn btn-primary" download>
  <i class="fa fa-download"></i> Descargar PDF
</a>
```
→ Selectors to try:
- `.btn-download`
- `a[download]`
- `a:contains("Descargar")`

**Usage in Bot**:
**File**: `src/bots/enlace/comprobante.bot.ts:236-264`

```typescript
const downloadSelectors = [
  SELECTORS.COMPROBANTE.DESCARGAR_PDF,
  SELECTORS.COMPROBANTE.DESCARGAR_BUTTON,
  SELECTORS.COMPROBANTE.VER_COMPROBANTE,
];

for (const selector of downloadSelectors) {
  if (await elementExists(page, selector)) {
    await waitAndClick(page, selector);
    buttonClicked = true;
    break;
  }
}
```

---

### 5. COMMON Section (Alerts & Messages)

**Current Selectors (ESTIMATED)**:
```typescript
COMMON: {
  ALERT_SUCCESS: '.alert-success',
  ALERT_ERROR: '.alert-danger',
  ALERT_WARNING: '.alert-warning',
  ALERT_INFO: '.alert-info',
  TOAST_SUCCESS: '.toast-success',
  TOAST_ERROR: '.toast-error',
  MODAL: '.modal',
  MODAL_CLOSE: '.modal .close',
  LOADING: '.loading-spinner',
  LOADING_OVERLAY: '.loading-overlay',
}
```

**How to Find**:

**Success Alert**:
After successful operation:
```html
<div class="alert alert-success" role="alert">
  <i class="fa fa-check"></i> Operación exitosa
</div>
```
→ Selector: `.alert-success`

**Error Alert**:
After failed operation:
```html
<div class="alert alert-danger" role="alert">
  <i class="fa fa-times"></i> Error: Usuario ya existe
</div>
```
→ Selector: `.alert-danger` or `.alert-error`

**Toast Notifications**:
Some sites use toast notifications instead of alerts:
```html
<div class="toast toast-success">
  Usuario registrado correctamente
</div>
```
→ Selector: `.toast-success`

**Modal Dialogs**:
```html
<div class="modal fade show" style="display: block;">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close">&times;</button>
      </div>
      ...
    </div>
  </div>
</div>
```
→ Selectors:
- Modal: `.modal.show` or `.modal[style*="display: block"]`
- Close: `.modal .close`

**Usage in Bot**:
**File**: `src/bots/enlace/registro.bot.ts:431-506`

```typescript
async function checkRegistrationResult(page: Page): Promise<{ success: boolean; error?: string }> {
  // Check success
  const successSelectors = [
    SELECTORS.COMMON.ALERT_SUCCESS,
    SELECTORS.COMMON.TOAST_SUCCESS,
  ];
  for (const selector of successSelectors) {
    if (await elementExists(page, selector)) {
      return { success: true };
    }
  }

  // Check error
  const errorSelectors = [
    SELECTORS.COMMON.ALERT_ERROR,
    SELECTORS.COMMON.TOAST_ERROR,
  ];
  for (const selector of errorSelectors) {
    if (await elementExists(page, selector)) {
      const errorText = await page.$eval(selector, el => el.textContent);
      return { success: false, error: errorText };
    }
  }

  // Fallback: check page text
  const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (pageText.includes('exitosamente') || pageText.includes('éxito')) {
    return { success: true };
  }

  return { success: true }; // Assume success if no clear indicator
}
```

---

### 6. NAV Section (Navigation Menu)

**Current Selectors (ESTIMATED)**:
```typescript
NAV: {
  HOME: 'a[href*="home"]',
  APORTANTES: 'a[href*="aportantes"]',
  LIQUIDACION: 'a[href*="liquidacion"]',
  COMPROBANTES: 'a[href*="comprobantes"]',
  REPORTES: 'a[href*="reportes"]',
  CONFIGURACION: 'a[href*="configuracion"]',
  PERFIL: 'a[href*="perfil"]',
  LOGOUT: 'a[href*="logout"]',
}
```

**How to Find**:

1. Look at navigation menu (usually top or side)
2. Inspect each menu item

**Example**:
```html
<ul class="nav navbar-nav">
  <li><a href="/home">Inicio</a></li>
  <li><a href="/administrar-aportantes">Aportantes</a></li>
  <li><a href="/liquidacion">Liquidación</a></li>
  <li><a href="/comprobantes">Comprobantes</a></li>
  <li><a href="/logout">Salir</a></li>
</ul>
```

→ Selectors:
- `a[href="/administrar-aportantes"]`
- `a:contains("Aportantes")`
- Use `href` attribute for most reliable

---

## URL Patterns

**File**: `src/bots/utils/selectors.ts`

```typescript
export const URL_PATTERNS = {
  BASE: 'https://suaporte.com.co',
  LOGIN: '/login',
  HOME: '/gestion/#/home',
  APORTANTES: '/gestion/#/home/administrar-aportantes',
  LIQUIDACION: '/gestion/#/home/liquidacion',
  COMPROBANTES: '/gestion/#/home/comprobantes',
};
```

**How to Verify**:
1. Manually navigate through site
2. Copy exact URLs from address bar
3. Update URL_PATTERNS

**Usage**:
```typescript
const enlaceBaseUrl = config.enlace?.baseUrl || URL_PATTERNS.BASE;
const aportantesUrl = `${enlaceBaseUrl}/gestion/#/home/administrar-aportantes`;
await page.goto(aportantesUrl, { waitUntil: 'networkidle0' });
```

---

## Selector Testing Checklist

### Before Deployment:

- [ ] **Login**
  - [ ] Document type select
  - [ ] Username input
  - [ ] Password input
  - [ ] Submit button
  - [ ] reCAPTCHA detection
  - [ ] Success redirect URL

- [ ] **Search**
  - [ ] Search input field
  - [ ] Search button (or Enter key)
  - [ ] Results table
  - [ ] No results message
  - [ ] First result row

- [ ] **Registration**
  - [ ] "Add Aportante" button
  - [ ] Form appearance
  - [ ] All form fields (tipo doc, numero doc, nombre, email, etc.)
  - [ ] Save button
  - [ ] Success message
  - [ ] Error message

- [ ] **Liquidation**
  - [ ] Navigation to section
  - [ ] User search
  - [ ] IBC input
  - [ ] Días input
  - [ ] EPS/Pension/ARL selects
  - [ ] Calculate button
  - [ ] Generate planilla button
  - [ ] Planilla number extraction
  - [ ] Success message

- [ ] **Comprobante**
  - [ ] Navigation to section
  - [ ] Planilla search
  - [ ] Download button
  - [ ] PDF download completion

- [ ] **Common**
  - [ ] Success alerts
  - [ ] Error alerts
  - [ ] Loading spinners
  - [ ] Modal dialogs

---

## Common Selector Patterns in Colombian Web Apps

### Bootstrap-based (Most Common):
```css
.alert.alert-success
.alert.alert-danger
.btn.btn-primary
.form-control
.modal.fade
.table.table-striped
```

### Custom Classes:
```css
.enlace-form
.aportante-card
.planilla-result
```

### Spanish Naming:
```css
.btn-guardar
.btn-cancelar
.mensaje-exito
.mensaje-error
.tabla-aportantes
```

---

## Debugging Selector Issues

### Issue: Element not found

**1. Check if selector is correct**:
```typescript
// Test in browser console
document.querySelector('#my-selector');
// Should return element, not null
```

**2. Check if element is in iframe**:
```typescript
// If element is in iframe
const frame = await page.frames().find(f => f.url().includes('iframe-url'));
await frame.waitForSelector(selector);
```

**3. Check if element loads later**:
```typescript
// Increase timeout
await page.waitForSelector(selector, { timeout: 10000 });

// Or wait for navigation
await page.waitForNavigation({ waitUntil: 'networkidle0' });
```

**4. Use XPath as fallback**:
```typescript
// XPath example
await page.waitForXPath('//button[contains(text(), "Guardar")]');
```

---

## Selector Update Log

Keep track of all selector changes:

| Date | Section | Selector | Old Value | New Value | Reason |
|------|---------|----------|-----------|-----------|--------|
| 2026-02-08 | LOGIN | USERNAME_INPUT | ESTIMATED | `#documento` | Real site inspection |
| | | | | | |

---

**Last Updated**: 2026-02-08
**Status**: All selectors are ESTIMATED - MUST UPDATE before production
