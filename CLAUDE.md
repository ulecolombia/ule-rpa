# CLAUDE.md - Contexto Completo del Proyecto ULE RPA Service

**Fecha**: 2026-03-07
**Versión**: 1.2
**Propósito**: Documentación comprensiva para mantener contexto de IA entre sesiones

---

## RESUMEN EJECUTIVO

Este es un servicio RPA (Robotic Process Automation) que automatiza la liquidación y pago de PILA (Planilla Integrada de Liquidación de Aportes) para trabajadores independientes colombianos.

**Stack**: Node.js + TypeScript + Puppeteer + BullMQ + PostgreSQL + Prisma + Redis + Express + Socket.io

**Operadores soportados**:
- **SOI** (nuevosoi.com.co) - Principal, preferido
- **Mi Planilla** (miplanilla.com) - Alternativo cuando SOI falla

---

## ARQUITECTURA DE PRODUCCIÓN

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ULE PRODUCCIÓN                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Usuarios (celular/web)                                        │
│          │                                                      │
│          ▼                                                      │
│   ┌─────────────────────────────┐                               │
│   │  ulecolombia.com (Vercel)   │  ← Next.js App               │
│   │  Frontend + API Routes      │                               │
│   └──────────────┬──────────────┘                               │
│                  │                                              │
│                  ▼                                              │
│   ┌─────────────────────────────┐                               │
│   │  Supabase (Backend/DB)      │  ← Auth, DB principal        │
│   │  PostgreSQL + Auth          │                               │
│   └──────────────┬──────────────┘                               │
│                  │                                              │
│                  │ Usuario paga → entra a queue                 │
│                  ▼                                              │
│   ┌─────────────────────────────┐                               │
│   │  rpa.ulecolombia.com        │  ← Mac Servidor              │
│   │  (Cloudflare Tunnel)        │     via Cloudflare Tunnel    │
│   │  Puerto 3001                │                               │
│   └─────────────────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**URLs de Producción:**
- **App ULE**: https://ulecolombia.com (Vercel)
- **RPA Service**: https://rpa.ulecolombia.com (Mac Servidor + Cloudflare)
- **Supabase**: https://ncrpqghvqpbqxybtxnza.supabase.co

**Mac Servidor (MacBook Pro 2012):**
- RPA Server → Puerto 3001
- PostgreSQL → Puerto 5432 (DB local: ule_rpa)
- Redis → Puerto 6379 (BullMQ Queue)
- Cloudflared → Túnel a internet

**Servicios auto-inicio (LaunchAgents):**
- `com.ule.rpa` - API + Worker
- `com.ule.cloudflared` - Túnel Cloudflare
- `postgresql@15` - Base de datos
- `redis` - Cache/Queue

---

## TABLA DE CONTENIDOS

