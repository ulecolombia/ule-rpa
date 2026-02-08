# Utilidades del Servicio RPA

Documentación de las utilidades fundamentales del servicio.

## 📁 Estructura

```
src/utils/
├── config.ts       # Configuración centralizada con validación
├── logger.ts       # Sistema de logging con Winston
├── errors.ts       # Clases de error personalizadas
├── crypto.ts       # Funciones de encriptación
├── helpers.ts      # Utilidades helper generales
├── validators.ts   # Validadores para datos colombianos
└── index.ts        # Exportaciones centralizadas
```

## 🔧 Configuración (config.ts)

Configuración centralizada con validación de variables de entorno usando Zod.

### Uso básico:

```typescript
import { config } from './utils/config';

// Acceso tipado a configuración
console.log(config.port); // 3001
console.log(config.enlace.baseUrl); // https://suaporte.com.co
console.log(config.isDevelopment); // true/false

// Validar configuración al inicio
import { validateConfig } from './utils/config';
validateConfig(); // Muestra resumen de configuración
```

### Variables disponibles:

- `config.nodeEnv` - Entorno (development/production/test)
- `config.port` - Puerto del servidor
- `config.database.url` - URL de PostgreSQL
- `config.redis.host/port` - Configuración Redis
- `config.enlace.admin.*` - Credenciales admin Enlace
- `config.puppeteer.*` - Configuración Puppeteer
- `config.logging.*` - Configuración de logs

## 📝 Logger (logger.ts)

Sistema de logging con Winston, logs estructurados y rotación de archivos.

### Uso básico:

```typescript
import { logger, createChildLogger, logWithTask } from './utils/logger';

// Logging simple
logger.info('Server started');
logger.error('Failed to connect', { error: err.message });
logger.debug('Processing user', { userId: '123' });

// Logger con contexto (child logger)
const taskLogger = createChildLogger({ taskId: 'task-123', userId: 'user-456' });
taskLogger.info('Task started');
taskLogger.error('Task failed', { error: 'Timeout' });
// Output incluye: taskId: 'task-123', userId: 'user-456'

// Funciones helper
logWithTask('task-123', 'info', 'Processing payment');
logBotAction('login', { username: 'admin' });
logApiRequest('POST', '/tasks', { taskType: 'REGISTRO' });
logDbOperation('insert', 'Task', { id: '123' });
```

### Características:

- ✅ Logs en consola (desarrollo) y archivos (producción)
- ✅ Rotación diaria de archivos (14 días error, 14 días combined, 7 días info)
- ✅ Logs estructurados en JSON
- ✅ Captura de excepciones y rechazos no manejados
- ✅ Contexto automático con child loggers

## ❌ Errores (errors.ts)

Clases de error personalizadas con contexto y códigos HTTP.

### Uso:

```typescript
import {
  ValidationError,
  NotFoundError,
  BotError,
  EnlaceError,
  ExternalServiceError,
  isOperationalError,
  formatErrorResponse,
} from './utils/errors';

// Lanzar errores tipados
throw new ValidationError('Email inválido', { email: 'bad-email' });
throw new NotFoundError('Usuario no encontrado', { userId: '123' });
throw new EnlaceError('Login falló', screenshotPath, pageUrl);

// En catch blocks
try {
  await operation();
} catch (error) {
  if (isOperationalError(error)) {
    // Error esperado, podemos manejarlo
    logger.warn('Operational error', error.toJSON());
  } else {
    // Error inesperado
    logger.error('Unexpected error', error);
  }
}

// Formatear para API response
app.use((err, req, res, next) => {
  const response = formatErrorResponse(err);
  res.status(err.statusCode || 500).json(response);
});
```

### Clases disponibles:

- `AppError` - Base (500)
- `ValidationError` - Validación (400)
- `AuthenticationError` - Autenticación (401)
- `AuthorizationError` - Autorización (403)
- `NotFoundError` - No encontrado (404)
- `ConflictError` - Conflicto (409)
- `TimeoutError` - Timeout (408)
- `RateLimitError` - Rate limit (429)
- `BotError` - Error de bot (500)
- `EnlaceError` - Error de Enlace (500)
- `ExternalServiceError` - API externa (502)
- `DatabaseError` - Error de BD (500)
- `QueueError` - Error de cola (500)

