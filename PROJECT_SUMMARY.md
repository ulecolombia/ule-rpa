# PROJECT_SUMMARY.md - Documentacion Exhaustiva del Sistema ULE RPA

**Fecha de generacion**: 2026-03-06
**Version**: 1.0
**Proposito**: Documentacion completa para entender el proyecto sin leer el codigo

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Bots - SOI](#3-bots---soi)
4. [Bots - Mi Planilla](#4-bots---mi-planilla)
5. [Bots - Utilidades](#5-bots---utilidades)
6. [Orquestador (Worker + Queue)](#6-orquestador-worker--queue)
7. [Base de Datos (Prisma Schema)](#7-base-de-datos-prisma-schema)
8. [Estado de Implementacion](#8-estado-de-implementacion)
9. [Flujos de Negocio](#9-flujos-de-negocio)
10. [Credenciales y Configuracion](#10-credenciales-y-configuracion)

---

## 1. RESUMEN EJECUTIVO

### Que es este proyecto?

**ULE RPA Service** es un sistema de automatizacion robotica (RPA) que permite a trabajadores independientes colombianos pagar su PILA (Planilla Integrada de Liquidacion de Aportes) de manera automatizada.

### Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js + TypeScript |
| Automatizacion | Puppeteer (browser automation) |
| Cola de tareas | BullMQ + Redis |
| Base de datos | PostgreSQL + Prisma ORM |
| API | Express + Socket.io |
| Storage | Local / Vercel Blob / S3 |

### Operadores de PILA Soportados

| Operador | URL | Rol | Estado |
|----------|-----|-----|--------|
| **SOI** | nuevosoi.com.co | Principal (preferido) | Activo |
| **Mi Planilla** | miplanilla.com | Fallback (cuando SOI falla) | Activo |

### Metricas del Codigo

- **~60 archivos fuente** en `src/`
- **~27,000 lineas** de TypeScript
- **2 operadores** de PILA con bots completos
- **6 tipos de tareas** procesables por el worker

---

## 2. ARQUITECTURA DEL SISTEMA

### Diagrama de Alto Nivel

```
+------------------------------------------------------------------+
|                        ULE App (Frontend)                         |
|                     ulecolombia.com (Vercel)                      |
+--------------------------------+---------------------------------+
                                 |
                                 | REST API + WebSocket
                                 v
+------------------------------------------------------------------+
|                     RPA Service (Este Proyecto)                   |
|                    rpa.ulecolombia.com:3001                       |
|                                                                   |
|  +-------------------+    +------------------+    +-----------+   |
|  |   Express API     |    |   BullMQ Worker  |    |  Socket.io|   |
|  |   src/api/        |    |   src/orchestr/  |    |  WebSocket|   |
|  +--------+----------+    +--------+---------+    +-----+-----+   |
|           |                        |                    |         |
|           v                        v                    |         |
|  +-------------------+    +------------------+          |         |
|  |    Redis Queue    |    |    PostgreSQL    |<---------+         |
|  |    (BullMQ)       |    |    (Prisma)      |                    |
|  +-------------------+    +------------------+                    |
|                                                                   |
|  +-------------------+    +------------------+                    |
|  |   BOT: SOI        |    |  BOT: Mi Planilla|                    |
|  |   src/bots/soi/   |    |  src/bots/miplan/|                    |
|  +--------+----------+    +--------+---------+                    |
|           |                        |                              |
|           +------------------------+                              |
|                        |                                          |
+------------------------+------------------------------------------+
                         |
                         v
+------------------------------------------------------------------+
|                    Portales Externos                              |
|  +-------------+  +-----------------+  +---------------------+    |
|  |    SOI      |  |   Mi Planilla   |  |  PSE / Bancolombia  |    |
|  | nuevosoi.co |  | miplanilla.com  |  | registro.pse.com.co |    |
|  +-------------+  +-----------------+  +---------------------+    |
+------------------------------------------------------------------+
```

### Arquitectura de Produccion

```
Mac Servidor (MacBook Pro 2012)
├── Puerto 3001: RPA Server (API + Worker)
├── Puerto 5432: PostgreSQL (DB local: ule_rpa)
├── Puerto 6379: Redis (BullMQ Queue)
└── Cloudflared: Tunel a internet (rpa.ulecolombia.com)

Servicios auto-inicio (LaunchAgents):
├── com.ule.rpa - API + Worker
├── com.ule.cloudflared - Tunel Cloudflare
├── postgresql@15 - Base de datos
└── redis - Cache/Queue
```

---

## 3. BOTS - SOI

### Ubicacion: `src/bots/soi/`

### 3.1 auth.bot.ts - Autenticacion SOI

**Proposito**: Maneja login y autenticacion en el portal SOI para independientes.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOIAuthBot` | Clase | Bot principal de autenticacion |
| `login(credentials?)` | Metodo | Login con credenciales admin por defecto |
| `loginAsUser(credentials)` | Metodo | Login con credenciales de un usuario especifico |
| `validateCredentials(credentials)` | Metodo | Valida credenciales sin mantener sesion |
| `ensureAuthenticated(credentials?)` | Metodo | Asegura sesion activa, reautentica si expiro |
| `isSessionValid()` | Metodo | Verifica si la sesion sigue activa |
| `getPage()` | Metodo | Retorna la pagina de Puppeteer actual |
| `close()` | Metodo | Cierra el navegador |
| `getSOIAuthBot()` | Funcion | Singleton - obtiene instancia del bot |
| `resetSOIAuthBot()` | Funcion | Resetea el singleton |

**Interfaces**:
- `SOICredentials` - Credenciales legacy (empresa + usuario)
- `SOIUserCredentials` - Credenciales simplificadas (tipoDoc, documento, password)
- `SOISession` - Estado de sesion (isAuthenticated, userName, etc.)

**URL de Login**: `https://www.nuevosoi.com.co/independientes`

---

### 3.2 registro.bot.ts - Registro de Usuarios SOI

**Proposito**: Crea cuentas SOI para usuarios ULE usando el formulario de auto-registro de independientes.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOIRegistroBot` | Clase | Bot de registro (legacy, requiere autenticacion admin) |
| `registrarUsuario(userData)` | Metodo | Registra usuario via panel admin |
| `buscarUsuario(page, tipoDoc, numeroDoc)` | Metodo | Busca si usuario ya existe |
| `registrarUsuarioSOI(userData)` | Funcion Helper | Wrapper para registrarUsuario |
| `crearCuentaSOI(userData)` | Funcion | **PRINCIPAL** - Auto-registro de independientes |

**Flujo de `crearCuentaSOI()`**:
1. Navega a formulario de registro publico
2. Paso 1: Llena datos personales (documento, nombres, apellidos)
3. Paso 2: Llena datos de contacto (ubicacion, telefono, email ULE)
4. Acepta terminos y finaliza
5. SOI envia email de activacion a `pagos.ule@gmail.com`

**Interfaces**:
- `SOIUserData` - Datos para registro legacy
- `SOIRegistrationResult` - Resultado del registro
- `SOIUserRegistration` - Datos para auto-registro V2 (tipoDocumento, documento, nombres, apellidos, departamento, municipio, celularUsuario, emailUsuario)
- `SOIAccountCreationResult` - Resultado de crearCuentaSOI (success, accountCreated, message, generatedPassword?)

**URLs**:
- Registro: `https://www.nuevosoi.com.co/independientes/registro`

---

### 3.3 crear-planilla.bot.ts - Creacion de Planilla PILA

**Proposito**: Flujo completo de creacion de planilla con IBC para independientes.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOICrearPlanillaBot` | Clase | Bot principal para crear planillas |
| `crearPlanilla(data)` | Metodo | Crea planilla completa con arbol de decision |
| `navegarACrearPlanilla()` | Metodo Privado | Navega a "Deseo liquidar una planilla" |
| `llenarPaso1Planilla(data)` | Metodo Privado | Llena info del aportante y periodo |
| `agregarCotizante(cotizante)` | Metodo Privado | Abre popup y agrega cotizante |
| `llenarPopupCotizante(popup, cotizante)` | Metodo Privado | Llena los 5 pasos del popup |
| `llenarPopupPaso1-5` | Metodos Privados | Cada paso del popup de cotizante |
| `continuarALiquidacion()` | Metodo Privado | Valida y liquida la planilla |
| `extraerResultadoLiquidacion()` | Metodo Privado | Extrae numero de planilla y valores |
| `crearPlanillaSOI(page, data, options?)` | Funcion Helper | Crea planilla con pagina ya autenticada |

**Flujo de `crearPlanilla()`**:
1. **Arbol de decision**: Verifica si ya existe planilla para el periodo
   - Si existe y esta PAGADA → Descargar comprobante
   - Si existe y esta PENDIENTE → Ir directo a pago
   - Si no existe → Crear planilla nueva
2. Navegar a "Deseo liquidar una planilla"
3. Paso 1: Seleccionar periodo (mes/ano)
4. Paso 2: Abrir popup "Agregar Cotizante"
5. Popup Paso 1: Datos basicos (documento, nombres, tipo cotizante)
6. Popup Paso 2: Novedades (opcional)
7. Popup Paso 3: **IBC y Seguridad Social** (salud, pension, ARL)
8. Popup Paso 4: Parafiscales (CCF opcional)
9. Popup Paso 5: Resumen y Finalizar
10. Continuar a validacion y liquidacion
11. Extraer numero de planilla y valores

**Interfaces**:
- `CrearPlanillaResult` - Resultado (success, numeroPlanilla, valorTotal, desglose, estado, accionEjecutada)
- `CrearPlanillaOptions` - Opciones (takeScreenshots, screenshotPrefix, skipStateCheck)

**Estados de Planilla**:
- `LIQUIDADA` - Planilla creada exitosamente
- `PENDIENTE_PAGO` - Existe pero no pagada
- `YA_EXISTE` - Existe planilla para el periodo
- `YA_PAGADA` - Ya fue pagada
- `ERROR` - Error en el proceso

---

### 3.4 liquidacion.bot.ts - Liquidacion (Legacy)

**Proposito**: Bot legacy para liquidar planillas. **DEPRECADO** - usar `crear-planilla.bot.ts`.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOILiquidacionBot` | Clase | Bot legacy de liquidacion |
| `liquidarPlanilla(data)` | Metodo | Liquida planilla |
| `liquidarPlanillaSOI(data)` | Funcion Helper | Wrapper |
| `liquidarPlanillaAsUser(credentials, data)` | Funcion | Liquida como usuario especifico |

**Estado**: DEPRECADO - El worker lanza error si se usa el tipo de tarea `LIQUIDACION`.

---

### 3.5 pago.bot.ts - Pago PSE

**Proposito**: Flujo completo de pago de planillas via PSE hasta Bancolombia.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOIPagoBot` | Clase | Bot principal de pago |
| `pagarPlanilla(data)` | Metodo | Flujo completo de pago |
| `ejecutarPagoPSE(page)` | Metodo | Click en boton Pagar (ejecuta pago real) |
| `verificarEstadoPago(numeroPlanilla)` | Metodo | Verifica estado de pago |
| `descargarComprobante(numeroPlanilla)` | Metodo | Descarga comprobante |
| `pagarPlanillaSOI(data)` | Funcion Helper | Wrapper para pagarPlanilla |
| `verificarPagoSOI(numeroPlanilla)` | Funcion Helper | Wrapper |
| `descargarComprobanteSOI(numeroPlanilla)` | Funcion Helper | Wrapper |

**Flujo de `pagarPlanilla()`**:
1. Dashboard → Click en img[src*="pagar.png"] (boton $ en tabla)
2. Pagina detalle planilla → Scroll → Click en img[src*="pse"]
3. Dialogo "Advertencia" → Click boton "Si"
4. Formulario PSE:
   - codTipoEntidad → JURIDICA
   - codEntidadFinanciera → BANCOLOMBIA
5. Click boton "Pagar" → Redirige a registro.pse.com.co
6. En PSE: Seleccionar tab "Juridica", ingresar NIT y Email de ULE
7. Click "Ir al Banco" → Redirige a Bancolombia
8. Click "Bancolombia Negocios" → **BOT SE DETIENE AQUI**
9. Admin ingresa credenciales y OTP manualmente

**Interfaces**:
- `SOIPagoData` - Datos de pago (numeroPlanilla, valorTotal, pse?)
- `SOIPagoResult` - Resultado (success, estadoPago, urlBanco, transaccionId, awaitingBankRedirect)

**Estados de Pago**:
- `PENDIENTE` - Esperando pago
- `EN_PROCESO` - PSE en curso / Redirigido al banco
- `PAGADA` - Pago confirmado
- `RECHAZADA` - Pago rechazado
- `ERROR` - Error en el proceso

---

### 3.6 comprobante.bot.ts - Descarga de Comprobantes

**Proposito**: Descarga PDFs de comprobantes de pago PILA.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `SOIComprobanteBot` | Clase | Bot de comprobantes |
| `verificarEstadoPlanilla(numeroPlanilla)` | Metodo | Verifica estado de planilla |
| `descargarComprobante(data)` | Metodo | Descarga PDF del comprobante |
| `getSOIComprobanteBot()` | Funcion | Singleton |
| `descargarComprobanteSOI(data)` | Funcion Helper | Wrapper |
| `verificarEstadoPlanillaSOI(numeroPlanilla)` | Funcion Helper | Wrapper |

**Flujo de `descargarComprobante()`**:
1. Verificar estado de planilla (debe ser PAGADA)
2. Navegar a consulta de planillas/soportes
3. Buscar planilla por numero
4. Hacer click en boton de descarga
5. Esperar que se descargue el archivo
6. Renombrar archivo con formato estructurado
7. Retornar path del archivo

**Interfaces**:
- `ComprobanteDownloadResult` - Resultado (success, filePath, fileName, fileSize, estadoPlanilla)
- `ComprobanteData` - Datos (numeroPlanilla, uleUserId, periodo?)

---

### 3.7 activacion.bot.ts - Activacion de Cuenta por Email

**Proposito**: Lee emails de activacion de SOI y hace click en el link de activacion.

**Estado**: Implementado pero requiere servicio de Gmail (gmail-reader.service.ts).

---

### 3.8 selectors.ts - Selectores CSS/XPath

**Proposito**: Centraliza todos los selectores usados por los bots SOI.

**Estructura**:
```typescript
SOI_SELECTORS = {
  URLS: { BASE, LOGIN_INDEPENDIENTES, REGISTRO_INDEPENDIENTES, ... },
  LOGIN_INDEPENDIENTE: { tipoDoc, numeroDoc, clave, submit },
  REGISTRO_INDEPENDIENTE: { ... },
  CREAR_PLANILLA: { PASO1, PASO2, PASO3, PASO4 },
  AGREGAR_COTIZANTE: { PASO1, PASO2, PASO3, PASO4, PASO5 },
  PAGO: { ... },
  PSE_ULE: { TIPO_PERSONA, TIPO_DOCUMENTO, NUMERO_DOCUMENTO, EMAIL, BANCO_DEFAULT }
}
```

---

## 4. BOTS - MI PLANILLA

### Ubicacion: `src/bots/miplanilla/`

### 4.1 auth.bot.ts - Autenticacion Mi Planilla

**Proposito**: Login en el portal de independientes de Mi Planilla.

**IMPORTANTE**: El usuario de login es `CC + documento` concatenados (ej: `CC1047484978`).

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `MiPlanillaAuthBot` | Clase | Bot de autenticacion |
| `login(credentials)` | Metodo | Login con credenciales |
| `isSessionValid()` | Metodo | Verifica sesion activa |
| `ensureAuthenticated(credentials)` | Metodo | Reautentica si expiro |
| `getPage()` | Metodo | Retorna pagina Puppeteer |
| `close()` | Metodo | Cierra navegador |
| `getMiPlanillaAuthBot()` | Funcion | Singleton |
| `resetMiPlanillaAuthBot()` | Funcion | Reset singleton |

**Interfaces**:
- `MiPlanillaSession` - Estado de sesion

**URLs**:
- Login: `https://independientes2.miplanilla.com/PublicoIndependientes/Home/Login`
- Dashboard: `https://independientes2.miplanilla.com/PrivadoIndependientes/Principal`

---

### 4.2 registro.bot.ts - Registro de Usuarios Mi Planilla

**Proposito**: Crea cuentas en Mi Planilla (3 pasos, sin activacion por email).

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `MiPlanillaRegistroBot` | Clase | Bot de registro |
| `registrarUsuario(data)` | Metodo | Registro completo de 3 pasos |
| `registrarUsuarioMiPlanilla(data)` | Funcion Helper | Wrapper |

**Flujo de `registrarUsuario()`**:
1. Navega a formulario de registro
2. Paso 1: Datos personales (documento, nombres, apellidos)
3. Paso 2: Datos de contacto (email, celular, direccion)
4. Paso 3: Datos de seguridad social (EPS, AFP, ingresos)
5. Acepta terminos y crea cuenta
6. La cuenta queda activa inmediatamente (no requiere email)

**Interfaces**:
- `MiPlanillaRegistro` - Datos de registro (tipoDocumento, documento, primerNombre, segundoNombre?, primerApellido, segundoApellido?, email, celular, direccion, ciudad, ingresosMensuales, epsCodigo, afpCodigo, actividadEconomica)
- `MiPlanillaRegistroResult` - Resultado (success, usuario, message, generatedPassword?)

---

### 4.3 liquidacion.bot.ts - Creacion de Planilla Mi Planilla

**Proposito**: Genera planillas PILA en Mi Planilla con arbol de decision.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `MiPlanillaLiquidacionBot` | Clase | Bot de liquidacion |
| `verificarYGenerarPlanilla(credentials, options?)` | Metodo | Verifica estado y genera si es necesario |
| `crearPlanillaMiPlanilla(credentials, options?)` | Funcion Helper | Wrapper |

**Arbol de Decision**:
```
Existe planilla para el periodo?
    SI → Esta pagada?
        SI → Descargar comprobante
        NO → Ir directo a pago
    NO → Crear planilla nueva
```

**Flujo**:
1. Login a Mi Planilla
2. Ir a "Administrar planillas"
3. Verificar si hay planilla para el periodo
4. Si no hay → Ir a "Generar planilla"
5. Cerrar modal ARL (si aparece)
6. Seleccionar tipo: "Pagos de mis propios aportes"
7. Verificar "Personas incluidas en la planilla" > 0
8. Click "Crear planilla"
9. Extraer numero de planilla

**Error Comun**: "Personas incluidas (0)" - El usuario no tiene su info de Aportante configurada.

---

### 4.4 pago.bot.ts - Pago PSE Mi Planilla

**Proposito**: Inicia pago PSE desde Mi Planilla.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `MiPlanillaPagoBot` | Clase | Bot de pago |
| `iniciarPago(request)` | Metodo | Inicia flujo de pago PSE |
| `iniciarPagoMiPlanilla(request)` | Funcion Helper | Wrapper |

**Interfaces**:
- `MiPlanillaPagoRequest` - Request (tipoDocumento, documento, password, numeroPlanilla?, banco?)

---

### 4.5 flujo-completo-admin.bot.ts - Flujo Admin-Controlled

**Proposito**: Flujo maestro que ejecuta Login → Verificar/Generar → PSE → Bancolombia en una sola sesion.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `ejecutarFlujoCompletoMiPlanilla(context)` | Funcion | Ejecuta flujo completo |

**Flujo**:
1. Login con credenciales del usuario
2. Verificar planillas existentes
3. Si hay planilla pendiente → Ir a pago
4. Si no hay → Generar nueva planilla
5. Iniciar proceso PSE
6. Seleccionar BANCOLOMBIA
7. Llenar datos PSE (NIT ULE, email ULE)
8. Click "Ir al Banco"
9. **BOT SE DETIENE** en pagina de Bancolombia
10. Admin ingresa credenciales y OTP manualmente

**Interfaces**:
- `FlujoCompletoContext` - Contexto (credentials, periodo?, banco?)
- `FlujoCompletoResult` - Resultado (success, numeroPlanilla, valorTotal, estadoFinal, urlBanco?)

---

### 4.6 comprobante.bot.ts - Descarga de Comprobantes Mi Planilla

**Proposito**: Descarga PDFs de comprobantes de pago.

**Clases y Funciones**:

| Elemento | Tipo | Descripcion |
|----------|------|-------------|
| `MiPlanillaComprobanteBot` | Clase | Bot de comprobantes |
| `verificarEstadoPlanilla(numeroPlanilla, credentials)` | Metodo | Verifica estado |
| `descargarComprobante(data)` | Metodo | Descarga PDF |
| `getMiPlanillaComprobanteBot()` | Funcion | Singleton |
| `descargarComprobanteMiPlanilla(data)` | Funcion Helper | Wrapper |
| `verificarEstadoPlanillaMiPlanilla(numeroPlanilla, credentials)` | Funcion Helper | Wrapper |

**Interfaces**:
- `MiPlanillaComprobanteDownloadResult` - Resultado de descarga
- `MiPlanillaComprobanteData` - Datos (numeroPlanilla, uleUserId, periodo?, tipoDocumento, documento, password)

---

## 5. BOTS - UTILIDADES

### Ubicacion: `src/bots/utils/`

### 5.1 browser.ts - BrowserManager

**Proposito**: Gestiona instancias de Puppeteer.

**Clase**: `BrowserManager`
- `launch()` - Inicia navegador
- `newPage()` - Crea nueva pagina
- `takeScreenshot(page, name)` - Toma screenshot
- `close()` - Cierra navegador

### 5.2 planilla-state.ts - Verificacion de Estado

**Proposito**: Implementa el arbol de decision para verificar estado de planillas.

**Funciones**:
- `verificarEstadoPlanillaSOI(page, options)` - Verifica estado en SOI
- `aplicarArbolDecision(estadoPlanilla)` - Retorna accion recomendada

**DecisionResult**:
- `CREAR_PLANILLA` - No existe, crear nueva
- `IR_A_PAGO` - Existe pendiente, ir a pago
- `DESCARGAR_COMPROBANTE` - Ya pagada
- `CORREGIR_DATOS` - Error de validacion

### 5.3 errors.ts - Errores Personalizados

**Clase**: `BotError` - Error con contexto del bot

### 5.4 wait.ts - Funciones de Espera

**Funciones**: Utilidades para esperas inteligentes.

### 5.5 bancolombia-negocios.ts - Interaccion con Bancolombia

**Proposito**: Helpers para la pagina de Bancolombia Negocios.

---

## 6. ORQUESTADOR (WORKER + QUEUE)

### Ubicacion: `src/orchestrator/`

### 6.1 worker.ts - Procesador de Tareas BullMQ

**Proposito**: Procesa tareas de la cola Redis de manera asincrona.

**Tipos de Tareas Soportados**:

| TaskType | Descripcion | Estado |
|----------|-------------|--------|
| `REGISTRO` | Registra usuario en SOI/Mi Planilla | Implementado |
| `LIQUIDACION` | Liquida planilla (legacy) | DEPRECADO |
| `COMPROBANTE` | Descarga comprobante de pago | Implementado |
| `FULL_FLOW` | Flujo completo (legacy) | DEPRECADO |
| `PAGO_SOI` | Pago via PSE en SOI | Implementado |
| `SOI_LIQUIDACION_COMPLETA` | Crea planilla con IBC completo | Implementado |
| `ACTIVACION` | Activa cuenta SOI por email | Implementado |

**Configuracion del Worker**:
```typescript
concurrency: 3        // Hasta 3 tareas simultaneas
limiter.max: 10       // Max 10 jobs
limiter.duration: 60000  // Por minuto
attempts: 3           // Reintentos por tarea
backoff: exponential  // 2s, 4s, 8s
```

**Flujo de Procesamiento**:
1. Recibe job de la cola
2. Crea/actualiza Task en DB con status PROCESSING
3. Ejecuta el bot segun el tipo de tarea
4. Actualiza Task con resultado (COMPLETED/FAILED)
5. Emite eventos WebSocket
6. Notifica a ULE via webhook

**Flujo de REGISTRO (con fallback)**:
1. Intenta registrar en SOI (crearCuentaSOI)
2. Si falla con APO-06002 (usuario ya existe) → Fallback a Mi Planilla
3. Si Mi Planilla tambien falla → Estado REQUIRES_MANUAL_REVIEW
4. Guarda en EnlaceUser con el operador correcto

**Flujo de COMPROBANTE (polimorfrico)**:
1. Determina operador del usuario (SOI o Mi Planilla)
2. Verifica estado de planilla
3. Si es PAGADA → Descarga PDF
4. Sube a storage
5. Crea registro Comprobante en DB
6. Notifica a ULE

### 6.2 queue.config.ts - Configuracion BullMQ

**Proposito**: Configura la cola Redis y funciones para agregar tareas.

**Funciones**:
- `addRegistroTask(data)` - Prioridad 5
- `addLiquidacionTask(data)` - Prioridad 3 (alta)
- `addComprobanteTask(data)` - Prioridad 7
- `addFullFlowTask(data)` - Prioridad 2 (mas alta)
- `getQueueStats()` - Estadisticas de la cola
- `moveToDeadLetter(job)` - Mueve a cola de errores

### 6.3 scheduler.ts - Tareas Programadas (Cron)

**Proposito**: Ejecuta tareas automaticas periodicas.

**Schedules**:
- `CHECK_PLANILLAS`: Cada 2 horas - Genera tareas COMPROBANTE para planillas pagadas
- `CLEAN_JOBS`: Cada 6 horas - Limpia jobs completados/fallidos antiguos
- `HEALTH_CHECK`: Cada 5 minutos - Verifica salud del sistema

### 6.4 reconciliation.ts - Reconciliacion de Estados

**Proposito**: Sincroniza estados entre el RPA y ULE.

---

## 7. BASE DE DATOS (PRISMA SCHEMA)

### Ubicacion: `prisma/schema.prisma`

### 7.1 Modelos Principales

#### EnlaceUser - Usuarios Registrados

```prisma
model EnlaceUser {
  id                String @id
  uleUserId         String @unique    // ID en ULE App
  tipoDocumento     String            // CC, CE, NIT
  numeroDocumento   String @unique
  nombre            String

  // OPERADOR
  operador          OperadorPila @default(SOI)  // SOI o MI_PLANILLA

  // Credenciales SOI (encriptadas)
  soiAccountStatus  SOIAccountStatus
  soiPassword       String?
  soiPasswordIV     String?

  // Credenciales Mi Planilla (encriptadas)
  miplanillaUser     String?   // CC + documento
  miplanillaPassword String?
  miplanillaPasswordIV String?

  // Entidades de seguridad social
  eps, pension, arl  String?

  // Estado
  enlaceStatus      EnlaceUserStatus  // PENDING, REGISTERED, REQUIRES_MANUAL_REVIEW

  // Relaciones
  tasks             Task[]
  planillas         PilaPlanilla[]
}
```

#### PilaPlanilla - Planillas Liquidadas

```prisma
model PilaPlanilla {
  id              String @id
  uleUserId       String
  enlaceUserId    String
  numeroPlanilla  String @unique
  periodo         String            // "2026-02"

  // Montos
  ingresoBase     Int
  ibc             Int
  salud           Int
  pension         Int
  arl             Int
  total           Int

  // Estado
  estadoPago      PagoStatus       // PENDIENTE, EN_PROCESO, PAGADA, RECHAZADA, VENCIDA

  // Fechas
  fechaLiquidacion DateTime
  fechaLimite      DateTime
  fechaPago        DateTime?

  // Relaciones
  comprobante      Comprobante?
  pseSessions      PseSession[]
  pagoAdminSessions PagoAdminSession[]
}
```

#### Task - Tareas del RPA

```prisma
model Task {
  id          String @id
  type        TaskType       // REGISTRO, COMPROBANTE, PAGO_PSE, etc.
  status      TaskStatus     // PENDING, PROCESSING, COMPLETED, FAILED
  priority    Int

  uleUserId   String
  paymentId   String?

  inputData   Json
  resultData  Json?
  error       String?

  attempts    Int
  startedAt   DateTime?
  completedAt DateTime?
  failedAt    DateTime?

  logs        TaskLog[]
}
```

#### Comprobante - Comprobantes Descargados

```prisma
model Comprobante {
  id          String @id
  planillaId  String @unique
  uleUserId   String

  fileName    String
  filePath    String
  fileUrl     String?
  fileSize    Int
  mimeType    String

  downloadedAt  DateTime
  uploadedToUle Boolean
  uploadedAt    DateTime?
}
```

#### PagoAdminSession - Sesiones de Pago Admin-Controlled

```prisma
model PagoAdminSession {
  id              String @id
  sessionId       String @unique
  planillaId      String

  status          PagoAdminStatus  // PENDING_ADMIN, RPA_STARTING, AWAITING_ADMIN_INPUT, COMPLETED, etc.

  valorTotal      Float
  banco           String

  browserSessionId String?  // Para recuperar pagina en memoria
  lastScreenshot   String?

  adminId          String?
  progress         Int
  progressMessage  String?
}
```

### 7.2 Enums

```prisma
enum OperadorPila {
  SOI
  MI_PLANILLA
}

enum EnlaceUserStatus {
  PENDING
  REGISTERING
  REGISTERED
  ERROR
  REQUIRES_MANUAL_REVIEW
}

enum SOIAccountStatus {
  NOT_LINKED
  PENDING_CREATION
  CREATING
  ACTIVE
  CREDENTIALS_ERROR
  BLOCKED
}

enum TaskType {
  REGISTRO
  LIQUIDACION
  COMPROBANTE
  FULL_FLOW
  PAGO_PSE
}

enum TaskStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
  AWAITING
}

enum PagoStatus {
  PENDIENTE
  EN_PROCESO
  PAGADA
  RECHAZADA
  VENCIDA
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

---

## 8. ESTADO DE IMPLEMENTACION

### 8.1 Funcionalidades Implementadas

| Categoria | Funcionalidad | Estado | Notas |
|-----------|--------------|--------|-------|
| **SOI** | Login | IMPLEMENTADO | Fix aplicado para false negatives |
| **SOI** | Registro (auto-registro) | IMPLEMENTADO | crearCuentaSOI() |
| **SOI** | Crear Planilla + IBC | IMPLEMENTADO | 5 pasos en popup |
| **SOI** | Pago PSE | IMPLEMENTADO | Hasta Bancolombia |
| **SOI** | Descarga Comprobante | IMPLEMENTADO | Requiere planilla PAGADA |
| **Mi Planilla** | Login | IMPLEMENTADO | Usuario = CC + doc |
| **Mi Planilla** | Registro | IMPLEMENTADO | 3 pasos, sin email |
| **Mi Planilla** | Crear Planilla | IMPLEMENTADO | Con arbol de decision |
| **Mi Planilla** | Pago PSE | IMPLEMENTADO | Hasta Bancolombia |
| **Mi Planilla** | Descarga Comprobante | IMPLEMENTADO | Requiere planilla PAGADA |
| **Worker** | Procesamiento REGISTRO | IMPLEMENTADO | Con fallback SOI→Mi Planilla |
| **Worker** | Procesamiento COMPROBANTE | IMPLEMENTADO | Polimorfico (ambos operadores) |
| **Worker** | Procesamiento SOI_LIQUIDACION_COMPLETA | IMPLEMENTADO | IBC completo |
| **Worker** | Procesamiento PAGO_SOI | IMPLEMENTADO | Via PSE |
| **Worker** | Procesamiento ACTIVACION | IMPLEMENTADO | Email SOI |
| **API** | WebSocket updates | IMPLEMENTADO | Socket.io |
| **API** | Admin endpoints | IMPLEMENTADO | Centro de Pagos |
| **Storage** | Upload comprobantes | IMPLEMENTADO | Local/Blob/S3 |
| **Notificaciones** | Webhooks a ULE | IMPLEMENTADO | ule-notifier.ts |
| **Alertas** | Sistema de alertas | IMPLEMENTADO | alert.service.ts |

### 8.2 Funcionalidades Pendientes o Parciales

| Funcionalidad | Estado | Motivo |
|---------------|--------|--------|
| Test Comprobante SOI | OMITIDO | Validacion JS en fechas impide filtro |
| Test Comprobante Mi Planilla | OMITIDO | Usuario de prueba sin planillas pagadas |
| Activacion automatica por email | PARCIAL | Requiere configuracion Gmail API |
| Tests E2E automatizados | PENDIENTE | Solo scripts manuales |

### 8.3 Bugs Conocidos y Fixes Aplicados

| Bug | Archivo | Fix | Estado |
|-----|---------|-----|--------|
| Login SOI false negative | auth.bot.ts | Verificar indicadores positivos PRIMERO | APLICADO |
| Wizard SOI usaba lupa | crear-planilla.bot.ts | Usar autocompletado en lugar de busqueda | APLICADO |
| Planillas duplicadas | planilla-state.ts | Arbol de decision antes de crear | APLICADO |

---

## 9. FLUJOS DE NEGOCIO

### 9.1 Flujo de Registro de Usuario

```
Usuario se registra en ULE App
           ↓
ULE envia datos al RPA (POST /api/tasks/registro)
           ↓
Worker procesa tarea REGISTRO
           ↓
Intenta crear cuenta en SOI (crearCuentaSOI)
           ↓
  ┌────────┴────────┐
  ↓                 ↓
Exitoso         Error APO-06002
  ↓              "Usuario ya existe"
operador=SOI         ↓
  ↓              Fallback a Mi Planilla
  ↓                   ↓
  ↓              ┌────┴────┐
  ↓              ↓         ↓
  ↓          Exitoso    Fallido
  ↓              ↓         ↓
  ↓     operador=MI_PLANILLA  REQUIRES_MANUAL_REVIEW
  ↓              ↓         ↓
  └──────────────┴─────────┴──→ Guarda en EnlaceUser
                                      ↓
                               Notifica a ULE
```

### 9.2 Flujo de Pago (Admin-Controlled)

```
Usuario ve monto a pagar en ULE App (calculo IBC)
           ↓
Usuario paga a ULE (transferencia, PSE, Nequi)
           ↓
Admin verifica pago en "Centro de Pagos"
           ↓
Admin activa RPA (POST /admin/pago/iniciar)
           ↓
RPA hace flujo atomico:
  1. Login a SOI/Mi Planilla
  2. Verifica estado de planilla (arbol de decision)
  3. Si no existe → Genera planilla con IBC
  4. Inicia proceso PSE
  5. Selecciona BANCOLOMBIA
  6. Llena datos PSE (NIT ULE, email ULE)
  7. Click "Ir al Banco"
           ↓
BOT SE DETIENE en pagina Bancolombia
(Usuario Bancolombia: Lbrochet01 - ya llenado)
           ↓
Admin ve esto en tiempo real via WebSocket
           ↓
Admin ingresa manualmente:
  - Password de Bancolombia
  - Codigo OTP del token
  - Confirma transferencia
           ↓
Admin confirma en ULE (POST /admin/pago/confirmar-exitoso)
           ↓
RPA descarga comprobante y actualiza estado a PAGADA
           ↓
Notifica a ULE con URL del comprobante
```

### 9.3 Arbol de Decision para Planillas

```
                   Inicio
                     ↓
         ¿Existe planilla para periodo?
                ↙         ↘
               SI          NO
               ↓            ↓
         ¿Esta pagada?    CREAR_PLANILLA
            ↙     ↘           ↓
           SI      NO     Ejecutar wizard
           ↓       ↓      y liquidar
   DESCARGAR    IR_A_PAGO
   COMPROBANTE     ↓
        ↓       Navegar a
   Descargar    pago directo
   PDF
```

---

## 10. CREDENCIALES Y CONFIGURACION

### 10.1 Variables de Entorno (.env)

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

# Encriptacion (AES-256)
ENCRYPTION_KEY=...  # 32 bytes hex

# Gmail (para activacion SOI)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# Storage
STORAGE_TYPE=local  # local | vercel-blob | s3
```

### 10.2 Credenciales de Prueba

**Usuario SOI (Prueba)**:
- Documento: 1018482146
- Tipo: CC
- Password: En .env (SOI_PASSWORD)

**Usuario Mi Planilla (Luis Brochet)**:
- Usuario: CC1047484978
- Password: Ulecolombia123

**PSE (Persona Juridica ULE)**:
- Tipo: JURIDICA
- NIT: 9020190314
- Email: ulecolombia@gmail.com

**Bancolombia Negocios**:
- Usuario: Lbrochet01
- Password: [Solo admin - NO automatizar]

### 10.3 Comandos Utiles

```bash
# Desarrollo
npm run dev              # API server
npm run dev:worker       # Worker
npm run dev:all          # Ambos

# Database
npx prisma studio        # UI para ver datos
npx prisma migrate dev   # Aplicar migraciones
npx prisma generate      # Regenerar cliente

# Testing
npx tsx scripts/test-registro-completo.ts
npx tsx scripts/prioridad-1-wizard-soi-completo.ts
npx tsx scripts/prioridad-2a-pse-soi-dryrun.ts

# Deploy
bash ~/ule-rpa/deploy.sh  # En Mac servidor
```

---

## NOTAS IMPORTANTES

1. **Nunca automatizar passwords bancarios** - El bot DEBE detenerse en la pagina del banco.

2. **Usuario Mi Planilla = CC + documento** - Sin espacios, concatenados.

3. **Verificar "Personas incluidas" > 0** antes de generar planilla en Mi Planilla.

4. **AES-256 para passwords** - Todas las contrasenas se guardan encriptadas.

5. **Horario PSE**: Lunes-Viernes 6:30am - 4:30pm Colombia.

6. **Prioridad de operadores**: SOI (preferido) > Mi Planilla (fallback).

7. **Error APO-06002**: Usuario ya existe en SOI → Fallback automatico a Mi Planilla.

---

**Ultima actualizacion**: 2026-03-06
