# 📋 Instrucciones para Implementar Integración en ULE

## ⚠️ IMPORTANTE

Este archivo contiene instrucciones para **TU PROYECTO ULE** (Next.js).
**NO** es para el proyecto `ule-rpa-service`.

Son dos proyectos separados:
- `ule-rpa-service` ← Proyecto RPA (donde estás ahora) ✅ YA COMPLETADO
- `ule` ← Aplicación Next.js (donde debes hacer estos cambios) ⏳ PENDIENTE

---

## 🚀 Pasos a Seguir

### Paso 1: Abrir Tu Proyecto ULE

```bash
# Cierra este proyecto y abre tu proyecto ULE
cd /ruta/a/tu/proyecto/ule
code .
```

---

### Paso 2: Actualizar Prisma Schema

1. **Abre** el archivo `prisma/schema.prisma` en tu proyecto ULE

2. **Copia** el contenido del archivo de ejemplo:
   `docs/examples/ule-prisma-schema.prisma`

3. **Agrega** al final de tu `schema.prisma`:

```prisma
model Payment {
  id                String        @id @default(cuid())
  userId            String
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  reference         String        @unique
  amount            Int
  status            PaymentStatus @default(PENDING)

  wompiTransactionId String?
  wompiCheckoutId    String?

  rpaTaskId         String?

  pilaData          Json

  createdAt         DateTime      @default(now())
  confirmedAt       DateTime?
  updatedAt         DateTime      @updatedAt

  @@index([userId])
  @@index([reference])
  @@index([status])
  @@index([rpaTaskId])
}

enum PaymentStatus {
  PENDING
  CONFIRMED
  FAILED
  REFUNDED
  CANCELLED
}
```

4. **Actualiza** el modelo `User` (si no tiene la relación):

```prisma
model User {
  id       String    @id @default(cuid())
  // ... tus campos existentes

  // AGREGAR ESTA LÍNEA:
  payments Payment[]
}
```

5. **Ejecuta** la migración:

```bash
npx prisma migrate dev --name add_payment_wompi_rpa
npx prisma generate
```

---

### Paso 3: Crear Webhook de Wompi

1. **Crea** la carpeta y archivo:

```bash
mkdir -p app/api/payments/wompi/webhook
touch app/api/payments/wompi/webhook/route.ts
```

2. **Copia** el código completo de:
   `docs/examples/ule-wompi-webhook.ts`

3. **Pégalo** en `app/api/payments/wompi/webhook/route.ts`

4. **Ajusta** los imports según tu proyecto:
   - Verifica que `@/lib/prisma` sea la ruta correcta de tu Prisma client
   - Si usas otro path, ajústalo

---

### Paso 4: Configurar Variables de Entorno

1. **Abre** el archivo `.env` o `.env.local` en tu proyecto ULE

2. **Agrega** estas variables:

```bash
# RPA Service
RPA_SERVICE_URL=http://localhost:4000
RPA_API_KEY=tu-api-key-secreta

# Wompi (obtén de https://comercios.wompi.co)
WOMPI_SECRET_KEY=prod_integrity_xxxxxxxxxxxxxxx
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxxxxxxxxx
```

3. **Producción**: Cambia las URLs a producción:
```bash
RPA_SERVICE_URL=https://rpa.tudominio.com
```

---

### Paso 5: Configurar Webhook en Wompi

1. **Ve** al dashboard de Wompi: https://comercios.wompi.co

2. **Navega** a: **Configuración → Webhooks**

3. **Agrega** la URL de tu webhook:
   ```
   Desarrollo: https://tu-ngrok.ngrok.io/api/payments/wompi/webhook
   Producción: https://tudominio.com/api/payments/wompi/webhook
   ```

4. **Selecciona** eventos:
   - ✅ `transaction.updated`

5. **Copia** el **Secret Key** para verificar firmas

6. **Guarda** en `.env`:
   ```bash
   WOMPI_SECRET_KEY=el-secret-key-copiado
   ```

---

### Paso 6: Implementar Creación de Pago

Cuando el usuario quiere pagar PILA, crea el registro:

