import { Request, Response, NextFunction } from 'express';
import {
  clockIn,
  clockOut,
  updateLocation,
  getActiveClock,
  getActiveClockEntries,
  getClockEntries,
  getClockEntryById,
  getTimeSummary,
  getLocationHistory,
  forceClockOut,
} from './db';
import { ClockInInput, ClockOutInput, LocationUpdateInput } from './types';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/core/utils/errors';

const ensureString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0];
  return value || '';
};

/**
 * POST /api/companies/:companyId/clock/in
 * Clock in to start working on a task
 */
export const handleClockIn = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const userId = req.user?.userId;

    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    const input: ClockInInput = req.body;

    if (!input.taskId) {
      throw new BadRequestError('Task ID is required');
    }

    const clockEntry = await clockIn(companyId, userId, input);

    res.status(201).json({
      success: true,
      data: clockEntry,
      message: 'Clocked in successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:companyId/clock/out
 * Clock out to stop working on current task
 */
export const handleClockOut = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    const input: ClockOutInput = req.body;

    const clockEntry = await clockOut(userId, input);

    res.json({
      success: true,
      data: clockEntry,
      message: 'Clocked out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:companyId/clock/location
 * Update GPS location while clocked in
 */
export const handleUpdateLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    const input: LocationUpdateInput = req.body;

    if (!input.clockEntryId || !input.latitude || !input.longitude) {
      throw new BadRequestError('Clock entry ID, latitude, and longitude are required');
    }

    const location = await updateLocation(userId, input);

    res.status(201).json({
      success: true,
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/active
 * Get current active clock entry for authenticated user
 */
export const handleGetActiveClock = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    const activeClock = await getActiveClock(userId);

    res.json({
      success: true,
      data: {
        hasActiveClock: !!activeClock,
        activeClock: activeClock || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/entries
 * Get clock entries with optional filters
 */
export const handleGetClockEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const { userId, taskId, startDate, endDate, isActive } = req.query;

    const entries = await getClockEntries(companyId, {
      userId: userId as string,
      taskId: taskId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    res.json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/entries/:entryId
 * Get a specific clock entry by ID
 */
export const handleGetClockEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const entryId = ensureString(req.params.entryId);

    const entry = await getClockEntryById(companyId, entryId);

    if (!entry) {
      throw new NotFoundError('Clock entry not found');
    }

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/summary
 * Get time summary for reporting/payroll
 */
export const handleGetTimeSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const { startDate, endDate, userId } = req.query;

    if (!startDate || !endDate) {
      throw new BadRequestError('Start date and end date are required');
    }

    const summary = await getTimeSummary(
      companyId,
      new Date(startDate as string),
      new Date(endDate as string),
      userId as string
    );

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/entries/:entryId/locations
 * Get location history for a clock entry
 */
export const handleGetLocationHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const entryId = ensureString(req.params.entryId);

    const locations = await getLocationHistory(entryId);

    res.json({
      success: true,
      data: locations,
      count: locations.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/clock/active-entries
 * Get all active clock entries for the company (all clocked-in users)
 */
export const handleGetActiveClockEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);

    const entries = await getActiveClockEntries(companyId);

    res.json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:companyId/clock/force-out/:userId
 * Admin: Force clock out a user (emergency)
 */
export const handleForceClockOut = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const targetUserId = ensureString(req.params.userId);
    const { notes } = req.body;

    // TODO: Add admin permission check here
    // For now, any authenticated user in the company can force clock out

    const clockEntry = await forceClockOut(companyId, targetUserId, notes);

    res.json({
      success: true,
      data: clockEntry,
      message: 'User clocked out successfully',
    });
  } catch (error) {
    next(error);
  }
};
