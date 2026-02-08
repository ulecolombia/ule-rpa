# Bots RPA - Enlace Operativo

Sistema de automatización con Puppeteer para gestión de PILA en Enlace Operativo.

## 📁 Estructura

```
src/bots/
├── utils/
│   ├── browser.ts       # BrowserManager con Puppeteer + Stealth
│   ├── wait.ts          # Helpers para esperar y manipular elementos
│   └── selectors.ts     # Selectores CSS/XPath de Enlace Operativo
├── enlace/
│   ├── auth.bot.ts      # Bot de autenticación (EnlaceAuthBot class)
│   ├── search.bot.ts    # Bot de búsqueda de usuarios
│   ├── registro.bot.ts  # Bot de registro de nuevos aportantes (EnlaceRegistroBot class)
│   ├── liquidacion.bot.ts   # Bot de liquidación PILA (EnlaceLiquidacionBot class)
│   └── comprobante.bot.ts   # Bot de descarga de comprobantes (EnlaceComprobanteBot class)
└── README.md
```

## 🤖 Bots Implementados

### 1. Authentication Bot (`auth.bot.ts`)

**Clase**: `EnlaceAuthBot`

**Funcionalidad**: Login, logout y gestión de sesiones en Enlace Operativo

**Características**:
- ✅ Gestión de sesión con timeout (30 minutos)
- ✅ Detección y manejo de reCAPTCHA (espera manual 2 minutos)
- ✅ Re-autenticación automática cuando expira sesión
- ✅ Verificación multi-nivel de autenticación (URL + elementos + cookies)
- ✅ Screenshots en cada paso crítico
- ✅ Singleton pattern para sesión compartida

**Métodos principales**:

```typescript
class EnlaceAuthBot {
  async login(): Promise<EnlaceSession>
  async getAuthenticatedPage(): Promise<Page>
  async isAuthenticated(): Promise<boolean>
  async ensureAuthenticated(): Promise<Page>
  async refreshSession(): Promise<void>
  async logout(): Promise<void>
  getSessionInfo(): { authenticated: boolean; ageMinutes: number | null; url: string | null }
  async cleanup(): Promise<void>
}

// Singleton instance
export const enlaceAuth = new EnlaceAuthBot();
```

**Ejemplo de uso**:

```typescript
import { enlaceAuth } from './enlace/auth.bot';

// Login
const session = await enlaceAuth.login();

// Get authenticated page (re-autentica si es necesario)
const page = await enlaceAuth.ensureAuthenticated();

// Check session info
const info = enlaceAuth.getSessionInfo();
console.log(`Session age: ${info.ageMinutes} minutes`);

// Logout
await enlaceAuth.logout();
```

**Interfaz EnlaceSession**:
```typescript
interface EnlaceSession {
  page: Page;
  cookies: any[];
  authenticated: boolean;
  sessionStartTime: Date;
}
```

---

### 2. Search Bot (`search.bot.ts`)

**Funcionalidad**: Buscar si un usuario ya existe en Enlace

**Funciones**:
- `buscarUsuarioEnlace(page, payload)` - Busca usuario por documento
- `usuarioExisteEnlace(page, numeroDocumento)` - Verifica existencia (retorna boolean)

**Proceso**:
1. Navegar a sección "Administrar aportantes"
2. Llenar input de búsqueda con número de documento
3. Presionar Enter o esperar resultados automáticos
4. Verificar si hay resultados
5. Extraer datos del usuario de la tabla (si existe)

**Ejemplo de uso**:

```typescript
import { enlaceAuth } from './enlace/auth.bot';
import { buscarUsuarioEnlace } from './enlace/search.bot';

const page = await enlaceAuth.ensureAuthenticated();

const result = await buscarUsuarioEnlace(page, {
  numeroDocumento: "1234567890",
  tipoDocumento: "CC"
});

if (result.data?.found) {
  console.log('User exists:', result.data.userData);
} else {
  console.log('User not found');
}
```

---

