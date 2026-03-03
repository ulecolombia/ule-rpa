# SOI Crear Planilla - Selectores y Flujo

## Resumen del Flujo

El proceso de crear una planilla en SOI para un independiente tiene el siguiente flujo:

### 1. Planilla Principal (4 pasos)
URL: `servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do`

| Paso | Nombre | URL |
|------|--------|-----|
| 1 | Información Básica | `inicioPlanillaEnLinea.do` |
| 2 | Información Detallada | `planillaEnLineaPaso1.do?Siguiente=Siguiente` |
| 3 | Validación Afiliación | `planillaEnLineaPaso2.do` |
| 4 | Liquidación General | `planillaEnLineaPaso3.do` |

### 2. Agregar Cotizante (5 pasos - Popup)
URL: `servicio.nuevosoi.com.co/soi/ingresarCotizante.do`

| Paso | Nombre | URL |
|------|--------|-----|
| 1 | Información Básica | `ingresarCotizante.do` → `informacionBasica.do` |
| 2 | Novedades | `novedades.do` |
| 3 | **Seguridad Social** | `seguridadSocial.do` ← **IBC AQUÍ** |
| 4 | Parafiscales | `parafiscales.do` |
| 5 | Resumen | `resumen.do` |

---

## Selectores - Planilla Principal

### Paso 1 - Información Básica del Aportante

```typescript
const PLANILLA_PASO1 = {
  // Form
  form: 'planillaEnLineaPaso1Form',

  // Selects (pre-llenados para independiente)
  tipoAportante: 'select[name="tipoAportante"]',  // 02-INDEPENDIENTE
  claseAportante: 'select[name="claseAportante"]', // I-INDEPENDIENTE
  formaPresent: 'select[name="formaPresent"]',     // ÚNICO
  arl: 'select[name="arl"]',                       // 14-11 - ARL SURA
  cajaCompensacion: '#cajaCompensacion',           // SELECCIONE o caja específica

  // Periodo de Liquidación
  periodoMes: '#periodoLiquidacionMes',
  periodoAnnio: '#periodoLiquidacionAnnio',

  // Exonerado parafiscales
  exoneradoSalud: 'select[name="exoneradoSalud"]',
  exoneradoICBF: 'select[name="exoneradoICBF"]',

  // Tipo Planilla
  tipoPlanilla: 'select[name="tipoPlanilla"]',     // I-INDEPENDIENTES

  // Botones
  siguiente: '#siguiente2',
  guardar: '#guardar2',
};
```

### Paso 2 - Información Detallada (Cotizantes)

```typescript
const PLANILLA_PASO2 = {
  // Form
  form: 'formPlanillaEnLineaPaso2',

  // Agregar cotizante (abre popup)
  agregarCotizante: 'a:contains("Agregar cotizante")', // o onclick="agregarCotizante()"

  // Buscar cotizante
  buscarDocumento: '#consultarCzte',
  btnBuscar: '#consultarCzteAll',

  // Tabla de cotizantes
  tablaCotizantes: '#CrearPlanilla',
  checkboxCotizante: 'input[name="seleccionado"]',

  // Botones
  guardar: '#guardar2',
  anterior: '#anterior2',
  siguiente: '#siguiente2',
  eliminar: '#eliminarLink',
};
```

---

## Selectores - Agregar Cotizante (Popup)

### Paso 1 - Información Básica del Cotizante

