# ULE RPA Service - Domain Knowledge

## Colombian Social Security System (PILA)

### What is PILA?
**PILA** = Planilla Integrada de Liquidación de Aportes (Integrated Contribution Payment Slip)

A mandatory monthly payment system where all workers in Colombia contribute to:
- **Salud** (Health insurance - EPS)
- **Pensión** (Pension fund - AFP)
- **ARL** (Occupational hazards insurance)
- **Parafiscales** (Optional: SENA, ICBF, Caja Compensación - only for employees)

### Who Must Pay?
- **Independent Workers** (trabajadores independientes): ULE's target users
- **Employees**: Employer pays, but employee contributes portion
- **Companies**: Pay for their employees

### Payment Deadline
**First 10 business days** of the following month

Example:
- January contributions → Deadline: February 10
- February contributions → Deadline: March 10

**Late payments** incur penalties and interest.

---

## PILA Contribution Calculation

### Base Concepts

**IBC** (Ingreso Base de Cotización) = Base income for contribution calculation
- **Minimum IBC**: 1 SMLMV (Salario Mínimo Legal Mensual Vigente)
- **Maximum IBC**: 25 SMLMV
- **2025 SMLMV**: $1,423,500 COP

### Contribution Rates

#### 1. Salud (Health)
**Rate**: 12.5% of IBC

Split:
- **Independent Worker**: Pays 100% (12.5%)
- **Employee**: Employee pays 4%, Employer pays 8.5%

**Example**:
- IBC: $2,000,000
- Salud: $2,000,000 × 12.5% = $250,000

#### 2. Pensión (Pension)
**Rate**: 16% of IBC

Split:
- **Independent Worker**: Pays 100% (16%)
- **Employee**: Employee pays 4%, Employer pays 12%

**Additional**:
- **Solidarity Fund** (Fondo de Solidaridad): Additional 1-2% for IBC > 4 SMLMV

**Example**:
- IBC: $2,000,000
- Pensión: $2,000,000 × 16% = $320,000

#### 3. ARL (Occupational Hazards)
**Rate**: Varies by risk level (0.522% to 6.96%)

Risk Levels:
- **Level I** (Minimal risk): 0.522% - Office workers
- **Level II** (Low risk): 1.044%
- **Level III** (Medium risk): 2.436%
- **Level IV** (High risk): 4.350%
- **Level V** (Maximum risk): 6.960% - Construction, mining

**Independent Worker**: Pays 100%

**Example** (Level I):
- IBC: $2,000,000
- ARL: $2,000,000 × 0.522% = $10,440

### Total Monthly Contribution (Independent Worker)

**Formula**:
```
Total = (IBC × 12.5%) + (IBC × 16%) + (IBC × ARL_rate)
Total = IBC × (28.5% + ARL_rate)
```

**Example** (IBC: $2,000,000, ARL Level I):
- Salud: $250,000
- Pensión: $320,000
- ARL: $10,440
- **Total: $580,440**

---

## Cotización Days (Días Cotizados)

### What are Días Cotizados?
Number of days worked/contributed in the month

### Rules:
- **Minimum**: 1 day
- **Maximum**: 30 days (even for months with 31 days)
- **Proportional payment**: Can pay for fewer days if worked less

### Examples:
- Worked full month: 30 days
- Worked 15 days: 15 days
- Started mid-month: Count from start date to end of month

### Calculation with Days:
```
Proportional IBC = (IBC / 30) × días_cotizados
Salud = Proportional IBC × 12.5%
Pensión = Proportional IBC × 16%
ARL = Proportional IBC × ARL_rate
```

**Example** (15 days):
- IBC: $2,000,000
- Days: 15
- Proportional IBC: ($2,000,000 / 30) × 15 = $1,000,000
- Salud: $1,000,000 × 12.5% = $125,000
- Pensión: $1,000,000 × 16% = $160,000
- ARL: $1,000,000 × 0.522% = $5,220
- **Total: $290,220**

---

## Colombian Document Types

### Cédula de Ciudadanía (CC)
- **Most common**: Colombian national ID
- **Format**: 6-10 digits
- **Example**: 1234567890

### Cédula de Extranjería (CE)
- **Foreign residents** in Colombia
- **Format**: 6-7 digits
- **Example**: 123456

### Tarjeta de Identidad (TI)
- **Minors** under 18
- **Format**: 10-11 digits

### NIT (Número de Identificación Tributaria)
- **Companies** and legal entities
- **Format**: 9 digits + verification digit
- **Example**: 900123456-7

### Pasaporte (Passport)
- **Foreign visitors** without CE
- **Format**: Alphanumeric

---

## EPS (Entidades Promotoras de Salud)

### Major EPS in Colombia:
1. **SURA** (formerly EPS SURA)
2. **Sanitas**
3. **Salud Total**
4. **Compensar**
5. **Famisanar**
6. **Nueva EPS**
7. **Coomeva**
8. **Medimás**
9. **Aliansalud**
10. **SOS**

### EPS Code Format:
- Each EPS has a unique code (e.g., "EPS001" for SURA)
- Used in PILA planilla to identify health insurer

