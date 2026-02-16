# Clock Tracking System with GPS

## Overview

The Clock Tracking System enables real-time time tracking for field workers with GPS location monitoring. Workers can clock in/out of tasks, and the system tracks their location throughout their work session.

---

## Core Features

✅ **Clock In/Out** - Start and stop time tracking for tasks
✅ **GPS Location Tracking** - Real-time location updates while working
✅ **Single Active Session** - Only one task can be clocked in at a time
✅ **Location History** - Complete GPS trail for each work session
✅ **Time Calculations** - Automatic duration tracking in minutes
✅ **Task Validation** - Users can only clock into assigned tasks
✅ **Admin Controls** - Force clock out for emergency situations
✅ **Reporting** - Time summaries for payroll and analytics

---

## Data Model

### ClockEntry
Main table tracking work sessions.

```typescript
{
  id: string;                // UUID
  companyId: string;         // Company reference
  userId: string;            // Worker
  taskId: string;            // Task being worked on

  // Clock In Data
  clockInTime: DateTime;     // When started
  clockInLat?: number;       // GPS latitude at start
  clockInLng?: number;       // GPS longitude at start
  clockInAddress?: string;   // Human-readable address

  // Clock Out Data
  clockOutTime?: DateTime;   // When finished (null if active)
  clockOutLat?: number;      // GPS latitude at end
  clockOutLng?: number;      // GPS longitude at end
  clockOutAddress?: string;  // Human-readable address

  // Metadata
  durationMinutes?: number;  // Auto-calculated
  notes?: string;            // Optional notes
  isActive: boolean;         // Is this session active?

  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### ClockLocation
GPS tracking points during work session.

```typescript
{
  id: string;
  clockEntryId: string;      // Parent clock entry

  // GPS Data
  latitude: number;          // Required
  longitude: number;         // Required
  accuracy?: number;         // GPS accuracy in meters
  altitude?: number;         // Elevation
  speed?: number;            // Speed in m/s
  heading?: number;          // Direction in degrees (0-360)

  timestamp: DateTime;       // When this location was recorded
  address?: string;          // Geocoded address

  createdAt: DateTime;
}
```

---

## API Endpoints

### 1. Clock In

**Endpoint:** `POST /api/companies/:companyId/clock/in`

**Purpose:** Start working on a task

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Request Body:**
```json
{
  "taskId": "uuid",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 5.0,
    "altitude": 10.5,
    "speed": 0.0,
    "heading": 180.0
  },
  "address": "123 Main St, New York, NY",
  "notes": "Starting work on site"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clock-entry-uuid",
    "companyId": "company-uuid",
    "userId": "user-uuid",
    "taskId": "task-uuid",
    "clockInTime": "2026-02-07T10:30:00Z",
    "clockInLat": 40.7128,
    "clockInLng": -74.0060,
    "clockInAddress": "123 Main St, New York, NY",
    "isActive": true,
    "task": {
      "id": "task-uuid",
      "taskDetailTitle": "Install Glass Panels",
      "categoryName": "Service TC",
      "status": "open"
    },
    "user": {
      "id": "user-uuid",
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com"
    }
  },
  "message": "Clocked in successfully"
}
```

**Validations:**
- ✅ User must not have an active clock entry
- ✅ User must be assigned to the task
- ✅ Task must exist and be accessible

**Error Responses:**
```json
// Already clocked in
{
  "success": false,
  "error": "Already clocked in to task: Install Panels. Please clock out first."
}

// Not assigned to task
{
  "success": false,
  "error": "You are not assigned to this task"
}
```

---

### 2. Clock Out

**Endpoint:** `POST /api/companies/:companyId/clock/out`

**Purpose:** Stop working on current task

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7130,
    "longitude": -74.0062,
    "accuracy": 5.0
  },
  "address": "123 Main St, New York, NY",
  "notes": "Work completed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clock-entry-uuid",
    "clockInTime": "2026-02-07T10:30:00Z",
    "clockOutTime": "2026-02-07T14:45:00Z",
    "durationMinutes": 255,
    "clockInLat": 40.7128,
    "clockInLng": -74.0060,
    "clockOutLat": 40.7130,
    "clockOutLng": -74.0062,
    "task": { ... },
    "user": { ... },
    "locationHistory": [...]
  },
  "message": "Clocked out successfully"
}
```