### 3. Registration Bot (`registro.bot.ts`)

**Clase**: `EnlaceRegistroBot`

**Funcionalidad**: Registrar nuevos usuarios (aportantes) en el sistema

**Características**:
- ✅ Verificación automática de duplicados (busca antes de registrar)
- ✅ Manejo de campos dinámicos (split name vs. full name)
- ✅ Selección inteligente de EPS/Pensión/ARL por coincidencia parcial
- ✅ Manejo de formularios con campos opcionales
- ✅ Extracción de enlaceUserId después del registro
- ✅ Integración con enlaceAuth para manejo de sesión

**Métodos principales**:

```typescript
class EnlaceRegistroBot {
  async registrarUsuario(userData: UserData): Promise<BotResponse<EnlaceRegistroResult>>
}

// Singleton instance
export const enlaceRegistro = new EnlaceRegistroBot();

// Quick function
export async function registrarUsuarioEnlace(userData: UserData): Promise<BotResponse<EnlaceRegistroResult>>
```

**Ejemplo de uso**:

```typescript
import { enlaceRegistro } from './enlace/registro.bot';

const userData = {
  uleUserId: "ULE123",
  tipoDocumento: "CC",
  numeroDocumento: "1234567890",
  nombre: "Juan Carlos Pérez García",
  email: "juan@example.com",
  telefono: "3001234567",
  direccion: "Calle 123 #45-67",
  ciudad: "Bogotá",
  eps: "SURA",
  pension: "PORVENIR",
  arl: "SURA"
};

const result = await enlaceRegistro.registrarUsuario(userData);

if (result.success && result.data?.registered) {
  console.log('Registered successfully');
  console.log('Enlace User ID:', result.data.enlaceUserId);
} else {
  console.log('Registration failed:', result.error);
}
```

**Características especiales**:
- **Split Name Handling**: Detecta si el formulario requiere nombre separado (primer nombre, segundo nombre, primer apellido, segundo apellido) o nombre completo
- **Partial Match Selection**: Para dropdowns con nombres largos (ej: "EPS SURA S.A."), busca por coincidencia parcial
- **Ciudad Handling**: Detecta si es input o select y maneja apropiadamente
- **Readonly Fields Detection**: No intenta llenar campos readonly/disabled

---

### 4. Liquidation Bot (`liquidacion.bot.ts`)

**Clase**: `EnlaceLiquidacionBot`

**Funcionalidad**: Liquidar PILA (calcular y generar planilla de pago)

**Características**:
- ✅ Búsqueda de usuario por documento
- ✅ Llenado de formulario con datos de cotización
- ✅ Detección de campos calculados automáticamente (readonly)
- ✅ Manejo de periodo (formato único o split Mes/Año)
- ✅ Extracción de número de planilla y fecha límite
- ✅ Validación de éxito con múltiples estrategias

**Métodos principales**:

```typescript
class EnlaceLiquidacionBot {
  async liquidarPila(numeroDocumento: string, pilaData: PilaData): Promise<BotResponse<EnlaceLiquidacionResult>>
}

// Singleton instance
export const enlaceLiquidacion = new EnlaceLiquidacionBot();

// Quick function
export async function liquidarPilaEnlace(numeroDocumento: string, pilaData: PilaData): Promise<BotResponse<EnlaceLiquidacionResult>>
```

**Ejemplo de uso**:

```typescript
import { enlaceLiquidacion } from './enlace/liquidacion.bot';

const pilaData = {
  periodo: "2026-02",
  ingresoBase: 1300000,
  ibc: 1300000,
  diasCotizados: 30,
  salud: 52000,
  pension: 52000,
  arl: 6942,
  nivelRiesgoARL: "I",
  total: 110942
};

const result = await enlaceLiquidacion.liquidarPila("1234567890", pilaData);

if (result.success && result.data?.liquidated) {
  console.log('Liquidation successful');
  console.log('Planilla number:', result.data.numeroPlanilla);
  console.log('Payment deadline:', result.data.fechaLimite);
  console.log('Total:', result.data.total);
}
```

