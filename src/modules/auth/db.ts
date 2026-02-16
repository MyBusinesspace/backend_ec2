import { prisma } from '../../core/database/prisma';
import { GoogleProfile, AuthUser } from './types';

const AUTH_USER_SELECT = {
    id: true,
    email: true,
    name: true,
    surname: true,
    avatar: true,
    googleId: true,
    phone: true,
    phoneVerified: true,
} as const;

export const findUserByGoogleId = async (googleId: string): Promise<AuthUser | null> => {
    return await prisma.user.findUnique({
        where: { googleId },
        select: AUTH_USER_SELECT,
    });
};

export const findUserByEmail = async (email: string): Promise<AuthUser | null> => {
    return await prisma.user.findUnique({
        where: { email },
        select: AUTH_USER_SELECT,
    });
};

export const findUserById = async (id: string): Promise<AuthUser | null> => {
    return await prisma.user.findUnique({
        where: { id },
        select: AUTH_USER_SELECT,
    });
};

export const findUserByPhone = async (phone: string): Promise<AuthUser | null> => {
    return await prisma.user.findUnique({
        where: { phone },
        select: AUTH_USER_SELECT,
    });
};

export const createUser = async (profile: GoogleProfile): Promise<AuthUser> => {
    return await prisma.user.create({
        data: {
            email: profile.email,
            name: profile.name,
            avatar: profile.picture || null,
            googleId: profile.id,
        },
        select: AUTH_USER_SELECT,
    });
};

export const updateUserAvatar = async (googleId: string, avatar: string): Promise<AuthUser> => {
    return await prisma.user.update({
        where: { googleId },
        data: { avatar },
        select: AUTH_USER_SELECT,
    });
};

export const findOrCreateUser = async (profile: GoogleProfile): Promise<AuthUser> => {
    // Try to find existing user
    let user = await findUserByGoogleId(profile.id);

    if (user) {
        // Update avatar if it changed
        if (profile.picture && user.avatar !== profile.picture) {
            user = await updateUserAvatar(profile.id, profile.picture);
        }
        return user;
    }

    // Create new user
    return await createUser(profile);
};

export const linkPhoneToUser = async (userId: string, phone: string): Promise<AuthUser> => {
    return await prisma.user.update({
        where: { id: userId },
        data: {
            phone,
            phoneVerified: true,
        },
        select: AUTH_USER_SELECT,
    });
};

export const unlinkPhoneFromUser = async (userId: string): Promise<AuthUser> => {
    return await prisma.user.update({
        where: { id: userId },
        data: {
            phone: null,
            phoneVerified: false,
        },
        select: AUTH_USER_SELECT,
    });
};

export const getUserCompanies = async (userId: string) => {
    return await prisma.companyUser.findMany({
        where: { userId },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    address: true,
                },
            },
        },
    });
};