**Calculations:**
- Duration calculated automatically: `clockOutTime - clockInTime`
- Rounded to nearest minute
- Location history included in response

**Error Responses:**
```json
// No active session
{
  "success": false,
  "error": "No active clock entry found. Please clock in first."
}
```

---

### 3. Update Location

**Endpoint:** `POST /api/companies/:companyId/clock/location`

**Purpose:** Send GPS location update while clocked in

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Request Body:**
```json
{
  "clockEntryId": "uuid",
  "latitude": 40.7129,
  "longitude": -74.0061,
  "accuracy": 5.0,
  "altitude": 11.2,
  "speed": 0.5,
  "heading": 90.0,
  "address": "123 Main St, New York, NY"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "location-uuid",
    "clockEntryId": "clock-entry-uuid",
    "latitude": 40.7129,
    "longitude": -74.0061,
    "accuracy": 5.0,
    "timestamp": "2026-02-07T12:15:00Z"
  }
}
```

**Mobile App Usage:**
```javascript
// Send location updates every 5 minutes while clocked in
setInterval(async () => {
  if (hasActiveClock) {
    await updateLocation({
      clockEntryId: activeClock.id,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
    });
  }
}, 5 * 60 * 1000); // 5 minutes
```

---

### 4. Get Active Clock

**Endpoint:** `GET /api/companies/:companyId/clock/active`

**Purpose:** Check if user is currently clocked in

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Response (Active):**
```json
{
  "success": true,
  "data": {
    "hasActiveClock": true,
    "activeClock": {
      "id": "clock-entry-uuid",
      "clockInTime": "2026-02-07T10:30:00Z",
      "task": {
        "id": "task-uuid",
        "taskDetailTitle": "Install Glass Panels",
        "categoryName": "Service TC",
        "project": {
          "id": "project-uuid",
          "name": "Padel Court"
        }
      },
      "locationHistory": [
        {
          "latitude": 40.7128,
          "longitude": -74.0060,
          "timestamp": "2026-02-07T10:30:00Z"
        }
      ]
    }
  }
}
```

**Response (Not Active):**
```json
{
  "success": true,
  "data": {
    "hasActiveClock": false,
    "activeClock": null
  }
}
```

**Mobile App Usage:**
```javascript
// Check on app launch
const { hasActiveClock, activeClock } = await getActiveClock();

if (hasActiveClock) {
  // Resume tracking from active session
  startLocationUpdates(activeClock.id);
}
```

---

### 5. Get Clock Entries

**Endpoint:** `GET /api/companies/:companyId/clock/entries`

**Purpose:** List clock entries with filters

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Query Parameters:**
- `userId` (optional) - Filter by specific user
- `taskId` (optional) - Filter by specific task
- `startDate` (optional) - Filter entries after this date (ISO 8601)
- `endDate` (optional) - Filter entries before this date (ISO 8601)
- `isActive` (optional) - Filter by active status (`true` or `false`)

**Examples:**
```
GET /api/companies/123/clock/entries
GET /api/companies/123/clock/entries?userId=user-123
GET /api/companies/123/clock/entries?isActive=true
GET /api/companies/123/clock/entries?startDate=2026-02-01&endDate=2026-02-28
GET /api/companies/123/clock/entries?userId=user-123&taskId=task-456
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "entry-1",
      "clockInTime": "2026-02-07T10:30:00Z",
      "clockOutTime": "2026-02-07T14:45:00Z",
      "durationMinutes": 255,
      "task": { ... },
      "user": { ... },
      "locationHistory": [...]
    },
    {
      "id": "entry-2",
      "clockInTime": "2026-02-06T09:00:00Z",
      "clockOutTime": "2026-02-06T17:00:00Z",
      "durationMinutes": 480,
      "task": { ... },
      "user": { ... },
      "locationHistory": [...]
    }
  ],
  "count": 2
}
```

