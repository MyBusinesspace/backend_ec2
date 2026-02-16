# Módulo de Gestión de Documentos y Nóminas

## ⚠️ SEGURIDAD CRÍTICA

Este módulo maneja documentos sensibles (nóminas, contratos). La seguridad es **PRIORITARIA**:

- ✅ Solo **ADMIN/OWNER** puede subir documentos
- ✅ Usuarios normales **JAMÁS** pueden acceder a documentos de otros
- ✅ Solo **ADMIN/OWNER** puede eliminar documentos
- ✅ Los filtros por userId se **IGNORAN** para usuarios no-admin

## Estructura de Archivos
```
src/modules/document/
├── types.ts       # Interfaces y tipos TypeScript
├── db.ts          # Funciones de acceso a datos (Prisma)
├── controller.ts  # Controladores con validación de roles ESTRICTA
└── routes.ts      # Definición de rutas
```

## Endpoints

### POST /api/companies/:companyId/documents/upload
Subir un documento para un usuario (SOLO ADMIN/OWNER).

**Permisos:** Solo ADMIN o OWNER.

**Body:**
```json
{
  "userId": "uuid-del-usuario-objetivo",
  "fileUrl": "https://storage.example.com/documents/documento.pdf",
  "type": "PAYROLL | CONTRACT | OTHER",
  "month": 1,      // Opcional: 1-12
  "year": 2026     // Opcional
}
```

**Validaciones:**
- El usuario actual debe ser ADMIN o OWNER
- El `userId` objetivo debe pertenecer a la empresa
- El `type` debe ser válido
- `month` debe estar entre 1 y 12 (si se proporciona)
- `year` debe ser válido (si se proporciona)

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "type": "PAYROLL",
    "fileUrl": "https://storage.example.com/documents/documento.pdf",
    "month": 1,
    "year": 2026,
    "user": {
      "id": "uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    },
    "uploadedAt": "2026-02-09T..."
  }
}
```

**Errores:**
- `403 Forbidden`: Si el usuario no es ADMIN/OWNER
- `400 Bad Request`: Datos inválidos
- `400 Bad Request`: Usuario objetivo no pertenece a la empresa

### GET /api/companies/:companyId/documents
Listar documentos con control de acceso basado en roles.

**Permisos por rol:**
- **EMPLOYEE/MANAGER**: Solo ve sus propios documentos (ignora `?userId=`)
- **ADMIN/OWNER**: Ve todos los documentos o filtra por usuario

**Query params (todos opcionales):**
- `userId`: Filtrar por usuario específico (solo ADMIN/OWNER)
- `type`: `PAYROLL | CONTRACT | OTHER`
- `year`: Año (número)
- `month`: Mes (1-12)

**Comportamiento de seguridad:**
```javascript
// Usuario normal (EMPLOYEE/MANAGER)
GET /api/companies/123/documents
// Retorna SOLO sus documentos, ignora cualquier query param

GET /api/companies/123/documents?userId=otro-user
// Ignora userId, retorna SOLO sus documentos

// ADMIN/OWNER
GET /api/companies/123/documents
// Retorna TODOS los documentos de la empresa

GET /api/companies/123/documents?userId=employee-123
// Retorna documentos del empleado específico

GET /api/companies/123/documents?type=PAYROLL&year=2026
// Retorna todas las nóminas de 2026
```

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": "uuid",
      "type": "PAYROLL",
      "fileUrl": "https://storage.example.com/documents/nomina-enero.pdf",
      "month": 1,
      "year": 2026,
      "user": {
        "id": "uuid",
        "name": "John",
        "surname": "Doe",
        "email": "john@example.com"
      },
      "uploadedAt": "2026-02-01T..."
    }
  ]
}
```

### GET /api/companies/:companyId/documents/:documentId
Obtener un documento específico.

**Permisos:**
- El dueño del documento puede acceder
- ADMIN/OWNER puede acceder a cualquier documento

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "type": "PAYROLL",
    "fileUrl": "https://storage.example.com/documents/nomina-enero.pdf",
    "month": 1,
    "year": 2026,
    "user": {
      "id": "uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    },
    "uploadedAt": "2026-02-01T..."
  }
}
```

**Errores:**
- `403 Forbidden`: Si el usuario no es el dueño ni ADMIN
- `404 Not Found`: Documento no existe o no pertenece a la empresa

### DELETE /api/companies/:companyId/documents/:documentId
Eliminar un documento (SOLO ADMIN/OWNER).

**Permisos:** Solo ADMIN o OWNER.

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "document": {
    "id": "uuid",
    "type": "PAYROLL",
    "fileUrl": "https://storage.example.com/documents/nomina-enero.pdf"
  }
}
```

**Errores:**
- `403 Forbidden`: Si el usuario no es ADMIN/OWNER
- `404 Not Found`: Documento no existe

## Validaciones de Seguridad Implementadas

### 1. Validación de Rol para Upload (Controller)
```typescript
// CRITICAL SECURITY: Only ADMIN or OWNER can upload documents
if (
    currentCompanyUser.role !== CompanyUserRole.ADMIN &&
    currentCompanyUser.role !== CompanyUserRole.OWNER
) {
    throw new ForbiddenError('Only administrators can upload documents');
}
```

### 2. Filtrado Automático por Usuario (Controller)
```typescript
// CRITICAL SECURITY: Determine which documents to return based on role
if (role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN) {
    // ADMIN/OWNER can see all or filter
    filterCompanyUserId = requestedUserId ? targetId : '';
} else {
    // EMPLOYEE or MANAGER: ONLY their own documents, ALWAYS
    // Ignore any userId query param for security
    filterCompanyUserId = currentCompanyUser.id;
}
```

