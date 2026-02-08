# API REST Documentation

Servidor API REST para gestión de tareas RPA del servicio ULE.

## 📋 Tabla de Contenidos

- [Autenticación](#autenticación)
- [Endpoints](#endpoints)
  - [Health Check](#health-check)
  - [Tasks](#tasks)
  - [Webhooks](#webhooks)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Códigos de Error](#códigos-de-error)

## 🔐 Autenticación

Todos los endpoints bajo `/api/tasks` requieren autenticación mediante API Key.

### Headers Requeridos

```http
X-API-Key: tu-api-key-aqui
```

### Configuración

La API Key se configura en el archivo `.env`:

```bash
API_KEY=your-secret-api-key-minimum-32-characters-long
```

### Respuesta de Error

```json
{
  "error": "Unauthorized"
}
```

Status: `401 Unauthorized`

## 🔌 Endpoints

### Health Check

#### `GET /health`

Verifica el estado del servicio y sus dependencias.

**Sin autenticación requerida**

**Respuesta Exitosa (200)**

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

**Respuesta Error (503)**

```json
{
  "status": "unhealthy",
  "error": "Redis connection failed"
}
```

---

### Tasks

Todos los endpoints requieren header `X-API-Key`.

#### `GET /api/tasks`

Lista tareas con filtros opcionales.

**Query Parameters**

- `userId` (opcional): ID del usuario ULE
- `status` (opcional): Estado de la tarea (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`)
- `type` (opcional): Tipo de tarea (`REGISTRO`, `LIQUIDACION`, `COMPROBANTE`, `FULL_FLOW`)

**Ejemplo Request**

```bash
curl -X GET "http://localhost:3001/api/tasks?userId=user-123&status=COMPLETED" \
  -H "X-API-Key: your-api-key"
```

**Respuesta (200)**

```json
{
  "tasks": [
    {
      "id": "clx123abc",
      "type": "REGISTRO",
      "status": "COMPLETED",
      "uleUserId": "user-123",
      "priority": 5,
      "inputData": {},
      "resultData": {},
      "createdAt": "2026-02-07T10:00:00.000Z",
      "startedAt": "2026-02-07T10:01:00.000Z",
      "completedAt": "2026-02-07T10:05:00.000Z"
    }
  ]
}
```

---

#### `GET /api/tasks/:id`

Obtiene una tarea específica con sus logs.

**Ejemplo Request**

```bash
curl -X GET "http://localhost:3001/api/tasks/clx123abc" \
  -H "X-API-Key: your-api-key"
```

**Respuesta (200)**

```json
{
  "task": {
    "id": "clx123abc",
    "type": "REGISTRO",
    "status": "COMPLETED",
    "logs": [
      {
        "id": "log-1",
        "level": "INFO",
        "message": "Task completed successfully",
        "timestamp": "2026-02-07T10:05:00.000Z"
      }
    ]
  }
}
```

**Error (404)**

```json
{
  "error": "Task not found"
}
```

---

#### `POST /api/tasks/registro`

Crea una tarea de registro de usuario en Enlace Operativo.

**Body**

```json
{
  "uleUserId": "user-123",
  "userData": {
    "tipoDocumento": "CC",
    "numeroDocumento": "1234567890",
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "telefono": "3001234567",
    "eps": "SURA",
    "pension": "PORVENIR",
    "arl": "SURA"
  }
}
```

**Ejemplo Request**

```bash
curl -X POST "http://localhost:3001/api/tasks/registro" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "uleUserId": "user-123",
    "userData": {
      "tipoDocumento": "CC",
      "numeroDocumento": "1234567890",
      "nombre": "Juan Pérez",
      "email": "juan@example.com",
      "telefono": "3001234567",
      "eps": "SURA",
      "pension": "PORVENIR",
      "arl": "SURA"
    }
  }'
```

**Respuesta Exitosa (202)**

```json
{
  "message": "Registration task queued",
  "taskId": "registro-user-123-1738929600000"
}
```

**Error - Tarea Ya Existe (409)**

```json
{
  "error": "Registration task already pending",
  "taskId": "registro-user-123-1738929500000"
}
```

---

#### `POST /api/tasks/liquidacion`

Crea una tarea de liquidación PILA.

**Body**

```json
{
  "uleUserId": "user-123",
  "paymentId": "payment-456",
  "pilaData": {
    "periodo": "2026-02",
    "ingresoBase": 1300000,
    "ibc": 1300000,
    "salud": 162500,
    "pension": 208000,
    "arl": 6786,
    "total": 377286
  }
}
```

**Ejemplo Request**

```bash
curl -X POST "http://localhost:3001/api/tasks/liquidacion" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "uleUserId": "user-123",
    "paymentId": "payment-456",
    "pilaData": {
      "periodo": "2026-02",
      "ingresoBase": 1300000,
      "ibc": 1300000,
      "salud": 162500,
      "pension": 208000,
      "arl": 6786,
      "total": 377286
    }
  }'
```

**Respuesta Exitosa (202)**

```json
{
  "message": "Liquidation task queued",
  "taskId": "liquidacion-user-123-payment-456-1738929600000"
}
```

**Error - Usuario No Registrado (400)**

```json
{
  "error": "User not registered in Enlace"
}
```

---

#### `POST /api/tasks/comprobante`

Crea una tarea de descarga de comprobante de pago.

**Body**

```json
{
  "uleUserId": "user-123",
  "numeroPlanilla": "PLN-123456",
  "periodo": "2026-02"
}
```

**Respuesta Exitosa (202)**

```json
{
  "message": "Comprobante download task queued",
  "taskId": "comprobante-user-123-1738929600000"
}
```

**Error - Planilla No Encontrada (404)**

```json
{
  "error": "Planilla not found"
}
```

---

#### `GET /api/tasks/stats/summary`

Obtiene estadísticas de la cola y base de datos.

**Ejemplo Request**

```bash
curl -X GET "http://localhost:3001/api/tasks/stats/summary" \
  -H "X-API-Key: your-api-key"
```

**Respuesta (200)**

```json
{
  "queue": {
    "waiting": 5,
    "active": 2,
    "completed": 150,
    "failed": 3,
    "delayed": 0,
    "paused": 0
  },
  "database": [
    { "status": "PENDING", "_count": 5 },
    { "status": "PROCESSING", "_count": 2 },
    { "status": "COMPLETED", "_count": 145 },
    { "status": "FAILED", "_count": 3 }
  ]
}
```

---

### Webhooks

Endpoints para recibir eventos desde la aplicación ULE.

#### `POST /api/webhooks/payment-confirmed`

Webhook llamado por ULE cuando un pago es confirmado. Automáticamente crea una tarea de liquidación.

**Sin autenticación requerida** (usa verificación de firma - pendiente implementar)

**Body**

```json
{
  "paymentId": "payment-789",
  "userId": "user-123",
  "amount": 377286,
  "pilaData": {
    "periodo": "2026-02",
    "ingresoBase": 1300000,
    "ibc": 1300000,
    "salud": 162500,
    "pension": 208000,
    "arl": 6786,
    "total": 377286
  }
}
```

**Ejemplo Request (desde ULE)**

```bash
curl -X POST "http://localhost:3001/api/webhooks/payment-confirmed" \
  -H "Content-Type: application/json" \
  -H "X-ULE-Signature: signature-here" \
  -d '{
    "paymentId": "payment-789",
    "userId": "user-123",
    "amount": 377286,
    "pilaData": {
      "periodo": "2026-02",
      "ingresoBase": 1300000,
      "ibc": 1300000,
      "salud": 162500,
      "pension": 208000,
      "arl": 6786,
      "total": 377286
    }
  }'
```

**Respuesta Exitosa (202)**

```json
{
  "message": "Payment received, liquidation queued",
  "taskId": "liquidacion-user-123-payment-789-1738929600000"
}
```

**Error - Payload Inválido (400)**

```json
{
  "error": "Invalid webhook payload",
  "details": [
    {
      "path": ["pilaData", "periodo"],
      "message": "Required"
    }
  ]
}
```

---

## 📝 Ejemplos de Uso

### Flujo Completo: Registro → Liquidación → Comprobante

#### 1. Registrar Usuario en Enlace

```bash
# Crear tarea de registro
curl -X POST "http://localhost:3001/api/tasks/registro" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "uleUserId": "user-123",
    "userData": {
      "tipoDocumento": "CC",
      "numeroDocumento": "1234567890",
      "nombre": "Juan Pérez",
      "email": "juan@example.com",
      "telefono": "3001234567",
      "eps": "SURA",
      "pension": "PORVENIR",
      "arl": "SURA"
    }
  }'

# Respuesta:
# {
#   "message": "Registration task queued",
#   "taskId": "registro-user-123-1738929600000"
# }
```

#### 2. Monitorear Progreso

```bash
# Consultar estado de la tarea
curl -X GET "http://localhost:3001/api/tasks/registro-user-123-1738929600000" \
  -H "X-API-Key: your-api-key"

# Respuesta cuando está completada:
# {
#   "task": {
#     "id": "registro-user-123-1738929600000",
#     "type": "REGISTRO",
#     "status": "COMPLETED",
#     "resultData": {
#       "enlaceUserId": "ENU-12345"
#     }
#   }
# }
```

#### 3. Liquidar PILA (después del registro)

```bash
curl -X POST "http://localhost:3001/api/tasks/liquidacion" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "uleUserId": "user-123",
    "paymentId": "payment-456",
    "pilaData": {
      "periodo": "2026-02",
      "ingresoBase": 1300000,
      "ibc": 1300000,
      "salud": 162500,
      "pension": 208000,
      "arl": 6786,
      "total": 377286
    }
  }'
```

#### 4. Descargar Comprobante (después de liquidación)

```bash
curl -X POST "http://localhost:3001/api/tasks/comprobante" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "uleUserId": "user-123",
    "numeroPlanilla": "PLN-123456",
    "periodo": "2026-02"
  }'