---

### 6. Get Clock Entry

**Endpoint:** `GET /api/companies/:companyId/clock/entries/:entryId`

**Purpose:** Get detailed information about a specific clock entry

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "entry-uuid",
    "clockInTime": "2026-02-07T10:30:00Z",
    "clockOutTime": "2026-02-07T14:45:00Z",
    "durationMinutes": 255,
    "clockInLat": 40.7128,
    "clockInLng": -74.0060,
    "clockOutLat": 40.7130,
    "clockOutLng": -74.0062,
    "task": {
      "id": "task-uuid",
      "taskDetailTitle": "Install Glass Panels",
      "project": { ... },
      "contact": { ... }
    },
    "user": { ... },
    "locationHistory": [
      {
        "id": "loc-1",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timestamp": "2026-02-07T10:30:00Z"
      },
      {
        "id": "loc-2",
        "latitude": 40.7129,
        "longitude": -74.0061,
        "timestamp": "2026-02-07T12:15:00Z"
      }
    ]
  }
}
```

---

### 7. Get Time Summary

**Endpoint:** `GET /api/companies/:companyId/clock/summary`

**Purpose:** Get time tracking summary for payroll/reporting

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Query Parameters:**
- `startDate` (required) - Start date (ISO 8601)
- `endDate` (required) - End date (ISO 8601)
- `userId` (optional) - Filter by specific user

**Examples:**
```
GET /api/companies/123/clock/summary?startDate=2026-02-01&endDate=2026-02-28
GET /api/companies/123/clock/summary?startDate=2026-02-01&endDate=2026-02-28&userId=user-123
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "user-123",
      "userName": "John Doe",
      "totalMinutes": 1200,
      "totalHours": 20.0,
      "entriesCount": 5,
      "taskBreakdown": [
        {
          "taskId": "task-1",
          "taskTitle": "Install Glass Panels",
          "minutes": 720,
          "hours": 12.0
        },
        {
          "taskId": "task-2",
          "taskTitle": "Transport Materials",
          "minutes": 480,
          "hours": 8.0
        }
      ]
    }
  ]
}
```

**Use Cases:**
- Weekly/monthly payroll reports
- Worker productivity analysis
- Project time allocation
- Billing clients based on hours worked

---

### 8. Get Location History

**Endpoint:** `GET /api/companies/:companyId/clock/entries/:entryId/locations`

**Purpose:** Get GPS trail for a specific clock entry

**Authentication:** Required (JWT)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "loc-1",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 5.0,
      "altitude": 10.5,
      "speed": 0.0,
      "heading": null,
      "timestamp": "2026-02-07T10:30:00Z",
      "address": "123 Main St, New York, NY"
    },
    {
      "id": "loc-2",
      "latitude": 40.7129,
      "longitude": -74.0061,
      "accuracy": 5.0,
      "altitude": 11.2,
      "speed": 0.5,
      "heading": 90.0,
      "timestamp": "2026-02-07T12:15:00Z",
      "address": "125 Main St, New York, NY"
    }
  ],
  "count": 2
}
```

**Visualization Use Cases:**
- Plot GPS trail on a map
- Verify worker visited job site
- Calculate distance traveled
- Identify routes taken

---

### 9. Force Clock Out (Admin)

**Endpoint:** `POST /api/companies/:companyId/clock/force-out/:userId`

**Purpose:** Admin emergency action to clock out a user

**Authentication:** Required (JWT + Admin)

**Middleware:** `authenticateJWT`, `verifyCompanyAccess`

