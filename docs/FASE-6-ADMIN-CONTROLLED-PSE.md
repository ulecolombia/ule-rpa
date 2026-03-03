# FASE 6: Flujo de Pago PSE Controlado por Administrador

## Resumen Ejecutivo

Implementar un flujo donde el **administrador inicia manualmente el RPA** desde el dashboard, el sistema automatiza todo hasta llegar a Bancolombia, y el **admin toma control para digitar la clave** y confirmar el pago. Una vez pagado, el comprobante se guarda automáticamente y la tarea se marca como completada.

---

## Flujo Propuesto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO ADMIN-CONTROLLED PSE                           │
└─────────────────────────────────────────────────────────────────────────────┘

Usuario ULE paga en app
         │
         ▼
┌─────────────────────┐
│ Se crea PAGO_TASK   │  ← Estado: PENDING_ADMIN
│ (planilla pendiente)│
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DASHBOARD ADMIN (Planillas Pendientes)                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Planilla    │ Usuario       │ Monto    │ Urgencia │ Acciones       │   │
│  │─────────────│───────────────│──────────│──────────│────────────────│   │
│  │ 5678901234  │ Ana Sofía     │ $189.000 │ Vencida  │ [▶ INICIAR]   │   │
│  │ 1357924680  │ Juan Pablo    │ $425.800 │ Urgente  │ [▶ INICIAR]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ Admin hace clic en "INICIAR"
         ▼
┌─────────────────────┐
│ POST /admin/pago/   │  ← Dispara RPA
│ iniciar-rpa         │     Estado: RPA_PROCESSING
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RPA AUTOMÁTICO                                      │
│                                                                              │
│  1. Login en SOI/Enlace (credenciales del usuario)                          │
│  2. Navegar a planilla pendiente                                            │
│  3. Iniciar proceso de pago PSE                                             │
│  4. Seleccionar Bancolombia                                                 │
│  5. Ingresar datos de cuenta/documento                                      │
│  6. ══════════════════════════════════════════════════════════════════     │
│     ▶▶▶ LLEGA A PANTALLA DE BANCOLOMBIA (login/clave) ◀◀◀                  │
│     ══════════════════════════════════════════════════════════════════     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ WebSocket: pse:awaiting-admin-input
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD ADMIN (Panel de Control)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚡ SESIÓN ACTIVA - Planilla 5678901234                             │   │
│  │                                                                      │   │
│  │  Estado: ESPERANDO ACCIÓN DEL ADMINISTRADOR                         │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────┐    │   │
│  │  │                                                            │    │   │
│  │  │     [IFRAME/PREVIEW de Bancolombia]                       │    │   │
│  │  │                                                            │    │   │
│  │  │     Admin digita clave y confirma pago                    │    │   │
│  │  │                                                            │    │   │
│  │  └────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  [📸 Ver Screenshot]  [❌ Cancelar]  [✅ Pago Completado]           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ Admin completa pago en Bancolombia
         │ Hace clic en "Pago Completado"
         ▼
┌─────────────────────┐
│ POST /admin/pago/   │  ← Notifica que pago fue hecho
│ confirmar-pago      │     Estado: VERIFYING_PAYMENT
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RPA RETOMA CONTROL                                       │
│                                                                              │
│  1. Detecta resultado del pago (exitoso/rechazado)                          │
│  2. Si exitoso:                                                              │
│     - Espera procesamiento de Enlace (~30 seg)                              │
│     - Descarga PDF del comprobante                                          │
│     - Sube a storage del usuario                                            │
│     - Actualiza PilaPlanilla.estadoPago = PAGADA                            │
│     - Crea registro Comprobante con fileUrl                                 │
│  3. Marca tarea como COMPLETED                                              │
│  4. WebSocket: task:completed + comprobante:ready                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ TAREA COMPLETADA    │
│ Comprobante en      │
│ biblioteca usuario  │
└─────────────────────┘
```

---

## Arquitectura de Estados

### Nuevo Estado de Tarea: `PagoAdminTask`

```typescript
enum PagoAdminTaskStatus {
  // Estados iniciales
  PENDING_ADMIN = 'PENDING_ADMIN',      // Esperando que admin inicie