### 3. Validación de Acceso Individual (Controller)
```typescript
// CRITICAL SECURITY: Check access rights
const isAdmin = role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN;
const isOwner = document.companyUserId === currentCompanyUser.id;

if (!isAdmin && !isOwner) {
    throw new ForbiddenError('You do not have access to this document');
}
```

### 4. Validación de Rol para Delete (Controller)
```typescript
// CRITICAL SECURITY: Only ADMIN or OWNER can delete documents
if (
    currentCompanyUser.role !== CompanyUserRole.ADMIN &&
    currentCompanyUser.role !== CompanyUserRole.OWNER
) {
    throw new ForbiddenError('Only administrators can delete documents');
}
```

## Modelo de Base de Datos

### Document
```prisma
model Document {
  id            String       @id @default(dbgenerated("gen_random_uuid()"))
  companyUserId String
  companyId     String
  type          DocumentType // PAYROLL, CONTRACT, OTHER
  fileUrl       String
  month         Int?         // 1-12
  year          Int?
  uploadedAt    DateTime     @default(now())

  companyUser CompanyUser @relation(...)
  company     Company     @relation(...)
}
```

## Tipos TypeScript

### DocumentType
```typescript
enum DocumentType {
  PAYROLL   // Nóminas
  CONTRACT  // Contratos
  OTHER     // Otros documentos
}
```

## Ejemplos de Uso con cURL

### Subir nómina (ADMIN)
```bash
curl -X POST http://localhost:3000/api/companies/123/documents/upload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "employee-uuid",
    "fileUrl": "https://storage.example.com/nominas/enero-2026.pdf",
    "type": "PAYROLL",
    "month": 1,
    "year": 2026
  }'
```

### Listar documentos propios (EMPLOYEE)
```bash
curl -X GET http://localhost:3000/api/companies/123/documents \
  -H "Authorization: Bearer EMPLOYEE_TOKEN"
# Retorna solo documentos del empleado
```

### Listar todos los documentos (ADMIN)
```bash
curl -X GET http://localhost:3000/api/companies/123/documents \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Retorna todos los documentos de la empresa
```

### Filtrar nóminas de un empleado (ADMIN)
```bash
curl -X GET "http://localhost:3000/api/companies/123/documents?userId=emp-uuid&type=PAYROLL&year=2026" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Obtener documento específico
```bash
curl -X GET http://localhost:3000/api/companies/123/documents/doc-uuid \
  -H "Authorization: Bearer TOKEN"
```

### Eliminar documento (ADMIN)
```bash
curl -X DELETE http://localhost:3000/api/companies/123/documents/doc-uuid \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

## Escenarios de Seguridad

### ❌ INTENTO DE ATAQUE: Usuario normal intenta ver documentos de otro
```bash
# Usuario normal intenta usar ?userId=
GET /api/companies/123/documents?userId=otro-empleado
```
**Resultado:** ✅ El sistema **IGNORA** el parámetro userId y solo retorna los documentos del usuario autenticado.

### ❌ INTENTO DE ATAQUE: Usuario normal intenta subir documento
```bash
# EMPLOYEE intenta subir documento
POST /api/companies/123/documents/upload
```
**Resultado:** ✅ `403 Forbidden - Only administrators can upload documents`

### ❌ INTENTO DE ATAQUE: Usuario normal intenta eliminar documento
```bash
# EMPLOYEE intenta eliminar documento
DELETE /api/companies/123/documents/doc-uuid
```
**Resultado:** ✅ `403 Forbidden - Only administrators can delete documents`

### ❌ INTENTO DE ATAQUE: Usuario intenta acceder a documento de otro
```bash
# EMPLOYEE intenta ver documento de otro empleado
GET /api/companies/123/documents/documento-de-otro
```
**Resultado:** ✅ `403 Forbidden - You do not have access to this document`

## Errores Comunes

### 400 Bad Request
- `Missing required fields: userId, fileUrl, type` - Faltan campos requeridos
- `Invalid document type` - Tipo de documento no válido
- `Month must be between 1 and 12` - Mes fuera de rango
- `Invalid year` - Año inválido
- `Target user does not belong to this company` - Usuario objetivo no existe en la empresa

### 403 Forbidden
- `Only administrators can upload documents` - Solo ADMIN puede subir
- `Only administrators can delete documents` - Solo ADMIN puede eliminar
- `You do not have access to this document` - Usuario intenta acceder a documento ajeno

### 404 Not Found
- `Document not found` - Documento no existe
- `Document not found in this company` - Documento no pertenece a esa empresa

## Integración con Storage

Este módulo **NO maneja el upload de archivos**. Solo guarda la referencia `fileUrl`.

El flujo completo sería:
1. Frontend sube archivo a storage (S3, Supabase Storage, etc.)
2. Storage retorna URL firmada
3. Frontend envía URL + metadata a `POST /upload`
4. Backend guarda la referencia en base de datos

## Próximos Pasos Sugeridos

1. **Implementar upload directo a storage** (S3 o Supabase Storage)
2. **URLs firmadas temporales** para mayor seguridad
3. **Notificaciones** cuando se suba un nuevo documento
4. **Versionado de documentos** (múltiples contratos, por ejemplo)
5. **Categorías personalizadas** por empresa
6. **Logs de acceso** para auditoría
