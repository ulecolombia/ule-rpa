# ULE Integration Guide

Guía completa para integrar el servicio RPA con la aplicación principal ULE.

---

## 📋 Overview

Este servicio RPA se comunica con la aplicación ULE mediante API REST. Cuando un usuario completa el onboarding en ULE, la aplicación automáticamente crea una tarea de registro en el servicio RPA.

**Flujo**:
```
Usuario completa perfil en ULE
    ↓
ULE guarda perfil en su BD
    ↓
ULE llama a RPA Service: POST /api/tasks/registro
    ↓
RPA crea job en BullMQ
    ↓
Worker procesa job → Bot registra usuario en Enlace
    ↓
RPA actualiza estado en BD
    ↓
ULE puede consultar estado: GET /api/tasks/:taskId
```

---

## 🔐 Autenticación

El servicio RPA usa **API Key** authentication mediante header `x-api-key`.

### Generar API Key

```bash
# Genera una API key segura de 32+ caracteres
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Ejemplo de salida:
# 8f4a9c6e2d1b5f7e3a9d4c8b1e6f2a7c5d9e1b4f7a2c6d3e8b9f1a5c7d2e4b6
```

**Guarda esta key en tus variables de entorno:**
- En **ULE**: `RPA_API_KEY`
- En **RPA Service**: `API_KEY`

---

## 📡 Endpoints Disponibles

### Base URL

```
Development: http://localhost:3001
Production: https://rpa.tudominio.com
```

### 1. **POST /api/tasks/registro**

Crea una tarea de registro de usuario en Enlace Operativo.

**Headers**:
```
Content-Type: application/json
x-api-key: <TU_API_KEY>
```

**Request Body**:
```typescript
{
  uleUserId: string;          // ID único del usuario en ULE
  userData: {
    tipoDocumento: 'CC' | 'CE' | 'PEP';
    numeroDocumento: string;  // Sin puntos ni guiones
    nombre: string;           // Nombre completo
    email: string;            // Email válido
    telefono: string;         // Teléfono con indicativo
    eps: string;              // Nombre de la EPS
    pension: string;          // Nombre del fondo de pensión
    arl: string;              // Nombre de la ARL
  }
}
```

**Response** (202 Accepted):
```json
{
  "message": "Registration task queued",
  "taskId": "abc123def456"
}
```

**Errores**:
- `401`: API key inválida
- `409`: Ya existe una tarea de registro pendiente para este usuario
- `400`: Datos inválidos (validación Zod)

---

### 2. **GET /api/tasks/:taskId**

Consulta el estado de una tarea.

**Headers**:
```
x-api-key: <TU_API_KEY>
```

**Response** (200 OK):
```json
{
  "task": {
    "id": "abc123def456",
    "type": "REGISTRO",
    "status": "COMPLETED",
    "uleUserId": "user123",
    "enlaceUserId": "12345678",
    "inputData": { ... },
    "resultData": {
      "enlaceUserId": "12345678",
      "alreadyExists": false,
      "warnings": []
    },
    "error": null,
    "attempts": 1,
    "priority": 5,
    "startedAt": "2026-02-08T10:00:00Z",
    "completedAt": "2026-02-08T10:02:30Z",
    "createdAt": "2026-02-08T10:00:00Z",
    "logs": [
      {
        "level": "INFO",
        "message": "Starting user registration",
        "timestamp": "2026-02-08T10:00:01Z"
      },
      // ... más logs
    ]
  }
}
```

**Estados Posibles**:
- `PENDING`: En cola, esperando procesamiento
- `PROCESSING`: Worker está ejecutando el bot
- `COMPLETED`: Tarea completada exitosamente
- `FAILED`: Tarea falló después de 3 intentos

---

### 3. **POST /api/tasks/liquidacion**

Crea una tarea de liquidación PILA.

**Request Body**:
```typescript
{
  uleUserId: string;
  paymentId: string;          // ID único del pago en ULE
  pilaData: {
    periodo: string;          // YYYY-MM
    ingresoBase: number;      // Ingreso base en COP
    ibc: number;              // Ingreso Base de Cotización
    salud: number;            // Valor aporte salud
    pension: number;          // Valor aporte pensión
    arl: number;              // Valor aporte ARL
    total: number;            // Total a pagar
  }
}
```

**Response** (202 Accepted):
```json
{
  "message": "Liquidation task queued",
  "taskId": "def456ghi789"
}
```

---

### 4. **POST /api/tasks/comprobante**

Descarga el comprobante de pago.

**Request Body**:
```typescript
{
  uleUserId: string;
  numeroPlanilla: string;     // Número de planilla PILA
  periodo: string;            // YYYY-MM
}
```

**Response** (202 Accepted):
```json
{
  "message": "Comprobante download task queued",
  "taskId": "ghi789jkl012"
}
```

---

### 5. **GET /api/tasks**

Lista tareas con filtros opcionales.

**Query Parameters**:
- `userId`: Filtrar por uleUserId
- `status`: Filtrar por status (PENDING, PROCESSING, COMPLETED, FAILED)
- `type`: Filtrar por tipo (REGISTRO, LIQUIDACION, COMPROBANTE, FULL_FLOW)

**Response** (200 OK):
```json
{
  "tasks": [
    {
      "id": "abc123",
      "type": "REGISTRO",
      "status": "COMPLETED",
      "uleUserId": "user123",
      "createdAt": "2026-02-08T10:00:00Z",
      "completedAt": "2026-02-08T10:02:30Z"
    }
    // ... más tareas
  ]
}
```

---

### 6. **GET /api/tasks/stats/summary**

Estadísticas del sistema.

