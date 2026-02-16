// ==================== Input Types ====================

export interface ClockInInput {
  taskId: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  address?: string;
  notes?: string;
}

export interface ClockOutInput {
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  address?: string;
  notes?: string;
}

export interface LocationUpdateInput {
  clockEntryId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  address?: string;
}

export interface GetClockEntriesQuery {
  userId?: string;
  taskId?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

// ==================== Output Types ====================

export interface ClockEntryResponse {
  id: string;
  companyId: string;
  userId: string;
  taskId: string;
  clockInTime: Date;
  clockInLat?: number;
  clockInLng?: number;
  clockInAddress?: string;
  clockOutTime?: Date;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutAddress?: string;
  durationMinutes?: number;
  notes?: string;
  isActive: boolean;
  task?: {
    id: string;
    taskDetailTitle: string;
    categoryName: string;
    status: string;
  };
  user?: {
    id: string;
    name: string;
    surname: string;
    email: string;
  };
  locationHistory?: ClockLocationResponse[];
}

export interface ClockLocationResponse {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: Date;
  address?: string;
}

export interface ActiveClockResponse {
  hasActiveClock: boolean;
  activeClock?: ClockEntryResponse;
}

export interface ClockSummary {
  userId: string;
  userName: string;
  totalHours: number;
  totalMinutes: number;
  entriesCount: number;
  taskBreakdown: {
    taskId: string;
    taskTitle: string;
    minutes: number;
    hours: number;
  }[];
}

// ==================== Validation Types ====================

export interface ClockValidation {
  isValid: boolean;
  error?: string;
  code?: string;
}