  // Estados de procesamiento RPA
  RPA_STARTING = 'RPA_STARTING',        // RPA iniciando navegador
  RPA_AUTHENTICATING = 'RPA_AUTHENTICATING', // Autenticando en SOI/Enlace
  RPA_NAVIGATING = 'RPA_NAVIGATING',    // Navegando a planilla
  RPA_PSE_PROCESS = 'RPA_PSE_PROCESS',  // Procesando PSE

  // Estado de control admin
  AWAITING_ADMIN_INPUT = 'AWAITING_ADMIN_INPUT', // En Bancolombia, admin debe actuar

  // Estados de verificación
  VERIFYING_PAYMENT = 'VERIFYING_PAYMENT', // Verificando resultado del pago
  DOWNLOADING_RECEIPT = 'DOWNLOADING_RECEIPT', // Descargando comprobante

  // Estados finales
  COMPLETED = 'COMPLETED',              // Pago exitoso + comprobante guardado
  FAILED = 'FAILED',                    // Falló en algún punto
  CANCELLED = 'CANCELLED',              // Cancelado por admin
  TIMEOUT = 'TIMEOUT',                  // Timeout por inactividad
}
```

---

## Cambios en Base de Datos (Prisma)

### Nueva tabla: `PagoAdminSession`

```prisma
model PagoAdminSession {
  id              String   @id @default(cuid())
  sessionId       String   @unique // pago_admin_{planillaId}_{timestamp}

  // Referencias
  planillaId      String
  planilla        PilaPlanilla @relation(fields: [planillaId], references: [id])
  taskId          String?
  task            Task?    @relation(fields: [taskId], references: [id])

  // Estado
  status          PagoAdminStatus @default(PENDING_ADMIN)

  // Información del pago
  valorTotal      Float
  banco           String   @default("BANCOLOMBIA")

  // Control de sesión
  browserSessionId String? // ID para recuperar página del navegador
  lastScreenshot   String? // URL del último screenshot

  // Timeouts
  createdAt       DateTime @default(now())
  startedAt       DateTime? // Cuando admin hizo clic en iniciar
  awaitingAdminAt DateTime? // Cuando llegó a Bancolombia
  completedAt     DateTime?

  // Resultado
  success         Boolean?
  transactionId   String?
  errorMessage    String?

  // Timeout configuración
  adminTimeoutMinutes Int @default(10) // Tiempo máximo en AWAITING_ADMIN_INPUT
}

enum PagoAdminStatus {
  PENDING_ADMIN
  RPA_STARTING
  RPA_AUTHENTICATING
  RPA_NAVIGATING
  RPA_PSE_PROCESS
  AWAITING_ADMIN_INPUT
  VERIFYING_PAYMENT
  DOWNLOADING_RECEIPT
  COMPLETED
  FAILED
  CANCELLED
  TIMEOUT
}
```

### Modificar `PilaPlanilla`

```prisma
model PilaPlanilla {
  // ... campos existentes ...

  // Nueva relación
  pagoAdminSessions PagoAdminSession[]

  // Nuevo campo para tracking
  pagoIniciadoPorAdmin Boolean @default(false)
}
```

---

## Nuevos Endpoints API

### `POST /api/admin/pago/iniciar-rpa`

Inicia el RPA para una planilla específica.

```typescript
// Request
{
  planillaId: string;
}

// Response 201
{
  success: true,
  sessionId: "pago_admin_abc123_1708621234",
  message: "RPA iniciado. Monitoreando progreso...",
  estimatedTimeToBank: "2-3 minutos"
}

// Response 400 (planilla ya en proceso)
{
  success: false,
  error: "Esta planilla ya tiene un pago en proceso"
}
```

### `GET /api/admin/pago/session/:sessionId`

Obtiene estado actual de la sesión de pago.

```typescript
// Response
{
  sessionId: string,
  status: PagoAdminStatus,
  planilla: {
    id: string,
    numeroPlanilla: string,
    valorTotal: number,
    usuario: { nombre: string, documento: string }
  },
  lastScreenshot: string | null, // URL del screenshot actual
  startedAt: Date | null,
  awaitingAdminAt: Date | null,
  timeoutIn: number | null, // segundos restantes
  canTakeScreenshot: boolean
}
```

### `POST /api/admin/pago/session/:sessionId/screenshot`

Captura screenshot actual de la sesión.

```typescript
// Response
{
  screenshotUrl: string,
  capturedAt: Date
}
```

### `POST /api/admin/pago/session/:sessionId/confirmar-pago`

Admin confirma que completó el pago en Bancolombia.

```typescript
// Request
{
  // Opcional: admin puede indicar si cree que fue exitoso
  adminBelievesSuccess?: boolean
}

