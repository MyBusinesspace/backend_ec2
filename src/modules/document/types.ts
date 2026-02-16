import { DocumentType } from '@prisma/client';

// ===== INPUT TYPES =====

export interface CreateDocumentInput {
    companyId: string;
    companyUserId: string;
    targetUserId: string; // User ID to upload document for
    type: DocumentType;
    fileUrl: string;
    month?: number;
    year?: number;
}

export interface GetDocumentsFilters {
    companyId: string;
    companyUserId?: string; // Filter by specific company user
    type?: DocumentType;
    year?: number;
    month?: number;
}

// ===== OUTPUT TYPES =====

export interface DocumentUser {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
}

export interface DocumentOutput {
    id: string;
    type: DocumentType;
    fileUrl: string;
    month: number | null;
    year: number | null;
    user: DocumentUser;
    uploadedAt: Date;
}
