# ULE ↔ RPA Integration: Wompi Webhook

## 📋 Resumen

Esta guía te muestra cómo integrar la aplicación **ULE** con el **RPA Service** para que cuando Wompi confirme un pago, se active automáticamente la liquidación de PILA.

---

## 🏗️ Arquitectura

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐      ┌─────────────┐
│   Usuario   │─────▶│   ULE App    │─────▶│    Wompi     │─────▶│  Banco PSE  │
│             │      │  (Next.js)   │      │  (Gateway)   │      │             │
└─────────────┘      └──────────────┘      └──────────────┘      └─────────────┘
                            │                      │
                            │                      │ Webhook
                            │                      ▼
                            │              ┌──────────────┐
                            │              │ ULE Webhook  │
                            │              │  /wompi      │
                            │              └──────────────┘
                            │                      │
                            │                      │ HTTP POST
                            │                      ▼
                            │              ┌──────────────┐
                            │              │ RPA Service  │
                            │              │  /webhooks   │
                            │              └──────────────┘
                            │                      │
                            │                      │ Queue
                            │                      ▼
                            │              ┌──────────────┐
                            │              │  BullMQ +    │
                            │              │   Worker     │
                            │              └──────────────┘
                            │                      │
                            │                      │ Execute
                            │                      ▼
                            │              ┌──────────────┐
                            │              │ Liquidation  │
                            │              │     Bot      │
                            │              └──────────────┘
                            │                      │
                            │ Poll                 │
                            ◀──────────────────────┘
                       GET /api/tasks/:taskId
```

---

## 📂 Archivos a Crear en ULE

### 1. Webhook de Wompi (ULE)
**Ubicación**: `app/api/payments/wompi/webhook/route.ts`

### 2. Schema de Prisma Actualizado (ULE)
**Ubicación**: `prisma/schema.prisma`

### 3. Variables de Entorno (ULE)
**Ubicación**: `.env` o `.env.local`

---

## 🚀 Instrucciones Paso a Paso

### Paso 1: Actualizar Schema de Prisma en ULE

1. Abre tu proyecto **ULE** (no el proyecto RPA)
2. Ve al archivo `prisma/schema.prisma`
3. Agrega/actualiza el modelo `Payment`:

```prisma
model Payment {
  id                String        @id @default(cuid())
  userId            String
  user              User          @relation(fields: [userId], references: [id])

  reference         String        @unique  // Referencia única para Wompi
  amount            Int                    // Monto en centavos (COP)
  status            PaymentStatus @default(PENDING)

  // Wompi Integration
  wompiTransactionId String?               // ID de transacción de Wompi
  wompiCheckoutId    String?               // ID de checkout de Wompi

  // RPA Integration
  rpaTaskId         String?                // ID de tarea en RPA Service

  // Datos de PILA (JSON)
  pilaData          Json                   // Almacena datos de liquidación

  createdAt         DateTime      @default(now())
  confirmedAt       DateTime?              // Cuando Wompi confirmó el pago
  updatedAt         DateTime      @updatedAt
}

enum PaymentStatus {
  PENDING    // Pago creado, esperando confirmación
  CONFIRMED  // Wompi confirmó el pago
  FAILED     // Pago falló
  REFUNDED   // Pago reembolsado
  CANCELLED  // Pago cancelado
}
```

4. Ejecuta la migración:
```bash
npx prisma migrate dev --name add_payment_wompi_rpa
```

---

### Paso 2: Crear Webhook de Wompi en ULE

1. Crea el archivo `app/api/payments/wompi/webhook/route.ts`
2. Copia el código del archivo de ejemplo (ver más abajo)
3. El webhook debe:
   - ✅ Verificar firma de Wompi
   - ✅ Validar que el pago fue aprobado
   - ✅ Actualizar estado del pago en tu DB
   - ✅ Llamar al RPA Service para liquidar PILA

---

### Paso 3: Configurar Variables de Entorno en ULE

Agrega a tu archivo `.env` o `.env.local`:

```bash
# RPA Service
RPA_SERVICE_URL=http://localhost:4000  # Producción: https://rpa.tudominio.com
RPA_API_KEY=tu-api-key-secreta