```typescript
// En tu página de liquidación (ej: app/pila/pagar/page.tsx)

import { prisma } from '@/lib/prisma';

// Cuando el usuario completa el formulario:
const payment = await prisma.payment.create({
  data: {
    userId: session.user.id,
    reference: `PILA-${session.user.id}-${Date.now()}`,
    amount: totalCentavos, // Total en centavos
    status: 'PENDING',
    pilaData: {
      periodo: '2026-02',
      ingresoBase: 1500000,
      ibc: 1500000,
      diasCotizados: 30,
      salud: 187500,
      pension: 240000,
      arl: 7830,
      nivelRiesgoARL: 'I',
      total: 435330,
    },
  },
});

// Redirigir a Wompi con payment.reference
// Ver docs de Wompi: https://docs.wompi.co
```

---

### Paso 7: Probar el Flujo Completo

#### 7.1 Iniciar RPA Service

En el proyecto `ule-rpa-service`:
```bash
npm run dev     # Terminal 1
npm run worker  # Terminal 2
```

#### 7.2 Iniciar ULE

En tu proyecto ULE:
```bash
npm run dev
```

#### 7.3 Usar ngrok (para testing local)

```bash
ngrok http 3000
```

Copia la URL de ngrok (ej: `https://abc123.ngrok.io`) y configúrala en Wompi.

#### 7.4 Simular Webhook de Prueba

Usa Postman o curl para simular un webhook de Wompi:

```bash
curl -X POST http://localhost:3000/api/payments/wompi/webhook \
  -H "Content-Type: application/json" \
  -H "x-event-signature: test-signature" \
  -d '{
    "event": "transaction.updated",
    "data": {
      "transaction": {
        "id": "test-transaction-123",
        "status": "APPROVED",
        "reference": "PILA-user123-1234567890"
      }
    },
    "timestamp": "2026-02-08T12:00:00Z"
  }'
```

#### 7.5 Verificar Logs

**En ULE** (terminal de Next.js):
```
✓ Wompi webhook received
✓ Payment confirmed in database
✓ Calling RPA Service...
✓ RPA liquidation task created: task-abc123
```

**En RPA Service** (terminal del worker):
```
✓ Payment confirmed webhook received
✓ Liquidation task created
✓ Worker processing LIQUIDACION task
✓ Step 1/4: Navigating to liquidation
✓ Step 2/4: Selecting liquidation type
✓ Step 3/4: Filling PILA form
✓ Step 4/4: Confirming liquidation
✓ Task completed: AWAITING
```

---

### Paso 8: Polling de Estado (Frontend)

En tu frontend de ULE, haz polling para ver el progreso:

```typescript
// En tu página de estado de pago
async function checkTaskStatus(taskId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_RPA_SERVICE_URL}/api/tasks/${taskId}`,
    {
      headers: {
        'x-api-key': process.env.NEXT_PUBLIC_RPA_API_KEY!,
      },
    }
  );

  const task = await response.json();

  if (task.status === 'AWAITING') {
    // Mostrar: "Planilla generada: {numeroPlanilla}"
    // Mostrar: "Fecha límite: {fechaLimite}"
    // Mostrar botón: "Descargar comprobante"
  }
}

// Polling cada 5 segundos
useEffect(() => {
  if (!taskId) return;

  const interval = setInterval(() => {
    checkTaskStatus(taskId);
  }, 5000);

  return () => clearInterval(interval);
}, [taskId]);
```

---

## ✅ Checklist Final

Antes de ir a producción, verifica:

- [ ] Prisma schema actualizado y migrado
- [ ] Webhook de Wompi creado
- [ ] Variables de entorno configuradas
- [ ] Webhook configurado en Wompi Dashboard
- [ ] Verificación de firma implementada (descomentar código)
- [ ] Flujo completo probado con pago de prueba
- [ ] Logs monitoreados en ambos servicios
- [ ] ngrok/URL pública configurada correctamente

---

## 🆘 ¿Necesitas Ayuda?

Si algo no funciona:

1. **Revisa logs** de ambos servicios (ULE + RPA)
2. **Verifica** que las URLs y API keys sean correctas
3. **Confirma** que ambos servicios estén corriendo
4. **Usa** ngrok para testing local
5. **Consulta** `docs/ULE_WOMPI_INTEGRATION.md` para troubleshooting

---

## 📚 Archivos de Referencia

En el proyecto `ule-rpa-service/docs/examples/`:
- ✅ `ule-wompi-webhook.ts` - Código completo del webhook
- ✅ `ule-prisma-schema.prisma` - Schema de Prisma actualizado
- ✅ `INSTRUCCIONES_ULE.md` - Este archivo

En el proyecto `ule-rpa-service/docs/`:
- ✅ `ULE_WOMPI_INTEGRATION.md` - Guía completa de integración

---

**¡Éxito con la implementación!** 🚀
