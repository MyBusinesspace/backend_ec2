import { prisma } from '@/database/prisma';
import { CreateDocumentInput, GetDocumentsFilters } from './types';
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
 * Create a new document record
 */
export const createDocument = async (data: CreateDocumentInput) => {
    // Validate month if provided
    if (data.month !== undefined && (data.month < 1 || data.month > 12)) {
        throw new BadRequestError('Month must be between 1 and 12');
    }

    // Get target user's CompanyUser record
    const targetCompanyUser = await getCompanyUser(data.targetUserId, data.companyId);
    if (!targetCompanyUser) {
        throw new BadRequestError('Target user does not belong to this company');
    }

    return await prisma.document.create({
        data: {
            companyId: data.companyId,
            companyUserId: targetCompanyUser.id,
            type: data.type,
            fileUrl: data.fileUrl,
            month: data.month,
            year: data.year,
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
 * Get documents with filters
 */
export const getDocuments = async (filters: GetDocumentsFilters) => {
    const where: any = {
        companyId: filters.companyId,
    };

    if (filters.companyUserId) {
        where.companyUserId = filters.companyUserId;
    }

    if (filters.type) {
        where.type = filters.type;
    }

    if (filters.year) {
        where.year = filters.year;
    }

    if (filters.month) {
        where.month = filters.month;
    }

    return await prisma.document.findMany({
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
        orderBy: [
            { year: 'desc' },
            { month: 'desc' },
            { uploadedAt: 'desc' },
        ],
    });
};

/**
 * Get document by ID
 */
export const getDocumentById = async (documentId: string) => {
    const document = await prisma.document.findUnique({
        where: { id: documentId },
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

    if (!document) {
        throw new NotFoundError('Document not found');
    }

    return document;
};

/**
 * Delete a document
 */
export const deleteDocument = async (documentId: string) => {
    const document = await getDocumentById(documentId);

    await prisma.document.delete({
        where: { id: documentId },
    });

    return document;
};

/**
 * Get user's documents count
 */
export const getUserDocumentsCount = async (companyUserId: string) => {
    return await prisma.document.count({
        where: {
            companyUserId,
        },
    });
};

/**
 * Check if document belongs to user
 */
export const documentBelongsToUser = async (
    documentId: string,
    companyUserId: string
): Promise<boolean> => {
    const document = await prisma.document.findFirst({
        where: {
            id: documentId,
            companyUserId,
        },
    });

    return !!document;
};
