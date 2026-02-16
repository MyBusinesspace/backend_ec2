import { Request, Response, NextFunction } from 'express';
import {
    createPettyCash,
    getPettyCashExpenses,
    getPettyCashById,
    updatePettyCashStatus,
    getUserExpenseSummary,
    getCompanyExpenseSummary,
    getCompanyUser,
} from './db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { PettyCashStatus, CompanyUserRole } from '@prisma/client';

// Helper to ensure string
const ensureString = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value || '';
};

/**
 * POST /companies/:companyId/petty-cash
 * Create a new petty cash expense
 */
export const handleCreatePettyCash = async (
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

        const { amount, currency = 'EUR', date, description, receiptUrl } = req.body;

        // Validate required fields
        if (!amount || !date || !description) {
            throw new BadRequestError('Missing required fields: amount, date, description');
        }

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new BadRequestError('Amount must be a positive number');
        }

        // Get CompanyUser record
        const companyUser = await getCompanyUser(userId, companyId);
        if (!companyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        // Parse date
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            throw new BadRequestError('Invalid date format');
        }

        const expense = await createPettyCash({
            companyId,
            companyUserId: companyUser.id,
            amount: parsedAmount,
            currency,
            date: parsedDate,
            description,
            receiptUrl,
        });

        res.status(201).json({
            success: true,
            expense: {
                id: expense.id,
                amount: parseFloat(expense.amount.toString()),
                currency: expense.currency,
                date: expense.date,
                description: expense.description,
                receiptUrl: expense.receiptUrl,
                status: expense.status,
                user: {
                    id: expense.companyUser.userId,
                    name: expense.companyUser.user.name,
                    surname: expense.companyUser.user.surname,
                    email: expense.companyUser.user.email,
                },
                createdAt: expense.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /companies/:companyId/petty-cash
 * Get petty cash expenses with role-based access control
 */
export const handleGetPettyCashExpenses = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const userId = req.user?.userId;
        const requestedUserId = req.query.userId
            ? ensureString(req.query.userId as string | string[])
            : undefined;
        const status = req.query.status as PettyCashStatus | undefined;
        const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
        const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

        if (!userId) {
            throw new ForbiddenError('User not authenticated');
        }

        // Get current user's CompanyUser record to check role
        const currentCompanyUser = await getCompanyUser(userId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        const role = currentCompanyUser.role;

        // Determine which expenses to return based on role
        let filterCompanyUserId: string | undefined;

        if (role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN) {
            // ADMIN/OWNER can see all expenses or filter by specific user
            if (requestedUserId) {
                const targetCompanyUser = await getCompanyUser(requestedUserId, companyId);
                if (!targetCompanyUser) {
                    throw new BadRequestError('Target user does not belong to this company');
                }
                filterCompanyUserId = targetCompanyUser.id;
            }
            // No filter means all expenses
        } else {
            // EMPLOYEE or MANAGER: ONLY their own expenses
            filterCompanyUserId = currentCompanyUser.id;
        }

        const expenses = await getPettyCashExpenses({
            companyId,
            companyUserId: filterCompanyUserId,
            status,
            dateFrom,
            dateTo,
        });

        res.status(200).json({
            success: true,
            expenses: expenses.map((expense) => ({
                id: expense.id,
                amount: parseFloat(expense.amount.toString()),
                currency: expense.currency,
                date: expense.date,
                description: expense.description,
                receiptUrl: expense.receiptUrl,
                status: expense.status,
                user: {
                    id: expense.companyUser.userId,
                    name: expense.companyUser.user.name,
                    surname: expense.companyUser.user.surname,
                    email: expense.companyUser.user.email,
                },
                createdAt: expense.createdAt,
                updatedAt: expense.updatedAt,
            })),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /companies/:companyId/petty-cash/summary
 * Get expense summary (ADMIN only for company-wide, users see their own)
 */
export const handleGetExpenseSummary = async (
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

        const currentCompanyUser = await getCompanyUser(userId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        const role = currentCompanyUser.role;

        if (role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN) {
            // ADMIN/OWNER: Company-wide summary
            const summary = await getCompanyExpenseSummary(companyId);
            res.status(200).json({
                success: true,
                summary,
            });
        } else {
            // Regular user: Only their own summary
            const summary = await getUserExpenseSummary(currentCompanyUser.id);
            res.status(200).json({
                success: true,
                summary,
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * PATCH /companies/:companyId/petty-cash/:expenseId/status
 * Approve or reject an expense (ADMIN only)
 */
export const handleUpdatePettyCashStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const expenseId = ensureString(req.params.expenseId);
        const userId = req.user?.userId;
        const { status } = req.body;

        if (!userId) {
            throw new ForbiddenError('User not authenticated');
        }

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        // Validate status
        if (status !== PettyCashStatus.APPROVED && status !== PettyCashStatus.REJECTED) {
            throw new BadRequestError('Status must be APPROVED or REJECTED');
        }

        // Get current user's role
        const currentCompanyUser = await getCompanyUser(userId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        // Only ADMIN or OWNER can approve/reject
        if (
            currentCompanyUser.role !== CompanyUserRole.OWNER &&
            currentCompanyUser.role !== CompanyUserRole.ADMIN
        ) {
            throw new ForbiddenError('Only administrators can approve expenses');
        }

        // Get the expense to check ownership
        const expense = await getPettyCashById(expenseId);

        // Verify the expense belongs to the company
        if (expense.companyId !== companyId) {
            throw new NotFoundError('Expense not found in this company');
        }

        const updatedExpense = await updatePettyCashStatus(expenseId, { status });

        res.status(200).json({
            success: true,
            expense: {
                id: updatedExpense.id,
                amount: parseFloat(updatedExpense.amount.toString()),
                currency: updatedExpense.currency,
                date: updatedExpense.date,
                description: updatedExpense.description,
                receiptUrl: updatedExpense.receiptUrl,
                status: updatedExpense.status,
                user: {
                    id: updatedExpense.companyUser.userId,
                    name: updatedExpense.companyUser.user.name,
                    surname: updatedExpense.companyUser.user.surname,
                    email: updatedExpense.companyUser.user.email,
                },
                updatedAt: updatedExpense.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /companies/:companyId/petty-cash/:expenseId
 * Get specific expense
 */
export const handleGetPettyCashById = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const expenseId = ensureString(req.params.expenseId);
        const userId = req.user?.userId;

        if (!userId) {
            throw new ForbiddenError('User not authenticated');
        }

        const currentCompanyUser = await getCompanyUser(userId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        const expense = await getPettyCashById(expenseId);

        // Verify the expense belongs to the company
        if (expense.companyId !== companyId) {
            throw new NotFoundError('Expense not found in this company');
        }

        // Check access rights
        const role = currentCompanyUser.role;
        const isAdmin = role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN;
        const isOwner = expense.companyUserId === currentCompanyUser.id;

        if (!isAdmin && !isOwner) {
            throw new ForbiddenError('You do not have access to this expense');
        }

        res.status(200).json({
            success: true,
            expense: {
                id: expense.id,
                amount: parseFloat(expense.amount.toString()),
                currency: expense.currency,
                date: expense.date,
                description: expense.description,
                receiptUrl: expense.receiptUrl,
                status: expense.status,
                user: {
                    id: expense.companyUser.userId,
                    name: expense.companyUser.user.name,
                    surname: expense.companyUser.user.surname,
                    email: expense.companyUser.user.email,
                },
                createdAt: expense.createdAt,
                updatedAt: expense.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};