// Response
{
  success: true,
  message: "Verificando resultado del pago...",
  nextStatus: "VERIFYING_PAYMENT"
}
```

### `POST /api/admin/pago/session/:sessionId/cancelar`

Cancela la sesión de pago activa.

```typescript
// Request
{
  reason?: string
}

// Response
{
  success: true,
  message: "Sesión cancelada. Navegador cerrado."
}
```

### `GET /api/admin/pago/sessions/active`

Lista todas las sesiones de pago activas.

```typescript
// Response
{
  sessions: [
    {
      sessionId: string,
      status: PagoAdminStatus,
      planilla: { numeroPlanilla, valorTotal, usuario },
      startedAt: Date,
      awaitingAdminAt: Date | null
    }
  ]
}
```

---

## Eventos WebSocket

### Nuevos eventos a emitir:

```typescript
// Cuando RPA inicia
socket.emit('pago-admin:started', {
  sessionId: string,
  planillaId: string,
  status: 'RPA_STARTING'
});

// Updates de progreso
socket.emit('pago-admin:progress', {
  sessionId: string,
  status: PagoAdminStatus,
  message: string, // "Autenticando en SOI...", "Navegando a planilla...", etc.
  progress: number // 0-100
});

// Cuando llega a Bancolombia (CRÍTICO)
socket.emit('pago-admin:awaiting-input', {
  sessionId: string,
  planillaId: string,
  numeroPlanilla: string,
  valorTotal: number,
  screenshotUrl: string,
  timeoutMinutes: 10,
  message: "RPA llegó a Bancolombia. Por favor complete el pago."
});

// Screenshot actualizado
socket.emit('pago-admin:screenshot', {
  sessionId: string,
  screenshotUrl: string,
  capturedAt: Date
});

// Verificando pago
socket.emit('pago-admin:verifying', {
  sessionId: string,
  message: "Verificando resultado del pago..."
});

// Pago completado exitosamente
socket.emit('pago-admin:completed', {
  sessionId: string,
  planillaId: string,
  success: true,
  transactionId: string | null,
  comprobanteUrl: string,
  message: "Pago exitoso. Comprobante guardado."
});

// Pago falló
socket.emit('pago-admin:failed', {
  sessionId: string,
  planillaId: string,
  error: string,
  canRetry: boolean
});

// Timeout
socket.emit('pago-admin:timeout', {
  sessionId: string,
  planillaId: string,
  message: "Sesión expirada por inactividad"
});
```

---

## Implementación del Bot

### Nuevo archivo: `src/bots/enlace/pago-admin-controlled.bot.ts`

```typescript
import { Page, Browser } from 'puppeteer';
import { PagoAdminSession } from '@prisma/client';

interface PagoAdminControlledResult {
  success: boolean;
  reachedBank: boolean;
  bankScreenshotUrl?: string;
  error?: string;
}

/**
 * Bot que lleva el proceso de pago hasta Bancolombia
 * y luego cede control al administrador.
 */
export async function ejecutarPagoHastaBancolombia(
  session: PagoAdminSession,
  onProgress: (status: string, progress: number) => void,
  onScreenshot: (url: string) => void
): Promise<PagoAdminControlledResult> {

  // 1. Obtener credenciales del usuario
  onProgress('RPA_AUTHENTICATING', 10);

  // 2. Login en SOI/Enlace
  onProgress('RPA_AUTHENTICATING', 20);

  // 3. Navegar a planillas pendientes de pago
  onProgress('RPA_NAVIGATING', 40);

  // 4. Seleccionar planilla específica
  onProgress('RPA_NAVIGATING', 50);

  // 5. Iniciar proceso PSE
  onProgress('RPA_PSE_PROCESS', 60);

  // 6. Seleccionar Bancolombia
  onProgress('RPA_PSE_PROCESS', 70);

  // 7. Ingresar datos de cuenta
  onProgress('RPA_PSE_PROCESS', 80);

  // 8. Llegar a pantalla de Bancolombia
  onProgress('RPA_PSE_PROCESS', 90);

  // 9. Capturar screenshot y ceder control
  const screenshot = await captureScreenshot(page);
  onScreenshot(screenshot);

  return {
    success: true,
    reachedBank: true,
    bankScreenshotUrl: screenshot
  };
}