---

## Pension Funds (AFP/Fondos de Pensión)

### Major Pension Funds:
1. **Porvenir**
2. **Protección**
3. **Colfondos**
4. **Old Mutual** (Skandia)

### Public System:
- **Colpensiones** (formerly ISS)
- Government-managed pension fund

### Fund Code Format:
- Each fund has unique code
- Used in PILA to route pension contributions

---

## ARL (Administradoras de Riesgos Laborales)

### Major ARL in Colombia:
1. **SURA** (largest)
2. **Positiva**
3. **Bolívar**
4. **Colmena**
5. **Liberty**
6. **AXA Colpatria**

### ARL Responsibilities:
- Occupational accident coverage
- Disability coverage
- Prevention programs
- Workplace safety training

---

## Enlace Operativo Platform

### What is Enlace Operativo?
**Official platform** for processing PILA payments through authorized operators

**Website**: https://suaporte.com.co

### Key Features:
1. **Aportante Registration** (Contributors)
2. **PILA Liquidation** (Contribution calculation)
3. **Payment Processing**
4. **Comprobante Download** (Receipts)
5. **Payment History**

### User Types:
- **Operadores**: Authorized operators (like ULE)
- **Aportantes**: Individual contributors
- **Empresas**: Companies

---

## Enlace Workflow for Independent Workers

### Step 1: Operador Registration
- Operator (ULE) creates account in Enlace
- Obtains credentials (username + password)
- Gets authorization to manage aportantes

### Step 2: Aportante Registration
- Operator registers independent worker
- Required data:
  - Tipo documento (CC, CE, etc.)
  - Número documento
  - Nombre completo
  - Email
  - Teléfono
  - Dirección
  - Ciudad
  - EPS code
  - Fondo de Pensión code
  - ARL code

### Step 3: Monthly Liquidation
- Operator enters contribution data:
  - IBC (Ingreso Base de Cotización)
  - Días cotizados
  - EPS
  - Fondo de Pensión
  - ARL
  - Nivel de riesgo (ARL)

- System calculates:
  - Valor Salud
  - Valor Pensión
  - Valor ARL
  - **Valor Total**

- System generates:
  - **Número de Planilla** (unique payment slip number)
  - **Fecha límite de pago** (payment deadline)

### Step 4: Payment
- User pays via PSE (Colombian online bank transfer)
- Or via other authorized payment methods

### Step 5: Comprobante Download
- After payment, download PDF receipt
- PDF contains:
  - Número de planilla
  - Worker data
  - Contribution breakdown
  - Payment date
  - Bank authorization

---

## PILA Planilla Number Format

### Structure:
```
XXXX-XXXXXXXX-X
```

**Example**: `1234-56789012-3`

- **First 4 digits**: Operator code
- **Next 8 digits**: Sequential number
- **Last digit**: Verification digit

### Uniqueness:
- Each planilla number is unique
- Used to track payment across all systems
- Required for comprobante download

---

## Business Rules Implemented in Bots

### Registration Rules
1. **Duplicate Check**: MUST search before registering
2. **Minimum Data**: `tipoDocumento`, `numeroDocumento`, `nombre` are required
3. **Document Validation**: numeroDocumento must be at least 6 characters
4. **Email Validation**: Must contain '@' if provided
5. **Phone Validation**: Must be at least 7 digits if provided
6. **EPS/Pension/ARL**: Optional but recommended for complete profile

### Liquidation Rules
1. **User Exists**: User MUST exist in Enlace before liquidation
2. **IBC Minimum**: IBC ≥ 1 SMLMV ($1,423,500 in 2025)
3. **IBC Maximum**: IBC ≤ 25 SMLMV
4. **Days Range**: 1 ≤ días ≤ 30
5. **Calculation**: System auto-calculates based on IBC + days + rates
6. **Planilla Generation**: System assigns unique planilla number
7. **Deadline**: System calculates payment deadline (10th of next month)

### Comprobante Rules
1. **Payment Required**: Can only download after payment is processed
2. **Planilla Number**: Must have valid planilla number
3. **PDF Format**: Comprobante is always PDF
4. **Storage**: Store with naming: `comprobante-{planilla}-{periodo}.pdf`

---

## ULE Business Logic

### ULE Platform Role
ULE is a **facilitator platform** for Colombian independent workers

**Services**:
1. **User Management**: Register workers
2. **PILA Automation**: Calculate and submit contributions
3. **Payment Processing**: Handle PSE payments
4. **Receipt Management**: Store and provide comprobantes
5. **Reminders**: Send payment deadline notifications

### ULE → Enlace Integration Flow
```
ULE User signs up
     ↓
ULE creates user in database (uleUserId)
     ↓
RPA Bot registers user in Enlace (get enlaceUserId)
     ↓
Link uleUserId ↔ enlaceUserId in database
     ↓
Each month:
  - ULE calculates IBC based on user income
  - RPA Bot liquidates in Enlace (get planilla number)
  - User pays via ULE platform
  - ULE sends payment confirmation to Enlace
  - RPA Bot downloads comprobante
  - ULE stores PDF and shows to user
```

