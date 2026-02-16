import { Request, Response, NextFunction } from 'express';
import { AuthUser } from './types';
import { jwtService } from '../../core/utils/jwt';
import { getUserCompanies, findUserById, findOrCreateUser, findUserByPhone, linkPhoneToUser, unlinkPhoneFromUser } from './db';
import { UnauthorizedError, ConflictError } from '../../core/utils/errors';
import { OAuth2Client } from 'google-auth-library';
import { processAuthEvent } from '../security/db';
import { generateDeviceFingerprint } from '../security/utils';
import { createAndSendOtp, verifyOtp } from './otp';

const client = new OAuth2Client(process.env.GOOGLE_IOS_CLIENT_ID);

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

export const googleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        console.log('google callback called');
        // After Passport OAuth, req.user has 'id' (not 'userId')
        const user = req.user;

        if (!user?.id || !user?.email) {
            res.redirect(`${frontendUrl}/login?error=auth_failed`);
            return;
        }

        // Generate access + refresh tokens with device fingerprint binding
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const deviceFingerprint = generateDeviceFingerprint(userAgent);

        const { accessToken, refreshToken } = await jwtService.generateTokenPair(
            user.id,
            user.email,
            user.name || user.email,
            userAgent,
            ipAddress,
            deviceFingerprint
        );

        // Track login event for security (fire-and-forget, don't block redirect)
        processAuthEvent(user.id, ipAddress, userAgent, 'login').catch(() => {});

        // Redirect to frontend with both tokens
        res.redirect(`${frontendUrl}/api/auth/callback?access_token=${accessToken}&refresh_token=${refreshToken}`);
    } catch (error) {
        next(error);
    }
};

export const googleMobileLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            throw new UnauthorizedError('No Google ID token provided');
        }

        // 1. Verify the token with Google
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_IOS_CLIENT_ID, // Use the iOS client ID here
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email) {
            throw new UnauthorizedError('Invalid Google token payload');
        }

        // 2. Map Google payload to your GoogleProfile type
        const googleProfile = {
            id: payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
            picture: payload.picture,
        };

        // 3. Find or create user in your database (reusing your existing db logic)
        const user = await findOrCreateUser(googleProfile);

        // 4. Generate access + refresh tokens with device fingerprint binding
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const deviceFingerprint = generateDeviceFingerprint(userAgent);

        const { accessToken, refreshToken } = await jwtService.generateTokenPair(
            user.id,
            user.email,
            user.name || user.email,
            userAgent,
            ipAddress,
            deviceFingerprint
        );

        // 5. Track login event for security (fire-and-forget)
        processAuthEvent(user.id, ipAddress, userAgent, 'login').catch(() => {});

        // 6. Return both tokens (mobile app will store both)
        res.json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // After JWT middleware, req.user has 'userId'
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        // Get full user details from database
        const user = await findUserById(req.user.userId);

        if (!user) {
            throw new UnauthorizedError('User not found');
        }

        // Get user companies
        const companies = await getUserCompanies(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                surname: user.surname,
                avatar: user.avatar,
                phone: user.phone || null,
                phoneVerified: user.phoneVerified || false,
            },
            companies: companies.map((cu) => cu.company),
        });
    } catch (error) {
        next(error);
    }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const refreshToken = req.headers['x-refresh-token'] as string;
        const accessToken = req.headers.authorization?.split(' ')[1];

        // Revoke refresh token if provided
        if (refreshToken) {
            await jwtService.revokeRefreshToken(refreshToken);
        }

        // Blacklist access token if provided
        if (accessToken) {
            jwtService.blacklistAccessToken(accessToken);
        }

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Logout from all devices — increments user's global token version.
 * This instantly invalidates ALL refresh tokens for the user.
 */
