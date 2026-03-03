# FASE 0: MI PLANILLA - Operador Alternativo

## Resumen

Cuando un usuario no puede registrarse en SOI (error `APO-06002: El aportante a registrar ya existe en el sistema`), el RPA automáticamente lo registra en **Mi Planilla** como operador alternativo.

## Arquitectura del Flujo

```
Usuario se registra en ULE
           │
           ▼
┌─────────────────────────────────┐
│  RPA intenta registrar en SOI   │
└─────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
  ✅ ÉXITO    ❌ ERROR APO-06002
     │        "Ya existe en sistema"
     ▼           │
┌──────────┐     ▼
│ operador │  ┌─────────────────────────────────┐
│  = SOI   │  │  RPA registra en MI PLANILLA    │
└──────────┘  └─────────────────────────────────┘
                         │
                         ▼
                   ┌──────────────┐
                   │   operador   │
                   │= MI_PLANILLA │
                   └──────────────┘
```

## URLs Principales

| Ambiente | URL |
|----------|-----|
| Landing | https://www.miplanilla.com/ |
| Portal Independientes | https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes |
| Registro | https://empresas.miplanilla.com/FSS/RegistroIndependientes |
| Dashboard | https://independientes2.miplanilla.com/PrivadoIndependientes/Principal |
| PSE | https://independientes2.miplanilla.com/pse/go.aspx |

---

## FLUJO 1: REGISTRO DE USUARIO

### Paso 1.1: Landing Page
- **URL**: `https://www.miplanilla.com/`
- **Acción**: Click en botón **"Independiente"**
- **Selector**: `button` o `a` con texto "Independiente"

### Paso 1.2: Portal Independientes
- **URL**: `https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes`
- **Acción 1**: Cerrar popup "Temporada de Cesantías" (si aparece)
  - **Selector**: Botón X en esquina superior derecha del modal
- **Acción 2**: Click en botón **"REGISTRO"** (naranja, arriba derecha)
- **Selector**: `button` o `a` con texto "REGISTRO"

### Paso 1.3: Página de Registro - Documento
- **URL**: `https://empresas.miplanilla.com/FSS/RegistroIndependientes`
- **Campos**:
  | Campo | Tipo | Valor |
  |-------|------|-------|
  | Tipo de documento | Dropdown | "CC-Cédula de Ciudadanía" (default) |
  | Número de documento | Input | `user.documentNumber` |
- **Acción**: Click **"Iniciar Registro"**

### Paso 1.4: Tipo de Aporte
- **URL**: `.../RegistroIndependientes/Preguntas`
- **Pregunta**: "¿Qué tipo de aportes deseas realizar?"
- **Seleccionar**: **"Aporte Propio"**

### Paso 1.5: Tipo de Cotizante
- **Pregunta**: "¿Cuál es tu tipo de cotizante?"
- **Seleccionar**: **"Independiente"** (botón naranja)
- **Acción**: Click **"Continuar"**

### Paso 1.6: Información Básica (Paso 1/3)
- **URL**: `.../RegistroIndependientes/InformacionBasica`
- **Campos**:

| Campo | Tipo | Valor | Notas |
|-------|------|-------|-------|
| Tipo de documento | Dropdown | CC (readonly) | Ya viene seleccionado |
| Número de documento | Input | readonly | Ya viene lleno |
| Primer Nombre | Input | `user.firstName` | |
| Segundo Nombre | Input | `user.middleName` | Opcional |
| Primer Apellido | Input | `user.lastName` | |
| Segundo Apellido | Input | `user.secondLastName` | Opcional |
| Correo Electrónico | Input | `pagos.ule@gmail.com` | Email de ULE |
| Celular | Input | `user.phone` | |
| Teléfono Fijo | Input | `user.phone` | Puede repetir celular |
| Dirección | Input | `user.address` | |
| Ciudad | **Modal autocompletado** | `user.city` | Ver nota abajo |
| Actividad Económica | Dropdown | `9609` (default) | Otras actividades |

