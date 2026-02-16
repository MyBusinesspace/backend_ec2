import { Router } from 'express';
import { authenticateJWT } from '@/middleware/authenticate';
import { verifyCompanyAccess } from '@/middleware/verifyCompanyAccess';
import {
    handleCreatePettyCash,
    handleGetPettyCashExpenses,
    handleGetExpenseSummary,
    handleUpdatePettyCashStatus,
    handleGetPettyCashById,
} from './controller';

export const pettyCashRouter = Router();

// Petty Cash routes (require authentication and company access)
// POST /companies/:companyId/petty-cash - Create expense
pettyCashRouter.post(
    '/companies/:companyId/petty-cash',
    authenticateJWT,
    verifyCompanyAccess,
    handleCreatePettyCash
);

// GET /companies/:companyId/petty-cash - Get expenses (with role-based filtering)
pettyCashRouter.get(
    '/companies/:companyId/petty-cash',
    authenticateJWT,
    verifyCompanyAccess,
    handleGetPettyCashExpenses
);

// GET /companies/:companyId/petty-cash/summary - Get expense summary
pettyCashRouter.get(
    '/companies/:companyId/petty-cash/summary',
    authenticateJWT,
    verifyCompanyAccess,
    handleGetExpenseSummary
);

// GET /companies/:companyId/petty-cash/:expenseId - Get specific expense
pettyCashRouter.get(
    '/companies/:companyId/petty-cash/:expenseId',
    authenticateJWT,
    verifyCompanyAccess,
    handleGetPettyCashById
);

// PATCH /companies/:companyId/petty-cash/:expenseId/status - Approve/Reject expense
pettyCashRouter.patch(
    '/companies/:companyId/petty-cash/:expenseId/status',
    authenticateJWT,
    verifyCompanyAccess,
    handleUpdatePettyCashStatus
);
