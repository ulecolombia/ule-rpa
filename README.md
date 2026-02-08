# ULE RPA Service

Servicio de automatización RPA para gestión de PILA (Planilla Integrada de Liquidación de Aportes) en Colombia a través de Enlace Operativo.

## Descripción

Este servicio automatiza procesos relacionados con la seguridad social en Colombia para la plataforma ULE. Utiliza Puppeteer para automatizar interacciones con el portal de Enlace Operativo, permitiendo:

- Registro automático de usuarios independientes
- Liquidación de planillas PILA
- Descarga de comprobantes de pago
- Búsqueda y verificación de usuarios

## Stack Tecnológico

- **Node.js 20** + **TypeScript**
- **Puppeteer** + **Puppeteer Extra** (stealth plugin)
- **BullMQ** para gestión de colas
- **Redis** para almacenamiento de colas
- **PostgreSQL** + **Prisma ORM** para persistencia
- **Express** para API REST
- **Winston** para logging
- **Zod** para validación
- **Docker** para containerización

## Arquitectura

```
ule-rpa-service/
├── src/
│   ├── bots/                    # Automatización con Puppeteer
│   │   ├── enlace/             # Bots específicos de Enlace
│   │   │   ├── auth.bot.ts     # Autenticación
│   │   │   ├── registro.bot.ts # Registro de usuarios
│   │   │   ├── liquidacion.bot.ts # Liquidación PILA
│   │   │   ├── comprobante.bot.ts # Descarga PDFs
│   │   │   └── search.bot.ts   # Búsqueda
│   │   └── utils/              # Utilidades de Puppeteer
│   │
│   ├── orchestrator/           # Sistema de colas BullMQ
│   │   ├── queue.config.ts    # Configuración de colas
│   │   ├── worker.ts          # Procesador de tareas
│   │   └── scheduler.ts       # Jobs programados
│   │
│   ├── api/                    # API REST
│   │   ├── routes/            # Rutas HTTP
│   │   └── middleware/        # Middleware (auth, validation, errors)
│   │
│   ├── storage/                # Gestión de archivos
│   ├── utils/                  # Utilidades (logger, config, crypto)
│   └── types/                  # TypeScript types
│
├── prisma/
│   ├── schema.prisma          # Schema de base de datos
│   └── seed.ts                # Datos iniciales
│
└── tests/                      # Tests unitarios e integración
```

## Requisitos Previos

- **Node.js** >= 20.0.0
- **Docker** y **Docker Compose**
- **PostgreSQL** 16
- **Redis** 7

## Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd ule-rpa-service
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# Server
PORT=3001
API_KEY=tu-api-key-segura

# Database
DATABASE_URL="postgresql://ule:ule_password@localhost:5432/ule_rpa?schema=public"

# Enlace Operativo (Cuenta Admin)
ENLACE_BASE_URL=https://suaporte.com.co
ENLACE_ADMIN_DOC=1234567890
ENLACE_ADMIN_USER=tu_usuario
ENLACE_ADMIN_PASS=tu_password

# ULE API
ULE_API_URL=http://localhost:3000
ULE_WEBHOOK_SECRET=secret-compartido-con-ule
```

### 4. Levantar servicios de infraestructura

```bash
docker-compose up -d
```

Esto inicia PostgreSQL y Redis.

### 5. Inicializar base de datos

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 6. Ejecutar en desarrollo

**Terminal 1 - API Server:**
```bash
npm run dev
```

**Terminal 2 - Worker:**
```bash
npm run worker
```

## Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Inicia API server con hot-reload
npm run worker           # Inicia worker de procesamiento

# Prisma
npm run prisma:generate  # Genera cliente Prisma
npm run prisma:migrate   # Ejecuta migraciones
npm run prisma:studio    # Abre Prisma Studio (GUI)
npm run prisma:seed      # Ejecuta seed de datos

# Build y Deploy
npm run build            # Compila TypeScript
npm start                # Ejecuta versión compilada

# Calidad de código
npm run lint             # Verifica con ESLint
npm run lint:fix         # Corrige problemas automáticamente
npm run format           # Formatea con Prettier
npm run typecheck        # Verifica tipos sin compilar

# Testing
npm test                 # Ejecuta tests
npm run test:watch       # Tests en modo watch
npm run test:e2e         # Tests end-to-end
```

