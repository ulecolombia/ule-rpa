# Orchestrator Module

Sistema de orquestación de tareas RPA utilizando BullMQ, Redis y node-cron.

## 📁 Estructura

```
src/orchestrator/
├── queue.config.ts   # Configuración de colas BullMQ
├── worker.ts         # Worker que procesa tareas
└── scheduler.ts      # Jobs programados para mantenimiento
```

## 🔄 Queue System (BullMQ)

### Configuración

El sistema utiliza dos colas principales:

- **`ule-rpa-tasks`**: Cola principal para tareas RPA
- **`ule-rpa-dead-letter`**: Cola para tareas que fallaron permanentemente

### Características

- **Reintentos**: 3 intentos con backoff exponencial (2s, 4s, 8s)
- **Concurrencia**: 3 tareas simultáneas
- **Rate Limiting**: Máximo 10 jobs por minuto
- **Timeouts por tipo**:
  - REGISTRO: 5 minutos
  - LIQUIDACION: 10 minutos
  - COMPROBANTE: 3 minutos
  - FULL_FLOW: 15 minutos

### Prioridades

- `1-2`: Muy alta (FULL_FLOW)
- `3-4`: Alta (LIQUIDACION)
- `5`: Normal (REGISTRO)
- `6-10`: Baja (COMPROBANTE, otros)

**Nota**: En BullMQ, menor número = mayor prioridad

### Funciones Disponibles

#### Agregar Tareas

```typescript
// Tareas específicas
await addRegistroTask(taskData);
await addLiquidacionTask(taskData);
await addComprobanteTask(taskData);
await addFullFlowTask(taskData);

// Genérica
await addTaskToQueue('REGISTRO', taskData, {
  priority: 3,
  timeout: 5 * 60 * 1000,
  jobId: 'custom-id',
});
```

#### Consultar Cola

```typescript
// Estadísticas
const stats = await getQueueStats();
// { waiting: 5, active: 2, completed: 100, failed: 3, ... }

// Obtener jobs
const waitingJobs = await getWaitingJobs(0, 10);
const activeJobs = await getActiveJobs();
const failedJobs = await getFailedJobs();
const completedJobs = await getCompletedJobs();

// Obtener job específico
const job = await getJob('job-id-123');
```

#### Gestionar Cola

```typescript
// Reintentar job fallido
await retryJob('job-id-123');

// Limpiar jobs antiguos
await cleanOldJobs(24 * 60 * 60 * 1000); // 24 horas

// Pausar/Reanudar
await pauseQueue();
await resumeQueue();

// Vaciar cola
await drainQueue();

// Cerrar conexiones
await closeQueue();
```

## 👷 Worker

El worker procesa las tareas de la cola y ejecuta los bots de RPA.

### Ciclo de Vida de una Tarea

1. **Recibir Job**: Worker toma job de la cola
2. **Crear/Actualizar Task**: Registro en base de datos
3. **Lanzar Browser**: Crear instancia de Puppeteer
4. **Autenticar**: Login en Enlace Operativo
5. **Ejecutar Bot**: Según tipo de tarea
6. **Guardar Resultado**: Actualizar registros en DB
7. **Cerrar Browser**: Cleanup
8. **Marcar Completado**: Actualizar estado

### Estados de Tarea

- `PENDING`: En cola esperando
- `PROCESSING`: Siendo procesada
- `COMPLETED`: Completada exitosamente
- `FAILED`: Falló después de reintentos
- `CANCELLED`: Cancelada manualmente
- `AWAITING`: Esperando acción externa

### Logs de Tarea

Cada tarea genera logs detallados en la tabla `TaskLog`:

```typescript
await logTaskProgress(
  taskId,
  'INFO',
  'Browser launched successfully',
  { duration: 2000 },
  screenshotBase64
);
```

Niveles: `DEBUG`, `INFO`, `WARN`, `ERROR`

### Tipos de Tareas

#### REGISTRO

Registra un nuevo usuario en Enlace:

```typescript
{
  type: 'REGISTRO',
  uleUserId: 'user-123',
  userData: {
    tipoDocumento: 'CC',
    numeroDocumento: '1234567890',
    nombre: 'Juan Pérez',
    eps: 'SURA',
    pension: 'PORVENIR',
    arl: 'SURA'
  }
}
```

#### LIQUIDACION

Liquida y genera planilla PILA:

```typescript
{
  type: 'LIQUIDACION',
  uleUserId: 'user-123',
  paymentId: 'payment-456',
  pilaData: {
    periodo: '2026-02',
    ingresoBase: 1300000,
    ibc: 1300000,
    salud: 162500,
    pension: 208000,
    arl: 6786,
    total: 377286
  }
}
```

#### COMPROBANTE

Descarga comprobante de pago:

```typescript
{
  type: 'COMPROBANTE',
  uleUserId: 'user-123',
  pilaData: {
    periodo: '2026-02',
    numeroPlanilla: 'PLN-123456'
  }
}
```

#### FULL_FLOW

Ejecuta registro + liquidación en una sola tarea:

