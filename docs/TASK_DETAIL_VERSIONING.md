# TaskDetail Versioning Strategy

## Overview

The CRM system implements an intelligent versioning strategy for TaskDetails to maintain data integrity and historical accuracy.

## Data Model Hierarchy

```
WorkingOrder (e.g., "Glass Panels on the Court")
  └── TaskDetail (Template/Blueprint)
        ├── title: "Bring Glass Panels to the court"
        ├── instructions: ["Step 1", "Step 2", ...]
        ├── category: "Service TC"
        └── Tasks (Execution Instances)
              ├── Task 1 (2026-02-06, assigned to Team A)
              ├── Task 2 (2026-02-07, assigned to Team B)
              └── Task 3 (2026-02-08, assigned to Individual)
```

## Core Concepts

### TaskDetail = Template
- Reusable blueprint for tasks
- Contains the "what" (title, instructions, category)
- Can be referenced by multiple Task instances

### Task = Instance
- Actual execution of a TaskDetail
- Snapshots the TaskDetail data at creation time
- Contains the "when" (schedule), "who" (assignments), and "status" (progress)

## Versioning Logic

When creating a job order with `POST /api/companies/:companyId/job-orders`:

### Scenario 1: New TaskDetail (`isNew: true`)
**Always creates a brand new TaskDetail.**

```json
{
  "taskDetails": {
    "isNew": true,
    "title": "Install Panels",
    "instructions": ["Step 1", "Step 2"],
    "category": "Service TC"
  }
}
```

**Result**: New TaskDetail created

---

### Scenario 2: Reuse Existing TaskDetail (`isNew: false`)

The system compares the incoming data with the existing TaskDetail:

#### Case 2A: No Changes
**If title, instructions, AND category are identical:**

```json
{
  "taskDetails": {
    "id": "existing-id-123",
    "isNew": false,
    "title": "Install Panels",           // SAME as DB
    "instructions": ["Step 1", "Step 2"], // SAME as DB
    "category": "Service TC"              // SAME as DB
  }
}
```

**Result**: Reuses existing TaskDetail (no new version created)

**Response:**
```json
{
  "taskDetailId": "existing-id-123",
  "taskDetailCreated": false
}
```

---

#### Case 2B: Instructions Changed
**If instructions differ:**

```json
{
  "taskDetails": {
    "id": "existing-id-123",
    "isNew": false,
    "title": "Install Panels",
    "instructions": ["Step 1", "Step 2", "Step 3"], // NEW instruction added
    "category": "Service TC"
  }
}
```

**Result**: Creates NEW TaskDetail (version 2)

**Response:**
```json
{
  "taskDetailId": "new-id-456",  // Different ID!
  "taskDetailCreated": true
}
```

---

#### Case 2C: Title or Category Changed
**If title or category differs:**

```json
{
  "taskDetails": {
    "id": "existing-id-123",
    "isNew": false,
    "title": "Install Tempered Glass Panels", // Changed
    "instructions": ["Step 1", "Step 2"],
    "category": "Service TC"
  }
}
```

**Result**: Creates NEW TaskDetail (version 2)

---

## Why This Approach?

### ✅ Preserves Historical Integrity
Old tasks keep their original instructions. If you complete a task with 3 steps, changing the instructions to 5 steps won't retroactively affect that completed task.

### ✅ Supports Template Evolution
Task templates naturally evolve. The system tracks these changes by creating new versions.

### ✅ Prevents Unintended Changes
Updating a TaskDetail wouldn't make sense because it would change the meaning of all historical tasks referencing it.

### ✅ Maintains Data Consistency
The Task snapshot pattern only makes sense if TaskDetails act as immutable templates.

---

## Example User Flow

### Initial Creation
User creates a task: "Bring Glass Panels to the court" with 2 instructions.

```
TaskDetail v1 (ID: abc-123)
├── title: "Bring Glass Panels to the court"
├── instructions: ["Load panels", "Transport to court"]
└── Tasks: [Task-1, Task-2]
```

### User Modifies Instructions
User selects the same task detail but adds a third instruction: "Unload carefully"

**Instead of updating TaskDetail v1**, the system creates TaskDetail v2:

```
TaskDetail v1 (ID: abc-123)
├── title: "Bring Glass Panels to the court"
├── instructions: ["Load panels", "Transport to court"]
└── Tasks: [Task-1, Task-2]  ← Still reference v1

TaskDetail v2 (ID: def-456)
├── title: "Bring Glass Panels to the court"
├── instructions: ["Load panels", "Transport to court", "Unload carefully"]
└── Tasks: [Task-3]  ← References v2
```

