import { prisma } from '@/core/database/prisma';
import { CreateJobOrderInput, UpdateTaskInput } from './types';

/**
 * Create a complete job order (working order + task detail + task + assignments)
 * This handles the entire creation flow in a transaction
 *
 * TaskDetail Versioning Strategy:
 * - TaskDetails act as templates/blueprints for tasks
 * - When isNew=true: Always creates a new TaskDetail
 * - When isNew=false: Compares with existing TaskDetail
 *   - If instructions, title, or category changed: Creates a NEW TaskDetail (new version)
 *   - If nothing changed: Reuses the existing TaskDetail
 *
 * This approach:
 * - Preserves historical integrity (old tasks keep their original instructions)
 * - Supports task template versioning
 * - Prevents unintended retroactive changes to existing tasks
 */
export const createJobOrder = async (
  companyId: string,
  input: CreateJobOrderInput
) => {
  return prisma.$transaction(async (tx) => {
    // Step 1: Handle WorkingOrder
    let workingOrderId: string;

    if (input.workingOrder.isNew) {
      const newWorkingOrder = await tx.workingOrder.create({
        data: {
          companyId,
          contactId: input.case.customerId,
          projectId: input.case.id,
          title: input.workingOrder.title,
        },
      });
      workingOrderId = newWorkingOrder.id;
    } else {
      if (!input.workingOrder.id) {
        throw new Error('Working order ID is required when isNew is false');
      }
      workingOrderId = input.workingOrder.id;
    }

    // Step 2: Handle TaskDetail
    let taskDetailId: string;
    let taskDetail;

    if (input.taskDetails.isNew) {
      // Look up category ID
      const category = await tx.taskCategory.findFirst({
        where: {
          companyId,
          name: input.taskDetails.category,
        },
      });

      const newTaskDetail = await tx.taskDetail.create({
        data: {
          companyId,
          contactId: input.case.customerId,
          projectId: input.case.id,
          workingOrderId,
          categoryId: category?.id || null,
          categoryName: input.taskDetails.category,
          title: input.taskDetails.title,
          instructions: input.taskDetails.instructions,
        },
      });
      taskDetailId = newTaskDetail.id;
      taskDetail = newTaskDetail;
    } else {
      // Reusing existing task detail
      if (!input.taskDetails.id) {
        throw new Error('Task detail ID is required when isNew is false');
      }

      // Fetch the existing task detail
      const existingTaskDetail = await tx.taskDetail.findUnique({
        where: { id: input.taskDetails.id },
      });

      if (!existingTaskDetail) {
        throw new Error('Task detail not found');
      }

      // Check if instructions have changed
      const instructionsChanged =
        JSON.stringify(existingTaskDetail.instructions.sort()) !==
        JSON.stringify(input.taskDetails.instructions.sort());

      const titleChanged = existingTaskDetail.title !== input.taskDetails.title;
      const categoryChanged = existingTaskDetail.categoryName !== input.taskDetails.category;

      // If any key fields changed, create a new TaskDetail (versioning)
      if (instructionsChanged || titleChanged || categoryChanged) {
        // Look up category ID if category changed
        const category = categoryChanged
          ? await tx.taskCategory.findFirst({
              where: {
                companyId,
                name: input.taskDetails.category,
              },
            })
          : null;

        // Create new TaskDetail as a new version
        const newTaskDetail = await tx.taskDetail.create({
          data: {
            companyId,
            contactId: input.case.customerId,
            projectId: input.case.id,
            workingOrderId,
            categoryId: categoryChanged ? (category?.id || null) : existingTaskDetail.categoryId,
            categoryName: input.taskDetails.category,
            title: input.taskDetails.title,
            instructions: input.taskDetails.instructions,
          },
        });

        taskDetailId = newTaskDetail.id;
        taskDetail = newTaskDetail;
      } else {
        // No changes, use existing task detail
        taskDetailId = input.taskDetails.id;
        taskDetail = existingTaskDetail;
      }
    }

    // Step 3: Create Task (always new)
    const instructionsCompleted = new Array(taskDetail.instructions.length).fill(false);

    const task = await tx.task.create({
      data: {
        companyId,
        contactId: input.case.customerId,
        projectId: input.case.id,
        workingOrderId,
        taskDetailId,
        categoryId: taskDetail.categoryId,
        categoryName: taskDetail.categoryName,
        taskDetailTitle: taskDetail.title,
        instructions: taskDetail.instructions,
        instructionsCompleted,
        scheduleEnabled: input.schedule.enabled,
        shiftType: input.schedule.enabled ? input.schedule.shiftType || null : null,
        scheduledDate: input.schedule.enabled && input.schedule.date
          ? new Date(input.schedule.date)
          : null,
        startTime: input.schedule.enabled ? input.schedule.startTime || null : null,
        endTime: input.schedule.enabled ? input.schedule.endTime || null : null,
        isRepeating: input.schedule.enabled && input.schedule.repeating.enabled,
        repeatFrequency:
          input.schedule.enabled && input.schedule.repeating.enabled
            ? input.schedule.repeating.frequency || null
            : null,
        repeatEndDate:
          input.schedule.enabled &&
          input.schedule.repeating.enabled &&
          input.schedule.repeating.endDate
            ? new Date(input.schedule.repeating.endDate)
            : null,
        status: 'open',
      },
    });

    // Step 4: Create TaskAssignments
    const uniqueUsers = new Map<string, {
      id: string;
      name: string | null;
      surname: string | null;
      email: string;
      assignmentType: 'team' | 'individual';
      teamId?: string;
      teamName?: string;
      teamCode?: string;
      teamColor?: string | null;
    }>();

    // Process team users first (higher priority)
    for (const user of input.assignedResources.teamUsers) {
      // Find which team this user belongs to
      const team = input.assignedResources.teams.find((t) =>
        input.assignedResources.teamUsers.some((tu) => tu.id === user.id)
      );

      uniqueUsers.set(user.id, {
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        assignmentType: 'team',
        teamId: team?.id,
        teamName: team?.name,
        teamCode: team?.code,
        teamColor: team?.color,
      });
    }

    // Process individual users (only if not already added as team user)
    for (const user of input.assignedResources.individualUsers) {
      if (!uniqueUsers.has(user.id)) {
        uniqueUsers.set(user.id, {
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          assignmentType: 'individual',
        });
      }
    }

    // Create task assignments
    for (const user of uniqueUsers.values()) {
      await tx.taskAssignment.create({
        data: {
          taskId: task.id,
          userId: user.id,
          teamId: user.teamId || null,
          userName: user.name,
          userSurname: user.surname,
          userEmail: user.email,
          teamName: user.teamName || null,
          teamCode: user.teamCode || null,
          teamColor: user.teamColor || null,
          assignmentType: user.assignmentType,
        },
      });
    }

    return {
      taskId: task.id,
      workingOrderId,
      taskDetailId,
      taskDetailCreated: input.taskDetails.isNew || taskDetailId !== input.taskDetails.id,
    };
  });
};

