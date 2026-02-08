# ULE RPA Service - Setup & Verification Guide

## 🚀 Quick Start

### 1. Instalación de Dependencias

```bash
# Instalar dependencias de Node.js
npm install

# Generar Prisma Client
npm run prisma:generate
```

### 2. Configuración de Entorno

Copiar y configurar archivo `.env`:

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```bash
# Base de datos
DATABASE_URL="postgresql://ule:ule_password@localhost:5432/ule_rpa?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# API Key (mínimo 32 caracteres)
API_KEY=your-secret-api-key-minimum-32-characters-long-please-change

# Enlace Operativo
ENLACE_ADMIN_DOC=1234567890
ENLACE_ADMIN_USER=your_username
ENLACE_ADMIN_PASS=your_password
```

### 3. Iniciar Servicios

#### Opción A: Con Docker

```bash
# Iniciar PostgreSQL y Redis
docker-compose up -d

# Verificar que estén corriendo
docker-compose ps
```

#### Opción B: Servicios Locales

Si ya tienes PostgreSQL y Redis instalados localmente:

```bash
# Iniciar PostgreSQL (macOS con Homebrew)
brew services start postgresql@15

# Iniciar Redis
brew services start redis

# O con redis-server directo
redis-server
```

### 4. Configurar Base de Datos

```bash
# Ejecutar migraciones
npm run prisma:migrate

# (Opcional) Cargar datos de prueba
npm run prisma:seed
```

### 5. Iniciar Aplicación

#### Desarrollo

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Worker (en otra terminal)
npm run dev:worker

# O ambos simultáneamente
npm run dev:all
```

#### Producción

```bash
# Compilar TypeScript
npm run build

# Iniciar ambos servicios
npm run start:all
```

---

## ✅ Verificación del Sistema

### 1. Health Check

```bash
curl http://localhost:3001/health
```

**Respuesta Esperada:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

**Si falla:**

- Verificar que PostgreSQL esté corriendo: `psql -U ule -d ule_rpa`
- Verificar que Redis esté corriendo: `redis-cli ping` → debe retornar `PONG`

### 2. Test de Autenticación

```bash
# Sin API Key (debe fallar)
curl -X GET http://localhost:3001/api/tasks

# Respuesta esperada: {"error":"Unauthorized"}
```

```bash
# Con API Key válida (debe funcionar)
curl -X GET http://localhost:3001/api/tasks \
  -H "X-API-Key: your-secret-api-key-minimum-32-characters-long-please-change"

# Respuesta esperada: {"tasks":[]}
```

### 3. Crear Tarea de Prueba

```bash
curl -X POST http://localhost:3001/api/tasks/registro \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key-minimum-32-characters-long-please-change" \
  -d '{
    "uleUserId": "test-user-123",
    "userData": {
      "tipoDocumento": "CC",
      "numeroDocumento": "1047484978",
      "nombre": "Juan Pérez",
      "email": "juan@test.com",
      "telefono": "3001234567",
      "eps": "Sanitas",
      "pension": "Porvenir",
      "arl": "Sura"
    }
  }'
```

**Respuesta Esperada:**

```json
{
  "message": "Registration task queued",
  "taskId": "registro-test-user-123-1738929600000"
}
```

### 4. Consultar Tarea

```bash
# Listar todas las tareas
curl -X GET http://localhost:3001/api/tasks \
  -H "X-API-Key: your-api-key"

# Obtener tarea específica
curl -X GET http://localhost:3001/api/tasks/[TASK_ID] \
  -H "X-API-Key: your-api-key"
