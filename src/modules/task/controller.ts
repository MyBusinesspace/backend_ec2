import { Request, Response, NextFunction } from 'express';
import {
  createJobOrder,
  getTaskDetailsByWorkingOrder,
  getCompanyTasks,
  getTaskById,
  updateTaskStatus,
  updateInstructionsCompleted,
  updateTask,
  softDeleteTask,
} from './db';
import { CreateJobOrderInput, UpdateTaskInput } from './types';
import { BadRequestError, NotFoundError } from '@/core/utils/errors';

const ensureString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0];
  return value || '';
};

/**
 * POST /api/companies/:companyId/job-orders
 * Create a complete job order
 */
export const handleCreateJobOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const input = req.body as CreateJobOrderInput;

    // Validation
    if (!input.case?.id) {
      throw new BadRequestError('Case ID is required');
    }

    if (!input.workingOrder?.title) {
      throw new BadRequestError('Working order title is required');
    }

    if (!input.taskDetails?.title) {
      throw new BadRequestError('Task details title is required');
    }

    const result = await createJobOrder(companyId, input);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/orders/:workingOrderId/task-details
 * Get all task details for a working order
 */
export const handleGetTaskDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);
    const workingOrderId = ensureString(req.params.workingOrderId);

    const taskDetails = await getTaskDetailsByWorkingOrder(companyId, workingOrderId);

    res.json({
      success: true,
      data: taskDetails,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/tasks
 * Get all tasks for a company
 */
export const handleGetTasks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const companyId = ensureString(req.params.companyId);

    const tasks = await getCompanyTasks(companyId);

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:companyId/tasks/:taskId
 * Get a task by ID
 */
export const handleGetTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = ensureString(req.params.taskId);

    const task = await getTaskById(taskId);

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/companies/:companyId/tasks/:taskId/status
 * Update task status
 */
export const handleUpdateTaskStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = ensureString(req.params.taskId);
    const { status } = req.body;

    if (!status) {
      throw new BadRequestError('Status is required');
    }

    const task = await updateTaskStatus(taskId, status);

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/companies/:companyId/tasks/:taskId/instructions
 * Update instructions completed
 */
export const handleUpdateInstructions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = ensureString(req.params.taskId);
    const { instructionsCompleted } = req.body;

    if (!Array.isArray(instructionsCompleted)) {
      throw new BadRequestError('Instructions completed must be an array');
    }

    const task = await updateInstructionsCompleted(taskId, instructionsCompleted);

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/companies/:companyId/tasks/:taskId
 * Update task editable fields (title, instructions, schedule, resources)
 */
export const handleUpdateTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = ensureString(req.params.taskId);
    const input = req.body as UpdateTaskInput;

    // Verify the task exists
    const existing = await getTaskById(taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    const task = await updateTask(taskId, input);

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/companies/:companyId/tasks/:taskId
 * Soft-delete a task (set isActive to false)
 */
export const handleDeleteTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = ensureString(req.params.taskId);

    const existing = await getTaskById(taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    await softDeleteTask(taskId);

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};