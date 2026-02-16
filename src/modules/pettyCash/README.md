# Módulo de Gestión de Gastos (Petty Cash)

## Descripción
Módulo para gestionar gastos menores con registro de tickets, aprobación administrativa y cálculo de totales por usuario.

## Estructura de Archivos
```
src/modules/pettyCash/
├── types.ts       # Interfaces y tipos TypeScript
├── db.ts          # Funciones de acceso a datos (Prisma)
├── controller.ts  # Controladores con validación de roles
└── routes.ts      # Definición de rutas
```

## Endpoints

### POST /api/companies/:companyId/petty-cash
Crear un nuevo gasto.

**Permisos:** Cualquier usuario autenticado de la empresa.

**Body:**
```json
{
  "amount": 45.50,
  "currency": "EUR",           // Opcional, default: "EUR"
  "date": "2026-02-09",
  "description": "Taxi al aeropuerto",
  "receiptUrl": "https://storage.example.com/receipts/ticket-123.jpg"  // Opcional
}
```

**Validaciones:**
- `amount` debe ser un número positivo
- `date` debe ser una fecha válida
- `description` es obligatorio
- El estado inicial siempre es `PENDING`

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "uuid",
    "amount": 45.50,
    "currency": "EUR",
    "date": "2026-02-09",
    "description": "Taxi al aeropuerto",
    "receiptUrl": "https://storage.example.com/receipts/ticket-123.jpg",
    "status": "PENDING",
    "user": {
      "id": "uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    },
    "createdAt": "2026-02-09T..."
  }
}
```

### GET /api/companies/:companyId/petty-cash
Listar gastos con control de acceso basado en roles.

**Permisos por rol:**
- **EMPLOYEE/MANAGER**: Solo ve sus propios gastos (ignora `?userId=`)
- **ADMIN/OWNER**: Ve todos los gastos o filtra por usuario

**Query params (todos opcionales):**
- `userId`: Filtrar por usuario específico (solo ADMIN/OWNER)
- `status`: `PENDING | APPROVED | REJECTED`
- `dateFrom`: Filtrar gastos desde esta fecha
- `dateTo`: Filtrar gastos hasta esta fecha

**Ejemplos:**
```bash
# EMPLOYEE - Solo ve sus gastos
GET /api/companies/123/petty-cash

# ADMIN - Ve todos los gastos
GET /api/companies/123/petty-cash

# ADMIN - Filtra por usuario
GET /api/companies/123/petty-cash?userId=employee-uuid

# ADMIN - Gastos pendientes del último mes
GET /api/companies/123/petty-cash?status=PENDING&dateFrom=2026-01-01&dateTo=2026-01-31
```

**Response:**
```json
{
  "success": true,
  "expenses": [
    {
      "id": "uuid",
      "amount": 45.50,
      "currency": "EUR",
      "date": "2026-02-09",
      "description": "Taxi al aeropuerto",
      "receiptUrl": "https://storage.example.com/receipts/ticket-123.jpg",
      "status": "PENDING",
      "user": {
        "id": "uuid",
        "name": "John",
        "surname": "Doe",
        "email": "john@example.com"
      },
      "createdAt": "2026-02-09T...",
      "updatedAt": "2026-02-09T..."
    }
  ]
}
```

### GET /api/companies/:companyId/petty-cash/summary
Obtener resumen de gastos con totales calculados.

**Permisos:**
- **EMPLOYEE/MANAGER**: Ve solo su propio resumen
- **ADMIN/OWNER**: Ve resumen de toda la empresa agrupado por usuario

**Response para EMPLOYEE:**
```json
{
  "success": true,
  "summary": {
    "approved": {
      "EUR": 450.00,
      "USD": 120.00
    },
    "pending": {
      "EUR": 85.50
    },
    "rejected": {
      "EUR": 25.00
    }
  }
}
```

**Response para ADMIN (Company-wide):**
```json
{
  "success": true,
  "summary": [
    {
      "userId": "uuid-1",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "totalApproved": 450.00,
      "totalPending": 85.50,
      "totalRejected": 25.00,
      "currency": "EUR"
    },
    {
      "userId": "uuid-2",
      "userName": "Jane Smith",
      "userEmail": "jane@example.com",
      "totalApproved": 320.00,
      "totalPending": 0,
      "totalRejected": 0,
      "currency": "EUR"
    }
  ]
}
```

### GET /api/companies/:companyId/petty-cash/:expenseId
Obtener un gasto específico.

**Permisos:**
- El dueño del gasto puede acceder
- ADMIN/OWNER puede acceder a cualquier gasto

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "uuid",
    "amount": 45.50,
    "currency": "EUR",
    "date": "2026-02-09",
    "description": "Taxi al aeropuerto",
    "receiptUrl": "https://storage.example.com/receipts/ticket-123.jpg",
    "status": "APPROVED",
    "user": {
      "id": "uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    },
    "createdAt": "2026-02-09T...",
    "updatedAt": "2026-02-09T..."
  }
}
```

### PATCH /api/companies/:companyId/petty-cash/:expenseId/status
Aprobar o rechazar un gasto (SOLO ADMIN/OWNER).

**Permisos:** Solo ADMIN o OWNER.

**Body:**
```json
{
  "status": "APPROVED | REJECTED"
}
```