**Proceso de liquidación**:
1. Navegar a sección de Liquidación
2. Buscar usuario por documento
3. Seleccionar usuario
4. Llenar periodo (YYYY-MM o Mes+Año)
5. Llenar IBC (Ingreso Base de Cotización)
6. Llenar días cotizados
7. Seleccionar nivel de riesgo ARL
8. Llenar valores de aportes (si no son readonly)
9. Click en "Calcular" (si existe el botón)
10. Click en "Liquidar" o "Generar Planilla"
11. Extraer número de planilla y fecha límite

---

### 5. Comprobante Bot (`comprobante.bot.ts`)

**Clase**: `EnlaceComprobanteBot`

**Funcionalidad**: Descargar comprobantes de pago PILA (PDF)

**Características**:
- ✅ Búsqueda por número de planilla, documento o periodo
- ✅ Tracking de descarga con timeout (1 minuto)
- ✅ Verificación de descarga (existencia, tamaño, formato PDF)
- ✅ Gestión automática de directorios
- ✅ Cleanup de archivos viejos
- ✅ Validación de PDF (magic bytes)

**Métodos principales**:

```typescript
class EnlaceComprobanteBot {
  async descargarComprobante(
    numeroPlanilla: string,
    numeroDocumento?: string,
    periodo?: string
  ): Promise<BotResponse<EnlaceComprobanteResult>>

  async cleanupOldFiles(daysOld: number = 30): Promise<number>
}

// Singleton instance
export const enlaceComprobante = new EnlaceComprobanteBot();

// Quick function
export async function descargarComprobanteEnlace(
  numeroPlanilla: string,
  numeroDocumento?: string,
  periodo?: string
): Promise<BotResponse<EnlaceComprobanteResult>>
```

**Ejemplo de uso**:

```typescript
import { enlaceComprobante } from './enlace/comprobante.bot';

const result = await enlaceComprobante.descargarComprobante(
  "123456789",  // numeroPlanilla
  "1234567890", // numeroDocumento (opcional)
  "2026-02"     // periodo (opcional)
);

if (result.success && result.data?.downloaded) {
  console.log('Downloaded successfully');
  console.log('File path:', result.data.filePath);
  console.log('File size:', result.data.fileSize);
}

// Cleanup old files (older than 30 days)
const deletedCount = await enlaceComprobante.cleanupOldFiles(30);
console.log(`Deleted ${deletedCount} old files`);
```

**Download tracking**:
- Monitorea el directorio de descargas cada segundo
- Busca archivos PDF creados recientemente (últimos 5 segundos)
- Ignora archivos `.crdownload` (descarga en progreso)
- Timeout de 1 minuto si no completa

---

## 🛠️ Utilities

### Browser Manager (`utils/browser.ts`)

**Clase**: `BrowserManager`

**Características**:
- ✅ Singleton pattern
- ✅ Puppeteer + Stealth plugin (anti-detección)
- ✅ Configuración automática de descargas via CDP
- ✅ Screenshots automáticos con timestamps
- ✅ User agent realista (Chrome 120 macOS)
- ✅ Viewport 1920x1080
- ✅ Headers de idioma: es-CO

**Métodos**:

```typescript
const manager = new BrowserManager({
  headless: true,
  downloadsPath: './downloads',
  userDataDir: './user-data'
});

await manager.launch();                        // Inicia browser
const page = await manager.newPage();          // Crea nueva página
await manager.takeScreenshot(page, 'test');    // Captura pantalla
await manager.close();                         // Cierra browser
```

**Singleton export**:
```typescript
export const browserManager = new BrowserManager();
```

---

### Wait Helpers (`utils/wait.ts`)

**Funciones principales**:

```typescript
// Esperar y hacer click
await waitAndClick(page, selector, { timeout: 10000, visible: true });

// Esperar y escribir texto
await waitAndType(page, selector, "texto", { delay: 100, clear: true });

// Seleccionar opción de dropdown
await selectOption(page, selector, "value");

// Verificar existencia de elemento (sin lanzar error)
const exists = await elementExists(page, selector);

// Obtener texto de elemento
const text = await getTextContent(page, selector);

// Obtener valor de input
const value = await getInputValue(page, selector);

// Delays aleatorios (simular comportamiento humano)
await randomDelay(500, 1500);

// Escribir con delays aleatorios
await humanType(page, selector, "texto");

// Scroll a elemento
await scrollToElement(page, selector);

// Reintentos con backoff exponencial
const result = await retryOperation(async () => {
  // operación que puede fallar
}, 3, 2000);
```

---

### Selectors (`utils/selectors.ts`)

**⚠️ IMPORTANTE**: Los selectores son ESTIMADOS y deben ser actualizados con los selectores reales del sitio web de Enlace Operativo.

**Estructura**:

```typescript
export const SELECTORS = {
  LOGIN: {
    TIPO_DOC_SELECT: 'select[name="tipoDocumento"]',
    NUMERO_DOC_INPUT: 'input[name="numeroDocumento"]',
    PASSWORD_INPUT: 'input[name="password"]',
    RECAPTCHA: '.g-recaptcha',
    CONTINUAR_BUTTON: 'button:has-text("Continuar")',
    // ...
  },
  APORTANTES: {
    MENU_ITEM: 'a:has-text("Administrar aportantes")',
    BUSCAR_INPUT: 'input[placeholder*="Buscar"]',
    FORM: { /* ... */ },
    RESULTS: { /* ... */ }
  },
  LIQUIDACION: { /* ... */ },
  COMPROBANTE: { /* ... */ },
  COMMON: { /* ... */ },
  NAV: { /* ... */ }
};

export const URL_PATTERNS = {
  BASE: 'https://suaporte.com.co',
  LOGIN: 'https://suaporte.com.co/sso/#/login',
  DASHBOARD: 'https://suaporte.com.co/tablero/',
  APORTANTES: 'https://suaporte.com.co/gestion/#/home/administrar-aportantes',
  LIQUIDACION: 'https://suaporte.com.co/liquidacion/',
  COMPROBANTES: 'https://suaporte.com.co/comprobantes/',
};
```

**Cómo actualizar selectores**:

1. Abrir Enlace Operativo en modo `headless: false`
2. Inspeccionar elementos con DevTools (F12)
3. Identificar selectores CSS únicos (IDs, classes, atributos)
4. Actualizar en `selectors.ts`
5. Probar con `npm run dev:worker`

---

## 📝 Flujo Típico Completo (FULL_FLOW)

```typescript
import { enlaceAuth } from './enlace/auth.bot';
import { buscarUsuarioEnlace } from './enlace/search.bot';
import { enlaceRegistro } from './enlace/registro.bot';
import { enlaceLiquidacion } from './enlace/liquidacion.bot';
import { enlaceComprobante } from './enlace/comprobante.bot';

async function flujoCompletoPila(userData: UserData, pilaData: PilaData) {
  try {
    // 1. Autenticar (la sesión se mantiene para todos los bots)
    const session = await enlaceAuth.login();
    const page = session.page;

    // 2. Verificar si usuario existe
    const searchResult = await buscarUsuarioEnlace(page, {
      numeroDocumento: userData.numeroDocumento
    });

    let enlaceUserId: string | undefined;

    if (!searchResult.data?.found) {
      // 3. Registrar usuario (si no existe)
      const registroResult = await enlaceRegistro.registrarUsuario(userData);

      if (!registroResult.success) {
        throw new Error(`Registration failed: ${registroResult.error}`);
      }

      enlaceUserId = registroResult.data?.enlaceUserId;
    } else {
      enlaceUserId = searchResult.data.userData?.enlaceUserId;
    }

    // 4. Liquidar PILA
    const liquidacionResult = await enlaceLiquidacion.liquidarPila(
      userData.numeroDocumento,
      pilaData
    );

    if (!liquidacionResult.success) {
      throw new Error(`Liquidation failed: ${liquidacionResult.error}`);
    }

    const numeroPlanilla = liquidacionResult.data?.numeroPlanilla;

    // 5. Descargar comprobante
    if (numeroPlanilla) {
      const comprobanteResult = await enlaceComprobante.descargarComprobante(
        numeroPlanilla,
        userData.numeroDocumento,
        pilaData.periodo
      );

      if (!comprobanteResult.success) {
        console.warn('Failed to download comprobante:', comprobanteResult.error);
      }
    }

    // 6. Logout
    await enlaceAuth.logout();

    return {
      success: true,
      enlaceUserId,
      numeroPlanilla,
      fechaLimite: liquidacionResult.data?.fechaLimite,
      total: liquidacionResult.data?.total
    };
  } catch (error) {
    console.error('Error en flujo PILA:', error);

    // Cleanup en caso de error
    await enlaceAuth.cleanup();

    throw error;
  }
}
```