```

### 5. Verificar en Base de Datos

```bash
# Abrir Prisma Studio
npm run prisma:studio
```

Navegar a:
- **Task** → Ver tareas creadas
- **TaskLog** → Ver logs de ejecución
- **EnlaceUser** → Ver usuarios registrados
- **PilaPlanilla** → Ver planillas generadas

### 6. Ver Logs del Worker

En la terminal donde corre el worker deberías ver:

```
[INFO] Worker started and waiting for jobs...
[INFO] Starting scheduler...
[INFO] Scheduled: Clean old jobs (every 6 hours)
[INFO] Scheduled: Health check (every 5 minutes)
[DEBUG] Health check passed { redis: 'OK', queue: 'OK', database: 'OK' }
[INFO] Processing task { jobId: 'registro-test-user-123-...', type: 'REGISTRO' }
[INFO] Task completed successfully { duration: 5234 }
```

---

## 🛠️ Issues Conocidos y Pendientes

### TypeScript Compilation Errors

Actualmente hay errores de compilación en:

#### 1. **express-rate-limit** (no instalado)
```bash
npm install express-rate-limit
```

#### 2. **Bots - Selectores Placeholder**

Los archivos en `src/bots/enlace/*.bot.ts` tienen selectores CSS de ejemplo que deben ser actualizados con los selectores reales del sitio web de Enlace Operativo.

**Archivos afectados:**
- `src/bots/enlace/auth.bot.ts`
- `src/bots/enlace/registro.bot.ts`
- `src/bots/enlace/liquidacion.bot.ts`
- `src/bots/enlace/comprobante.bot.ts`

**Acción requerida:**
- Inspeccionar el sitio web de Enlace
- Actualizar `src/bots/utils/selectors.ts` con selectores reales

#### 3. **Type Mismatches en TaskInput**

Los tipos `TaskInput`, `UserData` y `PilaData` en `src/types/task.types.ts` tienen campos adicionales que no siempre se usan.

**Solución temporal aplicada:**
- Cast a `any` en endpoints de la API

**Solución permanente:**
- Definir tipos más específicos por endpoint
- Usar tipos opcionales para campos no siempre requeridos

#### 4. **BullMQ Options**

Algunos options de BullMQ pueden ser incompatibles con la versión instalada:
- `timeout` en JobsOptions
- `stalledInterval` en WorkerOptions

**Solución:**
- Actualizar a la última versión de BullMQ
- O remover opciones no soportadas

---

## 📋 Checklist de Implementación Completada

### ✅ Fase 1: Orquestador y Cola de Tareas

- [x] **1.1 Sistema de Colas (BullMQ)**
  - [x] `src/orchestrator/queue.config.ts` - Configuración de colas
  - [x] Funciones: `addRegistroTask`, `addLiquidacionTask`, `addComprobanteTask`
  - [x] Dead Letter Queue para tareas fallidas
  - [x] Estadísticas y gestión de cola

- [x] **1.2 Worker**
  - [x] `src/orchestrator/worker.ts` - Procesador de tareas
  - [x] Integración con Puppeteer
  - [x] Manejo de errores y reintentos
  - [x] Logging a base de datos

- [x] **1.3 Scheduler**
  - [x] `src/orchestrator/scheduler.ts` - Jobs programados
  - [x] 7 jobs de mantenimiento configurados
  - [x] Health checks cada 5 minutos
  - [x] Limpieza automática de logs y jobs

- [x] **1.4 API REST**
  - [x] `src/api/server.ts` - Express server
  - [x] `src/api/middleware/auth.ts` - Autenticación
  - [x] `src/api/middleware/error.ts` - Manejo de errores
  - [x] `src/api/middleware/rateLimit.ts` - Rate limiting
  - [x] `src/api/routes/health.ts` - Health check
  - [x] `src/api/routes/tasks.ts` - Gestión de tareas
  - [x] `src/api/routes/webhooks.ts` - Webhooks desde ULE

### ✅ Base: Utilidades y Configuración

- [x] **Prisma Schema**
  - [x] Modelos: Task, EnlaceUser, PilaPlanilla, Comprobante, TaskLog
  - [x] Seed script con datos de ejemplo

- [x] **Utilities**
  - [x] `src/utils/logger.ts` - Winston logging
  - [x] `src/utils/config.ts` - Configuración con Zod
  - [x] `src/utils/errors.ts` - Errores personalizados
  - [x] `src/utils/crypto.ts` - Encriptación y hashing
  - [x] `src/utils/helpers.ts` - Funciones auxiliares
  - [x] `src/utils/validators.ts` - Validaciones colombianas

- [x] **Docker**
  - [x] `docker-compose.yml` - PostgreSQL + Redis

### ⏳ Pendiente: Implementación de Bots

- [ ] **Bots RPA** (placeholders existentes, requieren actualización)
  - [ ] Actualizar selectores CSS reales de Enlace Operativo
  - [ ] Probar flujo de autenticación
  - [ ] Probar flujo de registro
  - [ ] Probar flujo de liquidación
  - [ ] Probar flujo de comprobante

---

## 🔧 Troubleshooting

### PostgreSQL no se conecta

```bash
# Verificar que esté corriendo
ps aux | grep postgres

# Probar conexión
psql -U ule -d ule_rpa -h localhost

# Si falla, revisar DATABASE_URL en .env
```

### Redis no se conecta

```bash
# Verificar que esté corriendo
redis-cli ping

# Si no responde, iniciar Redis
brew services start redis
# O
redis-server
```

### Worker no procesa tareas

1. Verificar que Redis esté corriendo
2. Verificar logs del worker
3. Verificar cola en Redis:
   ```bash
   redis-cli
   > KEYS ule-rpa-tasks:*
   > LRANGE ule-rpa-tasks:wait 0 -1
   ```

### Errores de TypeScript

```bash
# Regenerar Prisma Client
npm run prisma:generate

# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# Verificar compilación
npm run typecheck
```

---

## 📚 Recursos

- **API Documentation**: `src/api/README.md`
- **Orchestrator Documentation**: `src/orchestrator/README.md`
- **Utils Documentation**: `src/utils/README.md`
- **Prisma Schema**: `prisma/schema.prisma`

---

## 🎯 Próximos Pasos

1. **Instalar dependencias faltantes**
   ```bash
   npm install express-rate-limit
   ```

2. **Configurar credenciales de Enlace Operativo**
   - Actualizar `.env` con credenciales reales
   - Verificar acceso al sitio

3. **Actualizar selectores de bots**
   - Inspeccionar sitio de Enlace
   - Actualizar `src/bots/utils/selectors.ts`

4. **Probar flujo completo**
   - Crear tarea de registro
   - Verificar que worker la procese
   - Revisar logs en base de datos

5. **Implementar webhooks en ULE**
   - Configurar endpoint de webhook
   - Implementar verificación de firma

---

## ✉️ Soporte

Para issues o preguntas, revisar:
- Logs del worker
- Logs de la API
- Base de datos en Prisma Studio
- Cola de Redis con `redis-cli`