**Validaciones:**
- Solo se pueden actualizar gastos en estado `PENDING`
- El status debe ser `APPROVED` o `REJECTED`

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "uuid",
    "amount": 45.50,
    "currency": "EUR",
    "date": "2026-02-09",
    "description": "Taxi al aeropuerto",
    "receiptUrl": "https://storage.example.com/receipts/ticket-123.jpg",
    "status": "APPROVED",
    "user": {
      "id": "uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    },
    "updatedAt": "2026-02-09T..."
  }
}
```

## Validaciones Implementadas

### 1. Validación de Monto (DB)
```typescript
if (data.amount <= 0) {
    throw new BadRequestError('Amount must be greater than 0');
}
```

### 2. Control de Acceso por Roles (Controller)
```typescript
// EMPLOYEE/MANAGER: Only their own expenses
// ADMIN/OWNER: All expenses or filter by user
if (role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN) {
    // Can see all or filter
} else {
    // Only own expenses, ignore userId param
    filterCompanyUserId = currentCompanyUser.id;
}
```

### 3. Validación de Aprobación (Controller)
```typescript
// Only ADMIN or OWNER can approve/reject
if (
    currentCompanyUser.role !== CompanyUserRole.OWNER &&
    currentCompanyUser.role !== CompanyUserRole.ADMIN
) {
    throw new ForbiddenError('Only administrators can approve expenses');
}
```

### 4. Validación de Estado (DB)
```typescript
if (expense.status !== PettyCashStatus.PENDING) {
    throw new BadRequestError('Only pending expenses can be updated');
}
```

## Cálculos en DB

### getUserExpenseSummary
Calcula totales por usuario agrupados por status y moneda:

```typescript
const summary = await getUserExpenseSummary(companyUserId);
// Returns:
// {
//   approved: { EUR: 450.00, USD: 120.00 },
//   pending: { EUR: 85.50 },
//   rejected: { EUR: 25.00 }
// }
```

### getCompanyExpenseSummary
Calcula totales de toda la empresa agrupados por usuario:

```typescript
const summary = await getCompanyExpenseSummary(companyId);
// Returns array of user summaries with totals by status
```

## Modelo de Base de Datos

### PettyCash
```prisma
model PettyCash {
  id            String           @id @default(dbgenerated("gen_random_uuid()"))
  companyUserId String
  companyId     String
  amount        Decimal          @db.Decimal(10, 2)
  currency      String           @default("EUR") @db.VarChar(3)
  date          DateTime         @db.Date
  description   String
  receiptUrl    String?
  status        PettyCashStatus  @default(PENDING)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  companyUser CompanyUser @relation(...)
  company     Company     @relation(...)
}
```

## Tipos TypeScript

### PettyCashStatus
```typescript
enum PettyCashStatus {
  PENDING
  APPROVED
  REJECTED
}
```

## Ejemplos de Uso con cURL

### Crear gasto
```bash
curl -X POST http://localhost:3000/api/companies/123/petty-cash \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 45.50,
    "currency": "EUR",
    "date": "2026-02-09",
    "description": "Taxi al aeropuerto",
    "receiptUrl": "https://storage.example.com/receipts/ticket.jpg"
  }'
```

### Listar gastos propios
```bash
curl -X GET http://localhost:3000/api/companies/123/petty-cash \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Ver resumen (ADMIN)
```bash
curl -X GET http://localhost:3000/api/companies/123/petty-cash/summary \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Aprobar gasto (ADMIN)
```bash
curl -X PATCH http://localhost:3000/api/companies/123/petty-cash/expense-uuid/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "APPROVED"
  }'
```

## Flujo de Trabajo Típico

```
1. Empleado registra gasto
   ├─ Toma foto del ticket con móvil
   ├─ Sube imagen a storage
   └─ POST /petty-cash con receiptUrl

2. Estado: PENDING
   └─ Empleado puede ver su gasto en la lista

3. Admin revisa gastos pendientes
   ├─ GET /petty-cash?status=PENDING
   └─ Ve todos los gastos de la empresa

4. Admin aprueba/rechaza
   ├─ PATCH /petty-cash/:id/status
   └─ Estado cambia a APPROVED o REJECTED

5. Resumen mensual
   ├─ GET /petty-cash/summary
   └─ Admin ve totales por empleado
```

## Casos de Uso Reales

### Uso Mobile-Friendly
1. Empleado en viaje de negocios
2. Paga taxi con efectivo
3. Toma foto del recibo con el móvil
4. Sube foto directamente desde la app
5. Registra el gasto en el momento
6. Admin aprueba al día siguiente

### Dashboard Administrativo
1. Admin ve resumen mensual
2. Identifica gastos pendientes
3. Revisa tickets adjuntos
4. Aprueba/rechaza en lote
5. Exporta totales para contabilidad

## Errores Comunes

### 400 Bad Request
- `Missing required fields: amount, date, description` - Faltan campos
- `Amount must be a positive number` - Monto inválido
- `Invalid date format` - Fecha incorrecta
- `Only pending expenses can be updated` - El gasto ya fue procesado

### 403 Forbidden
- `Only administrators can approve expenses` - Solo ADMIN puede aprobar
- `You do not have access to this expense` - Intentando ver gasto ajeno

### 404 Not Found
- `Expense not found` - El gasto no existe
- `Expense not found in this company` - No pertenece a esa empresa

## Optimizaciones Futuras

1. **Categorías de gastos** (transporte, comida, material, etc.)
2. **Límites de aprobación** (managers aprueban hasta X€, ADMIN para más)
3. **Aprobación por jerarquía** (manager → director → admin)
4. **Integración contable** (exportar a Excel/CSV)
5. **OCR de tickets** (extraer monto automáticamente de la foto)
6. **Notificaciones** cuando se aprueba/rechaza un gasto
7. **Políticas de gastos** por empresa (máximo diario, categorías permitidas)
