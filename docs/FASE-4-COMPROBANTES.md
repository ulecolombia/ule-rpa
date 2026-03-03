# Fase 4: Bot de Descarga de Comprobantes PILA

## Resumen Ejecutivo

La Fase 4 implementa la automatización completa de descarga de comprobantes de pago PILA:

- **Verificación automática** del estado de planillas pendientes
- **Descarga de PDFs** de comprobantes cuando están pagadas
- **Upload a múltiples backends** (local, Vercel Blob, AWS S3)
- **Scheduler automático** que revisa planillas cada 2 horas

### Estado: ✅ COMPLETADA

| Subfase | Descripción | Estado |
|---------|-------------|--------|
| 4.1 | Verificación de estado de planilla | ✅ Completo |
| 4.2 | Descarga de comprobante PDF | ✅ Completo |
| 4.3 | StorageUploader multi-backend | ✅ Completo |
| 4.4 | Scheduler de verificación automática | ✅ Completo |
| 4.5 | API en ULE para biblioteca | ✅ En ULE |
| 4.6 | UI de biblioteca en ULE | ✅ En ULE |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FLUJO AUTOMÁTICO                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐            │
│  │ Scheduler│───▶│ Check Paid   │───▶│ Create Task    │            │
│  │ (Cron)   │    │ Planillas    │    │ COMPROBANTE    │            │
│  └──────────┘    └──────────────┘    └───────┬────────┘            │
│       │                                       │                     │
│       │ Cada 2 horas                         ▼                     │
│       │                              ┌───────────────┐              │
│       │                              │    BullMQ     │              │
│       │                              │    Queue      │              │
│       │                              └───────┬───────┘              │
│       │                                      │                      │
│       │                                      ▼                      │
│       │                              ┌───────────────┐              │
│       │                              │    Worker     │              │
│       │                              │  (Procesa)    │              │
│       │                              └───────┬───────┘              │
│       │                                      │                      │
│       ▼                                      ▼                      │
│  ┌──────────┐                        ┌───────────────┐              │
│  │ Enlace   │◀───────────────────────│ Comprobante   │              │
│  │Operativo │                        │    Bot        │              │
│  └────┬─────┘                        └───────┬───────┘              │
│       │                                      │                      │
│       │ 1. Verificar estado                  │                      │
│       │ 2. Descargar PDF                     │                      │
│       ▼                                      ▼                      │
│  ┌──────────┐                        ┌───────────────┐              │
│  │   PDF    │───────────────────────▶│   Storage     │              │
│  │ (local)  │                        │   Uploader    │              │
│  └──────────┘                        └───────┬───────┘              │
│                                              │                      │
│                                              ▼                      │
│                           ┌──────────────────────────────┐          │
│                           │     Storage Backend          │          │
│                           ├──────────────────────────────┤          │
│                           │ • Local (desarrollo)         │          │
│                           │ • Vercel Blob (producción)   │          │
│                           │ • AWS S3 (alternativa)       │          │
│                           └──────────────────────────────┘          │
│                                              │                      │
│                                              ▼                      │
│                                      ┌───────────────┐              │
│                                      │   Database    │              │
│                                      │ (Comprobante) │              │
│                                      └───────────────┘              │
│                                              │                      │
│                                              ▼                      │
│                                      ┌───────────────┐              │
│                                      │   Webhook     │              │
│                                      │   to ULE      │              │
│                                      └───────────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Componentes

### 1. Comprobante Bot (`src/bots/enlace/comprobante.bot.ts`)

Bot principal que maneja la verificación y descarga de comprobantes.

#### Funciones Principales

```typescript
// Verificar estado de planilla
verificarEstadoPlanilla(numeroPlanilla: string): Promise<PlanillaStatus>

// Descargar PDF de comprobante
descargarComprobante(numeroPlanilla: string, outputDir?: string): Promise<DownloadResult>

// Clase completa
EnlaceComprobanteBot.descargarComprobante(numeroPlanilla, numeroDocumento?, periodo?)
```

#### Estrategias de Extracción

El bot usa 3 estrategias para extraer datos de la tabla:

1. **Data Attributes** - Más estable, usa `data-field="..."` attributes
2. **Posición de Columnas** - Fallback, asume orden fijo de columnas
3. **Búsqueda de Texto** - Último recurso, busca patrones de texto

### 2. Storage Uploader (`src/storage/uploader.ts`)

Servicio de upload multi-backend para subir comprobantes.

#### Configuración

```typescript
// Singleton
import { storageUploader } from './storage/uploader';

// O función helper
import { uploadComprobanteToStorage } from './storage/uploader';
```

#### Uso