**Response** (200 OK):
```json
{
  "queue": {
    "waiting": 5,
    "active": 2,
    "completed": 150,
    "failed": 3
  },
  "database": [
    { "status": "COMPLETED", "_count": 120 },
    { "status": "PENDING", "_count": 5 },
    { "status": "PROCESSING", "_count": 2 },
    { "status": "FAILED", "_count": 3 }
  ]
}
```

---

## 🔄 Webhooks (Opcional)

El servicio RPA puede notificar a ULE cuando una tarea se completa.

**Configurar Webhook URL en RPA**:
```bash
ULE_API_URL=https://ule.tudominio.com/api
ULE_WEBHOOK_SECRET=tu-webhook-secret
```

**Webhook Endpoint en ULE**: `POST /api/webhooks/rpa`

**Payload del Webhook**:
```json
{
  "event": "task.completed",
  "taskId": "abc123def456",
  "uleUserId": "user123",
  "type": "REGISTRO",
  "status": "COMPLETED",
  "resultData": {
    "enlaceUserId": "12345678"
  },
  "timestamp": "2026-02-08T10:02:30Z"
}
```

---

## 📦 Casos de Uso

### Caso 1: Registro Automático al Completar Perfil

**Flujo en ULE**:
1. Usuario completa formulario de onboarding
2. ULE guarda datos en su BD
3. ULE llama a RPA para registrar en Enlace
4. ULE guarda `taskId` para seguimiento

**Implementación**: Ver `integration/examples/ule-profile-complete.ts`

---

### Caso 2: Liquidación Mensual de PILA

**Flujo en ULE**:
1. Usuario selecciona periodo y IBC
2. ULE calcula aportes (salud, pensión, ARL)
3. ULE crea orden de pago
4. ULE llama a RPA para liquidar en Enlace
5. RPA retorna `numeroPlanilla`
6. Usuario paga con PSE/tarjeta

**Implementación**: Ver `integration/examples/ule-liquidacion.ts`

---

### Caso 3: Descarga Automática de Comprobantes

**Flujo en ULE**:
1. Usuario completa pago PSE
2. ULE confirma pago exitoso
3. ULE llama a RPA para descargar comprobante
4. RPA descarga PDF y lo almacena
5. ULE recibe URL del comprobante

**Implementación**: Ver `integration/examples/ule-comprobante.ts`

---

## 🛠️ Testing

### Test Manual con cURL

```bash
# 1. Registro
curl -X POST http://localhost:3001/api/tasks/registro \
  -H "Content-Type: application/json" \
  -H "x-api-key: tu-api-key-aqui" \
  -d '{
    "uleUserId": "test-user-123",
    "userData": {
      "tipoDocumento": "CC",
      "numeroDocumento": "1234567890",
      "nombre": "Juan Pérez García",
      "email": "juan.perez@example.com",
      "telefono": "+573001234567",
      "eps": "Sanitas EPS",
      "pension": "Porvenir",
      "arl": "SURA"
    }
  }'

# 2. Consultar estado
curl -X GET http://localhost:3001/api/tasks/abc123def456 \
  -H "x-api-key: tu-api-key-aqui"

# 3. Listar tareas del usuario
curl -X GET "http://localhost:3001/api/tasks?userId=test-user-123" \
  -H "x-api-key: tu-api-key-aqui"
```

---

## 🚨 Manejo de Errores

### Errores Comunes

**1. Usuario ya registrado**
```json
{
  "error": "Registration task already pending",
  "taskId": "existing-task-id"
}
```
**Solución**: Consultar estado de la tarea existente.

---

**2. Usuario no registrado en Enlace**
```json
{
  "error": "User not registered in Enlace"
}
```
**Solución**: Crear tarea de registro primero.

---

**3. Autenticación fallida**
```json
{
  "error": "Unauthorized"
}
```
**Solución**: Verificar API key en header `x-api-key`.

---

### Retry Strategy

El worker automáticamente reintenta tareas fallidas:
- **Intento 1**: Inmediato
- **Intento 2**: +1 minuto
- **Intento 3**: +5 minutos
- **Después**: Movido a Dead Letter Queue

---

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

**Response**:
```json
{
  "status": "healthy",
  "uptime": 123456,
  "timestamp": "2026-02-08T10:00:00Z"
}
```

---

### Logs

Logs detallados de cada tarea en tabla `TaskLog`:
- Navegación a secciones
- Llenado de formularios
- Errores encontrados
- Screenshots en caso de fallo

---

## 🔧 Troubleshooting

### Problema: Tarea queda en PROCESSING indefinidamente

**Causa**: Worker crashed o job stalled
**Solución**:
1. Revisar logs del worker: `docker logs rpa-worker`
2. Verificar que Redis esté corriendo
3. Reiniciar worker si es necesario

---

### Problema: Rate limit exceeded

**Causa**: Demasiadas requests simultáneas
**Solución**:
- Worker procesa máximo 3 tareas concurrentes
- Rate limit: 10 jobs por minuto
- Implementar cola en ULE si hay muchos usuarios

---

### Problema: Selectores no funcionan

**Causa**: Enlace Operativo cambió su HTML
**Solución**:
1. Actualizar selectores en `src/bots/utils/selectors.ts`
2. Correr bots en modo headless: false para debug
3. Usar inspector de DevTools para obtener nuevos selectores

---

## 📚 Más Información

- **API Docs**: Ver `/docs/API.md`
- **Bot Flows**: Ver `/docs/BOT_FLOWS.md`
- **Architecture**: Ver `/docs/ARCHITECTURE.md`
- **Examples**: Ver `/integration/examples/`

---

**Última actualización**: 2026-02-08