---

## 🧪 Testing de Bots

### Test Manual

```bash
# Modo visible (ver el browser)
PUPPETEER_HEADLESS=false npm run worker

# Ver screenshots generados
ls ./screenshots/
```

### Test con Script

Crear `scripts/test-full-flow.ts`:

```typescript
import { browserManager } from '../src/bots/utils/browser';
import { enlaceAuth } from '../src/bots/enlace/auth.bot';
import { enlaceRegistro } from '../src/bots/enlace/registro.bot';

async function test() {
  // Configure headless mode
  process.env.PUPPETEER_HEADLESS = 'false';

  try {
    // Test authentication
    console.log('Testing authentication...');
    const session = await enlaceAuth.login();
    console.log('✅ Auth successful');

    // Test registration
    console.log('Testing registration...');
    const userData = {
      uleUserId: 'TEST123',
      tipoDocumento: 'CC' as const,
      numeroDocumento: '1234567890',
      nombre: 'Juan Test García',
      email: 'juan@test.com',
      telefono: '3001234567',
      direccion: 'Calle Test 123',
      ciudad: 'Bogotá',
      eps: 'SURA',
      pension: 'PORVENIR',
      arl: 'SURA'
    };

    const result = await enlaceRegistro.registrarUsuario(userData);
    console.log('Registration result:', result);

    // Logout
    await enlaceAuth.logout();
    console.log('✅ Test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browserManager.close();
  }
}

test();
```

Ejecutar:

```bash
npx tsx scripts/test-full-flow.ts
```

---

## 🔐 Seguridad y Anti-Detección

### Plugins Aplicados:
- ✅ `puppeteer-extra-plugin-stealth` - Oculta señales de automation
- ✅ User Agent realista (Chrome 120 macOS)
- ✅ Viewport 1920x1080
- ✅ Headers de idioma: es-CO
- ✅ Delays aleatorios entre acciones
- ✅ Tipeo con velocidad variable (`humanType`)

### Mejores Prácticas:
1. **Usar delays aleatorios**: `randomDelay(500, 1500)`
2. **Simular comportamiento humano**: `humanType` en lugar de `type`
3. **Tomar screenshots en errores**: Para debugging
4. **Manejar reCAPTCHA**: Detectar y esperar resolución manual
5. **No usar selectores obvios de automation**: Evitar `data-testid`
6. **Sesiones persistentes**: Reusar sesión en lugar de login repetido

---

## 🐛 Troubleshooting

### Bot no encuentra elementos

**Problema**: `waitForSelector` timeout

**Soluciones**:
1. Verificar que selector es correcto (inspeccionar en DevTools)
2. Aumentar timeout: `waitForSelector(page, selector, 30000)`
3. Usar `elementExists` para verificar primero
4. Probar selector alternativo
5. Verificar que página terminó de cargar

### reCAPTCHA bloqueando login

**Problema**: Enlace muestra reCAPTCHA

