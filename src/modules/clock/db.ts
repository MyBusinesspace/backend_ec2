import { prisma } from '@/core/database/prisma';
import { ClockInInput, ClockOutInput, LocationUpdateInput, GetClockEntriesQuery } from './types';

/**
 * Clock In - Start tracking time for a task
 * Validates that user doesn't have an active clock entry
 */
export const clockIn = async (
  companyId: string,
  userId: string,
  input: ClockInInput
) => {
  return prisma.$transaction(async (tx) => {
    // Check if user already has an active clock entry
    const activeEntry = await tx.clockEntry.findFirst({
      where: {
        userId,
        clockOutTime: null,
        isActive: true,
      },
      include: {
        task: {
          select: {
            taskDetailTitle: true,
          },
        },
      },
    });

    if (activeEntry) {
      throw new Error(
        `Already clocked in to task: ${activeEntry.task.taskDetailTitle}. Please clock out first.`
      );
    }

    // Verify user is assigned to this task
    const taskAssignment = await tx.taskAssignment.findFirst({
      where: {
        taskId: input.taskId,
        userId,
      },
    });

    if (!taskAssignment) {
      throw new Error('You are not assigned to this task');
    }

    // Create clock entry
    const clockEntry = await tx.clockEntry.create({
      data: {
        companyId,
        userId,
        taskId: input.taskId,
        clockInTime: new Date(),
        clockInLat: input.location?.latitude,
        clockInLng: input.location?.longitude,
        clockInAddress: input.address,
        notes: input.notes,
        isActive: true,
      },
      include: {
        task: {
          select: {
            id: true,
            taskDetailTitle: true,
            categoryName: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
      },
    });

    // Create initial location record if location provided
    if (input.location) {
      await tx.clockLocation.create({
        data: {
          clockEntryId: clockEntry.id,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracy: input.location.accuracy,
          altitude: input.location.altitude,
          speed: input.location.speed,
          heading: input.location.heading,
          timestamp: new Date(),
          address: input.address,
        },
      });
    }

    return clockEntry;
  });
};

/**
 * Clock Out - Stop tracking time for current task
 */
export const clockOut = async (userId: string, input: ClockOutInput) => {
  return prisma.$transaction(async (tx) => {
    // Find active clock entry
    const activeEntry = await tx.clockEntry.findFirst({
      where: {
        userId,
        clockOutTime: null,
        isActive: true,
      },
    });

    if (!activeEntry) {
      throw new Error('No active clock entry found. Please clock in first.');
    }

    const clockOutTime = new Date();
    const durationMinutes = Math.round(
      (clockOutTime.getTime() - activeEntry.clockInTime.getTime()) / (1000 * 60)
    );

    // Update clock entry
    const updatedEntry = await tx.clockEntry.update({
      where: { id: activeEntry.id },
      data: {
        clockOutTime,
        clockOutLat: input.location?.latitude,
        clockOutLng: input.location?.longitude,
        clockOutAddress: input.address,
        durationMinutes,
        notes: input.notes || activeEntry.notes,
      },
      include: {
        task: {
          select: {
            id: true,
            taskDetailTitle: true,
            categoryName: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
        locationHistory: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    // Create final location record if location provided
    if (input.location) {
      await tx.clockLocation.create({
        data: {
          clockEntryId: activeEntry.id,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracy: input.location.accuracy,
          altitude: input.location.altitude,
          speed: input.location.speed,
          heading: input.location.heading,
          timestamp: clockOutTime,
          address: input.address,
        },
      });
    }

    return updatedEntry;
  });
};

/**
 * Update location while clocked in
 * Used for real-time GPS tracking during work
 */
export const updateLocation = async (
  userId: string,
  input: LocationUpdateInput
) => {
  // Verify the clock entry belongs to this user and is active
  const clockEntry = await prisma.clockEntry.findFirst({
    where: {
      id: input.clockEntryId,
      userId,
      clockOutTime: null,
      isActive: true,
    },
  });

  if (!clockEntry) {
    throw new Error('Clock entry not found or not active');
  }

  // Create location record
  return prisma.clockLocation.create({
    data: {
      clockEntryId: input.clockEntryId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      altitude: input.altitude,
      speed: input.speed,
      heading: input.heading,
      timestamp: new Date(),
      address: input.address,
    },
  });
};

/**
 * Get active clock entry for a user
 */
export const getActiveClock = async (userId: string) => {
  return prisma.clockEntry.findFirst({
    where: {
      userId,
      clockOutTime: null,
      isActive: true,
    },
    include: {
      task: {
        select: {
          id: true,
          taskDetailTitle: true,
          categoryName: true,
          status: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          contact: {
            select: {
              id: true,
              contactName: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
        },
      },
      locationHistory: {
        orderBy: { timestamp: 'desc' },
        take: 1, // Get last known location
      },
    },
  });
};

/**
 * Get clock entries with filters
 */
export const getClockEntries = async (
  companyId: string,
  query: GetClockEntriesQuery
) => {
  const where: any = {
    companyId,
  };

  if (query.userId) {
    where.userId = query.userId;
  }

  if (query.taskId) {
    where.taskId = query.taskId;
  }

  if (query.startDate || query.endDate) {
    where.clockInTime = {};
    if (query.startDate) {
      where.clockInTime.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.clockInTime.lte = new Date(query.endDate);
    }
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
    if (query.isActive) {
      where.clockOutTime = null;
    }
  }

  return prisma.clockEntry.findMany({
    where,
    include: {
      task: {
        select: {
          id: true,
          taskDetailTitle: true,
          categoryName: true,
          status: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          avatar: true,
        },
      },
      locationHistory: {
        select: {
          id: true,
          latitude: true,
          longitude: true,
          timestamp: true,
          address: true,
        },
        orderBy: { timestamp: 'asc' },
      },
    },
    orderBy: { clockInTime: 'desc' },
  });
};

/**
 * Get a specific clock entry by ID
 */
export const getClockEntryById = async (companyId: string, clockEntryId: string) => {
  return prisma.clockEntry.findFirst({
    where: {
      id: clockEntryId,
      companyId,
    },
    include: {
      task: {
        select: {
          id: true,
          taskDetailTitle: true,
          categoryName: true,
          status: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          contact: {
            select: {
              id: true,
              contactName: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          avatar: true,
        },
      },
      locationHistory: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });
};

/**
 * Get time summary for users
 * Useful for payroll and reporting
 */
export const getTimeSummary = async (
  companyId: string,
  startDate: Date,
  endDate: Date,
  userId?: string
) => {
  const where: any = {
    companyId,
    clockInTime: {
      gte: startDate,
      lte: endDate,
    },
    clockOutTime: { not: null }, // Only completed entries
  };

  if (userId) {
    where.userId = userId;
  }

  const entries = await prisma.clockEntry.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
        },
      },
      task: {
        select: {
          id: true,
          taskDetailTitle: true,
        },
      },
    },
  });

  // Group by user
  const userSummaries = entries.reduce((acc, entry) => {
    const userId = entry.userId;
    const userName = `${entry.user.name || ''} ${entry.user.surname || ''}`.trim();

    if (!acc[userId]) {
      acc[userId] = {
        userId,
        userName,
        totalMinutes: 0,
        totalHours: 0,
        entriesCount: 0,
        taskBreakdown: {},
      };
    }

    acc[userId].totalMinutes += entry.durationMinutes || 0;
    acc[userId].entriesCount += 1;

    // Task breakdown
    const taskId = entry.taskId;
    if (!acc[userId].taskBreakdown[taskId]) {
      acc[userId].taskBreakdown[taskId] = {
        taskId,
        taskTitle: entry.task.taskDetailTitle,
        minutes: 0,
        hours: 0,
      };
    }
    acc[userId].taskBreakdown[taskId].minutes += entry.durationMinutes || 0;

    return acc;
  }, {} as any);

  // Convert to array and calculate hours
  return Object.values(userSummaries).map((summary: any) => {
    summary.totalHours = Math.round((summary.totalMinutes / 60) * 100) / 100;
    summary.taskBreakdown = Object.values(summary.taskBreakdown).map((task: any) => {
      task.hours = Math.round((task.minutes / 60) * 100) / 100;
      return task;
    });
    return summary;
  });
};

/**
 * Get location history for a clock entry
 */
export const getLocationHistory = async (clockEntryId: string) => {
  return prisma.clockLocation.findMany({
    where: { clockEntryId },
    orderBy: { timestamp: 'asc' },
  });
};

/**
 * Get all active clock entries for a company (all currently clocked-in users)
 * Used for the timer/map dashboard to show where employees are working
 */
export const getActiveClockEntries = async (companyId: string) => {
  return prisma.clockEntry.findMany({
    where: {
      companyId,
      clockOutTime: null,
      isActive: true,
    },
    include: {
      task: {
        select: {
          id: true,
          taskDetailTitle: true,
          categoryName: true,
          status: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          avatar: true,
        },
      },
      locationHistory: {
        select: {
          id: true,
          latitude: true,
          longitude: true,
          accuracy: true,
          speed: true,
          timestamp: true,
          address: true,
        },
        orderBy: { timestamp: 'asc' }, // Chronological order for trail drawing
      },
    },
    orderBy: { clockInTime: 'desc' },
  });
};

/**
 * Admin: Force clock out a user (emergency situations)
 */
export const forceClockOut = async (
  companyId: string,
  userId: string,
  notes?: string
) => {
  const activeEntry = await prisma.clockEntry.findFirst({
    where: {
      companyId,
      userId,
      clockOutTime: null,
      isActive: true,
    },
  });

  if (!activeEntry) {
    throw new Error('No active clock entry found for this user');
  }

  const clockOutTime = new Date();
  const durationMinutes = Math.round(
    (clockOutTime.getTime() - activeEntry.clockInTime.getTime()) / (1000 * 60)
  );

  return prisma.clockEntry.update({
    where: { id: activeEntry.id },
    data: {
      clockOutTime,
      durationMinutes,
      notes: notes || activeEntry.notes,
    },
    include: {
      task: true,
      user: true,
    },
  });
};