## Uso de la API

### Autenticación

Todas las rutas protegidas requieren el header `X-API-Key`:

```bash
curl -H "X-API-Key: tu-api-key" http://localhost:3001/tasks
```

### Endpoints

#### Health Check

```bash
GET /health
GET /ping
```

#### Crear Tarea

```bash
POST /tasks
Content-Type: application/json
X-API-Key: tu-api-key

{
  "type": "REGISTRO_USUARIO",
  "priority": 1,
  "uleUserId": "user-123",
  "userDoc": "1234567890",
  "userName": "Juan Pérez",
  "payload": {
    "documento": "1234567890",
    "tipoDocumento": "CC",
    "nombres": "Juan",
    "apellidos": "Pérez",
    "email": "juan@example.com",
    "telefono": "3001234567"
  }
}
```

Tipos de tareas disponibles:
- `REGISTRO_USUARIO` - Registrar usuario en Enlace
- `LIQUIDACION_PILA` - Liquidar planilla PILA
- `DESCARGA_COMPROBANTE` - Descargar comprobante PDF
- `BUSQUEDA_USUARIO` - Buscar usuario existente

#### Consultar Tarea

```bash
GET /tasks/:id
X-API-Key: tu-api-key
```

#### Listar Tareas

```bash
GET /tasks?page=1&limit=20&status=COMPLETED&uleUserId=user-123
X-API-Key: tu-api-key
```

Parámetros de query:
- `page` - Número de página (default: 1)
- `limit` - Resultados por página (default: 20)
- `status` - Filtrar por estado (PENDING, PROCESSING, COMPLETED, FAILED)
- `type` - Filtrar por tipo de tarea
- `uleUserId` - Filtrar por usuario de ULE

#### Reintentar Tarea Fallida

```bash
POST /tasks/:id/retry
X-API-Key: tu-api-key
```

#### Estadísticas

```bash
GET /tasks/stats/summary
X-API-Key: tu-api-key
```

Retorna conteo de tareas por estado.

### Webhooks desde ULE

Para que ULE envíe tareas automáticamente:

```bash
POST /webhooks/ule/task
Content-Type: application/json
X-ULE-Signature: hmac-sha256-signature

{
  "type": "LIQUIDACION_PILA",
  "uleUserId": "user-123",
  "userDoc": "1234567890",
  "userName": "Juan Pérez",
  "priority": 1,
  "data": {
    "documento": "1234567890",
    "periodo": "2024-01",
    "ibc": 1300000,
    "diasCotizados": 30,
    "valorSalud": 52000,
    "valorPension": 52000,
    "valorARL": 6944
  }
}
```

La firma HMAC-SHA256 se calcula con `ULE_WEBHOOK_SECRET`.

## Flujo de Procesamiento

1. **Cliente (ULE)** crea una tarea vía API o webhook
2. La tarea se guarda en **PostgreSQL** con estado `PENDING`
3. Se agrega a la **cola de BullMQ**
4. El **Worker** toma la tarea y:
   - Actualiza estado a `PROCESSING`
   - Lanza navegador Puppeteer
   - Se autentica en Enlace Operativo
   - Ejecuta el bot correspondiente al tipo de tarea
   - Guarda resultados y archivos generados
   - Actualiza estado a `COMPLETED` o `FAILED`
5. ULE puede consultar el estado vía API

## Modelos de Base de Datos

### Task

Representa una tarea de RPA a ejecutar.

```typescript
{
  id: string
  type: TaskType
  status: TaskStatus
  priority: number
  uleUserId: string
  userDoc: string
  userName: string
  payload: Json
  result: Json | null
  error: string | null
  attempts: number
  maxAttempts: number
  createdAt: DateTime
  updatedAt: DateTime
  startedAt: DateTime | null
  completedAt: DateTime | null
  files: TaskFile[]
}
```

### EnlaceUser

Almacena usuarios registrados en Enlace.

```typescript
{
  id: string
  uleUserId: string
  documento: string
  tipoDocumento: string
  nombres: string
  apellidos: string
  email: string | null
  telefono: string | null
  enlaceId: string | null
  registered: boolean
  status: UserStatus
  lastSync: DateTime | null
  createdAt: DateTime
  updatedAt: DateTime
}
```

