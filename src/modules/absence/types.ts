import { AbsenceType, AbsenceStatus } from '@prisma/client';

// ===== INPUT TYPES =====

export interface CreateAbsenceInput {
    companyId: string;
    companyUserId: string;
    type: AbsenceType;
    startDate: Date;
    endDate: Date;
    reason?: string;
}

export interface UpdateAbsenceStatusInput {
    status: AbsenceStatus;
}

export interface GetAbsencesFilters {
    companyId: string;
    userId?: string;
    status?: AbsenceStatus;
}

// ===== OUTPUT TYPES =====

export interface AbsenceUser {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
}

export interface AbsenceOutput {
    id: string;
    companyUserId: string;
    type: AbsenceType;
    startDate: Date;
    endDate: Date;
    status: AbsenceStatus;
    reason: string | null;
    user: AbsenceUser;
    createdAt: Date;
    updatedAt: Date;
}
