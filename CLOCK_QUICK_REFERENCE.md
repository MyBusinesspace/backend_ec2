# Clock Tracking - Quick Reference Card

## 🚀 Quick Start

### 1. Clock In
```bash
POST /api/companies/:companyId/clock/in
{
  "taskId": "task-uuid",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

### 2. Update Location (Every 5 min)
```bash
POST /api/companies/:companyId/clock/location
{
  "clockEntryId": "entry-uuid",
  "latitude": 40.7129,
  "longitude": -74.0061
}
```

### 3. Clock Out
```bash
POST /api/companies/:companyId/clock/out
{
  "location": {
    "latitude": 40.7130,
    "longitude": -74.0062
  }
}
```

---

## 📱 Mobile App Flow

```typescript
// 1. Check for active clock on app launch
const { hasActiveClock, activeClock } = await getActiveClock();

// 2. If has active clock, resume tracking
if (hasActiveClock) {
  startLocationUpdates(activeClock.id);
}

// 3. Clock In
await clockIn(taskId, currentLocation);
startLocationUpdates(clockEntryId);

// 4. Update location every 5 minutes
setInterval(() => {
  updateLocation(clockEntryId, currentLocation);
}, 5 * 60 * 1000);

// 5. Clock Out
stopLocationUpdates();
await clockOut(currentLocation);
```

---

## 🔑 Key Business Rules

| Rule | Description |
|------|-------------|
| **Single Session** | Only one active clock entry per user |
| **Task Assignment** | Must be assigned to task before clock in |
| **Auto Duration** | Calculated on clock out (minutes) |
| **Server Timestamps** | All times set server-side (can't manipulate) |

---

## 📊 Common Queries

### Get Active Workers
```bash
GET /api/companies/:companyId/clock/entries?isActive=true
```

### Weekly Time Report
```bash
GET /api/companies/:companyId/clock/summary
  ?startDate=2026-02-01
  &endDate=2026-02-07
```

### User's History
```bash
GET /api/companies/:companyId/clock/entries
  ?userId=user-123
  &startDate=2026-02-01
  &endDate=2026-02-28
```

### GPS Trail
```bash
GET /api/companies/:companyId/clock/entries/:entryId/locations
```

---

## 🗄️ Database Tables

### ClockEntry
- `clockInTime` - When started
- `clockOutTime` - When finished (null if active)
- `durationMinutes` - Auto-calculated
- `clockInLat/Lng` - Start location
- `clockOutLat/Lng` - End location

### ClockLocation
- `latitude/longitude` - GPS coordinates
- `timestamp` - When recorded
- `accuracy` - GPS accuracy (meters)
- `speed/heading` - Movement data

---

## ⚡ Performance Tips

### Mobile App
- ✅ Request balanced accuracy (not high)
- ✅ Update every 5-10 minutes
- ✅ Stop tracking when clocked out
- ✅ Queue updates if offline

### Backend
- ✅ Use indexes (already configured)
- ✅ Query by date range for reports
- ✅ Archive old entries (> 1 year)

---

## 🔒 Security Checklist

- ✅ JWT authentication on all endpoints
- ✅ Verify company access
- ✅ Users can only clock in/out themselves
- ✅ Validate task assignment
- ✅ Check no existing active session

---

## 🐛 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Already clocked in" | User has active session | Clock out first |
| "Not assigned to task" | User not in TaskAssignment | Assign user to task |
| "No active clock entry" | Trying to clock out when not clocked in | Check active status first |
| "Clock entry not found" | Invalid clock entry ID | Verify entry exists |

---

## 📖 Documentation

| Type | Location |
|------|----------|
| **Complete Guide** | `docs/CLOCK_TRACKING_SYSTEM.md` |
| **API Reference** | `API_DOCUMENTATION.md` (Clock section) |
| **Implementation** | `CLOCK_IMPLEMENTATION_SUMMARY.md` |
| **Quick Reference** | This file |

---

## 💡 Example Payroll Query

```sql
-- Weekly hours per user
SELECT
  u.name,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  COUNT(*) AS shifts
FROM clock_entries ce
JOIN users u ON ce.user_id = u.id
WHERE
  ce.company_id = 'company-uuid'
  AND ce.clock_in_time >= '2026-02-01'
  AND ce.clock_in_time < '2026-02-08'
  AND ce.clock_out_time IS NOT NULL
GROUP BY u.id, u.name
ORDER BY total_hours DESC;
```

---

**Version:** 1.0.0
**Status:** Production Ready
**Last Updated:** February 7, 2026