## 🔐 Crypto (crypto.ts)

Funciones de encriptación segura para datos sensibles.

### Encriptación:

```typescript
import { encrypt, decrypt, encryptSimple, decryptSimple } from './utils/crypto';

// Encriptación completa (con salt, más segura)
const encrypted = await encrypt('datos sensibles');
const decrypted = await decrypt(encrypted);

// Encriptación simple (más rápida, sin salt)
const encrypted = encryptSimple('datos menos sensibles');
const decrypted = decryptSimple(encrypted);
```

### Hashing de passwords:

```typescript
import { hash, compareHash } from './utils/crypto';

// Guardar password
const hashedPassword = await hash('myPassword123');
// Guarda en DB: "salt:hash"

// Verificar password
const isValid = await compareHash('myPassword123', hashedPassword);
// true o false
```

### Webhooks y firmas:

```typescript
import { sign, verifySignature, generateToken } from './utils/crypto';

// Firmar payload
const payload = JSON.stringify({ data: 'something' });
const signature = sign(payload, config.ule.webhookSecret);

// Verificar firma
const isValid = verifySignature(payload, signature, config.ule.webhookSecret);

// Generar tokens
const apiKey = generateToken(32); // 64 caracteres hex
const sessionId = generateUrlSafeToken(16); // URL-safe
const taskId = generateId('task', 16); // 'task_a3f9e2c1...'
```

### Enmascarar datos sensibles:

```typescript
import { maskSensitive } from './utils/crypto';

maskSensitive('1234567890', 2); // '12******90'
maskSensitive('secret-api-key', 3); // 'sec********key'
```

## 🛠️ Helpers (helpers.ts)

Utilidades helper para operaciones comunes.

### Async utilities:

```typescript
import { sleep, retry } from './utils/helpers';

// Esperar
await sleep(1000); // 1 segundo

// Reintentar con backoff exponencial
const result = await retry(
  async () => {
    return await fetchData();
  },
  3, // max 3 reintentos
  1000 // delay inicial 1s
);
```

### Formateo:

```typescript
import {
  formatCurrency,
  formatPilaPeriod,
  formatDocumento,
  truncate,
} from './utils/helpers';

formatCurrency(1300000); // '$1.300.000'
formatPilaPeriod(new Date()); // '2026-02'
formatDocumento('1234567890'); // '1.234.567.890'
truncate('Long text here', 10); // 'Long te...'
```

### PILA específico:

```typescript
import {
  getCurrentPilaPeriod,
  calculatePilaContributions,
  validateIBC,
} from './utils/helpers';

// Periodo actual
const periodo = getCurrentPilaPeriod(); // '2026-02'

// Calcular aportes
const aportes = calculatePilaContributions(1300000, 'I');
// { salud: 162500, pension: 208000, arl: 6786, total: 377286 }

// Validar IBC
const isValid = validateIBC(1300000); // true
```

### Array utilities:

```typescript
import { chunk, unique, pick, omit } from './utils/helpers';

chunk([1, 2, 3, 4, 5], 2); // [[1,2], [3,4], [5]]
unique([1, 2, 2, 3, 3, 3]); // [1, 2, 3]

const user = { id: 1, name: 'John', password: 'secret' };
pick(user, ['id', 'name']); // { id: 1, name: 'John' }
omit(user, ['password']); // { id: 1, name: 'John' }
```

## ✅ Validators (validators.ts)

Validadores específicos para datos colombianos.

### Validación de documentos:

```typescript
import { validateDocumento, validateTelefono, validateEmail } from './utils/validators';

const result = validateDocumento('1234567890', 'CC');
if (!result.valid) {
  console.error(result.error);
}

validateTelefono('3001234567'); // { valid: true }
validateEmail('user@example.com'); // { valid: true }
```

### Validación de PILA:

