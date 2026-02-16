# Módulo de Gestión de Ausencias

## Descripción
Módulo para gestionar solicitudes de ausencias (vacaciones, bajas médicas, etc.) con control de acceso basado en roles.

## Estructura de Archivos
```
src/modules/absence/
├── types.ts       # Interfaces y tipos TypeScript
├── db.ts          # Funciones de acceso a datos (Prisma)
├── controller.ts  # Controladores de peticiones HTTP
└── routes.ts      # Definición de rutas
```

## Endpoints

### POST /api/companies/:companyId/absences
Crear una nueva solicitud de ausencia.

**Permisos:** Cualquier usuario autenticado de la empresa.

**Body:**
```json
{
  "type": "VACATION | SICK_LEAVE | OTHER",
  "startDate": "2026-02-10",
  "endDate": "2026-02-14",
  "reason": "Vacaciones de verano" // Opcional
}
```

**Validaciones:**
- `endDate` debe ser posterior a `startDate`
- No puede haber ausencias solapadas para el mismo usuario
- El tipo de ausencia debe ser válido

**Response:**
```json
{
  "success": true,
  "absence": {
    "id": "uuid",
    "companyUserId": "uuid",
    "type": "VACATION",
    "startDate": "2026-02-10",
    "endDate": "2026-02-14",
    "status": "PENDING",
    "reason": "Vacaciones de verano",
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

### GET /api/companies/:companyId/absences
Obtener ausencias según el rol del usuario.

**Permisos por rol:**
- **EMPLOYEE**: Solo ve sus propias ausencias (ignora `?userId=`)
- **MANAGER**: Ve sus ausencias o las de sus reportes directos
- **ADMIN/OWNER**: Ve todas las ausencias de la empresa o filtra por usuario

**Query params:**
- `userId` (opcional): Filtrar por usuario específico
- `status` (opcional): `PENDING | APPROVED | REJECTED`

**Ejemplos:**
```bash
# EMPLOYEE - Solo ve las suyas
GET /api/companies/123/absences

# MANAGER - Ve las de un reporte directo
GET /api/companies/123/absences?userId=456

# ADMIN - Ve todas
GET /api/companies/123/absences

# ADMIN - Filtra por usuario
GET /api/companies/123/absences?userId=789

# Filtrar por estado
GET /api/companies/123/absences?status=PENDING
```

**Response:**
```json
{
  "success": true,
  "absences": [
    {
      "id": "uuid",
      "companyUserId": "uuid",
      "type": "VACATION",
      "startDate": "2026-02-10",
      "endDate": "2026-02-14",
      "status": "PENDING",
      "reason": "Vacaciones de verano",
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

### PATCH /api/companies/:companyId/absences/:absenceId/status
Aprobar o rechazar una solicitud de ausencia.

**Permisos:**
- **MANAGER**: Solo puede aprobar ausencias de sus reportes directos
- **ADMIN/OWNER**: Puede aprobar cualquier ausencia de la empresa

**Body:**
```json
{
  "status": "APPROVED | REJECTED"
}
```

**Validaciones:**
- Solo se pueden actualizar ausencias en estado `PENDING`
- El status debe ser `APPROVED` o `REJECTED`

**Response:**
```json
{
  "success": true,
  "absence": {
    "id": "uuid",
    "companyUserId": "uuid",
    "type": "VACATION",
    "startDate": "2026-02-10",
    "endDate": "2026-02-14",
    "status": "APPROVED",
    "reason": "Vacaciones de verano",
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

### 1. Validación de Fechas
En `db.ts` - función `createAbsence()`:
```typescript
if (data.endDate < data.startDate) {
    throw new BadRequestError('End date must be after start date');
}
```

### 2. Validación de Solapamientos
En `db.ts` - función `checkOverlappingAbsences()`:
- Detecta si hay ausencias que se solapan en el mismo período
- Considera 3 casos:
  - Nueva ausencia empieza durante una existente
  - Nueva ausencia termina durante una existente
  - Nueva ausencia contiene completamente una existente

### 3. Control de Acceso por Roles
En `controller.ts` - función `handleGetAbsences()`:
- **EMPLOYEE**: Forzado a ver solo sus ausencias
- **MANAGER**: Puede ver sus ausencias o las de reportes directos
- **ADMIN/OWNER**: Puede ver todas o filtrar por usuario

En `controller.ts` - función `handleUpdateAbsenceStatus()`:
- **MANAGER**: Solo puede aprobar ausencias de reportes directos
- **ADMIN/OWNER**: Puede aprobar cualquier ausencia

## Modelos de Base de Datos

### HrAbsence
```prisma
model HrAbsence {
  id            String        @id @default(dbgenerated("gen_random_uuid()"))
  companyUserId String
  companyId     String
  type          AbsenceType   // VACATION, SICK_LEAVE, OTHER
  startDate     DateTime      @db.Date
  endDate       DateTime      @db.Date
  status        AbsenceStatus // PENDING, APPROVED, REJECTED
  reason        String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  companyUser CompanyUser @relation(...)
  company     Company     @relation(...)
}
```

## Tipos TypeScript

### AbsenceType
```typescript
enum AbsenceType {
  VACATION
  SICK_LEAVE
  OTHER
}
```

### AbsenceStatus
```typescript
enum AbsenceStatus {
  PENDING
  APPROVED
  REJECTED
}
```

## Ejemplos de Uso con cURL

### Crear ausencia
```bash
curl -X POST http://localhost:3000/api/companies/123/absences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "VACATION",
    "startDate": "2026-02-10",
    "endDate": "2026-02-14",
    "reason": "Vacaciones de verano"
  }'
```

### Obtener ausencias
```bash
curl -X GET http://localhost:3000/api/companies/123/absences \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Aprobar ausencia
```bash
curl -X PATCH http://localhost:3000/api/companies/123/absences/456/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "APPROVED"
  }'
```

## Errores Comunes

### 400 Bad Request
- `End date must be after start date` - La fecha de fin es anterior a la de inicio
- `There is already an absence request for this period` - Hay solapamiento de fechas
- `Invalid absence type` - Tipo de ausencia no válido
- `Only pending absences can be updated` - Solo se pueden actualizar ausencias pendientes

### 403 Forbidden
- `You can only view absences of your direct reports` - Manager intentando ver ausencias de alguien que no es su reporte directo
- `Only managers and administrators can approve absences` - Empleado intentando aprobar ausencias
- `You can only approve absences of your direct reports` - Manager intentando aprobar ausencia de alguien que no es su reporte directo

### 404 Not Found
- `Absence not found` - La ausencia no existe
- `Absence not found in this company` - La ausencia no pertenece a esa empresa
