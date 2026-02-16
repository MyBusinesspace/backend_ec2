import { prisma } from '@/core/database/prisma';
import { CreateWorkingOrderInput, UpdateWorkingOrderInput } from './types';

/**
 * Get all working orders for a company (across all projects)
 */
export const getCompanyWorkingOrders = async (companyId: string) => {
  return prisma.workingOrder.findMany({
    where: {
      companyId,
      isActive: true,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          contactName: true,
        },
      },
      tasks: {
        where: { isActive: true },
        select: {
          id: true,
          categoryName: true,
          taskDetailTitle: true,
          instructions: true,
          instructionsCompleted: true,
          scheduleEnabled: true,
          scheduledDate: true,
          startTime: true,
          endTime: true,
          shiftType: true,
          isRepeating: true,
          repeatFrequency: true,
          repeatEndDate: true,
          status: true,
          createdAt: true,
          assignments: {
            select: {
              id: true,
              userId: true,
              userName: true,
              userSurname: true,
              userEmail: true,
              assignmentType: true,
              teamId: true,
              teamName: true,
              teamCode: true,
              teamColor: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  surname: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          tasks: { where: { isActive: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get all working orders for a project
 */
export const getProjectWorkingOrders = async (
  companyId: string,
  projectId: string
) => {
  return prisma.workingOrder.findMany({
    where: {
      companyId,
      projectId,
      isActive: true,
    },
    include: {
      _count: {
        select: {
          taskDetails: true,
          tasks: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get a working order by ID
 */
export const getWorkingOrderById = async (workingOrderId: string) => {
  return prisma.workingOrder.findUnique({
    where: { id: workingOrderId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          contactName: true,
        },
      },
      _count: {
        select: {
          taskDetails: true,
          tasks: true,
        },
      },
    },
  });
};

/**
 * Create a working order
 */
export const createWorkingOrder = async (
  companyId: string,
  contactId: string,
  projectId: string,
  data: CreateWorkingOrderInput
) => {
  return prisma.workingOrder.create({
    data: {
      companyId,
      contactId,
      projectId,
      title: data.title,
    },
  });
};

/**
 * Update a working order
 */
export const updateWorkingOrder = async (
  workingOrderId: string,
  data: UpdateWorkingOrderInput
) => {
  return prisma.workingOrder.update({
    where: { id: workingOrderId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
};

/**
 * Delete (soft) a working order
 */
export const deleteWorkingOrder = async (workingOrderId: string) => {
  return prisma.workingOrder.update({
    where: { id: workingOrderId },
    data: { isActive: false },
  });
};

/**
 * Check if working order belongs to company
 */
export const workingOrderBelongsToCompany = async (
  workingOrderId: string,
  companyId: string
): Promise<boolean> => {
  const order = await prisma.workingOrder.findFirst({
    where: {
      id: workingOrderId,
      companyId,
    },
    select: { id: true },
  });

  return order !== null;
};