**Result**:
- Tasks 1 & 2 keep the original 2 instructions
- Task 3 uses the new 3 instructions
- Complete audit trail of changes

---

## API Response

The `POST /api/companies/:companyId/job-orders` endpoint returns:

```typescript
{
  "success": true,
  "data": {
    "taskId": "uuid",              // The created Task ID
    "workingOrderId": "uuid",      // The WorkingOrder ID (new or existing)
    "taskDetailId": "uuid",        // The TaskDetail ID (new or existing)
    "taskDetailCreated": boolean   // TRUE if new TaskDetail created
  }
}
```

**Use `taskDetailCreated` to know if a new version was created:**
- `true` = New TaskDetail created (either brand new or versioned)
- `false` = Existing TaskDetail reused (no changes detected)

---

## Frontend Recommendations

### When Displaying Task History
```javascript
// Show which version of instructions each task used
const task1 = {
  taskDetailId: "abc-123",  // v1
  instructions: ["Load panels", "Transport to court"]
}

const task3 = {
  taskDetailId: "def-456",  // v2
  instructions: ["Load panels", "Transport to court", "Unload carefully"]
}
```

### When User Edits Instructions
```javascript
// Inform user that editing will create a new version
if (!isNew && instructionsChanged) {
  showWarning("Changing instructions will create a new task template version. Previous tasks will keep their original instructions.");
}
```

### Viewing Version History
```javascript
// Use the new endpoint to see all versions
GET /api/companies/:companyId/working-orders/:orderId/task-detail-versions

// Returns all TaskDetail versions with their tasks
[
  {
    id: "abc-123",
    version: 1,
    instructions: [...],
    tasks: [...tasks using this version]
  },
  {
    id: "def-456",
    version: 2,
    instructions: [...],
    tasks: [...tasks using this version]
  }
]
```

---

## Implementation Details

### Change Detection Algorithm

The system compares:

1. **Instructions**:
   ```javascript
   JSON.stringify(existing.sort()) !== JSON.stringify(input.sort())
   ```
   - Sorted to handle array order differences
   - JSON stringified for deep comparison

2. **Title**:
   ```javascript
   existing.title !== input.title
   ```

3. **Category**:
   ```javascript
   existing.categoryName !== input.category
   ```

**If ANY of these differ → Create new TaskDetail**

### Transaction Safety

All operations are wrapped in a Prisma transaction:
```typescript
return prisma.$transaction(async (tx) => {
  // Create/reuse WorkingOrder
  // Create/reuse/version TaskDetail
  // Create Task (always new)
  // Create TaskAssignments
});
```

This ensures atomicity - either everything succeeds or nothing is saved.

---

## Database Schema

```sql
-- TaskDetails act as templates
CREATE TABLE task_details (
  id UUID PRIMARY KEY,
  working_order_id UUID REFERENCES working_orders(id),
  title TEXT,
  instructions TEXT[],  -- Array of instruction strings
  category_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Tasks are instances that snapshot TaskDetail data
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  task_detail_id UUID REFERENCES task_details(id),
  task_detail_title TEXT,          -- Snapshot
  instructions TEXT[],              -- Snapshot
  instructions_completed BOOLEAN[], -- Completion tracking
  scheduled_date DATE,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Benefits Summary

| Benefit | Description |
|---------|-------------|
| **Audit Trail** | See exactly what instructions each task had when created |
| **No Retroactive Changes** | Completed tasks don't get modified by template updates |
| **Template Evolution** | Track how task templates improve over time |
| **Data Integrity** | Immutable task templates = reliable historical data |
| **Flexible Reuse** | Reuse unchanged templates, version changed ones |

---

## Common Questions

### Q: Why not just update the TaskDetail?
**A:** Updating would change the meaning of all historical tasks referencing it. If Task-1 was completed with 3 instructions, updating the TaskDetail to 5 instructions would make Task-1's completion data misleading.

### Q: Won't this create many duplicate TaskDetails?
**A:** Only if instructions actually change. Most of the time, users reuse the same template, so the existing TaskDetail is reused. Versioning only happens when meaningful changes occur.

### Q: How do I see all versions?
**A:** Use the `getTaskDetailVersions` function or query TaskDetails by `workingOrderId` to see all versions and their associated tasks.

### Q: Can I delete old versions?
**A:** You can soft-delete them (`isActive: false`), but avoid hard deletion as this would orphan the tasks referencing them.

---

**Last Updated**: February 6, 2026
**Version**: 1.0.0