# Wompi
WOMPI_SECRET_KEY=prod_integrity_...  # Tu clave secreta de Wompi
WOMPI_PUBLIC_KEY=pub_test_...        # Tu clave pública de Wompi
```

---

### Paso 4: Configurar Webhook en Wompi Dashboard

1. Ve al dashboard de Wompi: https://comercios.wompi.co
2. Navega a **Configuración → Webhooks**
3. Agrega la URL de tu webhook:
   ```
   https://tudominio.com/api/payments/wompi/webhook
   ```
4. Selecciona eventos:
   - ✅ `transaction.updated`
5. Copia el **Secret Key** para verificar firmas

---

### Paso 5: Flujo de Creación de Pago

Cuando el usuario inicia un pago, debes crear el registro en tu DB:

```typescript
// En tu página de liquidación de PILA
const payment = await prisma.payment.create({
  data: {
    userId: session.user.id,
    reference: `PILA-${userId}-${Date.now()}`,
    amount: totalAmount, // En centavos
    status: 'PENDING',
    pilaData: {
      periodo: '2026-02',
      ingresoBase: 1500000,
      ibc: 1500000,
      diasCotizados: 30,
      salud: 187500,    // 12.5% del IBC
      pension: 240000,  // 16% del IBC
      arl: 7830,        // 0.522% del IBC (nivel I)
      nivelRiesgoARL: 'I',
      total: 435330,
    },
  },
});

// Redirigir a Wompi
const wompiUrl = `https://checkout.wompi.co/p/`;
// ... configurar checkout de Wompi con payment.reference
```

---

## 📄 Archivos de Ejemplo

Los archivos completos de ejemplo están en:
- `docs/examples/ule-wompi-webhook.ts` - Webhook completo
- `docs/examples/ule-prisma-schema.prisma` - Schema actualizado

---

## 🔒 Seguridad

### Verificación de Firma de Wompi

**IMPORTANTE**: En producción, DEBES verificar la firma del webhook:

```typescript
import crypto from 'crypto';

function verifyWompiSignature(
  payload: any,
  signature: string,
  secret: string
): boolean {
  const stringToSign = JSON.stringify(payload);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');

  return signature === expectedSignature;
}

// En el webhook:
const signature = headers().get('x-event-signature');
const isValid = verifyWompiSignature(body, signature, process.env.WOMPI_SECRET_KEY!);

if (!isValid) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
}
```

---

## 🧪 Testing

### Probar el Flujo Completo

1. **Crear pago de prueba** en ULE
2. **Simular webhook de Wompi** (ver documentación de Wompi para test events)
3. **Verificar logs**:
   - ULE: Webhook recibido y procesado
   - RPA: Task creada y en cola
   - RPA: Bot ejecutando liquidación
4. **Consultar estado** via polling:
   ```typescript
   const taskStatus = await fetch(
     `${RPA_SERVICE_URL}/api/tasks/${taskId}`,
     { headers: { 'x-api-key': RPA_API_KEY } }
   );
   ```

### Wompi Test Events

Usa la herramienta de Wompi para enviar webhooks de prueba:
- https://docs.wompi.co/docs/en/eventos#probando-eventos

---

## 🔍 Monitoreo

### Logs a Revisar

**En ULE**:
```typescript
console.log('Wompi webhook received', { reference, status });
console.log('RPA task created', { taskId, paymentId });
```

**En RPA Service**:
- Ver logs del worker: `npm run worker`
- Ver logs de la API: `npm run dev`

### Endpoints de Status

**Consultar tarea del RPA**:
```bash
GET /api/tasks/:taskId
Headers: x-api-key: your-api-key