0. [Flujo de Negocio Completo (MUY IMPORTANTE)](#0-flujo-de-negocio-completo-muy-importante)
1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [BOT: SOI](#2-bot-soi)
3. [BOT: Mi Planilla](#3-bot-mi-planilla)
4. [Flujo Pago Admin-Controlled](#4-flujo-pago-admin-controlled)
5. [Sistema de Types](#5-sistema-de-types)
6. [Orquestador y Queue](#6-orquestador-y-queue)
7. [API Endpoints](#7-api-endpoints)
8. [Base de Datos](#8-base-de-datos)
9. [Credenciales y Configuración](#9-credenciales-y-configuración)
10. [Errores Comunes y Soluciones](#10-errores-comunes-y-soluciones)
11. [Comandos Útiles](#11-comandos-útiles)
12. [Selectores Verificados SOI (2026-03-07)](#12-selectores-verificados-soi-2026-03-07)
13. [Comportamientos Especiales SOI](#13-comportamientos-especiales-soi)
14. [Módulo Compartido Bancolombia](#14-módulo-compartido-bancolombia)
15. [Worker: Tipos de Tarea](#15-worker-tipos-de-tarea)
16. [Sistema de Eventos](#16-sistema-de-eventos)
17. [Estados de Planilla](#17-estados-de-planilla)
18. [Estado de Implementación](#18-estado-de-implementación)
19. [Reglas Críticas de Desarrollo](#19-reglas-críticas-de-desarrollo)

---

## 0. FLUJO DE NEGOCIO COMPLETO (MUY IMPORTANTE)

Este RPA NO es un servicio independiente. Está integrado con la app ULE y se activa automáticamente por eventos del negocio.

### Flujo de Registro de Usuario

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE REGISTRO (Automático)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Usuario se registra en ULE App                                       │
│              ↓                                                           │
│  2. ULE Backend envía datos al RPA automáticamente                       │
│              ↓                                                           │
│  3. RPA intenta crear cuenta en SOI (plataforma preferida)              │
│              ↓                                                           │
│     ┌────────────────┬────────────────────────────────────┐             │
│     │   ¿Exitoso?    │                                    │             │
│     ├────────────────┤                                    │             │
│     │     SÍ         │              NO                    │             │
│     │     ↓          │              ↓                     │             │
│     │  operador=SOI  │  ¿Error APO-06002?                │             │
│     │  Continúa flujo│  "El aportante ya existe"         │             │
│     │                │              ↓                     │             │
│     │                │  SÍ: Usuario ya tiene cuenta SOI   │             │
│     │                │  → RPA redirige a Mi Planilla      │             │
│     │                │  → Crea cuenta en Mi Planilla      │             │
│     │                │  → operador=MI_PLANILLA            │             │
│     └────────────────┴────────────────────────────────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Campo `operador` en DB**: Cada usuario tiene un campo `operador` (SOI | MI_PLANILLA) que indica en qué plataforma está registrado. Todos los flujos posteriores (liquidación, pago) usan esta plataforma.

### Flujo de Pago (Admin-Controlled) - FLUJO ATÓMICO

**IMPORTANTE**: La liquidación NO existe como paso separado previo al pago.
Cuando el admin activa el RPA, este hace TODO en un solo flujo atómico:
Generar planilla → Pagar → Comprobante.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE PAGO (Activado por Admin)                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Usuario ve en ULE App cuánto debe pagar (cálculo de IBC)            │
│     ⚠️ NO se crea planilla en este momento - solo es un cálculo         │
│              ↓                                                           │
│  2. Usuario paga a ULE (transferencia, PSE, Nequi, etc.)                │
│              ↓                                                           │
│  3. Admin de ULE verifica que el pago llegó en "Centro de Pagos"        │
│              ↓                                                           │
│  4. Admin activa el RPA desde el Centro de Pagos                        │
│     ⚠️ El RPA NO se activa automáticamente - requiere acción del admin  │
│              ↓                                                           │
│  5. RPA hace TODO en un flujo atómico:                                  │
│     a) Login a SOI/Mi Planilla                                          │
│     b) GENERA la planilla (IBC, días, periodo)                          │
│     c) Inicia proceso PSE                                               │
│     d) Selecciona Bancolombia                                           │
│     e) Llena datos PSE (NIT ULE, email)                                 │
│     f) Navega hasta página de Bancolombia                               │
│              ↓                                                           │
│  6. ⛔ BOT SE DETIENE en Bancolombia                                    │
│     - Usuario ya llenado: Lbrochet01                                    │
│     - Admin ve esto en tiempo real por WebSocket                        │
│              ↓                                                           │
│  7. Admin completa manualmente:                                          │
│     - Ingresa contraseña de Bancolombia                                 │
│     - Ingresa código OTP del token                                      │
│     - Confirma la transferencia                                          │
│              ↓                                                           │
│  8. Admin confirma en ULE que el pago fue exitoso                       │
│              ↓                                                           │
│  9. RPA descarga comprobante y actualiza estado a PAGADA                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**¿Por qué el admin activa el pago?**:
- El usuario paga a ULE primero (ULE cobra comisión)
- Solo cuando ULE confirma que recibió el dinero, el admin autoriza el pago real de PILA
- Esto protege a ULE de fraudes y pagos rechazados

**¿Por qué es atómico (crear + pagar junto)?**:
- No tiene sentido crear una planilla sin pagarla inmediatamente
- Evita planillas "huérfanas" pendientes de pago
- Es más eficiente - una sola sesión de browser

### Error APO-06002 (SOI)

```
Error: "APO-06002: El aportante a registrar ya existe en el sistema"
```

**Significado**: El usuario YA tiene una cuenta creada en SOI (posiblemente la creó manualmente antes).

**Acción del RPA**:
1. Detecta este error durante el registro en SOI
2. Automáticamente redirige el flujo a Mi Planilla
3. Crea cuenta en Mi Planilla como fallback
4. Guarda `operador: MI_PLANILLA` en la base de datos

---

## 1. ARQUITECTURA DEL SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│                      ULE FRONTEND                           │
│                  (React/Next.js/Mobile)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API + WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER                       │
│  src/api/                                                   │
│  ├── routes/ (tasks, admin, pse, soi, pago-admin)          │
│  ├── middleware/ (auth, error, rateLimit, validator)       │
│  └── websocket.ts (Socket.io real-time updates)            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Redis Queue (BullMQ)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              BULLMQ WORKER & SCHEDULER                      │
│  src/orchestrator/                                          │
│  ├── worker.ts (Procesa tareas)                            │
│  ├── queue.config.ts (Configuración BullMQ)                │
│  └── scheduler.ts (Tareas cron automáticas)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      ┌──────────┐              ┌──────────────┐
      │ BOT: SOI │              │ BOT: Mi      │
      │          │              │ Planilla     │
      └──────────┘              └──────────────┘
            │                         │
            └────────────┬────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │     PORTALES WEB        │
            │  SOI, Mi Planilla, PSE  │
            │  Bancolombia, etc.      │
            └─────────────────────────┘
```

---

## 2. BOT: SOI

**URL Base**: `https://servicio.nuevosoi.com.co/soi`
**Portal Independientes**: `https://www.nuevosoi.com.co/independientes`

### Archivos
```
src/bots/soi/
├── auth.bot.ts          - Autenticación
├── registro.bot.ts      - Crear cuenta nueva
├── crear-planilla.bot.ts - Flujo completo con IBC
├── liquidacion.bot.ts   - Liquidar planilla (legacy)
├── pago.bot.ts          - Pago por PSE
├── activacion.bot.ts    - Activar cuenta por email
├── selectors.ts         - Selectores CSS/XPath
└── index.ts
```

### Credenciales SOI (Independientes)
```typescript
{
  tipoDocumento: 'CC' | 'CE' | 'NIT',
  documento: string,      // Ej: '1047484978'
  password: string        // Encriptada con AES-256
}
```

### Selectores Clave SOI
```typescript
// Login Independientes
LOGIN_INDEPENDIENTE: {
  tipoDoc: 'select[name="tipoIdUsuario"]',
  numeroDoc: 'input[name="numeroIdUsuario"]',
  clave: 'input[name="claveUsuario"]',
  submit: '#botonIngresarIndp'
}

// Crear Planilla
CREAR_PLANILLA: {
  PASO1: { /* Datos aportante */ },
  PASO2: { /* Agregar cotizantes con BDUA */ },
  PASO3: { /* IBC y aportes */ },
  PASO4: { /* Novedades */ }
}

// Pago PSE
PAGO: {
  botonPagar: 'img[src*="pagar.png"]',
  botonPSE: 'img[src*="pse"]',
  dialogoSi: 'button:has-text("Sí")',
  tipoEntidad: 'select[name="codTipoEntidad"]',
  banco: 'select[name="codEntidadFinanciera"]'
}
```

### Flujo Completo SOI
1. **Registro**: POST /api/soi/create-account → Crea cuenta + activa por email
2. **Liquidación**: POST /api/tasks/liquidacion → Genera planilla con IBC
3. **Pago**: POST /api/tasks/pago-pse → Pago por PSE/Bancolombia
4. **Comprobante**: Automático via scheduler cada 2 horas

---

## 3. BOT: MI PLANILLA

**URL Portal Independientes**: `https://independientes2.miplanilla.com/`
**URL Registro**: `https://empresas.miplanilla.com/FSS/RegistroIndependientes`

### Archivos
```
src/bots/miplanilla/
├── auth.bot.ts                    - Autenticación
├── registro.bot.ts                - Crear cuenta
├── liquidacion.bot.ts             - Liquidar planilla
├── pago.bot.ts                    - Pago PSE
├── pago-admin-controlled.bot.ts   - Pago controlado por admin
├── flujo-completo-admin.bot.ts    - Flujo completo hasta banco
├── selectors.ts
└── index.ts
```

### Credenciales Mi Planilla
```typescript
{
  usuario: 'CC' + documento,  // Ej: 'CC1047484978'
  password: string
}
```

**IMPORTANTE**: El campo usuario es `CC + documento` concatenados (sin espacio).

### Selectores Clave Mi Planilla
```typescript
// Login
LOGIN: {
  inputUsuario: '#usuario',      // CC1047484978
  inputPassword: '#clave',
  btnSubmit: 'button[type="submit"]'
}

// Generar Planilla
GENERAR_PLANILLA: {
  // Tipo de planilla (cards clickeables)
  tipoPlanilla: {
    propiosAportes: 'div[data-tipo="propios"]',  // Click en card
    empleados: 'div[data-tipo="empleados"]'
  },
  // Personas incluidas
  personasIncluidas: 'text*="Personas incluidas en la planilla"',
  // Modal ARL
  modalARL: {
    container: '.modal-content',
    btnCerrar: 'button:has-text("No, continuar sin actualizar")'
  }
}
```

### URLs Mi Planilla
```typescript
const MIPLANILLA_URLS = {
  landing: 'https://www.miplanilla.com/',
  portalIndependientes: 'https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes',
  login: 'https://independientes2.miplanilla.com/PublicoIndependientes/Home/Login',
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',
  generarPlanilla: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/GenerarPlanilla',
  administrarPlanillas: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas',
  pse: 'https://independientes2.miplanilla.com/pse/go.aspx',
}
```

### Flujo Mi Planilla (flujo-completo-admin.bot.ts)

```
1. Login
   - Navegar a portal independientes
   - Ingresar CC+documento y password
   - Click submit

2. Verificar planillas existentes
   - Ir a "Administrar planillas"
   - Si hay planilla pendiente → ir directo a pago
   - Si no hay → generar nueva

3. Generar planilla
   - Ir a "Generar planilla"
   - Cerrar modal ARL (si aparece)
   - Seleccionar tipo: "Pagos de mis propios aportes"
   - Verificar "Personas incluidas en la planilla" > 0
     * Si es 0 → ERROR: Cotizante no configurado
   - Click "Crear planilla"

4. Procesar pago PSE
   - Navegar a planilla pendiente
   - Click "Pagar por PSE"
   - Seleccionar banco (BANCOLOMBIA)
   - Ingresar datos PSE:
     * Tipo persona: JURIDICA
     * NIT: 9020190314
     * Email: ulecolombia@gmail.com
   - Click continuar

5. DETENER en Bancolombia
   - Bot llega a página login Bancolombia
   - Usuario Bancolombia: Lbrochet01
   - Admin ingresa password manualmente
   - NO automatizar password del banco
```

### Error Común Mi Planilla: "Personas incluidas (0)"

**Causa**: El usuario no tiene su información de "Aportante" configurada en Mi Planilla.

**Solución**:
1. El usuario debe ingresar manualmente a Mi Planilla
2. Ir a "Mi Perfil" o configuración
3. Completar información de aportante (EPS, AFP, ARL, ingresos)
4. Después el bot puede generar planillas

---

## 4. FLUJO PAGO ADMIN-CONTROLLED

**Propósito**: Admin inicia RPA, bot lleva hasta Bancolombia, admin ingresa OTP manualmente.

### Estados del Flujo
```typescript
enum PagoAdminStatus {
  PENDING_ADMIN = 'PENDING_ADMIN',
  RPA_STARTING = 'RPA_STARTING',
  RPA_AUTHENTICATING = 'RPA_AUTHENTICATING',
  RPA_NAVIGATING = 'RPA_NAVIGATING',
  RPA_PSE_PROCESS = 'RPA_PSE_PROCESS',
  AWAITING_ADMIN_INPUT = 'AWAITING_ADMIN_INPUT',  // BOT SE DETIENE AQUÍ
  VERIFYING_PAYMENT = 'VERIFYING_PAYMENT',
  DOWNLOADING_RECEIPT = 'DOWNLOADING_RECEIPT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT'
}
```

### Flujo Visual
```
Admin Dashboard                    RPA Backend
     │                                  │
     │ POST /admin/pago/iniciar         │
     │─────────────────────────────────>│
     │                                  │ Inicia browser
     │                                  │ Login a SOI/Mi Planilla
     │<─ WebSocket: RPA_AUTHENTICATING ─│
     │                                  │ Navega a planilla
     │<─ WebSocket: RPA_NAVIGATING ─────│
     │                                  │ Procesa PSE
     │<─ WebSocket: RPA_PSE_PROCESS ────│
     │                                  │ Llega a Bancolombia
     │<─ WebSocket: AWAITING_ADMIN ─────│ ← BOT SE DETIENE
     │                                  │
     │ Admin ingresa OTP en navegador   │
     │                                  │
     │ POST /admin/pago/confirmar       │
     │─────────────────────────────────>│
     │                                  │ Verifica pago
     │<─ WebSocket: VERIFYING ──────────│
     │                                  │ Descarga comprobante
     │<─ WebSocket: COMPLETED ──────────│
```

### Endpoints Admin-Controlled
```
POST /api/admin/pago/iniciar           - Iniciar RPA
GET  /api/admin/pago/:sessionId        - Estado de sesión
GET  /api/admin/pago/:sessionId/screenshot - Screenshot actual
POST /api/admin/pago/:sessionId/confirmar-exitoso
POST /api/admin/pago/:sessionId/confirmar-error
POST /api/admin/pago/:sessionId/cancelar
GET  /api/admin/pago/sesiones/activas  - Listar sesiones
```

---

## 5. SISTEMA DE TYPES

### Tipos Principales
```typescript
// src/types/index.ts
interface UserData {
  uleUserId: string
  tipoDocumento: 'CC' | 'CE' | 'PEP'
  numeroDocumento: string
  nombre: string
  email: string
  telefono: string
  eps: string
  pension: string
  arl: string
}

interface PilaData {
  periodo: 'YYYY-MM'    // Ej: '2026-02'
  ingresoBase: number   // Ingreso mensual
  ibc: number           // Ingreso Base Cotización
  diasCotizados: number // 1-30
  salud: number         // 12.5% del IBC
  pension: number       // 16% del IBC
  arl: number           // 1.94% del IBC (nivel I)
  total: number
}

interface TaskInput {
  type: 'REGISTRO' | 'LIQUIDACION' | 'COMPROBANTE' | 'FULL_FLOW' | 'PAGO_PSE'
  uleUserId: string
  userData?: UserData
  pilaData?: PilaData
  numeroPlanilla?: string
}
```

### Tipos SOI
```typescript
// src/types/soi.types.ts
interface SOIUserCredentials {
  tipoDocumento: 'CC' | 'CE' | 'NIT'
  documento: string
  password: string
}

interface SOIPlanillaLiquidacion {
  periodo: { mes: number; anio: number }
  aportante: SOIAportante
  cotizantes: SOICotizante[]
}

interface SOICotizante {
  tipoDocumento: string
  numeroDocumento: string
  tipoCotizante: '3'  // Independiente
  nombres: string
  apellidos: string
  eps: { codigo: string; nombre: string }
  afp: { codigo: string; nombre: string }
  ibc: number
  dias: number
}
```

### Tipos Mi Planilla
```typescript
// src/types/miplanilla.types.ts
interface MiPlanillaCredentials {
  tipoDocumento: 'CC' | 'CE'
  documento: string
  password: string
}

// Usuario para login: CC + documento
const usuario = 'CC' + credentials.documento  // 'CC1047484978'
```

---

## 6. ORQUESTADOR Y QUEUE

### Configuración BullMQ
```typescript
// src/orchestrator/queue.config.ts
const taskQueue = new Queue('ule-rpa-tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
})

// Funciones para agregar tareas
addRegistroTask(data)      // Prioridad 5
addLiquidacionTask(data)   // Prioridad 3 (alta)
addComprobanteTask(data)   // Prioridad 7
addFullFlowTask(data)      // Prioridad 2 (más alta)
```

### Scheduler (Tareas Cron)
```typescript
// src/orchestrator/scheduler.ts
SCHEDULES = {
  CHECK_PLANILLAS: '0 */2 * * *',  // Cada 2 horas → genera COMPROBANTE
  CLEAN_JOBS: '0 */6 * * *',       // Limpieza cada 6 horas
  HEALTH_CHECK: '*/5 * * * *',     // Cada 5 minutos
}
```

### Worker
```typescript
// src/orchestrator/worker.ts
const worker = new Worker('ule-rpa-tasks', async (job) => {
  switch(job.data.type) {
    case 'REGISTRO':     // Registrar usuario
    case 'LIQUIDACION':  // Liquidar planilla
    case 'COMPROBANTE':  // Descargar comprobante
    case 'PAGO_PSE':     // Procesar pago
    case 'FULL_FLOW':    // Todo junto
  }
})
```

---

## 7. API ENDPOINTS

### Tasks
```
GET  /api/tasks              - Listar tareas
GET  /api/tasks/:id          - Detalle de tarea
POST /api/tasks/registro     - Crear tarea registro
POST /api/tasks/liquidacion  - Crear tarea liquidación
POST /api/tasks/comprobante  - Crear tarea comprobante
```

### SOI
```
POST /api/soi/create-account      - Crear cuenta SOI
POST /api/soi/validar-credenciales
POST /api/soi/crear-planilla
```

### PSE
```
POST /api/pse/iniciar-pago
POST /api/pse/ingresar-codigo
GET  /api/pse/estado/:sessionId
```

### Admin
```
GET  /api/admin/stats
GET  /api/admin/users
POST /api/admin/queue/pause
POST /api/admin/queue/resume
```

---

## 8. BASE DE DATOS

### Modelos Principales (Prisma)
```prisma
model UleUser {
  id                String @id
  uleUserId         String @unique
  tipoDocumento     String
  numeroDocumento   String @unique
  nombre            String

  // SOI
  soiAccountStatus  SOIAccountStatus
  soiPassword       String?  // Encriptado AES-256
  soiPasswordIV     String?

  // Mi Planilla
  miplanillaUser     String?
  miplanillaPassword String?

  // Relaciones
  tasks      Task[]
  planillas  PilaPlanilla[]
}

model PilaPlanilla {
  id              String @id
  numeroPlanilla  String @unique
  periodo         String        // "2026-02"
  ibc             Int
  total           Int
  estadoPago      PagoStatus    // PENDIENTE, PAGADA, etc.
  fechaLimite     DateTime

  comprobante     Comprobante?
}

model Task {
  id        String @id
  type      TaskType
  status    TaskStatus
  inputData Json
  resultData Json?
  error     String?
}
```

---

## 9. CREDENCIALES Y CONFIGURACIÓN

### Variables de Entorno (.env)
```bash
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
PORT=3001
API_KEY=...
HMAC_SECRET=...

# Encriptación
ENCRYPTION_KEY=...  # 32 bytes hex para AES-256

# Gmail (para activación SOI)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# Storage
STORAGE_TYPE=local  # local | vercel-blob | s3
```

### Credenciales de Prueba

**Mi Planilla (Luis Brochet)**:
```
Usuario: CC1047484978
Password: Ulecolombia123
```

**PSE (Persona Jurídica)**:
```
Tipo: Jurídica
NIT: 9020190314
Email: ulecolombia@gmail.com
```

**Bancolombia Negocios**:
```
Usuario: Lbrochet01
Password: [Admin ingresa manualmente - NO automatizar]
```

---

## 10. ERRORES COMUNES Y SOLUCIONES

### Error: "Personas incluidas en la planilla (0)"
**Causa**: Usuario no tiene "Aportante" configurado en Mi Planilla.
**Solución**: Usuario debe configurar su perfil manualmente primero.

### Error: PLA-18015 (Horario PSE)
**Causa**: PSE fuera de horario.
**Horario**: Lunes-Viernes 6:30am - 4:30pm
**Solución**: Reintentar en horario hábil.

### Error: APO-06002 (SOI) - "El aportante a registrar ya existe en el sistema"
**Causa**: El usuario YA tiene una cuenta en SOI (posiblemente creada manualmente).
**Solución**: El RPA automáticamente detecta este error y redirige a Mi Planilla como fallback.
**Acción**: Actualizar campo `operador` a `MI_PLANILLA` en la base de datos.

### Error: Session perdida / Página pública
**Causa**: El bot navegó a una URL incorrecta o perdió autenticación.
**Solución**: Verificar URLs usadas, asegurar que login fue exitoso.

### Error: Modal ARL bloquea
**Causa**: Modal "Información importante" no se cerró.
**Solución**: Usar selector correcto para cerrar modal ARL.

---

## 11. COMANDOS ÚTILES

```bash
# Desarrollo (en Mac de desarrollo)
npm run dev              # API server
npm run dev:worker       # Worker
npm run dev:all          # Ambos

# Testing
npx tsx scripts/test-soi-crear-planilla-completo.ts
npx tsx scripts/test-flujo-completo-admin.ts
npx tsx scripts/test-miplanilla-pago-admin-dry-run.ts

# Database
npx prisma studio        # UI para ver datos
npx prisma migrate dev   # Aplicar migraciones
npx prisma generate      # Regenerar cliente

# Queue
# Ver tareas en Redis
redis-cli
> KEYS bull:*
```

### Deploy a Producción (Mac Servidor)

```bash
# Un solo comando para actualizar el servidor:
bash ~/ule-rpa/deploy.sh
```

El script `deploy.sh` hace todo automáticamente:
1. `git pull` - baja el código nuevo
2. `npm install` - instala dependencias nuevas si hay
3. `prisma generate` - regenera cliente de BD
4. `prisma migrate deploy` - aplica migraciones nuevas
5. `npm run build` - compila TypeScript
6. Reinicia el servidor RPA (LaunchAgent)
7. Reinicia el túnel Cloudflare
8. Espera 10 segundos
9. Verifica que todo esté healthy (local + internet)

**Flujo de Deploy:**
```
Mac Desarrollo          GitHub              Mac Servidor
      │                    │                     │
      │ git push           │                     │
      │───────────────────>│                     │
      │                    │                     │
      │                    │  bash ~/ule-rpa/deploy.sh
      │                    │<────────────────────│
      │                    │                     │
      │                    │     ✅ Deployed     │
```

---

## NOTAS IMPORTANTES PARA CLAUDE

1. **Nunca automatizar passwords bancarios** - El bot debe DETENERSE en la página del banco.

2. **Usuario Mi Planilla = CC + documento** - Sin espacios, concatenados.

3. **Verificar "Personas incluidas" > 0** antes de generar planilla en Mi Planilla.

4. **AES-256 para passwords** - Todas las contraseñas se guardan encriptadas.

5. **WebSocket para actualizaciones** - Frontend recibe updates en tiempo real.

6. **Prioridad de operadores**: SOI > Mi Planilla

7. **Horario PSE**: Lunes-Viernes 6:30am - 4:30pm Colombia.

---

## 12. SELECTORES VERIFICADOS SOI (2026-03-07)

> ⚠️ **IMPORTANTE**: Estos selectores fueron verificados directamente en el DOM de SOI.
> NO inventar selectores — siempre verificar con `page.$eval()` o inspeccionar el DOM real.

### Crear Planilla - Paso 1 (Información Básica)
```typescript
// Estos campos ya vienen correctos, NO modificar:
// - Tipo Aportante: 02-INDEPENDIENTE
// - Clase Aportante: I-INDEPENDIENTE
// - Naturaleza Jurídica: PRIVADA
// - Forma de Presentación: ÚNICO
// - Aportante Exonerado: NO

// Campos a configurar:
TIPO_PLANILLA: 'select[name="tipoPlanilla"]'     // Seleccionar "I" (I-INDEPENDIENTES)
PERIODO_MES: '#periodoLiquidacionMes'            // value: "1"-"12"
PERIODO_ANIO: '#periodoLiquidacionAnnio'         // value: "2026"
BTN_SIGUIENTE: '#siguiente1'                      // O 'input[value="Siguiente"]'
```

### Crear Planilla - Paso 2 (Agregar Cotizante)
```typescript
// ⚠️ El botón "Agregar cotizante" está OCULTO (display: none)
// Usar JavaScript directo en lugar de click:
BTN_AGREGAR_COTIZANTE: 'input[onclick*="agregarCotizante"]'  // display: none!

// Ejecutar así:
await page.evaluate(() => {
  (window as any).agregarCotizante();  // Llamar función JS directamente
});
```

### Popup Cotizante - Sub-paso 1 (Información Básica)
```typescript
TIPO_DOCUMENTO: 'select[name="tipoIdentificacionCotizante"]'
NUMERO_DOCUMENTO: 'input[name="numeroIdentificacionCotizante"]'

// ⚠️ NOMBRES se autocompletan desde BDUA después del blur en documento
PRIMER_NOMBRE: 'input[name="primerNombreCotizante"]'      // READONLY - viene de BDUA
PRIMER_APELLIDO: 'input[name="primerApellidoCotizante"]'  // READONLY - viene de BDUA

// ⚠️ TIPO COTIZANTE tiene formato especial "id,codigo"
TIPO_COTIZANTE: 'select[name="tipoCotizante"]'
// Valores: "3,3" = 3-INDEPENDIENTE, "16,33" = 33-BENEFICIARIO FSP, etc.

// Ubicación - también tienen formato "id-codigo"
DEPARTAMENTO: 'select[name="departamento"]'   // Ej: "38,13" = BOLIVAR
MUNICIPIO: 'select[name="municipio"]'         // Ej: "1140-13001" = CARTAGENA

BTN_SIGUIENTE: 'input#siguiente2'
```

### Popup Cotizante - Sub-paso 3 (Seguridad Social)
```typescript
// ⚠️ TYPO INTENCIONAL DE SOI - El campo se llama "sarioBasico" NO "salarioBasico"
SALARIO_BASICO: 'input[name="sarioBasico"]'   // TYPO! No es salarioBasico

// ⚠️ AFP y EPS vienen DISABLED del RUAF - NO intentar cambiarlos
AFP: 'select[name="administradoraPension"]'   // DISABLED - prellenado
EPS: 'select[name="administradoraSalud"]'     // DISABLED - prellenado

// IBC es READONLY - se calcula automáticamente
IBC_PENSION: 'input[name="ibcPension"]'       // READONLY
IBC_SALUD: 'input[name="ibcSalud"]'           // READONLY

// Días cotizados - verificar que sea 30
DIAS_PENSION: 'input[name="numeroDiasCotizadosPension"]'
DIAS_SALUD: 'input[name="numeroDiasCotizadosSalud"]'

// Tarifas - ya vienen correctas, NO modificar
TARIFA_PENSION: 'select[name="tarifaPension"]'  // 0.16 (16%)
TARIFA_SALUD: 'select[name="tarifaSalud"]'      // 0.125 (12.5%)
```

### Pago PSE - Advertencia PSE-04006
```typescript
// Después de click en "Pagar", aparece diálogo de confirmación
// ⚠️ SIEMPRE hacer click en "Sí" para continuar

// El diálogo usa JavaScript confirm() o un modal
// Buscar botón "Sí" con estos selectores:
DIALOGO_SI: 'input[value="Sí"]'
DIALOGO_SI_ALT: 'button:contains("Sí")'  // Puppeteer no soporta :contains
// En Puppeteer usar: page.evaluate(() => document.querySelector('button')?.click())
```

### Consulta de Planillas - Página de Comprobantes (Verificado 2026-03-07)
```typescript
// ⚠️ IMPORTANTE: Los tabs "Específica" y "General" son DECORATIVOS
// Los TDs con clase 'boton-act'/'boton-inact' NO tienen onclick

// TABS (solo visuales, no clickeables):
TD_ESPECIFICA: '#tdBusquedaEsp'           // class: 'boton-act borde-boton' (activo)
TD_GENERAL: '#tdBusquedaGen'              // class: 'boton-inact borde-boton' (inactivo)

// BOTONES REALES (estos son los que funcionan):
BTN_BUSCAR_ESPECIFICA: '#buscarEspecifica1'  // Para búsqueda por número de planilla
BTN_BUSCAR_GENERAL: '#buscarGeneral1'        // Para búsqueda por período (año/mes)

// ⚠️ Para búsqueda por período, usar #buscarGeneral1 (NO el TD visual)

// SELECTORES DE PERÍODO (aparecen después del primer click en buscarGeneral1):
OTROS_SUBS_ANIO: 'select[name="periodoLiqOtrosSubsAnnio"]'  // 2003-2026
OTROS_SUBS_MES: 'select[name="periodoLiqOtrosSubsMes"]'    // 1-12 (ENERO-DICIEMBRE)
SALUD_ANIO: 'select[name="periodoLiqSaludAnnio"]'          // 2003-2026
SALUD_MES: 'select[name="periodoLiqSaludMes"]'             // 1-12 (ENERO-DICIEMBRE)

// ⚠️ IMPORTANTE: Setear los 4 selectores CON EL MISMO VALOR de año/mes
// Los eventos onchange pueden resetear otros selectores
// Usar $eval SIN dispatchEvent para evitar interferencias:
await page.$eval('select[name="periodoLiqOtrosSubsAnnio"]', (el, val) => {
  (el as HTMLSelectElement).value = val;
}, '2026');

// COLUMNA SOPORTE PAGO (click para descargar):
IMG_SOPORTE_PAGO: 'img[onclick*="descargarSoportePago"]'   // ¡CORRECTO!
IMG_COMPROBANTE_PAGO: 'img[onclick*="descargarComprobante"]' // NO USAR - diferente documento

// ⚠️ Usar 'descargarSoportePago', NO 'descargarComprobante'

// PÁGINA DE DESCARGA (soportePagoInicio.do):
// Texto: "Para descargar su(s) soporte(s) de pago haga clic aquí:"
PDF_ICON: 'img[onclick*="generarSoportePago"]'  // Click para descargar PDF
```

### Flujo Correcto de Consulta de Planillas
```
1. Navegar a: Consultas > Activos > Ver marzo 2017 en adelante
2. Click en #buscarGeneral1 (activa tab General con selectores)
3. Configurar los 4 selectores de período (MISMO año y mes)
4. Click en #buscarGeneral1 otra vez (ejecuta la búsqueda)
5. Buscar fila con número de planilla
6. Click en img con onclick "descargarSoportePago"
7. En página soportePagoInicio.do, click en PDF icon
8. Esperar descarga
```

---

## 13. COMPORTAMIENTOS ESPECIALES SOI

### Planilla GUARDADA Existente
SOI muestra planillas existentes en el dashboard después del login.
El bot DEBE verificar si ya existe una planilla GUARDADA para el periodo antes de crear una nueva.

```typescript
// En checkPlanillaExistente():
// 1. Verificar tabla "Últimas planillas disponibles"
// 2. Buscar fila con: Tipo="I", Estado="GUARDADA", Periodo="2026-02"
// 3. Si existe: retornar { existe: true, numeroPlanilla, totalPagar }
// 4. Si no existe: continuar con creación
```

### Popup Cotizante - Detección con Polling
El popup de cotizante NO dispara evento `targetcreated` de forma confiable.
Usar polling en lugar de eventos:

```typescript
// ❌ NO FUNCIONA BIEN:
browser.once('targetcreated', async (target) => { ... });

// ✅ USAR POLLING:
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const pages = await browser.pages();
  for (const p of pages) {
    if (p.url().includes('ingresarCotizante')) {
      return p;  // Popup encontrado
    }
  }
}
```

### Navegación del Popup al Seleccionar tipoCotizante
Cuando se selecciona tipoCotizante (ej: "3,3"), el popup NAVEGA a otra URL.
Esto es comportamiento NORMAL, no un error.

```typescript
// URLs válidas del wizard de cotizante:
// - ingresarCotizante.do  (paso inicial)
// - informacionBasica.do  (después de seleccionar tipoCotizante)
// - novedades.do
// - seguridadSocial.do
// - parafiscales.do
// - resumen.do

// Verificar que siga en el wizard:
const validUrls = ['ingresarCotizante', 'informacionBasica', 'cotizante', 'novedades', 'seguridadSocial'];
const isValid = validUrls.some(url => popup.url().includes(url));
```

### Autocomplete BDUA
Después de ingresar la cédula y hacer blur, SOI consulta BDUA y autocompleta:
- Nombres y apellidos
- AFP (administradora de pensión)
- EPS (administradora de salud)

```typescript
// Esperar autocomplete después del blur:
await page.type('input[name="numeroIdentificacionCotizante"]', cedula);
await page.evaluate(() => {
  const input = document.querySelector('input[name="numeroIdentificacionCotizante"]');
  input?.blur();
  input?.dispatchEvent(new Event('blur', { bubbles: true }));
});

// Esperar que se llene el primer nombre (máx 8 segundos)
await page.waitForFunction(
  () => (document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement)?.value?.length > 0,
  { timeout: 8000 }
);
```

---

## 14. MÓDULO COMPARTIDO BANCOLOMBIA

### bancolombia-negocios.bot.ts

Módulo compartido que maneja la navegación en Bancolombia PSE para ambos operadores (SOI y Mi Planilla).

**Ubicación**: `src/bots/utils/bancolombia-negocios.bot.ts`

```typescript
import { navegarBancolombiaNegocios } from '../utils/bancolombia-negocios.bot';

// Retorna cuando el bot llega al campo de password
const result = await navegarBancolombiaNegocios(page, browser);
// result.estado: 'ESPERANDO_CLAVE' | 'EN_BANCO' | 'ERROR'
```

**Flujo**:
1. Detectar que estamos en `botonbancolombia.apps.bancolombia.com`
2. Click en "Bancolombia Negocios" (tercera opción)
3. Esperar página `autenticacion.apps.bancolombia.com`
4. Ingresar usuario `Lbrochet01`
5. Click Continuar
6. Detectar campo `input[type="password"]`
7. Retornar `ESPERANDO_CLAVE` (bot se detiene aquí)

**IMPORTANTE**: El bot NUNCA ingresa la clave. El admin lo hace manualmente.

---

## 15. WORKER: TIPOS DE TAREA

### Tareas Soportadas en worker.ts

| Tipo | Descripción | Operador |
|------|-------------|----------|
| `REGISTRO` | Crear cuenta (SOI → fallback Mi Planilla) | Ambos |
| `ACTIVACION` | Activar cuenta SOI por email | SOI |
| `COMPROBANTE` | Descargar comprobante de planilla pagada | Ambos |
| `PAGO_SOI` | Pagar planilla existente (legacy) | SOI |
| `SOI_LIQUIDACION_COMPLETA` | Flujo atómico: crear + pagar + comprobante | SOI |
| `MI_PLANILLA_LIQUIDACION_COMPLETA` | Flujo atómico: crear + pagar + comprobante | Mi Planilla |

### SOI_LIQUIDACION_COMPLETA vs MI_PLANILLA_LIQUIDACION_COMPLETA

Ambos siguen el mismo patrón:
1. Login
2. Verificar/crear planilla
3. Iniciar PSE
4. Navegar hasta Bancolombia (usa `navegarBancolombiaNegocios`)
5. Emitir `pago-admin:awaiting-input` via WebSocket
6. Esperar evento `payment-confirmed:{taskId}` del admin
7. Descargar comprobante
8. Emitir `comprobante:ready`

### Manejo de Errores en Liquidación

**⚠️ NO hay fallback automático SOI → Mi Planilla en liquidación**

Cuando SOI o Mi Planilla falla en liquidación, se emite alerta al admin:

```typescript
// En catch de SOI_LIQUIDACION_COMPLETA:
emitAdminAlert({
  id: `alert-${task.id}`,
  type: 'SOI_LIQUIDACION_FALLIDA',
  severity: 'error',
  title: 'SOI Liquidacion Fallida',
  message: `SOI fallo para cedula ${cedula}. Requiere intervencion manual.`,
  details: { error, taskId, cedula },
  timestamp: new Date(),
});

// En catch de MI_PLANILLA_LIQUIDACION_COMPLETA:
emitAdminAlert({
  type: 'MI_PLANILLA_LIQUIDACION_FALLIDA',
  // ...
});
```

El admin ve la alerta en el dashboard y decide qué hacer manualmente.

---

## 16. SISTEMA DE EVENTOS

### session-events.ts (EventEmitter)

Ubicación: `src/services/session-events.ts`

```typescript
import { EventEmitter } from 'events';
export const sessionEvents = new EventEmitter();

// Worker espera confirmación del admin:
sessionEvents.once(`payment-confirmed:${taskId}`, () => {
  // Continuar con descarga de comprobante
});

// API emite cuando admin confirma:
sessionEvents.emit(`payment-confirmed:${taskId}`);
```

### Eventos WebSocket

| Evento | Emisor | Descripción |
|--------|--------|-------------|
| `pago-admin:awaiting-input` | Worker | Bot llegó a Bancolombia, esperando admin |
| `alert:new` | Worker | Alerta de error (liquidación fallida, etc.) |
| `comprobante:ready` | Worker | Comprobante descargado y listo |
| `task:update` | Worker | Actualización de estado de tarea |
| `task:completed` | Worker | Tarea completada |
| `task:failed` | Worker | Tarea fallida |
| `planilla:update` | Worker | Actualización de estado de planilla |

### emitPagoAdminAwaitingInput

```typescript
emitPagoAdminAwaitingInput({
  sessionId: task.id,
  planillaId: nuevaPlanilla.id,
  numeroPlanilla: '6010795958',
  valorTotal: 570000,
  screenshotUrl: '/screenshots/bancolombia_esperando_clave.png',
  timeoutMinutes: 10,
  timeoutAt: new Date(Date.now() + 10 * 60 * 1000),
  message: 'Bot llego a Bancolombia Negocios. Ingresa la clave.',
});
```

### emitAdminAlert

```typescript
emitAdminAlert({
  id: `alert-${taskId}`,
  type: 'SOI_LIQUIDACION_FALLIDA' | 'MI_PLANILLA_LIQUIDACION_FALLIDA',
  severity: 'error' | 'warning' | 'info',
  title: 'Título de la alerta',
  message: 'Descripción detallada',
  details: { error, taskId, cedula },
  timestamp: new Date(),
});
```

---

## 17. ESTADOS DE PLANILLA

### Enum PagoStatus (Prisma)

```prisma
enum PagoStatus {
  PENDIENTE       // Planilla creada, sin pagar
  ESPERANDO_ADMIN // Bot en Bancolombia, esperando input del admin
  EN_PROCESO      // Admin confirmó, descargando comprobante
  PAGADA          // Pago completado, comprobante disponible
  RECHAZADA       // Error en pago PSE
  VENCIDA         // Fecha límite pasada
}
```

### Flujo de Estados

```
PENDIENTE → ESPERANDO_ADMIN → EN_PROCESO → PAGADA
                                        ↘ RECHAZADA
```

---

## 18. ESTADO DE IMPLEMENTACIÓN

### SOI (servicio.nuevosoi.com.co)

| Funcionalidad | Estado | Archivo | Notas |
|--------------|--------|---------|-------|
| Login independientes | ✅ FUNCIONANDO | `auth.bot.ts` | - |
| Registro cuenta | ✅ FUNCIONANDO | `registro.bot.ts` | Incluye activación por email |
| Crear planilla | ✅ FUNCIONANDO | `planilla.bot.ts` | Flujo completo con 5 sub-pasos |
| Detectar planilla existente | ✅ FUNCIONANDO | `planilla.bot.ts` | Reutiliza si ya existe |
| Pago PSE | ✅ FUNCIONANDO | `planilla.bot.ts` | Usa módulo compartido Bancolombia |
| Flujo completo (worker) | ✅ FUNCIONANDO | `worker.ts` | `SOI_LIQUIDACION_COMPLETA` |
| Alerta admin en fallo | ✅ FUNCIONANDO | `worker.ts` | `emitAdminAlert` |
| Descarga comprobante | ✅ FUNCIONANDO | `planilla.bot.ts` | Después de confirmación admin |

### Mi Planilla (miplanilla.com)

| Funcionalidad | Estado | Archivo | Notas |
|--------------|--------|---------|-------|
| Login | ✅ FUNCIONANDO | `auth.bot.ts` | Usuario = CC + documento |
| Crear planilla | ⚠️ PARCIAL | `liquidacion.bot.ts` | Depende de perfil configurado |
| Pago PSE admin-controlled | ✅ FUNCIONANDO | `flujo-completo-admin.bot.ts` | Usa módulo compartido Bancolombia |
| Flujo completo (worker) | ✅ FUNCIONANDO | `worker.ts` | `MI_PLANILLA_LIQUIDACION_COMPLETA` |
| Alerta admin en fallo | ✅ FUNCIONANDO | `worker.ts` | `emitAdminAlert` |
| Descarga comprobante | ✅ FUNCIONANDO | `comprobante.bot.ts` | Después de confirmación admin |

### Módulos Compartidos

| Módulo | Archivo | Usado por |
|--------|---------|-----------|
| Navegación Bancolombia | `bancolombia-negocios.bot.ts` | SOI, Mi Planilla |
| Session Events | `session-events.ts` | Worker, API |
| Crypto (AES-256) | `crypto.ts` | Todos |

### Planilla Creada Exitosamente (2026-03-07)
```
Número: 6010795958
Periodo: FEBRERO 2026
Total: $570.000
Estado: GUARDADA (lista para pago PSE)
Usuario: Camilo Andres Maturana Mejia (CC 1047478670)
```

---

## 19. REGLAS CRÍTICAS DE DESARROLLO

### ❌ NUNCA HACER

1. **NUNCA usar `waitForTimeout` como único mecanismo de espera**
   ```typescript
   // ❌ MAL
   await page.waitForTimeout(5000);
   await page.click('#boton');

   // ✅ BIEN
   await page.waitForSelector('#boton', { visible: true, timeout: 5000 });
   await page.click('#boton');
   ```

2. **NUNCA inventar selectores sin verificar**
   ```typescript
   // ❌ MAL - Asumiendo que existe
   await page.click('#btnGuardarPlanilla');

   // ✅ BIEN - Verificar primero
   const btn = await page.$('#btnGuardarPlanilla');
   if (!btn) {
     const html = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
     logger.error('Botón no encontrado. HTML:', html);
     throw new Error('Selector no encontrado');
   }
   ```

3. **NUNCA usar selectores de Playwright en Puppeteer**
   ```typescript
   // ❌ MAL - Sintaxis de Playwright
   await page.click('button:has-text("Siguiente")');
   await page.click('text=Guardar');

   // ✅ BIEN - Puppeteer puro
   await page.click('input[value="Siguiente"]');
   await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const btn = btns.find(b => b.textContent?.includes('Guardar'));
     btn?.click();
   });
   ```

### ✅ SIEMPRE HACER

1. **SIEMPRE tomar screenshots en cada paso**
   ```typescript
   await takeScreenshot(page, 'paso1_antes');
   // ... acción ...
   await takeScreenshot(page, 'paso1_despues');
   ```

2. **SIEMPRE usar `headless: false` en desarrollo**
   ```typescript
   const browserManager = new BrowserManager({ headless: false });
   ```

3. **SIEMPRE verificar que el elemento existe antes de interactuar**
   ```typescript
   const element = await page.$(selector);
   if (!element) {
     await takeScreenshot(page, 'error_elemento_no_encontrado');
     throw new Error(`Elemento no encontrado: ${selector}`);
   }
   ```

4. **SIEMPRE esperar después de acciones que disparan AJAX**
   ```typescript
   await page.select('select[name="departamento"]', value);
   await page.waitForTimeout(1000);  // Esperar que municipio cargue
   await waitForSelectOptions(page, 'select[name="municipio"]');
   ```

5. **SIEMPRE loggear el estado antes de fallar**
   ```typescript
   try {
     await page.click(selector);
   } catch (error) {
     const url = page.url();
     const html = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
     logger.error('Error en click', { selector, url, htmlPreview: html });
     await takeScreenshot(page, 'error_click');
     throw error;
   }
   ```

### Patrón de setSelectValue Robusto
```typescript
async function setSelectValue(page: Page, selector: string, value: string): Promise<boolean> {
  // 1. Obtener opciones disponibles
  const options = await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement;
    return Array.from(select?.options || []).map(o => ({ value: o.value, text: o.text }));
  }, selector);

  logger.info(`Opciones disponibles: ${JSON.stringify(options)}`);

  // 2. Buscar en orden de prioridad:
  //    a) Match exacto por value
  //    b) Match exacto por texto
  //    c) Match parcial (startsWith)

  // 3. Seleccionar y verificar
  // 4. Retornar true/false
}
```

---

**Última actualización**: 2026-03-07