```typescript
const COTIZANTE_PASO1 = {
  // Form
  form: 'informacionBasica',

  // Identificación
  tipoDocumento: 'select[name="tipoIdentificacionCotizante"]', // 1,CC
  numeroDocumento: 'input[name="numeroIdentificacionCotizante"]',

  // Nombres
  primerNombre: 'input[name="primerNombreCotizante"]',
  segundoNombre: 'input[name="segundoNombreCotizante"]',
  primerApellido: 'input[name="primerApellidoCotizante"]',
  segundoApellido: 'input[name="segundoApellidoCotizante"]',

  // Clasificación
  tipoCotizante: 'select[name="tipoCotizante"]',
  // Valores típicos:
  // - "3" = 3-INDEPENDIENTE
  // - "1" = 1-DEPENDIENTE

  subTipoCotizante: 'select[name="subTipoCotizante"]',
  // Depende del tipoCotizante seleccionado
  // Para independiente común: "00" o primer opción disponible

  exoneradoParafiscales: 'select[name="exoneradoParafiscales"]', // "no"

  // Colombiano exterior
  colombianoExterior: 'input[name="colombianoResidenteExterior"]',
  fechaExterior: 'input[name="fechaColResidenteExterior"]',

  // Extranjero
  extranjeroNoObligado: 'input[name="extrajeroNoObligado"]',

  // Ubicación
  departamento: 'select[name="departamento"]',
  municipio: 'select[name="municipio"]',

  // Navegación
  siguiente: '#siguiente2',
};
```

### Paso 2 - Novedades

```typescript
const COTIZANTE_PASO2_NOVEDADES = {
  // Aquí se configuran novedades como:
  // - Ingreso/Retiro
  // - Incapacidades
  // - Licencias
  // - Variación de salario

  siguiente: 'input[value="Siguiente"]',
  anterior: 'input[value="Anterior"]',
};
```

### Paso 3 - Seguridad Social (IBC) ⭐ VERIFICADO

**IMPORTANTE**: Este paso contiene los campos de IBC (confirmado 2026-02-22)

```typescript
const COTIZANTE_PASO3_SEGURIDAD_SOCIAL = {
  // ====== SALARIO ======
  salarioBasico: 'input#sarioBasico',  // NOTA: el campo tiene typo "sarioBasico" no "salarioBasico"

  // ====== PENSIÓN ======
  administradoraPension: 'select#administradoraPension',  // AFP (ej: COLPENSIONES = "224,25-14")
  numeroDiasCotizadosPension: 'input#numeroDiasCotizadosPension',  // Días (ej: 30)
  ibcPension: 'input#ibcPension',  // ⭐ IBC PENSIÓN
  tarifaPension: 'select#tarifaPension',  // Tarifa % (ej: 16%)
  totalCotizacionPension: 'input#totalCotizacionPension',  // Calculado
  tarifaIndicadorEspecial: 'select#tarifaIndicadorEspecial',  // Default: -1

  // ====== SALUD ======
  administradoraSalud: 'select#administradoraSalud',  // EPS (ej: SALUD TOTAL = "126,EPS002")
  numeroDiasCotizadosSalud: 'input#numeroDiasCotizadosSalud',  // Días (ej: 30)
  ibcSalud: 'input#ibcSalud',  // ⭐ IBC SALUD
  tarifaSalud: 'select#tarifaSalud',  // Tarifa % (ej: 12.5%)
  totalCotizacionSalud: 'input#totalCotizacionSalud',  // Calculado

  // ====== NAVEGACIÓN ======
  siguiente: 'input#siguiente2',
  anterior: 'input#anterior2',
};

// Campos IBC resumidos para referencia rápida
const IBC_FIELDS = {
  salarioBasico: 'sarioBasico',           // Salario base
  ibcPension: 'ibcPension',               // IBC para pensión
  ibcSalud: 'ibcSalud',                   // IBC para salud
  diasPension: 'numeroDiasCotizadosPension',
  diasSalud: 'numeroDiasCotizadosSalud',
};
```

### Paso 4 - Parafiscales

```typescript
const COTIZANTE_PASO4_PARAFISCALES = {
  // SENA, ICBF, Caja Compensación
  // Generalmente calculados automáticamente basados en IBC

  siguiente: 'input[value="Siguiente"]',
  anterior: 'input[value="Anterior"]',
};
```

### Paso 5 - Resumen

```typescript
const COTIZANTE_PASO5_RESUMEN = {
  // Muestra resumen de todos los valores
  // Botón para guardar/confirmar cotizante

  guardar: 'input[value="Guardar"]',
  anterior: 'input[value="Anterior"]',
};
```

---

## Flujo Completo de Creación de Planilla

