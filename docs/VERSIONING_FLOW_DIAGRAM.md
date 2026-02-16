# TaskDetail Versioning Flow Diagram

## Request Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│  POST /api/companies/:companyId/job-orders                  │
│  Body: { taskDetails: {...}, schedule: {...}, ... }        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  taskDetails     │
                  │  .isNew ?        │
                  └──────────────────┘
                     │            │
              YES ◄──┘            └──► NO
                │                       │
                ▼                       ▼
    ┌─────────────────────┐   ┌────────────────────────┐
    │ Create NEW          │   │ Fetch EXISTING         │
    │ TaskDetail          │   │ TaskDetail from DB     │
    │                     │   └────────────────────────┘
    │ Use input data:     │              │
    │ - title             │              ▼
    │ - instructions      │   ┌────────────────────────┐
    │ - category          │   │ Compare Fields:        │
    └─────────────────────┘   │ • instructions         │
                │             │ • title                │
                │             │ • category             │
                │             └────────────────────────┘
                │                        │
                │              ┌─────────┴──────────┐
                │              │                    │
                │           CHANGED            UNCHANGED
                │              │                    │
                │              ▼                    ▼
                │   ┌────────────────────┐  ┌────────────────┐
                │   │ Create NEW         │  │ REUSE existing │
                │   │ TaskDetail         │  │ TaskDetail     │
                │   │ (Version 2)        │  │                │
                │   │                    │  │ taskDetailId = │
                │   │ Use input data     │  │ existing.id    │
                │   └────────────────────┘  └────────────────┘
                │              │                    │
                │              │                    │
                └──────────────┴────────────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Create NEW Task        │
                    │ (Always created)       │
                    │                        │
                    │ Snapshot:              │
                    │ - TaskDetail data      │
                    │ - Schedule             │
                    │ - Assignments          │
                    └────────────────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Return Response:       │
                    │                        │
                    │ - taskId               │
                    │ - workingOrderId       │
                    │ - taskDetailId         │
                    │ - taskDetailCreated    │
                    └────────────────────────┘
```

---

## Data Flow Example: Instructions Change

### Initial State

```
Database:
┌─────────────────────────────────────────┐
│ TaskDetail (ID: abc-123)                │
├─────────────────────────────────────────┤
│ title: "Install Panels"                 │
│ instructions: ["Load", "Transport"]     │
│ category: "Service TC"                  │
└─────────────────────────────────────────┘
         │
         │ referenced by
         ▼
┌─────────────────────────────────────────┐
│ Task-1 (created yesterday)              │
├─────────────────────────────────────────┤
│ taskDetailId: abc-123                   │
│ instructions: ["Load", "Transport"]     │
│ status: "completed"                     │
└─────────────────────────────────────────┘
```

### User Request

```json
POST /api/companies/xyz/job-orders
{
  "taskDetails": {
    "id": "abc-123",
    "isNew": false,
    "title": "Install Panels",
    "instructions": ["Load", "Transport", "Unload"],  // ← Added "Unload"
    "category": "Service TC"
  },
  "schedule": { ... },
  "assignedResources": { ... }
}
```

### System Processing

```
Step 1: Fetch existing TaskDetail (abc-123)
        ↓
Step 2: Compare instructions
        DB:    ["Load", "Transport"]
        Input: ["Load", "Transport", "Unload"]
        Result: DIFFERENT ✗
        ↓
Step 3: Create NEW TaskDetail
        ↓
        ┌─────────────────────────────────────────┐
        │ TaskDetail (ID: def-456) ← NEW!         │
        ├─────────────────────────────────────────┤
        │ title: "Install Panels"                 │
        │ instructions: ["Load", "Transport",     │
        │               "Unload"]                 │
        │ category: "Service TC"                  │
        └─────────────────────────────────────────┘
        ↓
Step 4: Create Task referencing NEW TaskDetail
        ↓
        ┌─────────────────────────────────────────┐
        │ Task-2 (created today)                  │
        ├─────────────────────────────────────────┤
        │ taskDetailId: def-456  ← NEW VERSION!   │
        │ instructions: ["Load", "Transport",     │
        │               "Unload"]                 │
        │ status: "open"                          │
        └─────────────────────────────────────────┘
```

### Final State

```
Database after request:

TaskDetail v1                        TaskDetail v2
┌─────────────────────────┐         ┌─────────────────────────┐
│ ID: abc-123             │         │ ID: def-456             │
│ instructions:           │         │ instructions:           │
│  ["Load", "Transport"]  │         │  ["Load", "Transport",  │
│                         │         │   "Unload"]             │
└─────────────────────────┘         └─────────────────────────┘
         │                                     │
         │ referenced by                       │ referenced by
         ▼                                     ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ Task-1 (yesterday)      │         │ Task-2 (today)          │
