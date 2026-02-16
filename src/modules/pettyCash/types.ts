import { PettyCashStatus } from '@prisma/client';

// ===== INPUT TYPES =====

export interface CreatePettyCashInput {
    companyId: string;
    companyUserId: string;
    amount: number;
    currency: string;
    date: Date;
    description: string;
    receiptUrl?: string;
}

export interface UpdatePettyCashStatusInput {
    status: PettyCashStatus;
}

export interface GetPettyCashFilters {
    companyId: string;
    companyUserId?: string;
    status?: PettyCashStatus;
    dateFrom?: Date;
    dateTo?: Date;
}

// ===== OUTPUT TYPES =====

export interface PettyCashUser {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
}

export interface PettyCashOutput {
    id: string;
    amount: number;
    currency: string;
    date: Date;
    description: string;
    receiptUrl: string | null;
    status: PettyCashStatus;
    user: PettyCashUser;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserExpenseSummary {
    userId: string;
    userName: string;
    userEmail: string;
    totalApproved: number;
    totalPending: number;
    totalRejected: number;
    currency: string;
}

export interface ExpenseSummaryByStatus {
    approved: Record<string, number>;
    pending: Record<string, number>;
    rejected: Record<string, number>;
}