/**
 * Continúa después de que el admin confirma el pago
 */
export async function verificarYDescargarComprobante(
  session: PagoAdminSession,
  onProgress: (status: string, message: string) => void
): Promise<{
  success: boolean;
  transactionId?: string;
  comprobanteUrl?: string;
  error?: string;
}> {

  // 1. Detectar estado actual de la página
  onProgress('VERIFYING_PAYMENT', 'Detectando resultado del pago...');

  // 2. Verificar si pago fue exitoso
  const pagoExitoso = await detectarPagoExitoso(page);

  if (!pagoExitoso) {
    return { success: false, error: 'Pago rechazado o no completado' };
  }

  // 3. Esperar procesamiento de Enlace
  onProgress('DOWNLOADING_RECEIPT', 'Esperando procesamiento...');
  await wait(30000);

  // 4. Navegar a comprobantes
  onProgress('DOWNLOADING_RECEIPT', 'Descargando comprobante...');

  // 5. Descargar PDF
  const pdfPath = await descargarComprobantePDF(page);

  // 6. Subir a storage
  const comprobanteUrl = await uploadToStorage(pdfPath);

  return {
    success: true,
    transactionId: extractedTransactionId,
    comprobanteUrl
  };
}
```

---

## Nuevo Worker para Pago Admin

### Archivo: `src/orchestrator/pago-admin.worker.ts`

```typescript
import { prisma } from '../prisma';
import { emitPagoAdminEvent } from '../api/websocket';
import {
  ejecutarPagoHastaBancolombia,
  verificarYDescargarComprobante
} from '../bots/enlace/pago-admin-controlled.bot';
import { pseSessionManager } from '../bots/enlace/pse-session.manager';

/**
 * Inicia el proceso de pago controlado por admin
 */
export async function iniciarPagoAdminControlled(planillaId: string): Promise<string> {
  // 1. Crear sesión
  const session = await prisma.pagoAdminSession.create({
    data: {
      sessionId: `pago_admin_${planillaId}_${Date.now()}`,
      planillaId,
      status: 'RPA_STARTING',
      startedAt: new Date()
    },
    include: { planilla: true }
  });

  // 2. Emitir evento de inicio
  emitPagoAdminEvent('pago-admin:started', {
    sessionId: session.sessionId,
    planillaId,
    status: 'RPA_STARTING'
  });

  // 3. Ejecutar bot en background (no bloqueante)
  ejecutarPagoEnBackground(session);

  return session.sessionId;
}

async function ejecutarPagoEnBackground(session: PagoAdminSession) {
  try {
    const result = await ejecutarPagoHastaBancolombia(
      session,
      // Callback de progreso
      async (status, progress) => {
        await prisma.pagoAdminSession.update({
          where: { id: session.id },
          data: { status }
        });
        emitPagoAdminEvent('pago-admin:progress', {
          sessionId: session.sessionId,
          status,
          progress
        });
      },
      // Callback de screenshot
      async (screenshotUrl) => {
        await prisma.pagoAdminSession.update({
          where: { id: session.id },
          data: { lastScreenshot: screenshotUrl }
        });
        emitPagoAdminEvent('pago-admin:screenshot', {
          sessionId: session.sessionId,
          screenshotUrl
        });
      }
    );

    if (result.reachedBank) {
      // Llegamos a Bancolombia - ceder control a admin
      await prisma.pagoAdminSession.update({
        where: { id: session.id },
        data: {
          status: 'AWAITING_ADMIN_INPUT',
          awaitingAdminAt: new Date(),
          lastScreenshot: result.bankScreenshotUrl
        }
      });

      emitPagoAdminEvent('pago-admin:awaiting-input', {
        sessionId: session.sessionId,
        planillaId: session.planillaId,
        screenshotUrl: result.bankScreenshotUrl,
        timeoutMinutes: 10
      });

      // Iniciar timeout de 10 minutos
      scheduleSessionTimeout(session.sessionId, 10);
    }

  } catch (error) {
    await prisma.pagoAdminSession.update({
      where: { id: session.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message
      }
    });

    emitPagoAdminEvent('pago-admin:failed', {
      sessionId: session.sessionId,
      error: error.message,
      canRetry: true
    });
  }
}

/**
 * Llamado cuando admin confirma que completó el pago
 */
