import { Router } from 'express';
import { authenticateJWT } from '@/middleware/authenticate';
import { verifyCompanyAccess } from '@/middleware/verifyCompanyAccess';
import {
    handleCreateAbsence,
    handleGetAbsences,
    handleUpdateAbsenceStatus,
} from './controller';

export const absenceRouter = Router();

// Absence routes (require authentication and company access)
// POST /companies/:companyId/absences - Create absence request
absenceRouter.post('/companies/:companyId/absences', authenticateJWT, verifyCompanyAccess, handleCreateAbsence);

// GET /companies/:companyId/absences - Get absences (with role-based filtering)
absenceRouter.get('/companies/:companyId/absences', authenticateJWT, verifyCompanyAccess, handleGetAbsences);

// PATCH /companies/:companyId/absences/:absenceId/status - Approve/Reject absence
absenceRouter.patch(
    '/companies/:companyId/absences/:absenceId/status',
    authenticateJWT,
    verifyCompanyAccess,
    handleUpdateAbsenceStatus
);