```
1. Login como usuario independiente
   ↓
2. Click "Deseo liquidar una planilla"
   ↓
3. Paso 1: Verificar/ajustar datos del aportante
   - Seleccionar periodo (mes/año)
   - Click "Siguiente"
   ↓
4. Paso 2: Agregar cotizante(s)
   - Click "Agregar cotizante" → Abre POPUP
   ↓
   ┌─────────────────────────────────────┐
   │ POPUP: Agregar Cotizante (5 pasos) │
   │                                     │
   │ 4a. Paso 1: Datos básicos           │
   │     - Documento, nombres            │
   │     - Tipo/subtipo cotizante        │
   │     - Ubicación                     │
   │                                     │
   │ 4b. Paso 2: Novedades               │
   │     - Configurar si hay novedades   │
   │                                     │
   │ 4c. Paso 3: Seguridad Social ★      │
   │     - IBC Pensión                   │
   │     - IBC Salud                     │
   │     - IBC ARL                       │
   │     - Días cotizados                │
   │                                     │
   │ 4d. Paso 4: Parafiscales            │
   │     - SENA, ICBF, Caja              │
   │                                     │
   │ 4e. Paso 5: Resumen                 │
   │     - Confirmar y guardar           │
   └─────────────────────────────────────┘
   ↓
5. Paso 3: Validación Afiliación
   - Sistema valida datos vs BDUA
   ↓
6. Paso 4: Liquidación General
   - Ver totales calculados
   - Guardar planilla
   ↓
7. Pagar planilla (PSE)
```

---

## Valores para Independiente Típico

```typescript
const INDEPENDIENTE_DEFAULTS = {
  // Tipo Aportante
  tipoAportante: '02-INDEPENDIENTE',
  claseAportante: 'I-INDEPENDIENTE',
  formaPresent: 'ÚNICO',
  tipoPlanilla: 'I-INDEPENDIENTES',

  // Cotizante
  tipoCotizante: '3', // 3-INDEPENDIENTE
  subTipoCotizante: '00', // Sin subtipo específico (depende del cotizante)

  // IBC mínimo 2026 (ejemplo)
  salarioMinimo: 1300000,
  ibcMinimo: 1300000, // Para independientes, IBC mínimo = salario mínimo

  // Tarifas 2026 (ejemplo)
  tarifaPension: 16,    // 16%
  tarifaSalud: 12.5,    // 12.5%
  tarifaARL: 0.522,     // Depende del nivel de riesgo (I-V)

  // Días
  diasMesCompleto: 30,
};
```

---

## Notas Importantes

1. **SubTipo de Cotizante**: ⚠️ **IMPORTANTE**
   - Para independientes, **DEJAR EL SUBTIPO EN BLANCO** ("SELECCIONE")
   - NO seleccionar un subtipo manualmente
   - Error común si se selecciona: `PLA-13012: El subtipo de cotizante que seleccionaste, no es válido para el cotizante CC-XXX`
   - El sistema usa el subtipo correcto de BDUA automáticamente

2. **IBC**: El Ingreso Base de Cotización para independientes debe ser al menos el salario mínimo mensual.

3. **Días cotizados**: Normalmente 30 para mes completo.

4. **Popup de Cotizante**: Se abre con `window.open()`, necesita manejo especial en Puppeteer:
   ```typescript
   // Capturar popup
   browser.on('targetcreated', async (target) => {
     if (target.type() === 'page') {
       const popup = await target.page();
       // Trabajar con el popup...
     }
   });
   ```

5. **CSRF Token**: Todas las acciones requieren `csrfPreventionSalt` válido.

6. **Typo en campo**: El campo de salario tiene un typo en el name/id: `sarioBasico` (falta la 'l' de salario).

7. **Flujo correcto para agregar cotizante**:
   - Paso 1: Llenar documento → esperar BDUA → Seleccionar tipo cotizante (3-INDEPENDIENTE) → **NO tocar subtipo** → Llenar ubicación
   - Paso 2: Novedades (usualmente skip)
   - Paso 3: IBC (salario, pensión, salud)
   - Paso 4: Parafiscales
   - Paso 5: Guardar
