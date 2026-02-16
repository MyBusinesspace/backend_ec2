import { Router } from 'express';
import { authenticateJWT } from '@/middleware/authenticate';
import { verifyCompanyAccess } from '@/middleware/verifyCompanyAccess';
import {
    handleUploadDocument,
    handleGetDocuments,
    handleGetDocumentById,
    handleDeleteDocument,
} from './controller';

export const documentRouter = Router();

// Document routes (require authentication and company access)
// POST /companies/:companyId/documents/upload - Upload document (ADMIN only)
documentRouter.post(
    '/companies/:companyId/documents/upload',
    authenticateJWT,
    verifyCompanyAccess,
    handleUploadDocument
);

// GET /companies/:companyId/documents - Get documents (with role-based filtering)
documentRouter.get('/companies/:companyId/documents', authenticateJWT, verifyCompanyAccess, handleGetDocuments);

// GET /companies/:companyId/documents/:documentId - Get specific document
documentRouter.get(
    '/companies/:companyId/documents/:documentId',
    authenticateJWT,
    verifyCompanyAccess,
    handleGetDocumentById
);

// DELETE /companies/:companyId/documents/:documentId - Delete document (ADMIN only)
documentRouter.delete(
    '/companies/:companyId/documents/:documentId',
    authenticateJWT,
    verifyCompanyAccess,
    handleDeleteDocument
);
