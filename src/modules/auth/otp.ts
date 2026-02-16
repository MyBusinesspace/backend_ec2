/**
 * OTP (One-Time Password) utility for phone verification.
 *
 * Features:
 * - 6-digit code generation via crypto.randomInt
 * - 60-second cooldown between requests
 * - 5-minute code expiry
 * - Max 5 verification attempts (brute-force protection)
 * - Automatic invalidation of previous codes
 */

import crypto from 'crypto';
import { prisma } from '../../core/database/prisma';
import { sendWhatsAppOtp } from '../../core/utils/whatsapp';

interface OtpResult {
    success: boolean;
    error?: string;
}

interface VerifyResult {
    valid: boolean;
    userId?: string | null;
    error?: string;
}

/**
 * Generate a cryptographically random 6-digit OTP code.
 */
export const generateOtpCode = (): string => {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Check if the user can request a new OTP (60-second cooldown).
 */
export const canRequestOtp = async (phone: string, purpose: string): Promise<boolean> => {
    const recentOtp = await prisma.otpCode.findFirst({
        where: {
            phone,
            purpose,
            isUsed: false,
            createdAt: {
                gte: new Date(Date.now() - 60 * 1000), // within last 60 seconds
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return !recentOtp; // Can request if no recent OTP exists
};

/**
 * Create a new OTP, invalidate old ones, and send via WhatsApp.
 */
export const createAndSendOtp = async (
    phone: string,
    purpose: string,
    userId?: string
): Promise<OtpResult> => {
    // 1. Check 60-second cooldown
    const canRequest = await canRequestOtp(phone, purpose);
    if (!canRequest) {
        return { success: false, error: 'Please wait 60 seconds before requesting a new code' };
    }

    // 2. Invalidate existing unused OTPs for the same phone + purpose
    await prisma.otpCode.updateMany({
        where: {
            phone,
            purpose,
            isUsed: false,
        },
        data: { isUsed: true },
    });

    // 3. Generate code and store with 5-minute expiry
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpCode.create({
        data: {
            phone,
            code,
            purpose,
            userId: userId || null,
            expiresAt,
        },
    });

    // 4. Send via WhatsApp
    const sendResult = await sendWhatsAppOtp(phone, code);

    if (!sendResult.success) {
        return { success: false, error: sendResult.error || 'Failed to send verification code' };
    }

    return { success: true };
};

/**
 * Verify an OTP code.
 * Returns { valid: true, userId } on success.
 * Handles expiry, attempt limits, and code comparison.
 */
export const verifyOtp = async (
    phone: string,
    code: string,
    purpose: string
): Promise<VerifyResult> => {
    // 1. Find the most recent unused OTP for this phone + purpose
    const otpRecord = await prisma.otpCode.findFirst({
        where: {
            phone,
            purpose,
            isUsed: false,
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
        return { valid: false, error: 'No verification code found. Please request a new one.' };
    }

    // 2. Check expiry (5 minutes)
    if (new Date() > otpRecord.expiresAt) {
        // Mark as used so it can't be retried
        await prisma.otpCode.update({
            where: { id: otpRecord.id },
            data: { isUsed: true },
        });
        return { valid: false, error: 'Verification code has expired. Please request a new one.' };
    }

    // 3. Check attempt limit (max 5)
    if (otpRecord.attempts >= 5) {
        // Invalidate the OTP
        await prisma.otpCode.update({
            where: { id: otpRecord.id },
            data: { isUsed: true },
        });
        return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
    }

    // 4. Increment attempts first (before comparison, to prevent race conditions)
    await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
    });

    // 5. Compare code (constant-time comparison)
    const isValid = crypto.timingSafeEqual(
        Buffer.from(code.padEnd(6, '0')),
        Buffer.from(otpRecord.code.padEnd(6, '0'))
    );

    if (!isValid) {
        const remainingAttempts = 4 - otpRecord.attempts; // Already incremented
        return {
            valid: false,
            error: remainingAttempts > 0
                ? `Invalid code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
                : 'Too many failed attempts. Please request a new code.',
        };
    }

    // 6. Mark as used on success
    await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
    });

    return { valid: true, userId: otpRecord.userId };
};

/**
 * Clean up expired and old used OTP codes.
 * Call periodically (e.g., every hour).
 */
export const cleanupExpiredOtps = async (): Promise<number> => {
    const result = await prisma.otpCode.deleteMany({
        where: {
            OR: [
                // Expired codes
                { expiresAt: { lt: new Date() } },
                // Used codes older than 24 hours
                {
                    isUsed: true,
                    createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
            ],
        },
    });

    return result.count;
};