export const logoutAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const newVersion = await jwtService.incrementUserTokenVersion(req.user.userId);

        res.json({
            success: true,
            message: 'Logged out from all devices successfully',
            tokenVersion: newVersion,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Refresh tokens using rotation (explicit endpoint).
 * Rotates the refresh token: old one is invalidated, new pair is issued.
 * Detects token theft via reuse detection and device fingerprint mismatch.
 */
export const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const refreshToken = req.headers['x-refresh-token'] as string;

        if (!refreshToken) {
            throw new UnauthorizedError('Refresh token required');
        }

        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const requestFingerprint = generateDeviceFingerprint(userAgent);

        // Rotate: verify old token, issue new pair, invalidate old
        const rotationResult = await jwtService.rotateRefreshToken(
            refreshToken,
            userAgent,
            ipAddress,
            requestFingerprint
        );

        res.json({
            success: true,
            accessToken: rotationResult.accessToken,
            refreshToken: rotationResult.refreshToken,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user's active devices (sessions)
 */
export const getUserDevices = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const devices = await jwtService.getUserDevices(req.user.userId);

        res.json({
            success: true,
            devices,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Revoke a specific device (logout from one device)
 */
export const revokeDevice = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const tokenId = Array.isArray(req.params.tokenId)
            ? req.params.tokenId[0]
            : req.params.tokenId;

        if (!tokenId) {
            throw new UnauthorizedError('Token ID required');
        }

        await jwtService.revokeDevice(req.user.userId, tokenId);

        res.json({
            success: true,
            message: 'Device logged out successfully',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /auth/revoke-all-sessions
 * Nuclear option: increment user's token version to invalidate ALL sessions.
 * This is the "Revoke All Sessions" button on the security page.
 */
export const revokeAllSessions = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const newVersion = await jwtService.incrementUserTokenVersion(req.user.userId);

        res.json({
            success: true,
            message: 'All sessions have been revoked. You will need to log in again on all devices.',
            tokenVersion: newVersion,
        });
    } catch (error) {
        next(error);
    }
};

// =========================================================================
// Phone OTP Handlers
// =========================================================================

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * POST /auth/phone/link/request (authenticated)
 * Send an OTP to link a phone number to the current user's account.
 */
export const requestPhoneLink = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const { phone } = req.body;

        if (!phone || !E164_REGEX.test(phone)) {
            res.status(400).json({
                success: false,
                error: 'Invalid phone number. Use E.164 format (e.g. +34612345678)',
            });
            return;
        }

        // Check if phone is already linked to another user
        const existingUser = await findUserByPhone(phone);
        if (existingUser && existingUser.id !== req.user.userId) {
            throw new ConflictError('This phone number is already linked to another account');
        }

        const result = await createAndSendOtp(phone, 'link_phone', req.user.userId);

        if (!result.success) {
            res.status(429).json({ success: false, error: result.error });
            return;
        }

        res.json({ success: true, message: 'Verification code sent via WhatsApp' });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /auth/phone/link/verify (authenticated)
 * Verify OTP and link the phone number to the user's account.
 */
export const verifyPhoneLink = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        const { phone, code } = req.body;

        if (!phone || !code) {
            res.status(400).json({ success: false, error: 'Phone and code are required' });
            return;
        }

        const result = await verifyOtp(phone, code, 'link_phone');

        if (!result.valid) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        // Link the phone to the user
        await linkPhoneToUser(req.user.userId, phone);

        res.json({ success: true, message: 'Phone number linked successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /auth/phone/unlink (authenticated)
 * Remove the linked phone number from the user's account.
 */
export const unlinkPhone = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        await unlinkPhoneFromUser(req.user.userId);

        res.json({ success: true, message: 'Phone number unlinked successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /auth/phone/login/request (public)
 * Send an OTP for phone-based login.
 * Always returns a generic success message to prevent phone enumeration.
 */
export const requestPhoneLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { phone } = req.body;

        if (!phone || !E164_REGEX.test(phone)) {
            res.status(400).json({
                success: false,
                error: 'Invalid phone number. Use E.164 format (e.g. +34612345678)',
            });
            return;
        }

        // Find user by phone (silently fail if not found — anti-enumeration)
        const user = await findUserByPhone(phone);

        if (user && user.phoneVerified) {
            const result = await createAndSendOtp(phone, 'login', user.id);

            if (!result.success) {
                // If it's a cooldown error, return it (not an enumeration risk)
                if (result.error?.includes('wait')) {
                    res.status(429).json({ success: false, error: result.error });
                    return;
                }
                // Log internally but don't expose to client
                console.error('[PhoneLogin] Failed to send OTP:', result.error);
            }
        }

        // Always return success (anti-enumeration)
        res.json({
            success: true,
            message: 'If this phone number is registered, you will receive a verification code via WhatsApp',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /auth/phone/login/verify (public)
 * Verify OTP and log the user in via phone number.
 */
export const verifyPhoneLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { phone, code } = req.body;

        if (!phone || !code) {
            res.status(400).json({ success: false, error: 'Phone and code are required' });
            return;
        }

        const result = await verifyOtp(phone, code, 'login');

        if (!result.valid) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        // Find the user by phone
        const user = await findUserByPhone(phone);

        if (!user) {
            throw new UnauthorizedError('Account not found');
        }

        // Generate token pair (same as Google login flow)
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const deviceFingerprint = generateDeviceFingerprint(userAgent);

        const { accessToken, refreshToken } = await jwtService.generateTokenPair(
            user.id,
            user.email,
            user.name || user.email,
            userAgent,
            ipAddress,
            deviceFingerprint
        );

        // Track login event
        processAuthEvent(user.id, ipAddress, userAgent, 'login').catch(() => {});

        res.json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                surname: user.surname,
                avatar: user.avatar,
                phone: user.phone,
                phoneVerified: user.phoneVerified,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const authFailure = (req: Request, res: Response): void => {
    res.status(401).json({
        success: false,
        message: 'Authentication failed',
    });
};
