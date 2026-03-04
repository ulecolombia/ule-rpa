# CLAUDE.md - Contexto Completo del Proyecto ULE RPA Service

**Fecha**: 2026-03-04
**Versión**: 1.1
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

**Última actualización**: 2026-03-04