export async function confirmarPagoAdmin(sessionId: string) {
  const session = await prisma.pagoAdminSession.findUnique({
    where: { sessionId }
  });

  if (!session || session.status !== 'AWAITING_ADMIN_INPUT') {
    throw new Error('Sesión no válida para confirmación');
  }

  // Actualizar estado
  await prisma.pagoAdminSession.update({
    where: { id: session.id },
    data: { status: 'VERIFYING_PAYMENT' }
  });

  emitPagoAdminEvent('pago-admin:verifying', {
    sessionId,
    message: 'Verificando resultado del pago...'
  });

  // Verificar y descargar comprobante
  try {
    const result = await verificarYDescargarComprobante(session,
      async (status, message) => {
        await prisma.pagoAdminSession.update({
          where: { id: session.id },
          data: { status }
        });
        emitPagoAdminEvent('pago-admin:progress', {
          sessionId,
          status,
          message
        });
      }
    );

    if (result.success) {
      // Actualizar planilla como pagada
      await prisma.pilaPlanilla.update({
        where: { id: session.planillaId },
        data: {
          estadoPago: 'PAGADA',
          fechaPago: new Date()
        }
      });

      // Crear registro de comprobante
      await prisma.comprobante.create({
        data: {
          planillaId: session.planillaId,
          fileUrl: result.comprobanteUrl,
          // ... otros campos
        }
      });

      // Marcar sesión como completada
      await prisma.pagoAdminSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          success: true,
          transactionId: result.transactionId,
          completedAt: new Date()
        }
      });

      emitPagoAdminEvent('pago-admin:completed', {
        sessionId,
        planillaId: session.planillaId,
        success: true,
        comprobanteUrl: result.comprobanteUrl
      });

    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    await prisma.pagoAdminSession.update({
      where: { id: session.id },
      data: {
        status: 'FAILED',
        success: false,
        errorMessage: error.message
      }
    });

    emitPagoAdminEvent('pago-admin:failed', {
      sessionId,
      error: error.message,
      canRetry: true
    });
  }
}
```

---

## Cambios en el Dashboard (Frontend ULE)

### Nuevo componente: `PlanillasPendientesAdmin.tsx`

```tsx
// Estados visuales para cada fila
const getStatusBadge = (session: PagoAdminSession | null, planilla: Planilla) => {
  if (!session) {
    return <Badge variant="warning">Pendiente</Badge>;
  }

  switch (session.status) {
    case 'RPA_STARTING':
    case 'RPA_AUTHENTICATING':
    case 'RPA_NAVIGATING':
    case 'RPA_PSE_PROCESS':
      return <Badge variant="info" pulse>RPA en progreso...</Badge>;

    case 'AWAITING_ADMIN_INPUT':
      return <Badge variant="error" pulse>⚡ ACCIÓN REQUERIDA</Badge>;

    case 'VERIFYING_PAYMENT':
    case 'DOWNLOADING_RECEIPT':
      return <Badge variant="info">Verificando...</Badge>;

    case 'COMPLETED':
      return <Badge variant="success">✓ Completado</Badge>;

    case 'FAILED':
      return <Badge variant="error">✗ Falló</Badge>;
  }
};

// Botón de acción dinámico
const getActionButton = (session, planilla, onAction) => {
  if (!session) {
    return (
      <Button onClick={() => onAction('iniciar', planilla.id)}>
        ▶ INICIAR
      </Button>
    );
  }

  if (session.status === 'AWAITING_ADMIN_INPUT') {
    return (
      <Button variant="primary" onClick={() => onAction('ver-sesion', session.sessionId)}>
        👁 VER SESIÓN
      </Button>
    );
  }

  if (session.status === 'COMPLETED') {
    return (
      <Button variant="ghost" onClick={() => onAction('ver-comprobante', planilla.id)}>
        📄 Ver Comprobante
      </Button>
    );
  }

  return <Spinner />;
};
```

### Nuevo componente: `PagoAdminSessionModal.tsx`

Modal que se abre cuando hay una sesión en `AWAITING_ADMIN_INPUT`:

```tsx
<Modal open={session?.status === 'AWAITING_ADMIN_INPUT'}>
  <ModalHeader>
    ⚡ Sesión Activa - Planilla {session.planilla.numeroPlanilla}
  </ModalHeader>

  <ModalBody>
    <Alert variant="warning">
      El RPA llegó a Bancolombia. Por favor complete el pago manualmente.
    </Alert>

    <div className="screenshot-container">
      <img src={session.lastScreenshot} alt="Estado actual" />
      <Button onClick={refreshScreenshot}>🔄 Actualizar</Button>
    </div>

    <div className="session-info">
      <p>Valor a pagar: <strong>${session.valorTotal.toLocaleString()}</strong></p>
      <p>Tiempo restante: <Countdown from={session.timeoutAt} /></p>
    </div>
  </ModalBody>

  <ModalFooter>
    <Button variant="ghost" onClick={cancelarSesion}>
      ❌ Cancelar
    </Button>
    <Button variant="primary" onClick={confirmarPagoCompletado}>
      ✅ Pago Completado
    </Button>
  </ModalFooter>