**Request Body:**
```json
{
  "notes": "Emergency clock out - worker called in sick"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "entry-uuid",
    "clockInTime": "2026-02-07T10:30:00Z",
    "clockOutTime": "2026-02-07T15:00:00Z",
    "durationMinutes": 270,
    "notes": "Emergency clock out - worker called in sick"
  },
  "message": "User clocked out successfully"
}
```

**Use Cases:**
- Worker forgot to clock out
- Emergency situations
- System maintenance
- End-of-day automated clock out

---

## Mobile App Integration

### React Native Example

```typescript
import * as Location from 'expo-location';

// 1. Clock In
const clockIn = async (taskId: string) => {
  // Request location permissions
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    alert('Location permission required');
    return;
  }

  // Get current location
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  // Reverse geocode to get address
  const [address] = await Location.reverseGeocodeAsync({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });

  const addressString = `${address.street}, ${address.city}, ${address.region}`;

  // Clock in
  const response = await fetch(`${API_URL}/companies/${companyId}/clock/in`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId,
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
      },
      address: addressString,
    }),
  });

  const data = await response.json();

  if (data.success) {
    // Start background location tracking
    startLocationTracking(data.data.id);
  }
};

// 2. Background Location Tracking
const startLocationTracking = async (clockEntryId: string) => {
  // Request background location permission
  await Location.requestBackgroundPermissionsAsync();

  // Start location updates every 5 minutes
  await Location.startLocationUpdatesAsync('clock-location-tracking', {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5 * 60 * 1000, // 5 minutes
    distanceInterval: 100, // 100 meters
    foregroundService: {
      notificationTitle: 'Tracking your location',
      notificationBody: 'We\'re tracking your location while you work',
    },
  });
};

// 3. Location Update Task (runs in background)
TaskManager.defineTask('clock-location-tracking', async ({ data, error }) => {
  if (error) {
    console.error(error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];

    // Send to server
    await fetch(`${API_URL}/companies/${companyId}/clock/location`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clockEntryId: activeClockId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
      }),
    });
  }
});

// 4. Clock Out
const clockOut = async () => {
  // Stop location tracking
  await Location.stopLocationUpdatesAsync('clock-location-tracking');

  // Get final location
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const [address] = await Location.reverseGeocodeAsync({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });

  const addressString = `${address.street}, ${address.city}, ${address.region}`;

  // Clock out
  const response = await fetch(`${API_URL}/companies/${companyId}/clock/out`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      },
      address: addressString,
    }),
  });

  const data = await response.json();
  console.log('Clocked out:', data);
};
```

---

## Business Logic & Rules

### 1. Single Active Session Rule
- ✅ User can only be clocked into ONE task at a time
- ✅ Must clock out before clocking into another task
- ✅ Prevents time tracking conflicts

### 2. Task Assignment Validation
- ✅ Users can only clock into tasks they're assigned to
- ✅ Checked via `TaskAssignment` table
- ✅ Prevents unauthorized time tracking

### 3. Automatic Duration Calculation
- ✅ Duration calculated on clock out
- ✅ Formula: `(clockOutTime - clockInTime) / 60` (minutes)
- ✅ Rounded to nearest minute
- ✅ Stored in `durationMinutes` field

### 4. Location Privacy
- ✅ Location data only tracked while clocked in
- ✅ Location updates optional (can clock in/out without GPS)
- ✅ Geocoded addresses stored separately
- ✅ Full GPS trail available for verification

---

## Database Indexes

Optimized for common queries:

```sql
-- Clock Entries
CREATE INDEX idx_clock_entries_company_id ON clock_entries(company_id);
CREATE INDEX idx_clock_entries_user_id ON clock_entries(user_id);
CREATE INDEX idx_clock_entries_task_id ON clock_entries(task_id);
CREATE INDEX idx_clock_entries_clock_in_time ON clock_entries(clock_in_time);
CREATE INDEX idx_clock_entries_is_active ON clock_entries(is_active);
CREATE INDEX idx_clock_entries_user_active ON clock_entries(user_id, is_active);

-- Clock Locations
CREATE INDEX idx_clock_locations_clock_entry_id ON clock_locations(clock_entry_id);
CREATE INDEX idx_clock_locations_timestamp ON clock_locations(timestamp);
```