**Soluciones**:
1. Ejecutar en modo visible: `headless: false`
2. Resolver manualmente (bot espera 2 minutos automáticamente)
3. Considerar servicio de resolución de CAPTCHA (2captcha, anti-captcha)
4. Usar session cookies guardadas para evitar re-login

### Bot es detectado

**Problema**: Enlace detecta automation

**Soluciones**:
1. Verificar que stealth plugin está activo
2. Aumentar delays aleatorios
3. Usar `humanType` en lugar de `type`
4. Verificar User Agent
5. Probar en modo headful primero
6. Revisar que no hay WebDriver flags expuestos

### Sesión expira inesperadamente

**Problema**: Session timeout antes de 30 minutos

**Soluciones**:
1. Usar `enlaceAuth.refreshSession()` periódicamente
2. Verificar conectividad de red
3. Revisar logs para errores de navegación
4. Aumentar `SESSION_TIMEOUT_MS` si es necesario

### Descarga de comprobante falla

**Problema**: Archivo no se descarga o está vacío

**Soluciones**:
1. Verificar permisos del directorio `./uploads/comprobantes`
2. Aumentar `DOWNLOAD_TIMEOUT_MS`
3. Verificar que CDP session está configurado correctamente
4. Revisar que el botón de descarga es el correcto
5. Probar en modo visible para ver el comportamiento

---

## 📊 Arquitectura de Bots

### Patrón de Diseño

Todos los bots siguen el mismo patrón:

```typescript
export class BotClass {
  // 1. Métodos públicos (API del bot)
  async mainMethod(params): Promise<BotResponse<Result>> {
    const page = await enlaceAuth.ensureAuthenticated();

    try {
      // Flujo principal
      await this.step1(page);
      await this.step2(page);
      const result = await this.step3(page);

      return { success: true, data: result };
    } catch (error) {
      const screenshot = await browserManager.takeScreenshot(page, 'error');
      return { success: false, error: error.message, screenshot };
    }
  }

  // 2. Métodos privados (pasos internos)
  private async step1(page: Page): Promise<void> {
    // Implementación
  }
}

// 3. Singleton export
export const botInstance = new BotClass();

// 4. Quick function export
export async function quickFunction(params): Promise<BotResponse<Result>> {
  return botInstance.mainMethod(params);
}
```

### Ventajas del Patrón:
- ✅ Reutilización de sesión (todos usan `enlaceAuth`)
- ✅ Código organizado y testeable
- ✅ Manejo consistente de errores
- ✅ Screenshots automáticos
- ✅ Logging detallado
- ✅ Fácil extensión y mantenimiento

---

## 🔜 Próximos Pasos

1. ✅ **Actualizar selectores reales** - Inspeccionar Enlace y actualizar `selectors.ts`
2. ⬜ **Tests end-to-end** - Probar flujo completo con datos reales
3. ⬜ **Manejo de errores mejorado** - Reintentos automáticos en casos específicos
4. ⬜ **Logging a base de datos** - TaskLog con screenshots
5. ⬜ **Métricas y monitoring** - Duración, tasas de éxito
6. ⬜ **Session persistence** - Guardar cookies para evitar re-login
7. ⬜ **Parallel execution** - Múltiples bots concurrentes con BullMQ

---

## 📚 Referencias

- [Puppeteer Docs](https://pptr.dev/)
- [Puppeteer Extra](https://github.com/berstend/puppeteer-extra)
- [Stealth Plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [CSS Selectors Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)

---

## ✅ Checklist de Implementación

- [x] BrowserManager con Stealth
- [x] Wait helpers y utilidades
- [x] Selectores organizados
- [x] EnlaceAuthBot (clase con sesión)
- [x] Search bot (funciones)
- [x] EnlaceRegistroBot (clase)
- [x] EnlaceLiquidacionBot (clase)
- [x] EnlaceComprobanteBot (clase)
- [x] README completo
- [ ] Selectores actualizados con sitio real
- [ ] Tests E2E
- [ ] Integración con worker/queue