### Data Synchronization
**ULE Database** ↔ **Enlace System**

Must maintain:
- `uleUserId` (ULE internal)
- `enlaceUserId` (Enlace internal)
- `numeroDocumento` (shared identifier)
- `status` (sync state)

### Status Flow
```
pending → registering → registered → active
                ↓
           registration_failed
```

```
active → liquidating → planilla_generated → payment_pending → paid
           ↓               ↓
    liquidation_failed  payment_failed
```

---

## Common Colombian Terms

### Spanish Terms Used in Code:
- **Aportante**: Contributor (worker paying PILA)
- **Cotización**: Contribution payment
- **Liquidación**: Calculation/liquidation of contribution
- **Planilla**: Payment slip
- **Comprobante**: Receipt/proof of payment
- **IBC**: Base income for contribution
- **Días cotizados**: Days worked/contributed
- **Salud**: Health (insurance)
- **Pensión**: Pension (retirement fund)
- **ARL**: Occupational hazards insurance
- **SMLMV**: Minimum monthly legal wage
- **PSE**: Colombian online bank transfer system
- **Operador**: Authorized operator

---

## Validation Rules Reference

### Document Number
```typescript
function validateDocumento(numero: string, tipo: string): boolean {
  // Minimum length
  if (numero.length < 6) return false;

  // Maximum length
  if (numero.length > 12) return false;

  // Numeric for CC, CE, TI, NIT
  if (['CC', 'CE', 'TI', 'NIT'].includes(tipo)) {
    return /^\d+$/.test(numero);
  }

  // Alphanumeric for Passport
  if (tipo === 'Pasaporte') {
    return /^[A-Z0-9]+$/.test(numero);
  }

  return true;
}
```

### IBC Validation
```typescript
const SMLMV_2025 = 1423500;

function validateIBC(ibc: number): boolean {
  // Minimum 1 SMLMV
  if (ibc < SMLMV_2025) return false;

  // Maximum 25 SMLMV
  if (ibc > SMLMV_2025 * 25) return false;

  return true;
}
```

### Días Cotizados Validation
```typescript
function validateDias(dias: number): boolean {
  return dias >= 1 && dias <= 30;
}
```

### Email Validation
```typescript
function validateEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}
```

### Phone Validation
```typescript
function validateTelefono(telefono: string): boolean {
  // Remove spaces and dashes
  const cleaned = telefono.replace(/[\s-]/g, '');

  // Must be 7-10 digits
  return cleaned.length >= 7 && cleaned.length <= 10;
}
```

---

## Error Messages (Spanish)

### Common Success Messages in Enlace:
- "Usuario creado exitosamente"
- "Registro exitoso"
- "Operación completada con éxito"
- "Planilla generada correctamente"
- "Descarga exitosa"

### Common Error Messages in Enlace:
- "Usuario ya existe"
- "Documento inválido"
- "El IBC no puede ser menor al salario mínimo"
- "Días cotizados inválidos"
- "Error al procesar la solicitud"
- "Sesión expirada"
- "No se encontraron resultados"

---

## Regulatory Compliance

### Data Protection (Ley 1581 de 2012)
- **Personal data**: Document numbers, names, addresses
- **Sensitive data**: Health (EPS), financial (IBC)
- **Consent required**: For data processing
- **Right to deletion**: Users can request data deletion
- **Data retention**: Minimum 5 years for tax records

### Tax Obligations
- **PILA records**: Must be kept for 5 years
- **Comprobantes**: Must be available for DIAN (tax authority) audits
- **Late payment penalties**: 5% interest + mora

### Worker Rights
- **Timely payment**: Contributions must be paid by deadline
- **Coverage continuity**: Late payments can interrupt health coverage
- **Pension accumulation**: All payments count toward retirement

---

## Business Metrics & KPIs

### ULE Platform Metrics:
- **Registration success rate**: % of successful Enlace registrations
- **Liquidation processing time**: Average time to generate planilla
- **Payment completion rate**: % of planillas that get paid
- **Comprobante availability**: % of comprobantes downloaded successfully

### RPA Performance Metrics:
- **Bot execution time**: Average time per operation type
- **Bot success rate**: % of successful bot executions
- **Error rate by type**: Authentication, navigation, form errors
- **Session lifetime**: Average time before re-authentication needed

---

## Future Considerations

### Potential Features:
1. **Automatic IBC calculation** from user's monthly income
2. **Payment reminders** via SMS/email 5 days before deadline
3. **Bulk registration** for multiple workers
4. **Payment history** across multiple months
5. **Tax report generation** (annual PILA summary)
6. **EPS/Pension fund comparison** tool

### Regulatory Changes to Monitor:
- **SMLMV updates** (January every year)
- **Contribution rate changes** (rare but possible)
- **New document types** (e.g., PPT - Permiso de Protección Temporal for Venezuelan migrants)
- **Enlace platform updates** (UI changes require selector updates)

---

**Last Updated**: 2026-02-08
**Sources**:
- Colombian Ministry of Health (MinSalud)
- PILA official documentation
- Enlace Operativo user guides
- Colombian Labor Code