### TaskFile

Archivos generados por tareas (PDFs, screenshots).

```typescript
{
  id: string
  taskId: string
  fileName: string
  fileType: string
  filePath: string
  fileUrl: string | null
  fileSize: number
  createdAt: DateTime
}
```

## Configuración de Puppeteer

### Modo Headless

Por defecto en `true` para producción. Para debugging local:

```env
PUPPETEER_HEADLESS=false
```

### Selectores de Enlace

Los selectores CSS de Enlace Operativo están en:
```
src/bots/utils/selectors.ts
```

**IMPORTANTE:** Estos selectores son ejemplos. Debes actualizarlos según el sitio real de Enlace Operativo.

### Crear un Nuevo Bot

1. Crea archivo en `src/bots/enlace/mi-bot.bot.ts`
2. Implementa la función principal:

```typescript
import { Page } from 'puppeteer';
import { BotResponse } from '../../types';

export async function miNuevoBot(
  page: Page,
  payload: MiPayload
): Promise<BotResponse<MiResult>> {
  const startTime = Date.now();

  try {
    // Tu lógica aquí

    return {
      success: true,
      data: { /* resultado */ },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}
```

3. Agrégalo al worker en `src/orchestrator/worker.ts`

## Deployment

### Docker

```bash
# Build
docker build -t ule-rpa-service .

# Run
docker run -d \
  --name ule-rpa \
  -p 3001:3001 \
  --env-file .env \
  ule-rpa-service
```

### Docker Compose (Producción)

Edita `docker-compose.yml` y descomenta la sección `app`. Luego:

```bash
docker-compose up -d
```

## Monitoreo y Logs

### Logs

Los logs se almacenan en:
- Consola (desarrollo)
- Archivos rotativos en `./logs/` (producción)

Niveles de log:
- `error` - Errores críticos
- `warn` - Advertencias
- `info` - Información general
- `debug` - Debugging detallado

### BullMQ Dashboard (opcional)

Puedes instalar `@bull-board/express` para una UI de monitoreo de colas.

## Troubleshooting

### Puppeteer no encuentra Chromium

**macOS:**
```bash
brew install chromium
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install chromium-browser
```

Luego configura en `.env`:
```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Error de conexión a Redis

Verifica que Redis esté corriendo:
```bash
docker-compose ps
redis-cli ping  # debe responder PONG
```

### Error de conexión a PostgreSQL

Verifica la conexión:
```bash
docker-compose ps
psql postgresql://ule:ule_password@localhost:5432/ule_rpa
```

### Tareas se quedan en PROCESSING

El worker puede haber fallado. Reinícialo:
```bash
npm run worker
```

Para limpiar tareas huérfanas, conécta a la DB y actualiza manualmente:
```sql
UPDATE "Task" SET status = 'FAILED'
WHERE status = 'PROCESSING'
AND "startedAt" < NOW() - INTERVAL '1 hour';
```

### Bot falla con timeout

Aumenta el timeout en `.env`:
```env
PUPPETEER_TIMEOUT=60000
```

### Selectores no funcionan

Los selectores CSS pueden cambiar. Actualiza `src/bots/utils/selectors.ts` inspeccionando el sitio de Enlace con DevTools.

## Seguridad

- **API Key**: Protege todos los endpoints con API key
- **Webhook Signature**: Valida firma HMAC en webhooks
- **Credenciales**: Nunca commitees `.env` al repositorio
- **Encriptación**: Usa `src/utils/crypto.ts` para datos sensibles
- **Rate Limiting**: Implementa rate limiting en producción
- **CORS**: Configura CORS para permitir solo dominios autorizados

## Testing

```bash
# Unit tests
npm test

# Coverage
npm test -- --coverage

# E2E tests (requiere servicios corriendo)
npm run test:e2e
```

## Contribución

1. Fork el repositorio
2. Crea una rama feature (`git checkout -b feature/mi-feature`)
3. Commit cambios (`git commit -am 'Add feature'`)
4. Push a la rama (`git push origin feature/mi-feature`)
5. Abre un Pull Request

## Licencia

ISC

## Soporte

Para reportar bugs o solicitar features, abre un issue en el repositorio.