**Nota Ciudad**: El campo ciudad abre un modal. Hay que:
1. Click en el campo → Abre modal "Ciudades"
2. Escribir nombre de la ciudad en el input de búsqueda
3. Esperar resultados
4. Click en la opción correcta (formato: "CIUDAD, DEPTO. - CIUDAD DEPTO.")

- **Acción**: Click **"Continuar"**

### Paso 1.7: Información de Aportes (Paso 2/3)
- **URL**: `.../RegistroIndependientes/AportesCotizante`
- **Campos**:

| # | Pregunta | Tipo | Valor ULE |
|---|----------|------|-----------|
| 1 | ¿Te encuentras en el exterior? | Radio | "No, mi ubicación actual es en Colombia" |
| 2 | ¿Estás obligado a cotizar pensión? | Radio | "Sí, debo cotizar a pensión" |
| 3 | ¿Cuáles son tus ingresos mensuales? | Input | `user.ibc` (IBC liquidado) |
| 4 | ¿A cuál EPS te encuentras afiliado? | Dropdown | `user.eps` (código EPS) |
| 5 | ¿A cuál fondo de pensiones...? | Dropdown | `user.afp` (código AFP) |
| 6 | ¿Aportas a riesgos laborales voluntaria? | Radio | **No** |
| 7 | ¿Aportas a cajas compensación voluntaria? | Radio | **No** |
| 8 | ¿Eres trabajador nuevo (novedad ingreso)? | Radio | **No** |

- **Acción**: Click **"Continuar"**

### Paso 1.8: Datos de Usuario (Paso 3/3)
- **URL**: `.../RegistroIndependientes/InformacionUsuario`

**Sección Notificaciones**:
| Pregunta | Valor |
|----------|-------|
| ¿Recibir info vía correo electrónico? | **Sí** |
| ¿Recibir info vía mensaje de texto? | **No** |

**Sección Datos de Acceso** (fondo naranja):
| Campo | Valor | Notas |
|-------|-------|-------|
| Usuario | `CC{documentNumber}` | Automático, NO editable |
| Contraseña | `generatedPassword` | Generar segura |
| Confirmar Contraseña | `generatedPassword` | |

**Requisitos de contraseña**:
- Al menos una letra
- Al menos una mayúscula
- Al menos un número
- Mínimo 8 caracteres

**Aceptaciones**:
| Campo | Valor |
|-------|-------|
| ¿Autorizas tratamiento datos personales? | **Sí** |
| ¿Aceptas términos y condiciones? | **Sí** |

- **Acción**: Click **"Finalizar Registro"**

### Resultado del Registro
- **Usuario creado**: `CC{documentNumber}` (ej: `CC1047484978`)
- **Contraseña**: La generada por el RPA
- **NO requiere activación por email** (a diferencia de SOI)

---

## FLUJO 2: LOGIN

### Paso 2.1: Página de Login
- **URL**: `https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes`
- **Campos**:
  | Campo | Valor |
  |-------|-------|
  | Tipo de documento | CC (dropdown) |
  | Número de documento | `CC{documentNumber}` |
  | Contraseña | `user.miplanillaPassword` |
- **Acción**: Click **"Entrar"**

### Resultado
- Redirige a: `https://independientes2.miplanilla.com/PrivadoIndependientes/Principal`

---

## FLUJO 3: LIQUIDACIÓN DE PLANILLA

### Paso 3.1: Dashboard Principal
- **URL**: `.../PrivadoIndependientes/Principal`
- **Acción**: Click **"Generar nueva planilla"**

### Paso 3.2: Modal ARL (si aparece)
- **Pregunta**: "¿Quieres actualizar ARL?"
- **Acción**: Click **"No, continuar sin actualizar"**
- **Razón**: Independientes no pagan ARL

### Paso 3.3: Tipo de Planilla
- **URL**: `.../Planilla/GenerarPlanilla`
- **Seleccionar**: **"Pagos de mis propios aportes y de mis beneficiarios"**
- **Período**: Seleccionar período actual (ej: "Febrero de 2026")