</Modal>
```

---

## Diagrama de Secuencia

```
┌─────┐          ┌─────────┐          ┌─────┐          ┌──────────┐          ┌─────────┐
│Admin│          │Dashboard│          │ API │          │RPA Worker│          │Bancolombia│
└──┬──┘          └────┬────┘          └──┬──┘          └────┬─────┘          └────┬────┘
   │                  │                  │                  │                     │
   │  Ver planillas   │                  │                  │                     │
   │─────────────────>│                  │                  │                     │
   │                  │ GET /planillas   │                  │                     │
   │                  │─────────────────>│                  │                     │
   │                  │<─────────────────│                  │                     │
   │<─────────────────│                  │                  │                     │
   │                  │                  │                  │                     │
   │  Clic INICIAR    │                  │                  │                     │
   │─────────────────>│                  │                  │                     │
   │                  │POST /iniciar-rpa │                  │                     │
   │                  │─────────────────>│                  │                     │
   │                  │                  │ Crear sesión     │                     │
   │                  │                  │─────────────────>│                     │
   │                  │<─────────────────│                  │                     │
   │                  │                  │                  │ Login SOI           │
   │                  │                  │                  │────────────────────>│
   │                  │  WS: progress    │                  │                     │
   │                  │<═════════════════│<═════════════════│                     │
   │<─────────────────│                  │                  │ Navegar PSE         │
   │                  │                  │                  │────────────────────>│
   │                  │  WS: progress    │                  │                     │
   │                  │<═════════════════│<═════════════════│                     │
   │<─────────────────│                  │                  │                     │
   │                  │                  │                  │ Llega a Bancolombia │
   │                  │                  │                  │<────────────────────│
   │                  │WS:awaiting-input │                  │                     │
   │                  │<═════════════════│<═════════════════│                     │
   │<─────────────────│                  │                  │                     │
   │                  │                  │                  │                     │
   │══════════════════│══════════════════│══════════════════│═════════════════════│
   │                  │   ADMIN TOMA CONTROL EN BANCOLOMBIA │                     │
   │══════════════════│══════════════════│══════════════════│═════════════════════│
   │                  │                  │                  │                     │
   │  Digita clave    │                  │                  │                     │
   │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─────────────────────>│
   │                  │                  │                  │                     │
   │  Confirma pago   │                  │                  │                     │
   │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─────────────────────>│
   │                  │                  │                  │                     │
   │  Clic "Pago      │                  │                  │                     │
   │  Completado"     │                  │                  │                     │
   │─────────────────>│                  │                  │                     │
   │                  │POST /confirmar   │                  │                     │
   │                  │─────────────────>│                  │                     │
   │                  │                  │ Verificar pago   │                     │
   │                  │                  │─────────────────>│                     │
   │                  │                  │                  │ Detectar resultado  │
   │                  │                  │                  │────────────────────>│
   │                  │                  │                  │<────────────────────│
   │                  │                  │                  │ Descargar PDF       │
   │                  │                  │                  │────────────────────>│
   │                  │                  │                  │<────────────────────│
   │                  │  WS: completed   │                  │                     │
   │                  │<═════════════════│<═════════════════│                     │
   │<─────────────────│                  │                  │                     │
   │                  │                  │                  │                     │
   └──────────────────┴──────────────────┴──────────────────┴─────────────────────┘
