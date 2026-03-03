# Fase 5: Dashboard de Administración

## Resumen Ejecutivo

La Fase 5 implementa las APIs de administración para el dashboard de monitoreo del RPA:

- **Dashboard principal** con métricas en tiempo real
- **Gestión de tareas** (ver, reintentar, cancelar)
- **Monitoreo de planillas** pendientes y por vencer
- **Estadísticas y reportes** de rendimiento
- **Control de cola** (pausar, reanudar, limpiar)

### Estado: ✅ SUBFASES 5.1 y 5.2 COMPLETADAS

| Subfase | Descripción | Estado |
|---------|-------------|--------|
| 5.1 | APIs de Admin en RPA Service | ✅ Completo |
| 5.2 | WebSocket Server para tiempo real | ✅ Completo |
| 5.3 | UI Dashboard en ULE | ⏳ Pendiente (ver especificaciones abajo) |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────┐            │
│  │   ULE Admin Panel    │      │    RPA Service       │            │
│  │   (Next.js)          │─────▶│    (Express)         │            │
│  │                      │      │                      │            │
│  │  /admin/dashboard    │      │  /api/admin/*        │            │
│  │  /admin/tasks        │      │                      │            │
│  │  /admin/planillas    │      │  Authentication:     │            │
│  │  /admin/logs         │      │  - x-api-key         │            │
│  │  /admin/queue        │      │  - x-admin-secret    │            │
│  └──────────────────────┘      └──────────────────────┘            │
│                                         │                           │
│                                         ▼                           │
│                                ┌──────────────────────┐            │
│                                │    PostgreSQL        │            │
│                                │    (Prisma)          │            │
│                                │                      │            │
│                                │  - Tasks             │            │
│                                │  - TaskLogs          │            │
│                                │  - EnlaceUsers       │            │
│                                │  - PilaPlanillas     │            │
│                                └──────────────────────┘            │
│                                         │                           │
│                                         ▼                           │
│                                ┌──────────────────────┐            │
│                                │    Redis             │            │
│                                │    (BullMQ)          │            │
│                                │                      │            │
│                                │  - Queue stats       │            │
│                                │  - Active jobs       │            │
│                                │  - Dead letter       │            │
│                                └──────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Endpoints Implementados

### Dashboard Principal

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Métricas principales |
| GET | `/api/admin/system/health` | Health check detallado |

### Gestión de Tareas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/tasks/recent` | Tareas recientes |
| GET | `/api/admin/tasks/active` | Tareas en progreso |
| GET | `/api/admin/tasks/:id` | Detalle de tarea |
| POST | `/api/admin/tasks/:id/retry` | Reintentar tarea fallida |
| POST | `/api/admin/tasks/:id/cancel` | Cancelar tarea pendiente |

### Monitoreo de Planillas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/planillas/pending` | Planillas pendientes |
| GET | `/api/admin/planillas/expiring` | Planillas por vencer (3 días) |

### Estadísticas y Reportes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/stats/timeline` | Estadísticas por día |
| GET | `/api/admin/stats/performance` | Métricas de rendimiento |
| GET | `/api/admin/logs/recent` | Logs recientes |

### Control de Cola

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/queue/status` | Estado de la cola |
| POST | `/api/admin/queue/pause` | Pausar cola |
| POST | `/api/admin/queue/resume` | Reanudar cola |
| POST | `/api/admin/queue/clean` | Limpiar jobs viejos |

---

## Autenticación

### Headers Requeridos

```bash
x-api-key: <API_KEY>           # Mismo que API normal
x-admin-secret: <ADMIN_SECRET> # Secreto adicional para admin
```

### Variables de Entorno

```bash
# .env
API_KEY=your_api_key_32_chars_min
ADMIN_SECRET=your_admin_secret_32_chars

# Opcional: restringir por IP
ADMIN_IP_ALLOWLIST=192.168.1.1,10.0.0.1
```

---

## Ejemplos de Uso

### Dashboard Principal

```bash
curl -X GET http://localhost:3001/api/admin/dashboard \
  -H "x-api-key: your_api_key" \
  -H "x-admin-secret: your_admin_secret"
```

**Response:**
```json
{
  "timestamp": "2026-02-08T15:30:00.000Z",
  "tasks": {
    "today": 45,
    "thisMonth": 1250,
    "byStatus": {
      "COMPLETED": 1180,
      "FAILED": 35,
      "PENDING": 20,
      "PROCESSING": 15
    },
    "byType": {
      "REGISTRO": 400,
      "LIQUIDACION": 600,
      "COMPROBANTE": 250
    },
    "successRate": 97.1,
    "recentFailuresCount": 3
  },
  "users": {
    "total": 850,
    "newToday": 12,
    "byStatus": {
      "REGISTERED": 820,
      "PENDING": 30
    }
  },
  "planillas": {
    "pendientes": 45,
    "enProceso": 5,
    "pagadasMes": 580,
    "vencidas": 2,
    "totalPagadoHoy": 2500000,
    "totalPagadoMes": 45000000
  },
  "queue": {
    "waiting": 12,
    "active": 3,
    "completed": 1500,
    "failed": 25,
    "delayed": 0,
    "health": "healthy"
  },
  "system": {
    "uptime": 86400,
    "uptimeFormatted": "1d",
    "memory": {
      "heapUsed": 125,
      "heapTotal": 256,
      "rss": 310
    },
    "nodeVersion": "v20.10.0"
  }
}
```

### Reintentar Tarea Fallida

```bash
curl -X POST http://localhost:3001/api/admin/tasks/task-123/retry \
  -H "x-api-key: your_api_key" \
  -H "x-admin-secret: your_admin_secret"
```

**Response:**
```json
{
  "success": true,
  "message": "Task queued for retry",
  "taskId": "task-123"
}
```

### Pausar Cola

```bash
curl -X POST http://localhost:3001/api/admin/queue/pause \
  -H "x-api-key: your_api_key" \
  -H "x-admin-secret: your_admin_secret"
```

**Response:**
```json
{
  "success": true,
  "message": "Queue paused",
  "paused": true
}
```

### Estadísticas de Timeline

```bash
curl -X GET "http://localhost:3001/api/admin/stats/timeline?days=7" \
  -H "x-api-key: your_api_key" \
  -H "x-admin-secret: your_admin_secret"
```

---

## Archivos Implementados

| Archivo | Descripción | Líneas |
|---------|-------------|--------|
| `src/api/routes/admin.ts` | Rutas de admin | ~650 |
| `src/api/middleware/adminAuth.ts` | Middleware de auth | ~120 |
| `src/api/server.ts` | Servidor (actualizado) | +2 |
| `src/api/index.ts` | Exports (actualizado) | +5 |

---

## Seguridad

### Capas de Protección

1. **API Key** - Autenticación básica
2. **Admin Secret** - Capa adicional para admin
3. **IP Allowlist** - Opcional, restringe IPs
4. **Audit Logging** - Registro de todas las acciones

### Logs de Auditoría

Todas las acciones admin se registran:
```json
{
  "level": "info",
  "message": "Admin action completed",
  "ip": "192.168.1.1",
  "method": "POST",
  "path": "/api/admin/tasks/123/retry",
  "statusCode": 200,
  "timestamp": "2026-02-08T15:30:00.000Z"
}
```

---

## Subfase 5.2: WebSocket Server (COMPLETADO)

### Archivos Implementados

| Archivo | Descripción |
|---------|-------------|
| `src/api/websocket.ts` | Servidor WebSocket con Socket.io (~520 líneas) |
| `src/api/server.ts` | Actualizado para integrar WebSocket |
| `src/orchestrator/worker.ts` | Actualizado para emitir eventos en tiempo real |

### Eventos Emitidos

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `connected` | Conexión establecida | `{ message, timestamp, socketId }` |
| `task:created` | Nueva tarea creada | `{ taskId, type, userId, priority, timestamp }` |
| `task:updated` | Tarea actualizada | `{ taskId, status, type, userId, progress?, message?, timestamp }` |
| `task:completed` | Tarea completada | `{ taskId, type, result, duration, userId, timestamp }` |
| `task:failed` | Tarea fallida | `{ taskId, error, type, userId, attempts, willRetry, timestamp }` |
| `log:new` | Nuevo log (subscribed) | `{ taskId, level, message, details?, timestamp }` |
| `log:important` | Log crítico (global) | `{ taskId, level, message, details?, timestamp }` |
| `queue:updated` | Estado de cola | `{ waiting, active, completed, failed, delayed?, timestamp }` |
| `planilla:updated` | Planilla actualizada | `{ planillaId, numeroPlanilla, estadoPago, hasComprobante?, userId?, timestamp }` |
| `comprobante:ready` | Comprobante disponible | `{ planillaId, numeroPlanilla, fileUrl, userId, timestamp }` |
| `metrics:broadcast` | Métricas periódicas | `{ queue, connectedClients, timestamp }` |
| `stats:current` | Stats solicitadas | `{ queue, timestamp }` |
| `activeTasks:current` | Tareas activas solicitadas | `{ tasks[], timestamp }` |

### Eventos del Cliente (que puede emitir ULE)

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `subscribe:task` | Suscribirse a tarea específica | `taskId: string` |
| `unsubscribe:task` | Desuscribirse de tarea | `taskId: string` |
| `request:stats` | Solicitar estadísticas | - |
| `request:activeTasks` | Solicitar tareas activas | - |

---

## Próximo Paso: UI Dashboard en ULE (Subfase 5.3)

### Estructura Recomendada

```
app/(admin)/
  dashboard/
    page.tsx          # Dashboard principal
  tasks/
    page.tsx          # Lista de tareas
    [id]/page.tsx     # Detalle de tarea
  planillas/
    page.tsx          # Planillas pendientes
  queue/
    page.tsx          # Estado de cola
  logs/
    page.tsx          # Logs del sistema
```

### Cliente WebSocket para ULE

Ver documento separado: **FASE-5.2-ULE-WEBSOCKET-CLIENT.md**

---

## Testing

### Test de Endpoints

```bash
# Dashboard
curl -X GET http://localhost:3001/api/admin/dashboard \
  -H "x-api-key: $API_KEY" \
  -H "x-admin-secret: $ADMIN_SECRET"

# Tareas activas
curl -X GET http://localhost:3001/api/admin/tasks/active \
  -H "x-api-key: $API_KEY" \
  -H "x-admin-secret: $ADMIN_SECRET"

# Health check
curl -X GET http://localhost:3001/api/admin/system/health \
  -H "x-api-key: $API_KEY" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

### Verificar Autenticación

```bash
# Sin API key - debe retornar 401
curl -X GET http://localhost:3001/api/admin/dashboard

# Sin admin secret - debe retornar 401 (si ADMIN_SECRET está configurado)
curl -X GET http://localhost:3001/api/admin/dashboard \
  -H "x-api-key: $API_KEY"
```

---

## Troubleshooting

### Error 401: Unauthorized

**Causa:** API key o admin secret inválido

**Solución:**
1. Verificar que `API_KEY` y `ADMIN_SECRET` están en `.env`
2. Verificar que los headers están correctos
3. Verificar que los valores coinciden

### Error 403: Forbidden

**Causa:** IP no está en allowlist

**Solución:**
1. Verificar `ADMIN_IP_ALLOWLIST` en `.env`
2. Agregar tu IP a la lista
3. O remover la variable para deshabilitar

### Dashboard lento

**Causa:** Muchos datos en BD

**Solución:**
1. Verificar índices en Prisma schema
2. Limitar período de consultas (usar `days` param)
3. Implementar caché para métricas

---

**Última actualización:** 2026-02-08
**Autor:** Claude Code
**Versión:** 1.0.0