### Paso 3.4: Modificar Información (IBC)
La planilla se genera automáticamente con el IBC del registro, pero hay que modificarlo al IBC liquidado por el usuario en ULE.

1. En la tabla "Personas incluidas en la planilla", click **"Modificar información"**
2. Scroll hasta **"¿Cuáles son tus ingresos mensuales?"**
3. Cambiar valor a `user.ibcLiquidado` (el IBC de la liquidación ULE)
4. Verificar/actualizar EPS, AFP si es necesario
5. Scroll abajo
6. Click **"Guardar empleado"**
7. Esperar toast verde: "El cotizante... se ha actualizado correctamente"

### Paso 3.5: Generar Planilla
- **Acción**: Click **"Generar Planilla"**
- **Resultado**: Redirige a lista de planillas disponibles

---

## FLUJO 4: PAGO PSE

### Paso 4.1: Planillas Disponibles
- **URL**: `.../Planilla/AdministrarPlanillas`
- **Acción**: Click **"Paga aquí"** en la planilla generada

### Paso 4.2: Resumen de Planilla
- **URL**: `.../Pagos/ResumenPlanilla?idPlanilla=...`
- Muestra desglose por administradora (EPS, AFP)
- **Acción**: Click **"Seleccionar medio de pago"**

### Paso 4.3: Selección Medio de Pago
- **URL**: `.../Pagos/SeleccionOpcionPago?idPlanilla=...`
- **Seleccionar**: **"Pago por PSE"**
- **Acción**: Click **"Seleccionar medio de pago"**

### Paso 4.4: Página PSE
- **URL**: `https://independientes2.miplanilla.com/pse/go.aspx`
- **Campos**:
  | Campo | Valor |
  |-------|-------|
  | Tipo de cliente | "Persona Natural" |
  | Banco | Seleccionar banco del usuario |
- **Acción**: Click **"Continuar con el pago"**

### Paso 4.5: Flujo PSE Bancario
**Idéntico al flujo de SOI** - Reutilizar `pse-session.manager.ts`

1. Redirige al banco (ej: Bancolombia)
2. Usuario ingresa credenciales
3. Usuario aprueba con clave dinámica
4. Retorna a Mi Planilla con confirmación

---

## DIFERENCIAS CLAVE: SOI vs MI PLANILLA

| Aspecto | SOI | Mi Planilla |
|---------|-----|-------------|
| **Usuario** | Email | CC + documento |
| **Formato usuario** | `email@domain.com` | `CC1047484978` |
| **Activación** | Email (Gmail Reader) | Inmediata en página |
| **Gmail Reader** | Requerido | NO necesario |
| **IBC inicial** | Se pone en liquidación | Se pone en registro |
| **Modificar IBC** | En paso 3 de planilla | En "Modificar información" |
| **URL PSE** | `servicio.nuevosoi.com.co` | `independientes2.miplanilla.com/pse/go.aspx` |

---

## ESTRUCTURA DE ARCHIVOS

```
src/bots/miplanilla/
├── registro.bot.ts         # MiPlanillaRegistroBot
├── auth.bot.ts             # MiPlanillaAuthBot
├── liquidacion.bot.ts      # MiPlanillaLiquidacionBot
├── pago.bot.ts             # MiPlanillaPagoBot
├── selectors.ts            # MIPLANILLA_SELECTORS
└── index.ts                # Exports
```

---

## SCHEMA DE BASE DE DATOS

```prisma
model User {
  // ... campos existentes

  // Nuevo campo para operador
  operador        String    @default("SOI") // "SOI" | "MI_PLANILLA"

  // Credenciales Mi Planilla (si aplica)
  miplanillaUser      String?   // CC + documento
  miplanillaPassword  String?   // Encrypted
}
```

---

## SELECTORES CSS (Preliminares)