```typescript
{
  type: 'FULL_FLOW',
  uleUserId: 'user-123',
  paymentId: 'payment-456',
  userData: { ... },
  pilaData: { ... }
}
```

### Manejo de Errores

- **Retry automático**: Hasta 3 intentos con backoff
- **Dead Letter Queue**: Jobs que fallaron permanentemente
- **Logs detallados**: Cada error se registra con stack trace
- **Actualización DB**: Estado y error en tabla Task

### Eventos del Worker

```typescript
taskWorker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

taskWorker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job.id, error: err.message });
});

taskWorker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});
```

## ⏰ Scheduler

Sistema de jobs programados para mantenimiento y monitoreo.

### Jobs Configurados

| Job | Frecuencia | Descripción |
|-----|-----------|-------------|
| Clean Old Jobs | Cada 6 horas | Limpia jobs completados antiguos (>24h) |
| Queue Stats | Cada hora | Registra estadísticas de la cola |
| Stalled Check | Cada 30 min | Detecta jobs estancados |
| Health Check | Cada 5 min | Verifica Redis, DB, Cola |
| Clean Logs | Diario 3 AM | Elimina logs antiguos (>30 días) |
| DLQ Monitor | Cada 15 min | Monitorea dead letter queue |
| Sync Statuses | Cada hora | Sincroniza estados DB ↔ Cola |

### Timezone

Todos los jobs usan timezone: `America/Bogota` (COT)

### Health Check

Verifica:
- ✅ Conexión Redis (PING)
- ✅ Cola responsiva (stats)
- ✅ Base de datos (query test)

### Limpieza de Logs

- **DEBUG/INFO**: Eliminados después de 30 días
- **WARN/ERROR**: Mantenidos por 90 días
- Logs muy antiguos (>90 días): Eliminados completamente

### Monitoreo DLQ

- **Alerta**: Si DLQ tiene >50 jobs
- **Log**: Detalles de los 5 fallos más recientes
- **Acción**: Revisión manual requerida

### Sincronización de Estados

Detecta y corrige inconsistencias:
- Tasks en `PROCESSING` sin job activo → `FAILED`
- Tasks desincronizadas con estado de job
- Jobs "huérfanos" por reinicio del servidor

### Funciones

```typescript
// Iniciar scheduler
startScheduler();

// Detener scheduler
stopScheduler();

// Ver jobs programados
const jobs = getScheduledJobs();
// [{ name: 'clean-old-jobs', running: true }, ...]
```

## 🚀 Uso

### Desarrollo

```bash
# Ejecutar worker solo
npm run dev:worker

# Ejecutar server + worker simultáneamente
npm run dev:all
```

### Producción

```bash
# Compilar TypeScript
npm run build

# Ejecutar worker solo
npm run worker:prod

# Ejecutar server + worker
npm run start:all
```

### Docker

```bash
# Iniciar servicios (PostgreSQL + Redis)
docker-compose up -d

# Ver logs del worker
docker-compose logs -f worker
```

## 📊 Monitoreo

### Logs

Los logs del worker se guardan en:
- Console: Todos los niveles (con colores)
- `logs/combined-YYYY-MM-DD.log`: Info general
- `logs/error-YYYY-MM-DD.log`: Solo errores

### Métricas

El scheduler registra métricas cada hora:

```json
{
  "message": "Queue statistics",
  "waiting": 12,
  "active": 3,
  "completed": 458,
  "failed": 8,
  "delayed": 0,
  "paused": 0
}
```

### Alertas

- **Backlog**: Warning si waiting > 100
- **Failures**: Warning si failed > 50
- **DLQ**: Error si DLQ > 50
- **Stalled**: Warning si jobs exceden timeout × 1.5

## 🔧 Configuración

Variables de entorno relevantes:

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue
QUEUE_CONCURRENCY=3
QUEUE_MAX_RETRIES=3

# Logging
LOG_LEVEL=info
```

## 🛠️ Troubleshooting

### Jobs Estancados

```typescript
// Ver jobs activos
const activeJobs = await getActiveJobs();

// Si están estancados, el scheduler los detectará
// O manualmente reiniciar el job
const job = await getJob('job-id');
await job.retry();
```

### Cola Bloqueada

```bash
# Ver estadísticas
npm run worker -- --stats

# Pausar cola
# En código:
await pauseQueue();

# Vaciar cola (¡cuidado!)
await drainQueue();

# Reanudar
await resumeQueue();
```

### Dead Letter Queue Creciendo

1. Ver jobs en DLQ: `deadLetterQueue.getJobs()`
2. Analizar razones de fallo
3. Corregir problema subyacente
4. Opcionalmente reintroducir jobs corregidos

### Logs Ocupando Espacio

El scheduler limpia automáticamente, pero puedes ajustar:

```typescript
// En scheduler.ts, modificar:
const thirtyDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 días
```

## 📚 Referencias

- [BullMQ Docs](https://docs.bullmq.io/)
- [node-cron Syntax](https://github.com/node-cron/node-cron#cron-syntax)
- [IORedis API](https://github.com/redis/ioredis)
- [Prisma Client](https://www.prisma.io/docs/concepts/components/prisma-client)