```typescript
const result = await storageUploader.uploadComprobante(
  './downloads/comprobante_123.pdf',
  {
    userId: 'user-123',
    numeroPlanilla: '123456789',
    periodo: '2026-02',
    valor: 580440,
    fechaPago: new Date()
  }
);

if (result.success) {
  console.log('URL pública:', result.url);
}
```

#### Estructura de Archivos

```
comprobantes/
  {userId}/
    pila/
      {año}/
        {mes}/
          comprobante_{numeroPlanilla}.pdf
```

Ejemplo: `comprobantes/user-123/pila/2026/02/comprobante_123456789.pdf`

### 3. Scheduler (`src/orchestrator/scheduler.ts`)

Cron job que revisa planillas pendientes automáticamente.

#### Configuración

```typescript
// En SCHEDULES
CHECK_PLANILLAS: '0 */2 * * *'  // Cada 2 horas
```

#### Lógica

1. Busca planillas con `estadoPago: 'PENDIENTE'`
2. Que fueron liquidadas hace más de 1 hora
3. Que no están vencidas
4. Que no tienen comprobante aún
5. Que no tienen tarea en progreso
6. Crea tarea `COMPROBANTE` para cada una

---

## Estados de Planilla

| Estado | Descripción | Acción |
|--------|-------------|--------|
| `PENDIENTE` | Liquidada, esperando pago | Verificar periódicamente |
| `EN_PROCESO` | Pago PSE iniciado | Esperar confirmación |
| `PAGADA` | Pago confirmado | Descargar comprobante |
| `RECHAZADA` | Pago rechazado por banco | Notificar usuario |
| `VENCIDA` | Pasó fecha límite sin pagar | Archivar |

---

## Configuración

### Variables de Entorno

```bash
# Storage Type (required)
STORAGE_TYPE=local           # local | vercel-blob | s3

# Local Storage (para desarrollo)
STORAGE_PATH=./uploads
STORAGE_BASE_URL=http://localhost:3001/files

# Vercel Blob (para producción)
BLOB_READ_WRITE_TOKEN=vercel_blob_token_xxx

# AWS S3 (alternativa)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=ule-comprobantes
```

### Cron Schedule

```javascript
// En scheduler.ts

// Cada 2 horas (default)
'0 */2 * * *'

// Cada 30 minutos (más frecuente)
'*/30 * * * *'

// Cada hora
'0 * * * *'

// Cada 5 minutos (testing)
'*/5 * * * *'
```

---

## Worker Handler

El worker procesa tareas `COMPROBANTE`:

```typescript
// En worker.ts

case 'COMPROBANTE': {
  // 1. Verificar estado en Enlace
  const status = await verificarEstadoPlanilla(numeroPlanilla);

  if (status.estado !== 'PAGADA') {
    // Planilla aún no pagada, re-encolar para después
    return { success: false, requeue: true };
  }

  // 2. Descargar PDF
  const downloadResult = await descargarComprobante(numeroPlanilla);

  // 3. Subir a storage
  const uploadResult = await storageUploader.uploadComprobante(
    downloadResult.localPath,
    metadata
  );

  // 4. Guardar en BD
  await prisma.comprobante.create({
    data: {
      planillaId,
      uleUserId,
      fileName: downloadResult.fileName,
      fileUrl: uploadResult.url,
      fileSize: downloadResult.fileSize,
    }
  });

  // 5. Actualizar planilla
  await prisma.pilaPlanilla.update({
    where: { id: planillaId },
    data: { estadoPago: 'PAGADA' }
  });

  // 6. Notificar a ULE
  await sendWebhook('comprobante.ready', { ... });

  return { success: true };
}
```

---

## Testing

### Test Manual Completo

```bash
# Con headless (rápido)
tsx tests/manual/test-comprobante.ts

# Con browser visible (debugging)
PUPPETEER_HEADLESS=false tsx tests/manual/test-comprobante.ts

# Con planilla específica
PLANILLA=123456789 tsx tests/manual/test-comprobante.ts

# Solo verificar estado
TEST_TYPE=status tsx tests/manual/test-comprobante.ts

# Múltiples planillas
TEST_TYPE=multiple PLANILLAS=111,222,333 tsx tests/manual/test-comprobante.ts
```

### Test del Scheduler

```bash
# Ver logs del scheduler
tail -f logs/combined.log | grep -E "(scheduler|planilla|comprobante)"

# Forzar ejecución del scheduler (en node repl)
import { checkPaidPlanillasTask } from './src/orchestrator/scheduler';
await checkPaidPlanillasTask();
```

### Verificar Base de Datos

```bash
# Abrir Prisma Studio
npm run prisma:studio

# Consultas útiles:
# - Tabla Comprobante: ver archivos subidos
# - Tabla PilaPlanilla: ver estados de planillas
# - Tabla Task: ver tareas COMPROBANTE
```