```typescript
export const MIPLANILLA_SELECTORS = {
  // Landing
  btnIndependiente: 'a[href*="independientes"], button:contains("Independiente")',

  // Portal
  popupClose: '.modal .close, [class*="modal"] button[class*="close"]',
  btnRegistro: 'a[href*="Registro"], button:contains("REGISTRO")',

  // Login
  inputTipoDoc: 'select[name*="tipoDoc"], #tipoDocumento',
  inputNumDoc: 'input[name*="numDoc"], #numeroDocumento',
  inputPassword: 'input[type="password"]',
  btnEntrar: 'button:contains("Entrar"), input[type="submit"]',

  // Registro
  btnIniciarRegistro: 'button:contains("Iniciar Registro")',
  radioAportePropio: 'input[value="propio"], label:contains("Aporte Propio")',
  radioIndependiente: 'input[value="independiente"], label:contains("Independiente")',
  btnContinuar: 'button:contains("Continuar")',

  // Formulario Info Básica
  inputPrimerNombre: 'input[name*="primerNombre"]',
  inputSegundoNombre: 'input[name*="segundoNombre"]',
  inputPrimerApellido: 'input[name*="primerApellido"]',
  inputSegundoApellido: 'input[name*="segundoApellido"]',
  inputEmail: 'input[type="email"], input[name*="correo"]',
  inputCelular: 'input[name*="celular"]',
  inputTelefono: 'input[name*="telefono"]',
  inputDireccion: 'input[name*="direccion"]',
  inputCiudad: 'input[name*="ciudad"]',
  modalCiudades: '.modal:contains("Ciudades")',
  selectActividadEconomica: 'select[name*="actividad"]',

  // Formulario Aportes
  inputIngresos: 'input[name*="ingresos"]',
  selectEps: 'select[name*="eps"]',
  selectAfp: 'select[name*="pension"], select[name*="afp"]',

  // Formulario Usuario
  checkboxEmail: 'input[name*="notificacionEmail"]',
  checkboxSms: 'input[name*="notificacionSms"]',
  inputPasswordReg: 'input[name*="password"]',
  inputPasswordConfirm: 'input[name*="confirmPassword"]',
  checkboxDatos: 'input[name*="datosPersonales"]',
  checkboxTerminos: 'input[name*="terminos"]',
  btnFinalizarRegistro: 'button:contains("Finalizar Registro")',

  // Dashboard
  btnGenerarPlanilla: 'button:contains("Generar nueva planilla"), a:contains("Generar nueva planilla")',

  // Modal ARL
  btnNoActualizarArl: 'button:contains("No, continuar sin actualizar")',

  // Generar Planilla
  radioAportesPropio: 'input[value*="propios"], label:contains("Pagos de mis propios aportes")',
  btnModificarInfo: 'a:contains("Modificar información"), button:contains("Modificar")',
  btnGuardarEmpleado: 'button:contains("Guardar empleado")',
  btnGenerarPlanillaFinal: 'button:contains("Generar Planilla")',

  // Pago
  btnPagarAqui: 'button:contains("Paga aquí"), a:contains("Paga aquí")',
  btnSeleccionarMedioPago: 'button:contains("Seleccionar medio de pago")',
  radioPSE: 'input[value*="pse"], label:contains("Pago por PSE")',

  // PSE
  selectTipoCliente: 'select[name*="tipoCliente"]',
  selectBanco: 'select[name*="banco"]',
  btnContinuarPago: 'button:contains("Continuar con el pago")',
};
```

---

## PRÓXIMOS PASOS

1. [ ] Actualizar schema Prisma con campo `operador`
2. [ ] Crear `src/bots/miplanilla/` estructura
3. [ ] Implementar `MiPlanillaRegistroBot`
4. [ ] Implementar `MiPlanillaAuthBot`
5. [ ] Implementar `MiPlanillaLiquidacionBot`
6. [ ] Implementar `MiPlanillaPagoBot` (reutilizar PSE session manager)
7. [ ] Modificar `SOIRegistroBot` para detectar error APO-06002 y hacer fallback
8. [ ] Agregar tipos en `src/types/miplanilla.types.ts`
