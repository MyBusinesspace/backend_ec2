# Módulo de Company - Organigrama

## Endpoint Añadido: GET /api/companies/:companyId/org-chart

### Descripción
Obtiene la estructura jerárquica completa de la empresa basada en las relaciones manager-empleado definidas en el campo `managerId` de `CompanyUser`.

### Funcionamiento

La función `getOrgChart(companyId)` en `db.ts`:

1. **Obtiene todos los CompanyUsers** de la empresa con sus datos de usuario
2. **Construye un mapa de nodos** con toda la información relevante
3. **Crea la jerarquía** asignando empleados a sus managers
4. **Identifica nodos raíz** (usuarios con `managerId: null`)
5. **Ordena alfabéticamente** los empleados en cada nivel

### Estructura del Árbol

```typescript
interface OrgChartNode {
    id: string;              // CompanyUser ID
    companyUserId: string;   // Same as id
    userId: string;          // User ID
    email: string;
    name: string | null;
    surname: string | null;
    avatar: string | null;
    role: string;            // OWNER, ADMIN, MANAGER, EMPLOYEE
    jobTitle: string | null;
    department: string | null;
    managerId: string | null;
    directReports: OrgChartNode[];  // Recursive structure
}
```

### Request

**Endpoint:** `GET /api/companies/:companyId/org-chart`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Permisos:** Cualquier usuario autenticado que pertenezca a la empresa.

### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-ceo",
      "companyUserId": "uuid-ceo",
      "userId": "user-uuid-1",
      "email": "ceo@example.com",
      "name": "John",
      "surname": "Smith",
      "avatar": "https://avatar.url",
      "role": "OWNER",
      "jobTitle": "CEO",
      "department": "Executive",
      "managerId": null,
      "directReports": [
        {
          "id": "uuid-cto",
          "companyUserId": "uuid-cto",
          "userId": "user-uuid-2",
          "email": "cto@example.com",
          "name": "Jane",
          "surname": "Doe",
          "avatar": "https://avatar.url",
          "role": "ADMIN",
          "jobTitle": "CTO",
          "department": "Technology",
          "managerId": "uuid-ceo",
          "directReports": [
            {
              "id": "uuid-dev",
              "companyUserId": "uuid-dev",
              "userId": "user-uuid-3",
              "email": "dev@example.com",
              "name": "Bob",
              "surname": "Johnson",
              "avatar": null,
              "role": "EMPLOYEE",
              "jobTitle": "Senior Developer",
              "department": "Technology",
              "managerId": "uuid-cto",
              "directReports": []
            }
          ]
        },
        {
          "id": "uuid-cfo",
          "companyUserId": "uuid-cfo",
          "userId": "user-uuid-4",
          "email": "cfo@example.com",
          "name": "Alice",
          "surname": "Williams",
          "avatar": null,
          "role": "MANAGER",
          "jobTitle": "CFO",
          "department": "Finance",
          "managerId": "uuid-ceo",
          "directReports": []
        }
      ]
    }
  ]
}
```

### Ejemplo de Uso

**cURL:**
```bash
curl -X GET http://localhost:3000/api/companies/123/org-chart \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript/TypeScript:**
```typescript
const response = await fetch(
  `${API_URL}/companies/${companyId}/org-chart`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const { data: orgChart } = await response.json();
```

### Casos Especiales

#### Múltiples Nodos Raíz
Si hay varios usuarios con `managerId: null`, todos aparecerán como elementos del array raíz:

```json
{
  "data": [
    {
      // CEO 1
      "managerId": null,
      "directReports": [...]
    },
    {
      // CEO 2 (o Fundador independiente)
      "managerId": null,
      "directReports": [...]
    }
  ]
}
```

#### Manager No Encontrado (Inconsistencia de Datos)
Si un empleado tiene un `managerId` que no existe en la empresa, ese empleado aparecerá como nodo raíz:

```json
{
  "data": [
    {
      // Empleado huérfano (manager no existe)
      "managerId": "uuid-inexistente",
      "directReports": []
    }
  ]
}
```

### Visualización Frontend

**Ejemplo con react-organizational-chart:**
```tsx
import { Tree, TreeNode } from 'react-organizational-chart';

function OrgChart({ data }) {
  const renderNode = (node) => (
    <TreeNode
      label={
        <div className="org-card">
          <img src={node.avatar || '/default-avatar.png'} />
          <div>{node.name} {node.surname}</div>
          <div className="job-title">{node.jobTitle}</div>
          <div className="department">{node.department}</div>
        </div>
      }
    >
      {node.directReports.map((report) => renderNode(report))}
    </TreeNode>
  );

  return (
    <Tree label={<div>Organization Chart</div>}>
      {data.map((root) => renderNode(root))}
    </Tree>
  );
}
```

### Optimización para Empresas Grandes

Para organizaciones con más de 100 empleados, considerar:

1. **Lazy Loading**: Cargar solo los primeros niveles
2. **Paginación por Departamento**: Filtrar por departamento
3. **Búsqueda**: Endpoint separado para buscar en el árbol
4. **Cache**: Cachear la estructura con TTL corto

### Complejidad

- **Temporal**: O(n) donde n = número de empleados
- **Espacial**: O(n) para el mapa + estructura del árbol
- **Base de datos**: 1 query para obtener todos los CompanyUsers

### Integración con Módulos HR

Este organigrama se puede usar en:

- **Módulo de Ausencias**: Ver quién es el manager que debe aprobar
- **Módulo de Petty Cash**: Identificar la cadena de aprobación
- **Módulo de Documentos**: Entender la estructura organizativa
- **Dashboard HR**: Vista general de la empresa

### Testing

**Ejemplo de test unitario:**
```typescript
describe('getOrgChart', () => {
  it('should build correct hierarchy with CEO and reports', async () => {
    const orgChart = await getOrgChart('company-123');
    
    expect(orgChart).toHaveLength(1); // One CEO
    expect(orgChart[0].managerId).toBeNull();
    expect(orgChart[0].directReports.length).toBeGreaterThan(0);
  });

  it('should handle multiple root nodes', async () => {
    const orgChart = await getOrgChart('company-with-multiple-ceos');
    
    expect(orgChart.length).toBeGreaterThan(1);
    orgChart.forEach(root => {
      expect(root.managerId).toBeNull();
    });
  });
});
```

### Próximos Pasos

1. **Endpoint de búsqueda**: Buscar empleado en el árbol y retornar su rama
2. **Filtros**: Por departamento, rol, etc.
3. **Métricas**: Número de reportes directos, profundidad del árbol
4. **Export**: Exportar organigrama a PDF/imagen