---

## Troubleshooting

### Problema: Comprobantes no se descargan

**Causas posibles:**
1. Planilla no está PAGADA en Enlace
2. Selectores desactualizados
3. Sesión expirada

**Solución:**
```bash
# 1. Verificar estado manualmente
PUPPETEER_HEADLESS=false TEST_TYPE=status tsx tests/manual/test-comprobante.ts

# 2. Ver screenshots
ls -la ./screenshots/comprobante-*

# 3. Verificar selectores
# Abrir DevTools en Enlace y comparar con SELECTORS.COMPROBANTES
```

### Problema: PDF descargado pero no sube

**Causas posibles:**
1. Storage no configurado
2. Permisos de archivo
3. Token expirado (Vercel Blob)

**Solución:**
```bash
# 1. Verificar configuración
echo $STORAGE_TYPE
echo $BLOB_READ_WRITE_TOKEN

# 2. Verificar archivo local
ls -la ./downloads/comprobantes/

# 3. Ver logs de uploader
tail -f logs/combined.log | grep uploader
```

### Problema: Scheduler no ejecuta

**Causas posibles:**
1. Worker no está corriendo
2. Scheduler no se inició
3. Cron mal configurado

**Solución:**
```bash
# 1. Verificar que worker esté corriendo
ps aux | grep worker

# 2. Ver logs de inicio
tail -100 logs/combined.log | grep -i "scheduler\|scheduled"

# 3. Verificar tareas programadas
# En node repl:
import { getScheduledJobs } from './src/orchestrator/scheduler';
console.log(getScheduledJobs());
```

### Problema: Comprobante no aparece en ULE

**Causas posibles:**
1. Webhook no llegó
2. `uploadedToUle: false`
3. `fileUrl` inválida

**Solución:**
```bash
# 1. Verificar en BD de RPA
# Prisma Studio → Comprobante → buscar por planillaId

# 2. Verificar webhook
# Ver logs de ULE: /api/webhooks/rpa

# 3. Verificar URL
curl -I <fileUrl>
```

---

## Optimizaciones Futuras

### Corto Plazo
- [ ] Descarga paralela de múltiples comprobantes
- [ ] Retry más inteligente con backoff exponencial
- [ ] Caché de sesión de Enlace entre ejecuciones

### Mediano Plazo
- [ ] OCR para extraer datos del PDF
- [ ] Validación de PDF contra datos de BD
- [ ] Notificación push al usuario cuando está listo

### Largo Plazo
- [ ] Compresión de PDFs antes de subir
- [ ] Archivado automático de comprobantes viejos
- [ ] Dashboard de analytics de comprobantes

---

## Métricas de Éxito

| Métrica | Objetivo | Actual |
|---------|----------|--------|
| Tasa de descarga exitosa | > 95% | TBD |
| Tiempo promedio de descarga | < 30s | TBD |
| Detección de pago | < 2h | ✅ 2h |
| Disponibilidad del scheduler | > 99% | TBD |

---

## Flujo de Datos

### Flujo Automático (Recomendado)

```
1. Usuario paga PILA vía PSE
2. Wompi confirma pago → ULE actualiza Payment
3. Scheduler detecta planilla pagada (cada 2h)
4. Crea tarea COMPROBANTE
5. Worker ejecuta:
   a. Verificar estado en Enlace
   b. Descargar PDF
   c. Subir a storage
   d. Guardar en BD
   e. Enviar webhook a ULE
6. Usuario ve comprobante en biblioteca
```

### Flujo Manual (API Directa)

```bash
# Trigger directo desde ULE
POST /api/tasks/comprobante
{
  "uleUserId": "user-123",
  "numeroPlanilla": "123456789",
  "planillaId": "planilla-abc"
}
```

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `src/bots/enlace/comprobante.bot.ts` | Bot principal (1,266 líneas) |
| `src/storage/uploader.ts` | Servicio de upload (419 líneas) |
| `src/storage/local.ts` | Backend local (87 líneas) |
| `src/orchestrator/scheduler.ts` | Cron jobs (515 líneas) |
| `src/orchestrator/worker.ts` | Handler COMPROBANTE |
| `tests/manual/test-comprobante.ts` | Test manual |

---

## Próximos Pasos

Después de completar Fase 4:

- ✅ Comprobantes se descargan automáticamente
- ✅ Usuarios pueden ver/descargar PDFs en ULE
- ⏭️ **Siguiente: Fase 5 - Dashboard Admin / Monitoring**

---

**Última actualización:** 2026-02-08
**Autor:** Claude Code
**Versión:** 1.0.0