/**
 * Get all task details for a working order
 */
export const getTaskDetailsByWorkingOrder = async (
  companyId: string,
  workingOrderId: string
) => {
  return prisma.taskDetail.findMany({
    where: {
      companyId,
      workingOrderId,
      isActive: true,
    },
    select: {
      id: true,
      title: true,
      categoryName: true,
      instructions: true,
      tasks: {
        where: { isActive: true },
        select: {
          scheduleEnabled: true,
          shiftType: true,
          scheduledDate: true,
          startTime: true,
          endTime: true,
          isRepeating: true,
          repeatFrequency: true,
          repeatEndDate: true,
          assignments: {
            select: {
              userId: true,
              teamId: true,
              assignmentType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get all tasks for a company
 */
export const getCompanyTasks = async (companyId: string) => {
  return prisma.task.findMany({
    where: { companyId, isActive: true },
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
      workingOrder: {
        select: {
          id: true,
          title: true,
        },
      },
      taskDetail: {
        select: {
          id: true,
          title: true,
        },
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              email: true,
              avatar: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get a task by ID
 */
export const getTaskById = async (taskId: string) => {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      contact: true,
      workingOrder: true,
      taskDetail: true,
      category: true,
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              email: true,
              avatar: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              code: true,
              color: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Update task status
 */
export const updateTaskStatus = async (taskId: string, status: string) => {
  return prisma.task.update({
    where: { id: taskId },
    data: { status },
  });
};

/**
 * Update instructions completed
 */
export const updateInstructionsCompleted = async (
  taskId: string,
  instructionsCompleted: boolean[]
) => {
  return prisma.task.update({
    where: { id: taskId },
    data: { instructionsCompleted },
  });
};

/**
 * Soft-delete a task (set isActive to false)
 */
export const softDeleteTask = async (taskId: string) => {
  return prisma.task.update({
    where: { id: taskId },
    data: { isActive: false },
  });
};

/**
 * Update a task's editable fields (title, instructions, schedule, resources)
 * Updates the task directly and replaces assignments if provided
 */
export const updateTask = async (taskId: string, input: UpdateTaskInput) => {
  return prisma.$transaction(async (tx) => {
    // Build the data object for task update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (input.taskDetailTitle !== undefined) {
      data.taskDetailTitle = input.taskDetailTitle;
    }

    if (input.instructions !== undefined) {
      data.instructions = input.instructions;
    }

    if (input.instructionsCompleted !== undefined) {
      data.instructionsCompleted = input.instructionsCompleted;
    }

    if (input.schedule !== undefined) {
      data.scheduleEnabled = input.schedule.enabled;
      data.shiftType = input.schedule.enabled ? (input.schedule.shiftType || null) : null;
      data.scheduledDate = input.schedule.enabled && input.schedule.date
        ? new Date(input.schedule.date)
        : null;
      data.startTime = input.schedule.enabled ? (input.schedule.startTime || null) : null;
      data.endTime = input.schedule.enabled ? (input.schedule.endTime || null) : null;
      data.isRepeating = input.schedule.enabled && (input.schedule.repeating?.enabled ?? false);
      data.repeatFrequency =
        input.schedule.enabled && input.schedule.repeating?.enabled
          ? (input.schedule.repeating.frequency || null)
          : null;
      data.repeatEndDate =
        input.schedule.enabled && input.schedule.repeating?.enabled && input.schedule.repeating.endDate
          ? new Date(input.schedule.repeating.endDate)
          : null;
    }

    // Update the task
    const task = await tx.task.update({
      where: { id: taskId },
      data,
    });

    // Replace assignments if provided
    if (input.assignedResources !== undefined) {
      // Delete existing assignments
      await tx.taskAssignment.deleteMany({
        where: { taskId },
      });

      // Build unique users map (same logic as create)
      const uniqueUsers = new Map<string, {
        id: string;
        name: string | null;
        surname: string | null;
        email: string | null;
        assignmentType: 'team' | 'individual';
        teamId?: string;
        teamName?: string | null;
        teamCode?: string | null;
        teamColor?: string | null;
      }>();

      // Process team users first
      for (const user of input.assignedResources.teamUsers) {
        const team = input.assignedResources.teams.find((t) =>
          input.assignedResources!.teamUsers.some((tu) => tu.id === user.id)
        );

        uniqueUsers.set(user.id, {
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          assignmentType: 'team',
          teamId: team?.id,
          teamName: team?.name,
          teamCode: team?.code,
          teamColor: team?.color,
        });
      }

      // Process individual users
      for (const user of input.assignedResources.individualUsers) {
        if (!uniqueUsers.has(user.id)) {
          uniqueUsers.set(user.id, {
            id: user.id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            assignmentType: 'individual',
          });
        }
      }

      // Create new assignments
      for (const user of uniqueUsers.values()) {
        await tx.taskAssignment.create({
          data: {
            taskId,
            userId: user.id,
            teamId: user.teamId || null,
            userName: user.name,
            userSurname: user.surname,
            userEmail: user.email || '',
            teamName: user.teamName || null,
            teamCode: user.teamCode || null,
            teamColor: user.teamColor || null,
            assignmentType: user.assignmentType,
          },
        });
      }
    }

    // Return full task with assignments
    return tx.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  });
};

/**
 * Get all TaskDetail versions for a working order
 * This shows the evolution of task templates over time
 */
export const getTaskDetailVersions = async (
  companyId: string,
  workingOrderId: string
) => {
  return prisma.taskDetail.findMany({
    where: {
      companyId,
      workingOrderId,
      isActive: true,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      tasks: {
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};