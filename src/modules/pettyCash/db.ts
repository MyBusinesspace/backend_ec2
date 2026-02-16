import { prisma } from '@/database/prisma';
import { CreatePettyCashInput, GetPettyCashFilters, UpdatePettyCashStatusInput } from './types';
import { PettyCashStatus } from '@prisma/client';
import { NotFoundError, BadRequestError } from '@/utils/errors';

/**
 * Get CompanyUser record for a userId and companyId
 */
export const getCompanyUser = async (userId: string, companyId: string) => {
    return await prisma.companyUser.findFirst({
        where: {
            userId,
            companyId,
        },
        include: {
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
};

/**
 * Create a new petty cash expense
 */
export const createPettyCash = async (data: CreatePettyCashInput) => {
    // Validate amount
    if (data.amount <= 0) {
        throw new BadRequestError('Amount must be greater than 0');
    }

    return await prisma.pettyCash.create({
        data: {
            companyId: data.companyId,
            companyUserId: data.companyUserId,
            amount: data.amount,
            currency: data.currency.toUpperCase(),
            date: data.date,
            description: data.description,
            receiptUrl: data.receiptUrl,
            status: PettyCashStatus.PENDING,
        },
        include: {
            companyUser: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
};

/**
 * Get petty cash expenses with filters
 */
export const getPettyCashExpenses = async (filters: GetPettyCashFilters) => {
    const where: any = {
        companyId: filters.companyId,
    };

    if (filters.companyUserId) {
        where.companyUserId = filters.companyUserId;
    }

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
        where.date = {};
        if (filters.dateFrom) {
            where.date.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
            where.date.lte = filters.dateTo;
        }
    }

    return await prisma.pettyCash.findMany({
        where,
        include: {
            companyUser: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            date: 'desc',
        },
    });
};

/**
 * Get petty cash expense by ID
 */
export const getPettyCashById = async (expenseId: string) => {
    const expense = await prisma.pettyCash.findUnique({
        where: { id: expenseId },
        include: {
            companyUser: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });

    if (!expense) {
        throw new NotFoundError('Expense not found');
    }

    return expense;
};

/**
 * Update petty cash status (approve/reject)
 */
export const updatePettyCashStatus = async (
    expenseId: string,
    data: UpdatePettyCashStatusInput
) => {
    const expense = await getPettyCashById(expenseId);

    if (expense.status !== PettyCashStatus.PENDING) {
        throw new BadRequestError('Only pending expenses can be updated');
    }

    return await prisma.pettyCash.update({
        where: { id: expenseId },
        data: {
            status: data.status,
            updatedAt: new Date(),
        },
        include: {
            companyUser: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
};

/**
 * Calculate total expenses by user
 */
export const getUserExpenseSummary = async (companyUserId: string) => {
    const totals = await prisma.pettyCash.groupBy({
        by: ['status', 'currency'],
        where: {
            companyUserId,
        },
        _sum: {
            amount: true,
        },
    });

    // Convert to a more usable format
    const summary: any = {
        approved: {},
        pending: {},
        rejected: {},
    };

    totals.forEach((total) => {
        const amount = total._sum.amount ? parseFloat(total._sum.amount.toString()) : 0;
        const currency = total.currency;
        const status = total.status.toLowerCase();

        if (!summary[status][currency]) {
            summary[status][currency] = 0;
        }
        summary[status][currency] += amount;
    });

    return summary;
};

/**
 * Get company-wide expense summary
 */
export const getCompanyExpenseSummary = async (companyId: string) => {
    const expenses = await prisma.pettyCash.findMany({
        where: {
            companyId,
        },
        include: {
            companyUser: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });

    // Group by user and calculate totals
    const userSummaries = new Map<string, any>();

    expenses.forEach((expense) => {
        const userId = expense.companyUser.userId;
        const userName = `${expense.companyUser.user.name || ''} ${expense.companyUser.user.surname || ''}`.trim();
        const userEmail = expense.companyUser.user.email;
        const amount = parseFloat(expense.amount.toString());

        if (!userSummaries.has(userId)) {
            userSummaries.set(userId, {
                userId,
                userName,
                userEmail,
                totalApproved: 0,
                totalPending: 0,
                totalRejected: 0,
                currency: expense.currency,
            });
        }

        const summary = userSummaries.get(userId);
        
        if (expense.status === PettyCashStatus.APPROVED) {
            summary.totalApproved += amount;
        } else if (expense.status === PettyCashStatus.PENDING) {
            summary.totalPending += amount;
        } else if (expense.status === PettyCashStatus.REJECTED) {
            summary.totalRejected += amount;
        }
    });

    return Array.from(userSummaries.values());
};

/**
 * Delete a petty cash expense
 */
export const deletePettyCash = async (expenseId: string) => {
    const expense = await getPettyCashById(expenseId);

    await prisma.pettyCash.delete({
        where: { id: expenseId },
    });

    return expense;
};