│ status: "completed"     │         │ status: "open"          │
│ instructions:           │         │ instructions:           │
│  ["Load", "Transport"]  │         │  ["Load", "Transport",  │
│                         │         │   "Unload"]             │
└─────────────────────────┘         └─────────────────────────┘

✅ Task-1 keeps original 2 instructions (completed with those)
✅ Task-2 uses new 3 instructions (created with updated template)
✅ Both versions preserved in database
```

---

## Comparison Matrix

| Field | Old Value | New Value | Action |
|-------|-----------|-----------|--------|
| `instructions` | `["Load", "Transport"]` | `["Load", "Transport", "Unload"]` | ❌ DIFFERENT → Create v2 |
| `title` | `"Install Panels"` | `"Install Panels"` | ✅ SAME |
| `category` | `"Service TC"` | `"Service TC"` | ✅ SAME |

**Result**: ONE field changed → Create new version

---

## Response Interpretation

### Response When New Version Created

```json
{
  "success": true,
  "data": {
    "taskId": "task-999",
    "workingOrderId": "wo-888",
    "taskDetailId": "def-456",        // ← DIFFERENT from input ID!
    "taskDetailCreated": true         // ← TRUE = new version
  }
}
```

**Frontend should interpret:**
- ✅ Request successful
- ✅ Task created with ID `task-999`
- ⚠️ New TaskDetail version created (`def-456` instead of `abc-123`)
- 💡 Can show notification: "Instructions changed - new template version created"

### Response When Existing Reused

```json
{
  "success": true,
  "data": {
    "taskId": "task-999",
    "workingOrderId": "wo-888",
    "taskDetailId": "abc-123",        // ← SAME as input ID
    "taskDetailCreated": false        // ← FALSE = reused
  }
}
```

**Frontend should interpret:**
- ✅ Request successful
- ✅ Task created with ID `task-999`
- ✅ Existing TaskDetail reused (no changes detected)
- 💡 No notification needed

---

## Timeline View

```
Time │ Event                           │ TaskDetail ID │ Instructions
─────┼─────────────────────────────────┼───────────────┼─────────────────────
Day 1│ Create initial template         │ abc-123       │ ["Load", "Transport"]
     │ Create Task-1                   │ → abc-123     │ ["Load", "Transport"]
     │                                 │               │
Day 2│ Complete Task-1                 │               │
     │                                 │               │
Day 3│ Create Task-2 with new          │ def-456 (NEW!)│ ["Load", "Transport",
     │ instructions                    │ → def-456     │  "Unload"]
     │                                 │               │
     │ Task-1 still shows old version  │ → abc-123     │ ["Load", "Transport"]
```

**Key Point**: Historical data is preserved. Task-1 doesn't retroactively change when the template evolves.

---

## Edge Cases Handled

### Case 1: Instructions in Different Order

```javascript
DB:    ["Step 1", "Step 2", "Step 3"]
Input: ["Step 3", "Step 1", "Step 2"]

// System sorts both arrays before comparison
// Result: SAME (no new version)
```

### Case 2: Empty Instructions

```javascript
DB:    []
Input: ["New Step"]

// Result: DIFFERENT → Create new version
```

### Case 3: Multiple Changes

```javascript
DB:
  title: "Old Title"
  instructions: ["A", "B"]
  category: "Cat 1"

Input:
  title: "New Title"         // ← Changed
  instructions: ["A", "B"]   // ← Same
  category: "Cat 2"          // ← Changed

// ANY change triggers new version
// Result: Create new version
```

### Case 4: Concurrent Requests

```
Request 1                    Request 2
    │                            │
    ├─ Fetch TaskDetail abc-123  │
    │                            ├─ Fetch TaskDetail abc-123
    │                            │
    ├─ Detect changes            │
    │                            ├─ Detect changes
    │                            │
    ├─ Create new def-456        │
    │                            ├─ Create new ghi-789
    │                            │
    └─ Commit ✅                 └─ Commit ✅

Result: Two new versions created (both valid)
Each Task references its own version
Transaction isolation prevents conflicts
```

---

## Visual Legend

```
┌───────────┐
│ Decision  │  = Decision point
└───────────┘

┌───────────┐
│ Action    │  = Database operation
└───────────┘

    │
    ▼         = Flow direction

YES / NO      = Condition result

✅            = Success / Match
❌            = Different / Changed
⚠️            = Warning / Attention needed
💡            = Information / Tip
```

---

## Summary

The versioning system:

1. **Detects changes** by comparing incoming data with database
2. **Creates new versions** automatically when changes detected
3. **Preserves history** by keeping old versions intact
4. **Provides transparency** via `taskDetailCreated` flag
5. **Handles edge cases** like order differences and concurrent requests

This ensures data integrity while allowing task templates to evolve naturally over time.
