import { CompanyUserRole } from '@prisma/client';

// ===== OUTPUT TYPES =====

export interface CompanyUser {
    id: string;
    email: string;
    name: string | null;
    surname: string | null;
    avatar: string | null;
    createdAt: Date;
}

export interface CompanyDetails {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface OrgChartNode {
    id: string;
    companyUserId: string;
    userId: string;
    email: string;
    name: string | null;
    surname: string | null;
    avatar: string | null;
    role: CompanyUserRole;
    jobTitle: string | null;
    department: string | null;
    managerId: string | null;
    directReports: OrgChartNode[];
}

// ===== QUERY PARAMS =====

export interface SearchUsersQuery {
    search?: string;
    limit?: number;
}
