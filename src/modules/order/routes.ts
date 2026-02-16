import { Router } from 'express';
import { authenticateJWT } from '@/core/middleware/authenticate';
import { verifyCompanyAccess } from '@/core/middleware/verifyCompanyAccess';
import {
  handleGetCompanyOrders,
  handleGetProjectOrders,
  handleGetOrder,
  handleCreateOrder,
  handleUpdateOrder,
  handleDeleteOrder,
} from './controller';

const orderRouter = Router();

// All routes require authentication
orderRouter.use(authenticateJWT);

// Working order routes
orderRouter.get('/companies/:companyId/orders', verifyCompanyAccess, handleGetCompanyOrders);
orderRouter.get(
  '/companies/:companyId/projects/:projectId/orders',
  verifyCompanyAccess,
  handleGetProjectOrders
);
orderRouter.get('/companies/:companyId/orders/:orderId', verifyCompanyAccess, handleGetOrder);
orderRouter.post(
  '/companies/:companyId/projects/:projectId/orders',
  verifyCompanyAccess,
  handleCreateOrder
);
orderRouter.patch('/companies/:companyId/orders/:orderId', verifyCompanyAccess, handleUpdateOrder);
orderRouter.delete('/companies/:companyId/orders/:orderId', verifyCompanyAccess, handleDeleteOrder);

export { orderRouter };