```

---

## ⚠️ Códigos de Error

| Código | Descripción |
|--------|-------------|
| `200` | Solicitud exitosa |
| `201` | Recurso creado |
| `202` | Tarea aceptada (queued) |
| `400` | Bad Request - Payload inválido |
| `401` | Unauthorized - API key inválida |
| `404` | Not Found - Recurso no encontrado |
| `409` | Conflict - Tarea ya existe |
| `500` | Internal Server Error |
| `503` | Service Unavailable - Servicio no saludable |

---

## 🔧 Configuración

### Variables de Entorno

```bash
# Server
PORT=3001
API_KEY=your-secret-api-key-minimum-32-characters-long

# CORS
ULE_API_URL=http://localhost:3000

# Storage
STORAGE_PATH=./uploads
STORAGE_BASE_URL=http://localhost:3001/files
```

### Iniciar Servidor

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start

# Con worker simultáneamente
npm run dev:all      # Desarrollo
npm run start:all    # Producción
```

---

## 🧪 Testing con cURL

### Test Health Check

```bash
curl http://localhost:3001/health
```

### Test con API Key Inválida

```bash
curl -X GET http://localhost:3001/api/tasks \
  -H "X-API-Key: invalid-key"

# Respuesta: {"error": "Unauthorized"}
```

### Test Listar Tareas

```bash
curl -X GET http://localhost:3001/api/tasks \
  -H "X-API-Key: your-api-key"
```

---

## 📚 Referencias

- [Express.js](https://expressjs.com/)
- [Zod Validation](https://zod.dev/)
- [Prisma Client](https://www.prisma.io/docs/concepts/components/prisma-client)
- [BullMQ](https://docs.bullmq.io/)

---

## 🔜 TODOs

- [ ] Implementar verificación de firma en webhooks
- [ ] Agregar rate limiting por IP
- [ ] Implementar paginación en GET /api/tasks
- [ ] Agregar endpoints de cancelación de tareas
- [ ] Documentar OpenAPI/Swagger