```typescript
import {
  validatePilaPeriod,
  validateIBC,
  validateDiasCotizados,
} from './utils/validators';

validatePilaPeriod('2026-02'); // { valid: true }
validatePilaPeriod('2027-01'); // { valid: false, error: '...' }

validateIBC(1300000); // { valid: true }
validateIBC(500000); // { valid: false, error: 'IBC no puede ser menor...' }

validateDiasCotizados(30); // { valid: true }
validateDiasCotizados(31); // { valid: false }
```

### Schemas Zod:

```typescript
import {
  UserDataSchema,
  PilaDataSchema,
  DocumentoSchema,
  EmailSchema,
} from './utils/validators';

// Validar con Zod
try {
  const userData = UserDataSchema.parse({
    uleUserId: 'user-123',
    tipoDocumento: 'CC',
    numeroDocumento: '1234567890',
    nombre: 'Juan Pérez',
    email: 'juan@example.com',
    telefono: '3001234567',
    direccion: 'Calle 123',
    ciudad: 'Bogotá',
    eps: 'SANITAS',
    pension: 'PORVENIR',
    arl: 'SURA',
  });
} catch (error) {
  console.error('Validation failed', error.errors);
}
```

### Constantes:

```typescript
import {
  DOCUMENT_TYPES,
  ARL_RISK_LEVELS,
  EPS_PROVIDERS,
  PENSION_PROVIDERS,
  ARL_PROVIDERS,
} from './utils/validators';

// ['CC', 'CE', 'PEP', 'TI', 'RC']
// ['I', 'II', 'III', 'IV', 'V']
// ['SANITAS', 'SURA', 'SALUD TOTAL', ...]
```

## 🚀 Ejemplos de uso completo

### Crear tarea con validación:

```typescript
import { logger, ValidationError, UserDataSchema, createChildLogger } from './utils';

async function createTask(input: any) {
  const taskLogger = createChildLogger({ operation: 'createTask' });

  try {
    // Validar entrada
    const userData = UserDataSchema.parse(input.userData);

    taskLogger.info('Creating task', { userId: userData.uleUserId });

    // Crear tarea...

    taskLogger.info('Task created successfully');
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid user data', { errors: error.errors });
    }
    throw error;
  }
}
```

### Procesar con retry y logging:

```typescript
import { logger, retry, sleep, BotError } from './utils';

async function processWithRetry(taskId: string) {
  const taskLogger = createChildLogger({ taskId });

  const result = await retry(
    async () => {
      taskLogger.debug('Attempting operation');

      try {
        const result = await performOperation();
        return result;
      } catch (error) {
        taskLogger.warn('Operation failed, will retry', { error: error.message });
        throw error;
      }
    },
    3,
    2000
  );

  return result;
}
```

## 📋 Checklist de implementación

Cuando uses estas utilidades:

- [ ] Importar desde `./utils` o `./utils/<modulo>`
- [ ] Usar `createChildLogger` para contexto en tareas
- [ ] Lanzar errores tipados en lugar de `Error` genérico
- [ ] Validar inputs con schemas de Zod
- [ ] Usar `retry()` para operaciones que pueden fallar
- [ ] Enmascarar datos sensibles en logs con `maskSensitive()`
- [ ] Encriptar datos sensibles antes de guardar en BD
- [ ] Verificar firmas de webhooks con `verifySignature()`

## 🔍 Tips

1. **Logging**: Siempre usa child loggers para agregar contexto automático
2. **Errores**: Captura y registra todos los errores, incluso los operacionales
3. **Validación**: Valida datos al entrar y salir de tu sistema
4. **Encriptación**: Usa `encrypt()` completo para datos muy sensibles, `encryptSimple()` para el resto
5. **Retry**: No abuses de retry, úsalo solo para operaciones idempotentes
6. **Helpers**: Usa las funciones de PILA para cálculos consistentes

## 📚 Referencias

- Winston: https://github.com/winstonjs/winston
- Zod: https://zod.dev
- Node.js crypto: https://nodejs.org/api/crypto.html
