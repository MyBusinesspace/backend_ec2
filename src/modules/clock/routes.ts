import { Router } from 'express';
import { authenticateJWT } from '@/core/middleware/authenticate';
import { verifyCompanyAccess } from '@/core/middleware/verifyCompanyAccess';
import {
  handleClockIn,
  handleClockOut,
  handleUpdateLocation,
  handleGetActiveClock,
  handleGetActiveClockEntries,
  handleGetClockEntries,
  handleGetClockEntry,
  handleGetTimeSummary,
  handleGetLocationHistory,
  handleForceClockOut,
} from './controller';

export const clockRouter = Router();

// All routes require authentication
clockRouter.use(authenticateJWT);

/**
 * Clock Management Routes
 */

// Clock In - Start working on a task
clockRouter.post('/companies/:companyId/clock/in', verifyCompanyAccess, handleClockIn);

// Clock Out - Stop working on current task
clockRouter.post('/companies/:companyId/clock/out', verifyCompanyAccess, handleClockOut);

// Update Location - Real-time GPS tracking
clockRouter.post('/companies/:companyId/clock/location', verifyCompanyAccess, handleUpdateLocation);

// Get Active Clock - Check if user is currently clocked in
clockRouter.get('/companies/:companyId/clock/active', verifyCompanyAccess, handleGetActiveClock);

// Get Active Clock Entries - All clocked-in users in the company (for map/dashboard)
clockRouter.get('/companies/:companyId/clock/active-entries', verifyCompanyAccess, handleGetActiveClockEntries);

/**
 * Clock History & Reporting Routes
 */

// Get Clock Entries - List all clock entries with filters
clockRouter.get('/companies/:companyId/clock/entries', verifyCompanyAccess, handleGetClockEntries);

// Get Clock Entry - Get specific entry by ID
clockRouter.get(
  '/companies/:companyId/clock/entries/:entryId',
  verifyCompanyAccess,
  handleGetClockEntry
);

// Get Time Summary - Reporting and payroll data
clockRouter.get('/companies/:companyId/clock/summary', verifyCompanyAccess, handleGetTimeSummary);

// Get Location History - GPS trail for a clock entry
clockRouter.get(
  '/companies/:companyId/clock/entries/:entryId/locations',
  verifyCompanyAccess,
  handleGetLocationHistory
);

/**
 * Admin Routes
 */

// Force Clock Out - Admin emergency action
clockRouter.post(
  '/companies/:companyId/clock/force-out/:userId',
  verifyCompanyAccess,
  handleForceClockOut
);
