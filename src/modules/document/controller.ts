import { Request, Response, NextFunction } from 'express';
import {
    createDocument,
    getDocuments,
    getDocumentById,
    deleteDocument,
    getCompanyUser,
} from './db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { DocumentType, CompanyUserRole } from '@prisma/client';

// Helper to ensure string
const ensureString = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value || '';
};

/**
 * POST /companies/:companyId/documents/upload
 * Upload document for a user (ADMIN only)
 */
export const handleUploadDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const currentUserId = req.user?.userId;

        if (!currentUserId) {
            throw new ForbiddenError('User not authenticated');
        }

        const { userId, fileUrl, type, month, year } = req.body;

        // Validate required fields
        if (!userId || !fileUrl || !type) {
            throw new BadRequestError('Missing required fields: userId, fileUrl, type');
        }

        // Validate document type
        if (!Object.values(DocumentType).includes(type)) {
            throw new BadRequestError('Invalid document type');
        }

        // Get current user's CompanyUser record to check role
        const currentCompanyUser = await getCompanyUser(currentUserId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        // CRITICAL SECURITY: Only ADMIN or OWNER can upload documents
        if (
            currentCompanyUser.role !== CompanyUserRole.ADMIN &&
            currentCompanyUser.role !== CompanyUserRole.OWNER
        ) {
            throw new ForbiddenError('Only administrators can upload documents');
        }

        // Validate month and year if provided
        if (month !== undefined && month !== null) {
            const monthNum = parseInt(month, 10);
            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                throw new BadRequestError('Month must be between 1 and 12');
            }
        }

        if (year !== undefined && year !== null) {
            const yearNum = parseInt(year, 10);
            if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
                throw new BadRequestError('Invalid year');
            }
        }

        const document = await createDocument({
            companyId,
            companyUserId: currentCompanyUser.id,
            targetUserId: userId,
            type,
            fileUrl,
            month: month ? parseInt(month, 10) : undefined,
            year: year ? parseInt(year, 10) : undefined,
        });

        res.status(201).json({
            success: true,
            document: {
                id: document.id,
                type: document.type,
                fileUrl: document.fileUrl,
                month: document.month,
                year: document.year,
                user: {
                    id: document.companyUser.userId,
                    name: document.companyUser.user.name,
                    surname: document.companyUser.user.surname,
                    email: document.companyUser.user.email,
                },
                uploadedAt: document.uploadedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /companies/:companyId/documents
 * Get documents with strict access control
 * - Regular users: Only their own documents
 * - ADMIN/OWNER: All documents or filter by userId
 */
export const handleGetDocuments = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const currentUserId = req.user?.userId;
        const requestedUserId = req.query.userId
            ? ensureString(req.query.userId as string | string[])
            : undefined;
        const type = req.query.type as DocumentType | undefined;
        const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
        const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;

        if (!currentUserId) {
            throw new ForbiddenError('User not authenticated');
        }

        // Get current user's CompanyUser record to check role
        const currentCompanyUser = await getCompanyUser(currentUserId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        const role = currentCompanyUser.role;

        // CRITICAL SECURITY: Determine which documents to return based on role
        let filterCompanyUserId: string;

        if (role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN) {
            // ADMIN/OWNER can see all documents or filter by specific user
            if (requestedUserId) {
                const targetCompanyUser = await getCompanyUser(requestedUserId, companyId);
                if (!targetCompanyUser) {
                    throw new BadRequestError('Target user does not belong to this company');
                }
                filterCompanyUserId = targetCompanyUser.id;
            } else {
                // No filter, will return all documents (by not setting filterCompanyUserId)
                filterCompanyUserId = '';
            }
        } else {
            // EMPLOYEE or MANAGER: ONLY their own documents, ALWAYS
            // Ignore any userId query param for security
            filterCompanyUserId = currentCompanyUser.id;
        }

        const documents = await getDocuments({
            companyId,
            companyUserId: filterCompanyUserId || undefined,
            type,
            year,
            month,
        });

        res.status(200).json({
            success: true,
            documents: documents.map((doc) => ({
                id: doc.id,
                type: doc.type,
                fileUrl: doc.fileUrl,
                month: doc.month,
                year: doc.year,
                user: {
                    id: doc.companyUser.userId,
                    name: doc.companyUser.user.name,
                    surname: doc.companyUser.user.surname,
                    email: doc.companyUser.user.email,
                },
                uploadedAt: doc.uploadedAt,
            })),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /companies/:companyId/documents/:documentId
 * Get specific document with access control
 */
export const handleGetDocumentById = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const documentId = ensureString(req.params.documentId);
        const currentUserId = req.user?.userId;

        if (!currentUserId) {
            throw new ForbiddenError('User not authenticated');
        }

        // Get current user's CompanyUser record
        const currentCompanyUser = await getCompanyUser(currentUserId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        // Get the document
        const document = await getDocumentById(documentId);

        // Verify the document belongs to the company
        if (document.companyId !== companyId) {
            throw new NotFoundError('Document not found in this company');
        }

        // CRITICAL SECURITY: Check access rights
        const role = currentCompanyUser.role;
        const isAdmin = role === CompanyUserRole.OWNER || role === CompanyUserRole.ADMIN;
        const isOwner = document.companyUserId === currentCompanyUser.id;

        if (!isAdmin && !isOwner) {
            throw new ForbiddenError('You do not have access to this document');
        }

        res.status(200).json({
            success: true,
            document: {
                id: document.id,
                type: document.type,
                fileUrl: document.fileUrl,
                month: document.month,
                year: document.year,
                user: {
                    id: document.companyUser.userId,
                    name: document.companyUser.user.name,
                    surname: document.companyUser.user.surname,
                    email: document.companyUser.user.email,
                },
                uploadedAt: document.uploadedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /companies/:companyId/documents/:documentId
 * Delete a document (ADMIN only)
 */
export const handleDeleteDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const companyId = ensureString(req.params.companyId);
        const documentId = ensureString(req.params.documentId);
        const currentUserId = req.user?.userId;

        if (!currentUserId) {
            throw new ForbiddenError('User not authenticated');
        }

        // Get current user's role
        const currentCompanyUser = await getCompanyUser(currentUserId, companyId);
        if (!currentCompanyUser) {
            throw new ForbiddenError('User does not belong to this company');
        }

        // CRITICAL SECURITY: Only ADMIN or OWNER can delete documents
        if (
            currentCompanyUser.role !== CompanyUserRole.ADMIN &&
            currentCompanyUser.role !== CompanyUserRole.OWNER
        ) {
            throw new ForbiddenError('Only administrators can delete documents');
        }

        // Get the document to verify it belongs to the company
        const document = await getDocumentById(documentId);

        if (document.companyId !== companyId) {
            throw new NotFoundError('Document not found in this company');
        }

        await deleteDocument(documentId);

        res.status(200).json({
            success: true,
            message: 'Document deleted successfully',
            document: {
                id: document.id,
                type: document.type,
                fileUrl: document.fileUrl,
            },
        });
    } catch (error) {
        next(error);
    }
};