**Query Performance:**
- Finding active clock: `O(1)` with `user_id + is_active` index
- Date range queries: Fast with `clock_in_time` index
- Location history: Fast with `clock_entry_id` index

---

## Security Considerations

### 1. Authorization
- ✅ All endpoints require JWT authentication
- ✅ Company access verified via middleware
- ✅ Users can only clock in/out for themselves
- ✅ Admin endpoints have separate validation (force clock out)

### 2. Data Privacy
- ✅ Users can only see their own clock entries (unless admin)
- ✅ GPS data encrypted in transit (HTTPS)
- ✅ Location data scoped to work sessions only

### 3. Tampering Prevention
- ✅ Clock in/out times set server-side (can't be manipulated)
- ✅ Duration calculated server-side
- ✅ Location timestamps from server, not client

---

## Best Practices

### Mobile App

**1. Handle Location Permissions Gracefully**
```typescript
if (!hasLocationPermission) {
  // Allow clock in without location
  // Show warning that GPS tracking won't be available
}
```

**2. Battery Optimization**
```typescript
// Use balanced accuracy, not high
// Update every 5-10 minutes, not every second
// Stop tracking when clocked out
```

**3. Offline Support**
```typescript
// Queue location updates if offline
// Sync when connection restored
// Show user if data is pending sync
```

**4. User Feedback**
```typescript
// Show clear clock in/out status
// Display elapsed time while working
// Notification while clocked in
```

### Backend

**1. Validation**
- Always validate task assignment before clock in
- Check for existing active sessions
- Validate GPS coordinates (latitude: -90 to 90, longitude: -180 to 180)

**2. Error Handling**
- Graceful handling of missing location data
- Clear error messages for validation failures
- Retry logic for location updates

**3. Performance**
- Batch location updates if receiving high volume
- Use database indexes for all common queries
- Archive old entries periodically

---

## Reporting & Analytics

### Payroll Report
```sql
SELECT
  u.name,
  u.email,
  SUM(ce.duration_minutes) as total_minutes,
  ROUND(SUM(ce.duration_minutes)::numeric / 60, 2) as total_hours,
  COUNT(*) as entries_count
FROM clock_entries ce
JOIN users u ON ce.user_id = u.id
WHERE
  ce.company_id = $1
  AND ce.clock_in_time >= $2
  AND ce.clock_in_time <= $3
  AND ce.clock_out_time IS NOT NULL
GROUP BY u.id, u.name, u.email
ORDER BY total_hours DESC;
```

### Task Time Allocation
```sql
SELECT
  t.task_detail_title,
  SUM(ce.duration_minutes) as total_minutes,
  ROUND(SUM(ce.duration_minutes)::numeric / 60, 2) as total_hours,
  COUNT(DISTINCT ce.user_id) as unique_workers
FROM clock_entries ce
JOIN tasks t ON ce.task_id = t.id
WHERE ce.company_id = $1
GROUP BY t.task_detail_title
ORDER BY total_hours DESC;
```

---

## Future Enhancements

### Geofencing
- Define virtual boundaries around job sites
- Alert if worker leaves geofence while clocked in
- Auto clock out if geofence violated

### Breaks & Pauses
- Support for lunch breaks (pause/resume)
- Track break duration separately
- Compliance with labor laws

### Photo Verification
- Require photo at clock in/out
- Verify worker is on-site
- Attach photos to clock entries

### Automated Clock Out
- End-of-day automatic clock out
- Configurable cutoff time
- Notification before auto clock out

---

**Version:** 1.0.0
**Last Updated:** February 7, 2026
**Status:** ✅ Production Ready
