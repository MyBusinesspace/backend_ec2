import { Router } from 'express';
import { authenticateJWT } from '@/core/middleware/authenticate';
import { verifyCompanyAccess } from '@/core/middleware/verifyCompanyAccess';
import {
  handleCreateJobOrder,
  handleGetTaskDetails,
  handleGetTasks,
  handleGetTask,
  handleUpdateTaskStatus,
  handleUpdateInstructions,
  handleUpdateTask,
  handleDeleteTask,
} from './controller';

const taskRouter = Router();

// All routes require authentication
taskRouter.use(authenticateJWT);

// Job order / Task routes
taskRouter.post('/companies/:companyId/job-orders', verifyCompanyAccess, handleCreateJobOrder);
taskRouter.get('/companies/:companyId/orders/:workingOrderId/task-details', verifyCompanyAccess, handleGetTaskDetails);
taskRouter.get('/companies/:companyId/tasks', verifyCompanyAccess, handleGetTasks);
taskRouter.get('/companies/:companyId/tasks/:taskId', verifyCompanyAccess, handleGetTask);
taskRouter.patch(
  '/companies/:companyId/tasks/:taskId/status',
  verifyCompanyAccess,
  handleUpdateTaskStatus
);
taskRouter.patch(
  '/companies/:companyId/tasks/:taskId/instructions',
  verifyCompanyAccess,
  handleUpdateInstructions
);
taskRouter.patch(
  '/companies/:companyId/tasks/:taskId',
  verifyCompanyAccess,
  handleUpdateTask
);
taskRouter.delete(
  '/companies/:companyId/tasks/:taskId',
  verifyCompanyAccess,
  handleDeleteTask
);

export { taskRouter };