```

---

## Plan de Implementación

### Subfase 6.1: Base de Datos y Tipos ✅ COMPLETADO
- [x] Crear migración Prisma para `PagoAdminSession`
- [x] Agregar relación en `PilaPlanilla` y `Task`
- [x] Crear tipos TypeScript para estados y eventos (`src/types/pago-admin.types.ts`)

### Subfase 6.2: Endpoints API ✅ COMPLETADO
- [x] `POST /api/admin/pago/iniciar-rpa`
- [x] `GET /api/admin/pago/session/:sessionId`
- [x] `POST /api/admin/pago/session/:sessionId/confirmar-pago`
- [x] `POST /api/admin/pago/session/:sessionId/cancelar`
- [x] `POST /api/admin/pago/session/:sessionId/screenshot`
- [x] `GET /api/admin/pago/sessions/active`
- [x] `GET /api/admin/pago/dashboard`
- [x] `GET /api/admin/pago/planillas-pendientes`
- [x] `GET /api/admin/pago/sessions/history`

### Subfase 6.3: Bot Admin-Controlled ✅ COMPLETADO
- [x] Crear `pago-admin-controlled.bot.ts`
- [x] Implementar `ejecutarPagoHastaBancolombia()`
- [x] Implementar `verificarYDescargarComprobante()`
- [x] Crear `pago-admin-session.manager.ts` para mantener sesiones activas

### Subfase 6.4: Worker y WebSocket ✅ COMPLETADO
- [x] Crear `pago-admin.worker.ts`
- [x] Implementar eventos WebSocket nuevos en `websocket.ts`
- [x] Implementar timeout de sesión (10 min)
- [x] Cleanup de sesiones expiradas (cron cada minuto)
- [x] Integrar cron en `server.ts`

### Subfase 6.5: Testing 🔄 PENDIENTE
- [ ] Test de flujo completo (dry-run)
- [ ] Test de timeout
- [ ] Test de cancelación
- [ ] Test de error recovery

### Subfase 6.6: Descarga de Comprobante ✅ COMPLETADO
- [x] Integrar `descargarComprobante()` del bot existente
- [x] Subir comprobante a storage con `uploadComprobanteToStorage()`
- [x] Guardar registro en tabla `Comprobante`
- [x] Incluir `comprobanteUrl` en evento `pago-admin:completed`

---

## Consideraciones de Seguridad

1. **Sesión de navegador aislada**: Cada pago usa su propia instancia de Puppeteer
2. **Timeout automático**: Si admin no actúa en 10 minutos, sesión se cancela
3. **Rate limiting**: Máximo 3 sesiones activas simultáneas por admin
4. **Logs de auditoría**: Registrar quién inició cada pago y cuándo
5. **Encriptación**: Cualquier dato sensible (si aplica) se encripta en tránsito y reposo

---

## Métricas a Trackear

- Tiempo promedio desde "Iniciar" hasta llegar a Bancolombia
- Tiempo promedio que admin tarda en completar pago
- Tasa de éxito de pagos
- Tasa de timeout por inactividad
- Errores más comunes por etapa

---

## Decisiones de Diseño (Resueltas)

1. **¿El admin debe ver el navegador en vivo o solo screenshots?**
   - ✅ **Screenshots** - Implementado con captura bajo demanda

2. **¿Múltiples admins pueden gestionar pagos simultáneamente?**
   - ✅ **Sí, hasta 3 admins** - Límite de 3 sesiones activas

3. **¿Qué pasa si el pago falla en Bancolombia?**
   - ✅ Se marca como fallido y se notifica vía WebSocket
   - El admin puede reintentar creando nueva sesión

4. **¿Límite de sesiones activas simultáneas?**
   - ✅ **3 sesiones máximo** - Configurado en `MAX_CONCURRENT_SESSIONS`

---

## Archivos Creados/Modificados

### Nuevos archivos:
- `prisma/migrations/20260222XXXXXX_add_pago_admin_session/` - Migración DB
- `src/types/pago-admin.types.ts` - Tipos TypeScript
- `src/api/routes/pago-admin.ts` - Endpoints API
- `src/bots/enlace/pago-admin-controlled.bot.ts` - Bot principal
- `src/bots/enlace/pago-admin-session.manager.ts` - Session manager
- `src/orchestrator/pago-admin.worker.ts` - Worker orquestador

### Archivos modificados:
- `prisma/schema.prisma` - Nuevo modelo PagoAdminSession
- `src/api/server.ts` - Integración de rutas y cron
- `src/api/websocket.ts` - Nuevos eventos WebSocket
- `src/types/index.ts` - Export de nuevos tipos