Response:
{
  "id": "task-123",
  "status": "AWAITING",
  "type": "LIQUIDACION",
  "resultData": {
    "numeroPlanilla": "123456789",
    "planillaId": "planilla-uuid",
    "urlPSE": "https://..."
  }
}
```

---

## ❌ Troubleshooting

### Problema: Webhook no se llama
- ✅ Verifica que la URL del webhook esté configurada en Wompi
- ✅ Verifica que la URL sea accesible públicamente (no localhost)
- ✅ Usa ngrok para pruebas locales: `ngrok http 3000`

### Problema: Firma inválida
- ✅ Verifica que uses el `WOMPI_SECRET_KEY` correcto
- ✅ Verifica que el payload se esté parseando correctamente
- ✅ No modifiques el body antes de verificar la firma

### Problema: RPA no recibe la llamada
- ✅ Verifica que `RPA_SERVICE_URL` sea correcto
- ✅ Verifica que `RPA_API_KEY` sea correcto
- ✅ Verifica que el RPA Service esté corriendo
- ✅ Revisa logs del RPA Service

### Problema: Task se crea pero falla
- ✅ Revisa logs del worker en RPA
- ✅ Verifica que el usuario esté registrado en Enlace
- ✅ Verifica que los datos de PILA sean válidos
- ✅ Consulta `GET /api/tasks/:taskId` para ver errores

---

## 📊 Diagrama de Secuencia

```
Usuario          ULE App         Wompi          ULE Webhook       RPA Service       Worker/Bot
  |                |               |                 |                 |                |
  |--Pagar PILA--->|               |                 |                 |                |
  |                |--Create       |                 |                 |                |
  |                |  Payment----->|                 |                 |                |
  |                |               |                 |                 |                |
  |                |<--Redirect----|                 |                 |                |
  |                |  to PSE       |                 |                 |                |
  |                |               |                 |                 |                |
  |<---PSE Form--------------------|                 |                 |                |
  |                |               |                 |                 |                |
  |--Complete Payment------------->|                 |                 |                |
  |                |               |                 |                 |                |
  |                |               |--Webhook------->|                 |                |
  |                |               |  (APPROVED)     |                 |                |
  |                |               |                 |                 |                |
  |                |               |                 |--Update-------->|                |
  |                |               |                 |  Payment        |                |
  |                |               |                 |                 |                |
  |                |               |                 |--POST---------->|                |
  |                |               |                 | /webhooks/      |                |
  |                |               |                 | payment-        |                |
  |                |               |                 | confirmed       |                |
  |                |               |                 |                 |                |
  |                |               |                 |<--202 Accepted--|                |
  |                |               |                 |  taskId         |                |
  |                |               |                 |                 |                |
  |                |               |<--200 OK--------|                 |                |
  |                |               |                 |                 |                |
  |                |               |                 |                 |--Queue Task--->|
  |                |               |                 |                 |                |
  |                |               |                 |                 |                |--Execute
  |                |               |                 |                 |                |  Liquidation
  |                |               |                 |                 |                |
  |--Poll Status------------------>|                 |                 |                |
  | GET /api/tasks/:taskId         |                 |                 |                |
  |                |               |                 |                 |                |
  |                |--Forward------------------------------------->GET /api/tasks/---->|
  |                |                                                   |                |
  |                |<--Task Status (AWAITING)--------------------------|                |
  |<--Show Planilla #--------------|                 |                 |                |
```

---

## 🎯 Checklist de Implementación

**En ULE (Proyecto Next.js)**:
- [ ] Actualizar `prisma/schema.prisma` con modelo Payment
- [ ] Ejecutar migración: `npx prisma migrate dev`
- [ ] Crear `app/api/payments/wompi/webhook/route.ts`
- [ ] Agregar variables de entorno (`RPA_SERVICE_URL`, `RPA_API_KEY`)
- [ ] Configurar webhook en Wompi Dashboard
- [ ] Implementar verificación de firma de Wompi
- [ ] Probar flujo completo con pagos de prueba

**En RPA Service (Este Proyecto)** ✅:
- [x] Endpoint `/api/webhooks/payment-confirmed` implementado
- [x] Worker procesa tareas LIQUIDACION
- [x] Bot `liquidarPilaConConfirmacion` completo
- [x] Task status AWAITING después de liquidación
- [x] Logging completo

---

## 📚 Referencias

- **Wompi Docs**: https://docs.wompi.co
- **Wompi Events**: https://docs.wompi.co/docs/en/eventos
- **RPA Service API**: Ver `docs/API.md` en este proyecto
- **ULE Integration**: Ver `docs/ULE_INTEGRATION.md` en este proyecto

---

**Última actualización**: 2026-02-08
