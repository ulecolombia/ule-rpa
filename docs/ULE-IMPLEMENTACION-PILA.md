# GUÍA COMPLETA: Implementación PILA en ULE

> **Documento para el equipo de ULE (Frontend + Backend)**
>
> Fecha: Febrero 2026
> Versión: 1.0

---

## TABLA DE CONTENIDOS

1. [Contexto del Proyecto](#1-contexto-del-proyecto)
2. [Arquitectura General](#2-arquitectura-general)
3. [Principios de Diseño UI/UX](#3-principios-de-diseño-uiux)
4. [Pantallas a Implementar](#4-pantallas-a-implementar)
5. [Estructura de Base de Datos](#5-estructura-de-base-de-datos)
6. [Endpoints API](#6-endpoints-api)
7. [Comunicación con el RPA](#7-comunicación-con-el-rpa)
8. [Cálculos y Fórmulas](#8-cálculos-y-fórmulas)
9. [Manejo de Errores](#9-manejo-de-errores)
10. [Plan de Implementación](#10-plan-de-implementación)

---

## 1. CONTEXTO DEL PROYECTO

### 1.1 ¿Qué es esto?

ULE permite a trabajadores independientes liquidar y pagar su PILA (Planilla Integrada de Liquidación de Aportes) de forma automática. En lugar de que el usuario entre manualmente a SOI (el sistema del gobierno), llene formularios complicados y haga el pago, ULE simplifica todo esto.

### 1.2 ¿Qué es la PILA?

La PILA es el pago mensual obligatorio que todo trabajador (independiente o empleado) debe hacer para:
- **Pensión**: Ahorro para la vejez (AFP como Colpensiones, Porvenir, etc.)
- **Salud**: Cobertura médica (EPS como Sura, Salud Total, etc.)
- **ARL**: Riesgos laborales (opcional para algunos independientes)

### 1.3 ¿Qué es SOI?

SOI (Sistema de Operadores de Información) es el portal web del gobierno donde se liquida y paga la PILA:
- URL: https://www.nuevosoi.com.co/
- Es obligatorio usarlo para pagar la seguridad social
- Tiene formularios complicados y confusos para el usuario promedio

### 1.4 ¿Cómo funciona nuestra solución?

```
FLUJO SIMPLIFICADO:

1. Usuario vincula su cuenta SOI a ULE (una sola vez)
         ↓
2. Usuario indica cuánto quiere cotizar este mes (IBC)
         ↓
3. ULE envía los datos a un RPA (robot)
         ↓
4. El RPA entra a SOI, llena todo automáticamente y genera la planilla
         ↓
5. Usuario paga por PSE (puede ser automático o manual)
         ↓
6. ¡Listo! Planilla pagada
```

### 1.5 ¿Qué es el RPA?

Es un servicio separado (este repositorio: `ule-rpa-service`) que tiene un "robot" (Puppeteer/navegador automatizado) que:
- Entra a SOI con las credenciales del usuario
- Llena los formularios exactamente como lo haría el usuario
- Usa los datos que ULE le envía (NO inventa nada)
- Reporta el resultado a ULE

### 1.6 ¿Qué debe hacer ULE?

1. **Capturar y guardar** las credenciales SOI del usuario (encriptadas)
2. **Mostrar formularios simples** para que el usuario ingrese su información de liquidación
3. **Enviar tareas** al RPA con toda la información necesaria
4. **Mostrar el estado** de la liquidación al usuario
5. **Guardar historial** de pagos

---

## 2. ARQUITECTURA GENERAL

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ULE FRONTEND                                │
│                         (React/Next.js/Mobile)                          │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Vincular   │  │  Liquidar   │  │  Dashboard  │  │  Historial  │    │
│  │  Cuenta SOI │  │    PILA     │  │  Principal  │  │   Pagos     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ API REST
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              ULE BACKEND                                 │
│                          (Node.js/Python/etc)                           │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Auth &    │  │  Gestión    │  │  Cálculos   │  │   Cola de   │    │
│  │ Credenciales│  │ Liquidación │  │    PILA     │  │   Tareas    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        BASE DE DATOS                              │  │
│  │  usuarios_soi | liquidaciones_pila | historial_pagos | bancos    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Cola Redis / API
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           RPA SERVICE                                    │
│                     (ule-rpa-service - Este repo)                       │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Worker    │  │  SOI Auth   │  │  Liquidar   │  │   Pago PSE  │    │
│  │   Queue     │  │    Bot      │  │  Planilla   │  │     Bot     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│                              ↓ Puppeteer                                │
│                     ┌─────────────────────┐                             │
│                     │   Portal SOI        │                             │
│                     │ nuevosoi.com.co     │                             │
│                     └─────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo de Datos Detallado

```
PASO 1: VINCULAR CUENTA SOI (una sola vez)
─────────────────────────────────────────────
Usuario                ULE                    RPA                  SOI
   │                    │                      │                    │
   │──[1] Ingresa ─────▶│                      │                    │
   │    credenciales    │                      │                    │
   │                    │──[2] Verificar ─────▶│                    │
   │                    │     credenciales     │──[3] Login ───────▶│
   │                    │                      │◀──[4] OK + Info ───│
   │                    │◀──[5] Resultado ─────│                    │
   │◀──[6] Cuenta ──────│                      │                    │
   │    vinculada!      │                      │                    │


PASO 2: LIQUIDAR PILA (cada mes)
─────────────────────────────────────────────
Usuario                ULE                    RPA                  SOI
   │                    │                      │                    │
   │──[1] Cuánto ──────▶│                      │                    │
   │    cotizo ($)      │                      │                    │
   │                    │──[2] Calcular ──────▶│                    │
   │◀──[3] Resumen ─────│    (interno)         │                    │
   │    Pensión: $X     │                      │                    │
   │    Salud: $Y       │                      │                    │
   │    Total: $Z       │                      │                    │
   │                    │                      │                    │
   │──[4] Confirmar ───▶│                      │                    │
   │    y pagar         │──[5] Enviar ────────▶│                    │
   │                    │    tarea             │──[6] Login ───────▶│
   │                    │                      │──[7] Llenar ──────▶│
   │                    │                      │    formularios     │
   │                    │                      │──[8] Generar ─────▶│
   │                    │                      │    planilla        │
   │                    │◀──[9] Planilla ──────│◀─── #12345 ────────│
   │                    │    generada          │                    │
   │◀──[10] Ir a ───────│                      │                    │
   │    pagar PSE       │                      │                    │
   │                    │                      │                    │
   │──────────[11] Usuario paga en su banco ──────────────────────▶│
   │                    │                      │                    │
   │◀──[12] Pago ───────│◀────────────────────────────── OK ───────│
   │    confirmado!     │                      │                    │
```

---

## 3. PRINCIPIOS DE DISEÑO UI/UX

### 3.1 Filosofía: "No hagas pensar al usuario"

El usuario promedio:
- **NO sabe** qué es un "IBC" (Ingreso Base de Cotización)
- **NO sabe** qué es un "Tipo Cotizante" o "SubTipo"
- **NO sabe** las tarifas de pensión y salud
- **NO quiere** llenar formularios complicados

El usuario **SÍ sabe**:
- Cuánto gana (o cuánto quiere cotizar)
- Si tuvo alguna novedad (incapacidad, vacaciones, etc.)
- Que quiere pagar su seguridad social sin complicaciones

### 3.2 Principios de Diseño

| Principio | Implementación |
|-----------|----------------|
| **Simplicidad** | Máximo 3 campos por pantalla |
| **Pre-llenado** | Usar valores del mes anterior como default |
| **Lenguaje simple** | "¿Cuánto ganaste?" en lugar de "IBC" |
| **Feedback inmediato** | Mostrar cálculos en tiempo real |
| **Progreso visible** | Indicadores de estado claros |
| **Errores amigables** | Mensajes que expliquen qué hacer |

### 3.3 Vocabulario a Usar

| Término técnico | Término amigable |
|-----------------|------------------|
| IBC | "¿Cuánto ganaste este mes?" |
| Días cotizados | "¿Cuántos días trabajaste?" |
| Novedades | "¿Pasó algo especial este mes?" |
| Tipo cotizante | (No mostrar, es fijo para independientes) |
| AFP | "Tu fondo de pensiones" |
| EPS | "Tu aseguradora de salud" |
| Tarifa | (No mostrar, se calcula automático) |

---

## 4. PANTALLAS A IMPLEMENTAR

### 4.1 Pantalla: Vincular Cuenta SOI

**Ruta:** `/configuracion/vincular-soi` o `/onboarding/soi`

**Cuándo se muestra:**
- Primera vez que el usuario quiere usar la funcionalidad de PILA
- Si las credenciales guardadas ya no funcionan

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [← Volver]                                                     │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       🔗 Conecta tu cuenta de SOI                              │
│                                                                 │
│       Para liquidar tu PILA automáticamente,                   │
│       necesitamos conectar tu cuenta del sistema               │
│       de seguridad social (SOI).                               │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       Tipo de documento                                         │
│       ┌─────────────────────────────────────┐                  │
│       │ Cédula de Ciudadanía            ▼  │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       Número de documento                                       │
│       ┌─────────────────────────────────────┐                  │
│       │                                     │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       Contraseña de SOI                                         │
│       ┌─────────────────────────────────────┐                  │
│       │                                 👁  │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       ℹ️ Esta es la contraseña que usas para                   │
│          entrar a www.nuevosoi.com.co                          │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     🔒 Conectar cuenta              │  ← Botón primario│
│       └─────────────────────────────────────┘                  │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       🔐 Tu información está protegida                         │
│                                                                 │
│       • Tu contraseña se guarda encriptada                     │
│       • Nunca la compartimos con terceros                      │
│       • Puedes desconectar tu cuenta cuando quieras            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Estado: Verificando**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         ⏳                                      │
│                                                                 │
│              Verificando credenciales...                        │
│                                                                 │
│              Esto puede tomar unos segundos.                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Estado: Éxito**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     ✅ ¡Cuenta conectada!                       │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       Encontramos tu información:                               │
│                                                                 │
│       ┌───────────────────────────────────────────────────┐   │
│       │                                                   │   │
│       │  👤 CAMILO ANDRES TORRES SANDOVAL                │   │
│       │  📄 CC 1018482146                                │   │
│       │                                                   │   │
│       │  ─────────────────────────────────────────────   │   │
│       │                                                   │   │
│       │  🏦 Fondo de pensiones                           │   │
│       │     COLPENSIONES                                 │   │
│       │                                                   │   │
│       │  🏥 Aseguradora de salud                         │   │
│       │     SALUD TOTAL                                  │   │
│       │                                                   │   │
│       └───────────────────────────────────────────────────┘   │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     Continuar                       │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Estado: Error**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     ❌ No pudimos conectar                      │
│                                                                 │
│       Las credenciales no son válidas.                         │
│       Verifica tu número de documento y contraseña.            │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     Intentar de nuevo              │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       ¿Olvidaste tu contraseña de SOI?                         │
│       [Recuperar en nuevosoi.com.co →]                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.2 Pantalla: Dashboard Principal

**Ruta:** `/` o `/dashboard`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [Logo ULE]                    👤 Camilo Torres    [≡ Menú]    │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       ¡Hola, Camilo! 👋                                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │   📋 Tu PILA de Febrero 2026                             │ │
│  │                                                           │ │
│  │   ┌─────────────────────────────────────────────────┐   │ │
│  │   │                                                 │   │ │
│  │   │   Estado: ⏳ Pendiente                         │   │ │
│  │   │                                                 │   │ │
│  │   │   Tienes hasta el 15 de marzo para pagar       │   │ │
│  │   │   sin recargos.                                │   │ │
│  │   │                                                 │   │ │
│  │   └─────────────────────────────────────────────────┘   │ │
│  │                                                           │ │
│  │   ┌─────────────────────────────────────────────────┐   │ │
│  │   │         💰 Liquidar y Pagar                     │   │ │
│  │   └─────────────────────────────────────────────────┘   │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       📊 Historial de pagos                                    │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │  Enero 2026                                        │ │
│       │  ✅ Pagado el 18 ene                  $356,400     │ │
│       │                                                     │ │
│       ├─────────────────────────────────────────────────────┤ │
│       │                                                     │ │
│       │  Diciembre 2025                                    │ │
│       │  ✅ Pagado el 20 dic                  $356,400     │ │
│       │                                                     │ │
│       ├─────────────────────────────────────────────────────┤ │
│       │                                                     │ │
│       │  Noviembre 2025                                    │ │
│       │  ✅ Pagado el 15 nov                  $356,400     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│       [Ver todo el historial →]                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Variante: PILA ya pagada este mes**

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│   📋 Tu PILA de Febrero 2026                                 │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │   ✅ ¡Pagada!                                      │   │
│   │                                                     │   │
│   │   Pagaste $712,500 el 22 de febrero               │   │
│   │                                                     │   │
│   │   [📄 Ver comprobante]                             │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

### 4.3 Pantalla: Liquidar PILA (Formulario Principal)

**Ruta:** `/pila/liquidar` o `/pila/nueva`

**Esta es la pantalla MÁS IMPORTANTE. Debe ser SÚPER simple.**

**Mockup - Versión Simple (sin novedades):**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [← Volver]                              Febrero 2026           │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       💰 ¿Cuánto ganaste este mes?                             │
│                                                                 │
│       Este es el valor sobre el cual cotizarás                 │
│       tu pensión y salud.                                       │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │ $  2,500,000                        │  ← Input numérico│
│       └─────────────────────────────────────┘    con formato   │
│                                                                 │
│       Mínimo: $1,423,500 (1 salario mínimo)                    │
│       El mes pasado cotizaste sobre $2,500,000                 │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       📅 ¿Cuántos días trabajaste?                             │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │ 30 días (mes completo)          ▼  │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       Opciones: 30, 29, 28... hasta 1 día                      │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       📋 ¿Tuviste alguna novedad este mes?                     │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │ [ ] Estuve incapacitado                             │ │
│       │ [ ] Tomé vacaciones                                 │ │
│       │ [ ] Empecé a trabajar este mes                      │ │
│       │ [ ] Dejé de trabajar este mes                       │ │
│       │ [ ] Cambié de AFP o EPS                             │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       📊 Resumen de tu pago                                    │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │   Pensión (16%)                       $400,000     │ │
│       │   COLPENSIONES                                     │ │
│       │                                                     │ │
│       │   Salud (12.5%)                       $312,500     │ │
│       │   SALUD TOTAL                                      │ │
│       │                                                     │ │
│       │   ─────────────────────────────────────────────   │ │
│       │                                                     │ │
│       │   TOTAL A PAGAR                       $712,500     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     💳 Continuar al pago            │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       🏦 Pagarás con: Bancolombia          [Cambiar banco]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Mockup - Con novedad seleccionada (incapacidad):**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│       📋 ¿Tuviste alguna novedad este mes?                     │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │ [✓] Estuve incapacitado                             │ │
│       │                                                     │ │
│       │     ┌─────────────────────────────────────────┐    │ │
│       │     │                                         │    │ │
│       │     │  ¿Cuántos días de incapacidad?         │    │ │
│       │     │  ┌───────────────┐                     │    │ │
│       │     │  │ 5             │                     │    │ │
│       │     │  └───────────────┘                     │    │ │
│       │     │                                         │    │ │
│       │     │  ¿Desde qué fecha?                     │    │ │
│       │     │  ┌───────────────┐                     │    │ │
│       │     │  │ 10/02/2026    │  📅               │    │ │
│       │     │  └───────────────┘                     │    │ │
│       │     │                                         │    │ │
│       │     └─────────────────────────────────────────┘    │ │
│       │                                                     │ │
│       │ [ ] Tomé vacaciones                                 │ │
│       │ [ ] Empecé a trabajar este mes                      │ │
│       │ [ ] Dejé de trabajar este mes                       │ │
│       │ [ ] Cambié de AFP o EPS                             │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.4 Pantalla: Procesando Liquidación

**Ruta:** `/pila/procesando/{id}`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                                                                 │
│                         ⏳                                      │
│                                                                 │
│              Estamos liquidando tu PILA...                     │
│                                                                 │
│              Esto puede tomar unos segundos.                   │
│              No cierres esta ventana.                          │
│                                                                 │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │                                     │                  │
│       │  ✓ Conectando con SOI              │                  │
│       │  ✓ Iniciando sesión                │                  │
│       │  ✓ Creando planilla                │                  │
│       │  ◐ Registrando cotización...       │  ← Spinner       │
│       │  ○ Generando número de planilla    │                  │
│       │                                     │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.5 Pantalla: Planilla Lista - Ir a Pagar

**Ruta:** `/pila/pagar/{id}`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     ✅ ¡Planilla lista!                        │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       Tu planilla de Febrero 2026 fue creada                   │
│       exitosamente en SOI.                                      │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │  Número de planilla                                │ │
│       │  4510012345678                                     │ │
│       │                                                     │ │
│       │  ─────────────────────────────────────────────────│ │
│       │                                                     │ │
│       │  Pensión                              $400,000     │ │
│       │  Salud                                $312,500     │ │
│       │  ─────────────────────────────────────────────────│ │
│       │  Total a pagar                        $712,500     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       💳 Completa el pago                                      │
│                                                                 │
│       Al hacer clic serás redirigido a la página               │
│       de tu banco para completar el pago.                      │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │  🏦  Pagar con Bancolombia          │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       ─────────────────────────────────────────────────────    │
│                                                                 │
│       [Pagar después]   [Cambiar banco]                        │
│                                                                 │
│       ⚠️ Recuerda: tienes hasta el 15 del mes siguiente       │
│          para pagar sin recargos.                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.6 Pantalla: Confirmación de Pago

**Ruta:** `/pila/confirmacion/{id}`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                         ✅                                      │
│                                                                 │
│              ¡Tu PILA de Febrero está pagada!                  │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │  📋 Comprobante de pago                            │ │
│       │                                                     │ │
│       │  Período: Febrero 2026                             │ │
│       │  Planilla: 4510012345678                           │ │
│       │  Referencia PSE: PSE-987654321                     │ │
│       │  Fecha de pago: 22 Feb 2026, 11:45 AM              │ │
│       │                                                     │ │
│       │  ─────────────────────────────────────────────────│ │
│       │                                                     │ │
│       │  Pensión (COLPENSIONES)               $400,000     │ │
│       │  Salud (SALUD TOTAL)                  $312,500     │ │
│       │  ─────────────────────────────────────────────────│ │
│       │  Total pagado                         $712,500     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     📄 Descargar comprobante        │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│       ┌─────────────────────────────────────┐                  │
│       │     🏠 Volver al inicio             │                  │
│       └─────────────────────────────────────┘                  │
│                                                                 │
│                                                                 │
│       🎉 ¡Excelente! Ya cumpliste con tu seguridad social     │
│          de este mes.                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.7 Pantalla: Seleccionar Banco PSE

**Ruta:** Modal o `/pila/banco`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │         🏦 Selecciona tu banco                         │   │
│  │                                                         │   │
│  │   ┌───────────────────────────────────────────────┐   │   │
│  │   │ 🔍 Buscar banco...                            │   │   │
│  │   └───────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │   ┌───────────────────────────────────────────────┐   │   │
│  │   │ ○  Bancolombia                                │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  Banco de Bogotá                            │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  Davivienda                                 │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  BBVA                                       │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  Nequi                                      │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  Banco de Occidente                         │   │   │
│  │   ├───────────────────────────────────────────────┤   │   │
│  │   │ ○  AV Villas                                  │   │   │
│  │   └───────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │   ┌─────────────────────────────────────┐              │   │
│  │   │         Confirmar                    │              │   │
│  │   └─────────────────────────────────────┘              │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.8 Pantalla: Historial de Pagos

**Ruta:** `/pila/historial`

**Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [← Volver]                         📊 Historial de pagos      │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│       2026                                                      │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │  Febrero 2026                                      │ │
│       │  ✅ Pagado el 22 feb                  $712,500     │ │
│       │  Planilla: 4510012345678                           │ │
│       │                                        [Ver →]     │ │
│       │                                                     │ │
│       ├─────────────────────────────────────────────────────┤ │
│       │                                                     │ │
│       │  Enero 2026                                        │ │
│       │  ✅ Pagado el 18 ene                  $356,400     │ │
│       │  Planilla: 4510012345677                           │ │
│       │                                        [Ver →]     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│       2025                                                      │
│                                                                 │
│       ┌─────────────────────────────────────────────────────┐ │
│       │                                                     │ │
│       │  Diciembre 2025                                    │ │
│       │  ✅ Pagado el 20 dic                  $356,400     │ │
│       │                                        [Ver →]     │ │
│       │                                                     │ │
│       ├─────────────────────────────────────────────────────┤ │
│       │                                                     │ │
│       │  Noviembre 2025                                    │ │
│       │  ✅ Pagado el 15 nov                  $356,400     │ │
│       │                                        [Ver →]     │ │
│       │                                                     │ │
│       └─────────────────────────────────────────────────────┘ │
│                                                                 │
│       📈 Total pagado en 2026: $1,068,900                      │
│       📈 Total pagado en 2025: $4,276,800                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. ESTRUCTURA DE BASE DE DATOS

### 5.1 Tabla: `usuarios_soi`

Almacena las credenciales SOI vinculadas de cada usuario.

```sql
CREATE TABLE usuarios_soi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Credenciales SOI (encriptadas)
    tipo_documento VARCHAR(5) NOT NULL,      -- 'CC', 'CE', 'NIT', 'PA', 'TI'
    numero_documento VARCHAR(20) NOT NULL,
    password_encrypted TEXT NOT NULL,         -- Encriptado con AES-256

    -- Información del perfil (obtenida de SOI al vincular)
    nombre_completo VARCHAR(200),

    -- AFP (Fondo de pensiones)
    afp_codigo VARCHAR(20),                   -- Ej: "25-14"
    afp_nombre VARCHAR(100),                  -- Ej: "COLPENSIONES"

    -- EPS (Aseguradora de salud)
    eps_codigo VARCHAR(20),                   -- Ej: "EPS002"
    eps_nombre VARCHAR(100),                  -- Ej: "SALUD TOTAL"

    -- ARL (Riesgos laborales - opcional)
    arl_codigo VARCHAR(20),
    arl_nombre VARCHAR(100),

    -- Tipo de cotizante (para independientes normalmente es "3")
    tipo_cotizante VARCHAR(10) DEFAULT '3',

    -- Ubicación (para formularios SOI)
    departamento_codigo VARCHAR(20),
    departamento_nombre VARCHAR(100),
    municipio_codigo VARCHAR(20),
    municipio_nombre VARCHAR(100),

    -- Estado de la vinculación
    verificado BOOLEAN DEFAULT false,
    verificado_at TIMESTAMP,
    ultimo_uso_at TIMESTAMP,
    error_ultimo_uso TEXT,                    -- Si falló el último uso

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id),
    UNIQUE(numero_documento)
);

-- Índices
CREATE INDEX idx_usuarios_soi_user_id ON usuarios_soi(user_id);
CREATE INDEX idx_usuarios_soi_documento ON usuarios_soi(numero_documento);
```

### 5.2 Tabla: `liquidaciones_pila`

Almacena cada liquidación de PILA creada.

```sql
CREATE TABLE liquidaciones_pila (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Período de la liquidación
    periodo_mes INT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
    periodo_anio INT NOT NULL CHECK (periodo_anio >= 2020),

    -- Valores ingresados por el usuario
    ingreso_base DECIMAL(12,2) NOT NULL,      -- Lo que el usuario dijo que gana
    dias_cotizados INT NOT NULL DEFAULT 30 CHECK (dias_cotizados BETWEEN 1 AND 30),

    -- Novedades (estructura flexible en JSON)
    novedades JSONB,
    /*
    Estructura de novedades:
    {
        "incapacidad": {
            "dias": 5,
            "fechaInicio": "2026-02-10",
            "fechaFin": "2026-02-14"
        },
        "vacaciones": {
            "dias": 3,
            "fechaInicio": "2026-02-01",
            "fechaFin": "2026-02-03"
        },
        "ingreso": {
            "fecha": "2026-02-15"
        },
        "retiro": {
            "fecha": "2026-02-20"
        },
        "trasladoAfp": {
            "fecha": "2026-02-01",
            "afpAnterior": "PORVENIR",
            "afpNueva": "COLPENSIONES"
        }
    }
    */

    -- Pensión (calculado/enviado al RPA)
    pension_afp_codigo VARCHAR(20),
    pension_afp_nombre VARCHAR(100),
    pension_dias INT,
    pension_ibc DECIMAL(12,2),
    pension_tarifa DECIMAL(5,4) DEFAULT 0.16,  -- 16%
    pension_valor DECIMAL(12,2),               -- IBC * tarifa

    -- Salud (calculado/enviado al RPA)
    salud_eps_codigo VARCHAR(20),
    salud_eps_nombre VARCHAR(100),
    salud_dias INT,
    salud_ibc DECIMAL(12,2),
    salud_tarifa DECIMAL(5,4) DEFAULT 0.125,   -- 12.5%
    salud_valor DECIMAL(12,2),

    -- ARL (opcional)
    arl_codigo VARCHAR(20),
    arl_nombre VARCHAR(100),
    arl_dias INT,
    arl_ibc DECIMAL(12,2),
    arl_clase_riesgo VARCHAR(5),               -- 'I', 'II', 'III', 'IV', 'V'
    arl_tarifa DECIMAL(5,4),
    arl_valor DECIMAL(12,2),

    -- Total
    total_a_pagar DECIMAL(12,2),

    -- Banco para pago PSE
    banco_pse_codigo VARCHAR(20),
    banco_pse_nombre VARCHAR(100),

    -- Estado de la liquidación
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador',
    /*
    Estados posibles:
    - 'borrador': Usuario está llenando el formulario
    - 'pendiente': Listo para enviar al RPA
    - 'procesando': RPA está trabajando
    - 'liquidada': Planilla creada en SOI, pendiente de pago
    - 'pagando': Usuario en proceso de pago PSE
    - 'pagada': Pago confirmado
    - 'error': Hubo un error (ver error_mensaje)
    - 'cancelada': Usuario canceló
    */

    -- Resultado del RPA
    numero_planilla VARCHAR(50),               -- Número asignado por SOI
    url_pago TEXT,                             -- URL para pagar en PSE
    referencia_pago VARCHAR(50),               -- Referencia del pago PSE

    -- Errores
    error_codigo VARCHAR(50),
    error_mensaje TEXT,
    intentos_rpa INT DEFAULT 0,

    -- Tarea del RPA
    rpa_task_id VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    enviado_rpa_at TIMESTAMP,
    liquidado_at TIMESTAMP,
    pagado_at TIMESTAMP,

    -- Constraints
    UNIQUE(user_id, periodo_mes, periodo_anio)
);

-- Índices
CREATE INDEX idx_liquidaciones_user_id ON liquidaciones_pila(user_id);
CREATE INDEX idx_liquidaciones_periodo ON liquidaciones_pila(periodo_anio, periodo_mes);
CREATE INDEX idx_liquidaciones_estado ON liquidaciones_pila(estado);
CREATE INDEX idx_liquidaciones_rpa_task ON liquidaciones_pila(rpa_task_id);
```

### 5.3 Tabla: `bancos_pse`

Catálogo de bancos disponibles para pago PSE.

```sql
CREATE TABLE bancos_pse (
    codigo VARCHAR(20) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nombre_corto VARCHAR(50),
    logo_url TEXT,
    activo BOOLEAN DEFAULT true,
    orden INT DEFAULT 100                      -- Para ordenar en la UI
);

-- Datos iniciales
INSERT INTO bancos_pse (codigo, nombre, nombre_corto, orden) VALUES
('BANCOLOMBIA', 'Bancolombia S.A.', 'Bancolombia', 1),
('BOGOTA', 'Banco de Bogotá', 'Bogotá', 2),
('DAVIVIENDA', 'Banco Davivienda S.A.', 'Davivienda', 3),
('BBVA', 'BBVA Colombia', 'BBVA', 4),
('POPULAR', 'Banco Popular', 'Popular', 5),
('OCCIDENTE', 'Banco de Occidente', 'Occidente', 6),
('AVVILLAS', 'Banco AV Villas', 'AV Villas', 7),
('NEQUI', 'Nequi', 'Nequi', 8),
('DAVIPLATA', 'Daviplata', 'Daviplata', 9),
('SCOTIABANK', 'Scotiabank Colpatria', 'Scotiabank', 10),
('ITAU', 'Banco Itaú', 'Itaú', 11),
('GNB_SUDAMERIS', 'Banco GNB Sudameris', 'GNB', 12),
('PICHINCHA', 'Banco Pichincha', 'Pichincha', 13),
('AGRARIO', 'Banco Agrario', 'Agrario', 14),
('CAJA_SOCIAL', 'Banco Caja Social', 'Caja Social', 15);
```

### 5.4 Tabla: `configuracion_pila`

Parámetros configurables del sistema.

```sql
CREATE TABLE configuracion_pila (
    clave VARCHAR(50) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales
INSERT INTO configuracion_pila (clave, valor, descripcion) VALUES
('SALARIO_MINIMO_2026', '1423500', 'Salario mínimo mensual 2026'),
('TARIFA_PENSION', '0.16', 'Tarifa de cotización pensión (16%)'),
('TARIFA_SALUD', '0.125', 'Tarifa de cotización salud (12.5%)'),
('TARIFA_ARL_RIESGO_I', '0.00522', 'Tarifa ARL Riesgo I (0.522%)'),
('TARIFA_ARL_RIESGO_II', '0.01044', 'Tarifa ARL Riesgo II (1.044%)'),
('TARIFA_ARL_RIESGO_III', '0.02436', 'Tarifa ARL Riesgo III (2.436%)'),
('TARIFA_ARL_RIESGO_IV', '0.0435', 'Tarifa ARL Riesgo IV (4.35%)'),
('TARIFA_ARL_RIESGO_V', '0.0696', 'Tarifa ARL Riesgo V (6.96%)'),
('FECHA_LIMITE_PAGO_DIA', '15', 'Día límite de pago sin recargo'),
('RPA_TIMEOUT_SEGUNDOS', '120', 'Timeout para tareas del RPA'),
('RPA_MAX_REINTENTOS', '3', 'Máximo de reintentos en caso de error');
```

---

## 6. ENDPOINTS API

### 6.1 Vinculación SOI

#### POST `/api/soi/vincular`

Vincula una cuenta SOI al usuario.

**Request:**
```json
{
    "tipoDocumento": "CC",
    "documento": "1018482146",
    "password": "miPasswordSOI123"
}
```

**Response (éxito):**
```json
{
    "success": true,
    "data": {
        "nombreCompleto": "CAMILO ANDRES TORRES SANDOVAL",
        "tipoDocumento": "CC",
        "documento": "1018482146",
        "afp": {
            "codigo": "25-14",
            "nombre": "COLPENSIONES"
        },
        "eps": {
            "codigo": "EPS002",
            "nombre": "SALUD TOTAL"
        },
        "arl": null,
        "ubicacion": {
            "departamento": "Bogotá D.C.",
            "municipio": "Bogotá"
        }
    }
}
```

**Response (error - credenciales inválidas):**
```json
{
    "success": false,
    "error": {
        "code": "CREDENCIALES_INVALIDAS",
        "message": "No pudimos conectar con tu cuenta SOI. Verifica tu número de documento y contraseña."
    }
}
```

**Response (error - cuenta ya vinculada):**
```json
{
    "success": false,
    "error": {
        "code": "CUENTA_YA_VINCULADA",
        "message": "Esta cuenta SOI ya está vinculada a tu perfil."
    }
}
```

---

#### GET `/api/soi/estado`

Obtiene el estado de vinculación del usuario.

**Response (vinculado):**
```json
{
    "vinculado": true,
    "data": {
        "nombreCompleto": "CAMILO ANDRES TORRES SANDOVAL",
        "tipoDocumento": "CC",
        "documento": "1018482146",
        "afp": {
            "codigo": "25-14",
            "nombre": "COLPENSIONES"
        },
        "eps": {
            "codigo": "EPS002",
            "nombre": "SALUD TOTAL"
        },
        "verificadoEn": "2026-02-20T10:30:00Z",
        "ultimoUso": "2026-02-22T15:45:00Z"
    }
}
```

**Response (no vinculado):**
```json
{
    "vinculado": false,
    "data": null
}
```

---

#### DELETE `/api/soi/desvincular`

Desvincula la cuenta SOI del usuario.

**Response:**
```json
{
    "success": true,
    "message": "Tu cuenta SOI ha sido desvinculada."
}
```

---

### 6.2 Liquidaciones PILA

#### GET `/api/pila/actual`

Obtiene la liquidación del mes actual (o la crea en borrador).

**Response (pendiente de crear):**
```json
{
    "periodo": {
        "mes": 2,
        "mesNombre": "Febrero",
        "anio": 2026
    },
    "estado": "pendiente",
    "liquidacion": null,
    "fechaLimitePago": "2026-03-15",
    "diasRestantes": 21,
    "valoresDefault": {
        "ingresoBase": 2500000,
        "diasCotizados": 30
    }
}
```

**Response (ya creada):**
```json
{
    "periodo": {
        "mes": 2,
        "mesNombre": "Febrero",
        "anio": 2026
    },
    "estado": "pagada",
    "liquidacion": {
        "id": "uuid-123",
        "ingresoBase": 2500000,
        "diasCotizados": 30,
        "pension": {
            "afp": "COLPENSIONES",
            "valor": 400000
        },
        "salud": {
            "eps": "SALUD TOTAL",
            "valor": 312500
        },
        "total": 712500,
        "numeroPlanilla": "4510012345678",
        "pagadoEn": "2026-02-22T11:45:00Z"
    },
    "fechaLimitePago": "2026-03-15",
    "diasRestantes": 21
}
```

---

#### POST `/api/pila/calcular`

Calcula los valores de una liquidación (sin guardar).

**Request:**
```json
{
    "ingresoBase": 2500000,
    "diasCotizados": 30,
    "novedades": null
}
```

**Response:**
```json
{
    "ingresoBase": 2500000,
    "diasCotizados": 30,
    "pension": {
        "afp": "COLPENSIONES",
        "ibc": 2500000,
        "tarifa": 0.16,
        "valor": 400000
    },
    "salud": {
        "eps": "SALUD TOTAL",
        "ibc": 2500000,
        "tarifa": 0.125,
        "valor": 312500
    },
    "total": 712500
}
```

---

#### POST `/api/pila/liquidacion`

Crea una nueva liquidación (en estado borrador o pendiente).

**Request:**
```json
{
    "periodoMes": 2,
    "periodoAnio": 2026,
    "ingresoBase": 2500000,
    "diasCotizados": 30,
    "novedades": null,
    "bancoPse": "BANCOLOMBIA"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid-liquidacion-123",
        "estado": "pendiente",
        "periodo": {
            "mes": 2,
            "anio": 2026
        },
        "resumen": {
            "ingresoBase": 2500000,
            "pensionValor": 400000,
            "saludValor": 312500,
            "totalAPagar": 712500
        }
    }
}
```

---

#### POST `/api/pila/liquidacion/{id}/procesar`

Envía la liquidación al RPA para procesarla en SOI.

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid-liquidacion-123",
        "estado": "procesando",
        "rpaTaskId": "rpa-task-456",
        "mensaje": "Estamos procesando tu liquidación. Esto puede tomar unos segundos."
    }
}
```

---

#### GET `/api/pila/liquidacion/{id}`

Obtiene el estado actual de una liquidación.

**Response (procesando):**
```json
{
    "id": "uuid-liquidacion-123",
    "estado": "procesando",
    "periodo": {
        "mes": 2,
        "mesNombre": "Febrero",
        "anio": 2026
    },
    "progreso": {
        "paso": 3,
        "totalPasos": 5,
        "descripcion": "Registrando cotización..."
    }
}
```

**Response (liquidada - lista para pagar):**
```json
{
    "id": "uuid-liquidacion-123",
    "estado": "liquidada",
    "periodo": {
        "mes": 2,
        "mesNombre": "Febrero",
        "anio": 2026
    },
    "numeroPlanilla": "4510012345678",
    "resumen": {
        "ingresoBase": 2500000,
        "pension": {
            "afp": "COLPENSIONES",
            "valor": 400000
        },
        "salud": {
            "eps": "SALUD TOTAL",
            "valor": 312500
        },
        "total": 712500
    },
    "pago": {
        "banco": "BANCOLOMBIA",
        "urlPago": "https://pse.todo1.com/..."
    }
}
```

**Response (pagada):**
```json
{
    "id": "uuid-liquidacion-123",
    "estado": "pagada",
    "periodo": {
        "mes": 2,
        "mesNombre": "Febrero",
        "anio": 2026
    },
    "numeroPlanilla": "4510012345678",
    "resumen": {
        "pension": { "valor": 400000 },
        "salud": { "valor": 312500 },
        "total": 712500
    },
    "pago": {
        "referencia": "PSE-987654321",
        "fecha": "2026-02-22T11:45:00Z",
        "banco": "BANCOLOMBIA"
    }
}
```

**Response (error):**
```json
{
    "id": "uuid-liquidacion-123",
    "estado": "error",
    "error": {
        "codigo": "SOI_SESION_EXPIRADA",
        "mensaje": "Tu sesión en SOI expiró. Por favor, intenta de nuevo.",
        "puedeReintentar": true
    }
}
```

---

#### GET `/api/pila/historial`

Obtiene el historial de liquidaciones del usuario.

**Query params:**
- `limit`: Número de resultados (default: 12)
- `offset`: Offset para paginación
- `anio`: Filtrar por año

**Response:**
```json
{
    "data": [
        {
            "id": "uuid-1",
            "periodo": {
                "mes": 2,
                "mesNombre": "Febrero",
                "anio": 2026
            },
            "estado": "pagada",
            "total": 712500,
            "fechaPago": "2026-02-22",
            "numeroPlanilla": "4510012345678"
        },
        {
            "id": "uuid-2",
            "periodo": {
                "mes": 1,
                "mesNombre": "Enero",
                "anio": 2026
            },
            "estado": "pagada",
            "total": 356400,
            "fechaPago": "2026-01-18",
            "numeroPlanilla": "4510012345677"
        }
    ],
    "pagination": {
        "total": 15,
        "limit": 12,
        "offset": 0,
        "hasMore": true
    },
    "resumen": {
        "totalPagado2026": 1068900,
        "mesesPagados2026": 2
    }
}
```

---

### 6.3 Bancos PSE

#### GET `/api/bancos`

Obtiene la lista de bancos disponibles para PSE.

**Response:**
```json
{
    "data": [
        { "codigo": "BANCOLOMBIA", "nombre": "Bancolombia", "logoUrl": "..." },
        { "codigo": "BOGOTA", "nombre": "Banco de Bogotá", "logoUrl": "..." },
        { "codigo": "DAVIVIENDA", "nombre": "Davivienda", "logoUrl": "..." },
        { "codigo": "BBVA", "nombre": "BBVA", "logoUrl": "..." },
        { "codigo": "NEQUI", "nombre": "Nequi", "logoUrl": "..." }
    ],
    "bancoDefault": "BANCOLOMBIA"
}
```

---

### 6.4 Webhook del RPA

#### POST `/api/rpa/webhook/resultado`

Endpoint que el RPA llama para reportar el resultado de una tarea.

**Request (éxito):**
```json
{
    "taskId": "rpa-task-456",
    "liquidacionId": "uuid-liquidacion-123",
    "estado": "completado",
    "resultado": {
        "numeroPlanilla": "4510012345678",
        "totalLiquidado": 712500,
        "urlPago": "https://pse.todo1.com/..."
    },
    "timestamp": "2026-02-22T11:40:00Z"
}
```

**Request (error):**
```json
{
    "taskId": "rpa-task-456",
    "liquidacionId": "uuid-liquidacion-123",
    "estado": "error",
    "error": {
        "codigo": "SOI_LOGIN_FAILED",
        "mensaje": "No se pudo iniciar sesión en SOI. Credenciales inválidas o sesión expirada.",
        "puedeReintentar": true,
        "intentos": 1
    },
    "timestamp": "2026-02-22T11:40:00Z"
}
```

**Response:**
```json
{
    "received": true
}
```

---

## 7. COMUNICACIÓN CON EL RPA

### 7.1 Estructura del Mensaje de Tarea

Cuando ULE necesita que el RPA procese una liquidación, envía esta estructura:

```typescript
interface TareaLiquidacionPILA {
    // Identificación
    taskId: string;                    // UUID único de la tarea
    tipo: 'LIQUIDAR_PILA';
    liquidacionId: string;             // ID de la liquidación en ULE

    // Credenciales SOI del usuario (encriptadas)
    credenciales: {
        tipoDocumento: 'CC' | 'CE' | 'NIT';
        documento: string;
        password: string;              // Encriptado, el RPA desencripta
    };

    // Período a liquidar
    periodo: {
        mes: number;                   // 1-12
        anio: number;                  // 2026
    };

    // Datos del cotizante
    cotizante: {
        tipoCotizante: string;         // "3" para independiente
        subTipoCotizante: string;      // "" (vacío) - IMPORTANTE
        departamento: string;          // Código: "37,11"
        municipio: string;             // Código: "1139-11001"
    };

    // Novedades (si aplica)
    novedades: {
        ingreso?: { fecha: string };
        retiro?: { fecha: string };
        incapacidad?: {
            dias: number;
            fechaInicio: string;
            fechaFin: string;
        };
        vacaciones?: { dias: number };
        // ... otras
    } | null;

    // Seguridad Social - IBC
    seguridadSocial: {
        salarioBasico: number;

        pension: {
            administradora: string;    // Código AFP: "224,25-14"
            diasCotizados: number;
            ibc: number;
        };

        salud: {
            administradora: string;    // Código EPS: "126,EPS002"
            diasCotizados: number;
            ibc: number;
        };

        riesgosLaborales?: {
            administradora: string;
            diasCotizados: number;
            ibc: number;
            claseRiesgo: string;
        };
    };

    // Configuración de pago
    pago: {
        banco: string;                 // "BANCOLOMBIA"
        generarUrlPago: boolean;       // true para obtener URL de PSE
    };

    // Callbacks
    webhookUrl: string;                // URL para reportar resultado
}
```

### 7.2 Ejemplo Completo de Mensaje

```json
{
    "taskId": "task-uuid-12345",
    "tipo": "LIQUIDAR_PILA",
    "liquidacionId": "liq-uuid-67890",

    "credenciales": {
        "tipoDocumento": "CC",
        "documento": "1018482146",
        "password": "encrypted:AES256:xxxxxxxxxxxxx"
    },

    "periodo": {
        "mes": 2,
        "anio": 2026
    },

    "cotizante": {
        "tipoCotizante": "3",
        "subTipoCotizante": "",
        "departamento": "37,11",
        "municipio": "1139-11001"
    },

    "novedades": null,

    "seguridadSocial": {
        "salarioBasico": 2500000,

        "pension": {
            "administradora": "224,25-14",
            "diasCotizados": 30,
            "ibc": 2500000
        },

        "salud": {
            "administradora": "126,EPS002",
            "diasCotizados": 30,
            "ibc": 2500000
        }
    },

    "pago": {
        "banco": "BANCOLOMBIA",
        "generarUrlPago": true
    },

    "webhookUrl": "https://api.ule.app/api/rpa/webhook/resultado"
}
```

### 7.3 Métodos de Comunicación

#### Opción A: API REST (Simple)

```typescript
// En el backend de ULE
async function enviarTareaRPA(tarea: TareaLiquidacionPILA) {
    const response = await fetch('https://rpa.ule.app/api/tareas', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RPA_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(tarea)
    });

    return response.json();
}
```

#### Opción B: Cola Redis (Recomendada para producción)

```typescript
// En el backend de ULE
async function enviarTareaRPA(tarea: TareaLiquidacionPILA) {
    // Publicar en cola
    await redis.lpush('rpa:tareas:pila', JSON.stringify(tarea));

    // Guardar estado inicial
    await redis.hset(`rpa:estado:${tarea.taskId}`, {
        estado: 'encolada',
        timestamp: new Date().toISOString()
    });
}

// Escuchar actualizaciones (opcional, además del webhook)
async function escucharResultados(taskId: string) {
    const subscriber = redis.duplicate();
    await subscriber.subscribe(`rpa:resultado:${taskId}`);

    subscriber.on('message', (channel, message) => {
        const resultado = JSON.parse(message);
        // Procesar resultado...
    });
}
```

---

## 8. CÁLCULOS Y FÓRMULAS

### 8.1 Constantes (2026)

```typescript
const CONFIG_PILA_2026 = {
    // Salario mínimo
    SALARIO_MINIMO: 1423500,

    // Tarifas de cotización
    TARIFA_PENSION: 0.16,           // 16%
    TARIFA_SALUD: 0.125,            // 12.5%

    // Tarifas ARL por clase de riesgo
    TARIFA_ARL: {
        'I': 0.00522,               // 0.522%
        'II': 0.01044,              // 1.044%
        'III': 0.02436,             // 2.436%
        'IV': 0.0435,               // 4.35%
        'V': 0.0696                 // 6.96%
    },

    // Días del mes estándar
    DIAS_MES: 30,

    // Fecha límite de pago
    DIA_LIMITE_PAGO: 15             // Del mes siguiente
};
```

### 8.2 Función de Cálculo

```typescript
interface DatosLiquidacion {
    ingresoBase: number;
    diasCotizados: number;
    incluyeArl?: boolean;
    claseRiesgoArl?: 'I' | 'II' | 'III' | 'IV' | 'V';
}

interface ResultadoCalculo {
    ibc: number;
    pension: {
        ibc: number;
        tarifa: number;
        valor: number;
    };
    salud: {
        ibc: number;
        tarifa: number;
        valor: number;
    };
    arl?: {
        ibc: number;
        tarifa: number;
        valor: number;
    };
    total: number;
}

function calcularLiquidacion(datos: DatosLiquidacion): ResultadoCalculo {
    const { SALARIO_MINIMO, TARIFA_PENSION, TARIFA_SALUD, TARIFA_ARL, DIAS_MES } = CONFIG_PILA_2026;

    // 1. Validar IBC mínimo (no puede ser menor al salario mínimo)
    const ibcBase = Math.max(datos.ingresoBase, SALARIO_MINIMO);

    // 2. Calcular IBC proporcional si no es mes completo
    const ibcProporcional = datos.diasCotizados < DIAS_MES
        ? Math.round((ibcBase / DIAS_MES) * datos.diasCotizados)
        : ibcBase;

    // 3. Calcular pensión
    const pensionValor = Math.round(ibcProporcional * TARIFA_PENSION);

    // 4. Calcular salud
    const saludValor = Math.round(ibcProporcional * TARIFA_SALUD);

    // 5. Calcular ARL (si aplica)
    let arlValor = 0;
    let arlTarifa = 0;
    if (datos.incluyeArl && datos.claseRiesgoArl) {
        arlTarifa = TARIFA_ARL[datos.claseRiesgoArl];
        arlValor = Math.round(ibcProporcional * arlTarifa);
    }

    // 6. Total
    const total = pensionValor + saludValor + arlValor;

    return {
        ibc: ibcProporcional,
        pension: {
            ibc: ibcProporcional,
            tarifa: TARIFA_PENSION,
            valor: pensionValor
        },
        salud: {
            ibc: ibcProporcional,
            tarifa: TARIFA_SALUD,
            valor: saludValor
        },
        ...(datos.incluyeArl && {
            arl: {
                ibc: ibcProporcional,
                tarifa: arlTarifa,
                valor: arlValor
            }
        }),
        total
    };
}
```

### 8.3 Ejemplos de Cálculo

```typescript
// Ejemplo 1: Mes completo con salario mínimo
calcularLiquidacion({
    ingresoBase: 1423500,
    diasCotizados: 30
});
// Resultado:
// {
//     ibc: 1423500,
//     pension: { ibc: 1423500, tarifa: 0.16, valor: 227760 },
//     salud: { ibc: 1423500, tarifa: 0.125, valor: 177938 },
//     total: 405698
// }

// Ejemplo 2: Mes completo con $2.5M
calcularLiquidacion({
    ingresoBase: 2500000,
    diasCotizados: 30
});
// Resultado:
// {
//     ibc: 2500000,
//     pension: { ibc: 2500000, tarifa: 0.16, valor: 400000 },
//     salud: { ibc: 2500000, tarifa: 0.125, valor: 312500 },
//     total: 712500
// }

// Ejemplo 3: Solo 15 días trabajados
calcularLiquidacion({
    ingresoBase: 2500000,
    diasCotizados: 15
});
// Resultado:
// {
//     ibc: 1250000,  // Proporcional
//     pension: { ibc: 1250000, tarifa: 0.16, valor: 200000 },
//     salud: { ibc: 1250000, tarifa: 0.125, valor: 156250 },
//     total: 356250
// }
```

---

## 9. MANEJO DE ERRORES

### 9.1 Códigos de Error

| Código | Descripción | Acción UI |
|--------|-------------|-----------|
| `CREDENCIALES_INVALIDAS` | Password o documento incorrecto | Pedir que verifique datos |
| `CUENTA_YA_VINCULADA` | Ya existe vinculación | Mostrar cuenta existente |
| `SOI_NO_DISPONIBLE` | SOI está caído | Mostrar mensaje de espera |
| `SOI_SESION_EXPIRADA` | Sesión expiró durante proceso | Botón de reintentar |
| `IBC_MENOR_MINIMO` | IBC menor al salario mínimo | Corregir valor |
| `PERIODO_YA_LIQUIDADO` | Ya existe planilla del período | Mostrar planilla existente |
| `RPA_TIMEOUT` | El proceso tardó demasiado | Botón de reintentar |
| `PAGO_RECHAZADO` | Banco rechazó el pago | Intentar con otro banco |

### 9.2 Mensajes Amigables

```typescript
const MENSAJES_ERROR = {
    CREDENCIALES_INVALIDAS: {
        titulo: "No pudimos conectar",
        mensaje: "Verifica tu número de documento y contraseña de SOI.",
        accion: "Intentar de nuevo"
    },
    SOI_NO_DISPONIBLE: {
        titulo: "SOI no disponible",
        mensaje: "El sistema de seguridad social está presentando problemas. Por favor intenta en unos minutos.",
        accion: "Intentar más tarde"
    },
    SOI_SESION_EXPIRADA: {
        titulo: "Sesión expirada",
        mensaje: "Tu sesión expiró. No te preocupes, puedes intentar de nuevo.",
        accion: "Reintentar"
    },
    RPA_TIMEOUT: {
        titulo: "Tardó más de lo esperado",
        mensaje: "El proceso está tomando más tiempo de lo normal. ¿Quieres intentar de nuevo?",
        accion: "Reintentar"
    },
    PERIODO_YA_LIQUIDADO: {
        titulo: "Ya tienes planilla",
        mensaje: "Ya creaste una planilla para este mes. Puedes verla en tu historial.",
        accion: "Ver planilla"
    }
};
```

---

## 10. PLAN DE IMPLEMENTACIÓN

### Fase 1: Fundamentos (Semana 1)

- [ ] Crear tablas en base de datos
- [ ] Implementar encriptación de credenciales
- [ ] Crear endpoint POST `/api/soi/vincular`
- [ ] Crear endpoint GET `/api/soi/estado`
- [ ] Integrar con RPA para verificar credenciales

### Fase 2: Formulario de Vinculación (Semana 2)

- [ ] Crear pantalla de vinculación SOI
- [ ] Implementar flujo de verificación con loading
- [ ] Pantalla de éxito con datos del perfil
- [ ] Manejo de errores en UI

### Fase 3: Dashboard y Liquidación (Semana 3)

- [ ] Crear dashboard principal
- [ ] Crear formulario de liquidación simple
- [ ] Implementar cálculos en tiempo real
- [ ] Crear endpoint POST `/api/pila/liquidacion`
- [ ] Crear endpoint POST `/api/pila/liquidacion/{id}/procesar`

### Fase 4: Integración RPA (Semana 4)

- [ ] Implementar envío de tareas al RPA
- [ ] Crear pantalla de "procesando"
- [ ] Implementar webhook de resultados
- [ ] Crear pantalla de planilla lista
- [ ] Integrar redirección a PSE

### Fase 5: Historial y Pulido (Semana 5)

- [ ] Crear pantalla de historial
- [ ] Implementar manejo de novedades
- [ ] Agregar validaciones completas
- [ ] Manejo de errores robusto
- [ ] Testing end-to-end

### Fase 6: Producción (Semana 6)

- [ ] Pruebas con usuarios reales
- [ ] Monitoreo y alertas
- [ ] Documentación final
- [ ] Deploy a producción

---

## NOTAS FINALES

### Puntos Críticos

1. **Seguridad de credenciales**: Las contraseñas SOI DEBEN estar encriptadas con AES-256 o similar. Nunca en texto plano.

2. **SubTipo de cotizante**: SIEMPRE dejarlo vacío (`""`) para independientes. El sistema SOI usa automáticamente el valor correcto de BDUA.

3. **IBC mínimo**: Validar que el ingreso base nunca sea menor al salario mínimo vigente.

4. **Timeout del RPA**: Las tareas del RPA pueden tardar 30-60 segundos. La UI debe manejar esto con feedback visual.

5. **Reintentos**: Si el RPA falla, permitir hasta 3 reintentos automáticos antes de mostrar error al usuario.

### Contacto con el Equipo RPA

Para cualquier duda sobre la integración con el RPA, los selectores de SOI, o la estructura de mensajes, el código fuente está en:

```
ule-rpa-service/
├── docs/SOI-CREAR-PLANILLA-SELECTORS.md  # Documentación de selectores
├── src/types/soi-planilla.types.ts       # Tipos TypeScript
└── src/bots/soi/                         # Bots de SOI
```

---

**Documento generado el 22 de Febrero de 2026**
**Versión: 1.0**
