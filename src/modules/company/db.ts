import { prisma } from '@/core/database/prisma';
import { CompanyUser, OrgChartNode } from './types';

/**
 * Get all users from a company
 */
export const getCompanyUsers = async (
    companyId: string,
    search?: string,
    limit: number = 50
): Promise<CompanyUser[]> => {
    const companyUsers = await prisma.companyUser.findMany({
        where: {
            companyId,
            ...(search && {
                user: {
                    OR: [
                        { email: { contains: search, mode: 'insensitive' } },
                        { name: { contains: search, mode: 'insensitive' } },
                        { surname: { contains: search, mode: 'insensitive' } },
                    ],
                },
            }),
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    surname: true,
                    avatar: true,
                },
            },
        },
        orderBy: [{ user: { name: 'asc' } }, { user: { email: 'asc' } }],
        take: limit,
    });

    return companyUsers.map((cu) => ({
        id: cu.user.id,
        email: cu.user.email,
        name: cu.user.name,
        surname: cu.user.surname,
        avatar: cu.user.avatar,
        createdAt: cu.createdAt,
    }));
};

/**
 * Get company details
 */
export const getCompanyById = async (companyId: string) => {
    return prisma.company.findUnique({
        where: { id: companyId },
    });
};

/**
 * Check if user belongs to company
 */
export const userBelongsToCompany = async (userId: string, companyId: string): Promise<boolean> => {
    const companyUser = await prisma.companyUser.findFirst({
        where: {
            userId,
            companyId,
        },
        select: { id: true },
    });

    return companyUser !== null;
};

/**
 * Get organization chart for a company
 * Builds a hierarchical tree structure based on managerId relationships
 */
export const getOrgChart = async (companyId: string): Promise<OrgChartNode[]> => {
    // Get all company users with their relationships
    const companyUsers = await prisma.companyUser.findMany({
        where: {
            companyId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    surname: true,
                    avatar: true,
                },
            },
        },
        orderBy: [
            { user: { name: 'asc' } },
            { user: { surname: 'asc' } },
        ],
    });

    // Build a map of all nodes
    const nodeMap = new Map<string, OrgChartNode>();

    companyUsers.forEach((cu) => {
        nodeMap.set(cu.id, {
            id: cu.id,
            companyUserId: cu.id,
            userId: cu.user.id,
            email: cu.user.email,
            name: cu.user.name,
            surname: cu.user.surname,
            avatar: cu.user.avatar,
            role: cu.role,
            jobTitle: cu.jobTitle,
            department: cu.department,
            managerId: cu.managerId,
            directReports: [],
        });
    });

    // Build the tree structure by assigning direct reports to managers
    const rootNodes: OrgChartNode[] = [];

    nodeMap.forEach((node) => {
        if (node.managerId === null) {
            // This is a root node (no manager)
            rootNodes.push(node);
        } else {
            // This node has a manager, add it to manager's directReports
            const manager = nodeMap.get(node.managerId);
            if (manager) {
                manager.directReports.push(node);
            } else {
                // Manager not found (data inconsistency), treat as root
                rootNodes.push(node);
            }
        }
    });

    // Sort direct reports recursively
    const sortDirectReports = (node: OrgChartNode) => {
        if (node.directReports.length > 0) {
            node.directReports.sort((a, b) => {
                const nameA = `${a.name || ''} ${a.surname || ''}`.trim();
                const nameB = `${b.name || ''} ${b.surname || ''}`.trim();
                return nameA.localeCompare(nameB);
            });
            node.directReports.forEach(sortDirectReports);
        }
    };

    rootNodes.forEach(sortDirectReports);

    return rootNodes;
};
