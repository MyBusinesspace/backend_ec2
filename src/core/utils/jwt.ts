import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errors';
import { logger } from './logger';
import { prisma } from '@/database/prisma';
import crypto from 'crypto';
import { generateDeviceFingerprint } from '@/modules/security/utils';
import { createSecurityAlert } from '@/modules/security/db';

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  type?: 'access' | 'refresh';
  tokenVersion?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RotationResult {
  accessToken: string;
  refreshToken: string;
}

export class JWTService {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  // Grace period for rotation race conditions (10 seconds)
  private static readonly ROTATION_GRACE_MS = 10_000;

  // In-memory blacklist (in production, use Redis)
  private blacklistedTokens: Set<string> = new Set();

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '5m'; // 5 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '15d'; // 15 days

    if (!this.accessTokenSecret) {
      throw new Error('JWT_ACCESS_SECRET or JWT_SECRET environment variable is required');
    }

    if (!this.refreshTokenSecret) {
      throw new Error('JWT_REFRESH_SECRET or JWT_SECRET environment variable is required');
    }
  }

  // ============================================================
  // ACCESS TOKEN
  // ============================================================

  /**
   * Generate access token (short-lived: 5 minutes)
   */
  generateAccessToken(payload: Omit<JWTPayload, 'type' | 'tokenVersion'>): string {
    return jwt.sign(
      {
        ...payload,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
      } as jwt.SignOptions
    );
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      // Check blacklist
      if (this.blacklistedTokens.has(token)) {
        throw new UnauthorizedError('Token has been revoked');
      }

      const decoded = jwt.verify(token, this.accessTokenSecret) as JWTPayload;

      if (decoded.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }

      return decoded;
    } catch (error: any) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Access token verification failed:', {
        error: error.message,
        name: error.name,
      });

      throw new UnauthorizedError(`Invalid or expired access token: ${error.message}`);
    }
  }

  /**
   * Blacklist an access token (for immediate logout)
   * In production, use Redis with TTL equal to token expiry
   */
  blacklistAccessToken(token: string): void {
    this.blacklistedTokens.add(token);

    // Auto-remove after 5 minutes (access token expiry)
    setTimeout(() => {
      this.blacklistedTokens.delete(token);
    }, 5 * 60 * 1000);
  }

  // ============================================================
  // REFRESH TOKEN GENERATION
  // ============================================================

  /**
   * Generate refresh token (long-lived: 15 days)
   * Stored in database with family tracking and device fingerprint
   *
   * @param userId - User ID
   * @param deviceInfo - User-Agent string
   * @param ipAddress - Client IP address
   * @param familyId - Token family ID (omit for new login = new family)
   * @param deviceFingerprint - Device fingerprint hash
   */
  async generateRefreshToken(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
    familyId?: string,
    deviceFingerprint?: string
  ): Promise<string> {
    // Get the user's current token version from the User model
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });

    const tokenVersion = user?.tokenVersion || 1;

    // Family: reuse existing or create new (new login = new family)
    const family = familyId || crypto.randomBytes(16).toString('hex');

    // Fingerprint: compute if not provided
    const fingerprint = deviceFingerprint || generateDeviceFingerprint(deviceInfo);

    // Generate unique token
    const token = jwt.sign(
      {
        userId,
        type: 'refresh',
        tokenVersion,
        fid: family,
        jti: crypto.randomBytes(16).toString('hex'),
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
      } as jwt.SignOptions
    );

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 15);

    // Store in database
    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        tokenVersion,
        familyId: family,
        deviceFingerprint: fingerprint,
        expiresAt,
        deviceInfo,
        ipAddress,
      },
    });

    return token;
  }

  /**
   * Generate both access and refresh tokens (used on login)
   */
  async generateTokenPair(
    userId: string,
    email: string,
    name: string,
    deviceInfo?: string,
    ipAddress?: string,
    deviceFingerprint?: string
  ): Promise<TokenPair> {
    const accessToken = this.generateAccessToken({ userId, email, name });
    const refreshToken = await this.generateRefreshToken(
      userId,
      deviceInfo,
      ipAddress,
      undefined, // new family (login = new family)
      deviceFingerprint
    );

    return { accessToken, refreshToken };
  }

  // ============================================================
  // REFRESH TOKEN ROTATION (core security feature)
  // ============================================================

  /**
   * Rotate a refresh token: verify the old one, issue a new pair,
   * and invalidate the old token. Detects theft via reuse detection
   * and device fingerprint mismatch.
   *
   * This is the primary method used during token refresh (both
   * middleware auto-refresh and explicit /auth/refresh endpoint).
   */
  async rotateRefreshToken(
    oldTokenString: string,
    deviceInfo?: string,
    ipAddress?: string,
    requestFingerprint?: string
  ): Promise<RotationResult> {
    // 1. Decode JWT (verify signature + expiration)
    let decoded: any;
    try {
      decoded = jwt.verify(oldTokenString, this.refreshTokenSecret);
    } catch (error: any) {
      throw new UnauthorizedError(`Invalid or expired refresh token: ${error.message}`);
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // 2. Lookup in DB
    const storedToken = await prisma.refreshToken.findFirst({
      where: { token: oldTokenString },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token not found');
    }

    // Check expiration
    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // 3. CHECK GLOBAL TOKEN VERSION (User model version)
    // If user's tokenVersion has been incremented (e.g., "Revoke All Sessions"),
    // ALL tokens with a lower version are instantly invalid.
    if (storedToken.tokenVersion < storedToken.user.tokenVersion) {
      logger.warn('SECURITY: Refresh token version is outdated (global revocation)', {
        userId: storedToken.userId,
        tokenVersion: storedToken.tokenVersion,
        userVersion: storedToken.user.tokenVersion,
      });
      // Revoke this specific token for cleanup
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      });
      throw new UnauthorizedError('Session has been invalidated. Please re-authenticate.');
    }

    // 4. CHECK FOR TOKEN REUSE (theft detection)
    if (storedToken.isRevoked || storedToken.replacedByToken) {
      // This token was already used/rotated. Check grace period.
      if (storedToken.rotatedAt) {
        const elapsed = Date.now() - storedToken.rotatedAt.getTime();
        if (elapsed < JWTService.ROTATION_GRACE_MS && storedToken.replacedByToken) {
          // Grace period: return the replacement token instead of flagging theft
          const replacementRecord = await prisma.refreshToken.findFirst({
            where: { token: storedToken.replacedByToken, isRevoked: false },
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          });

          if (replacementRecord && new Date() < replacementRecord.expiresAt) {
            const accessToken = this.generateAccessToken({
              userId: replacementRecord.user.id,
              email: replacementRecord.user.email,
              name: replacementRecord.user.name || '',
            });
            return {
              accessToken,
              refreshToken: replacementRecord.token,
            };
          }
        }
      }

      // Outside grace period or no valid replacement: THEFT DETECTED
      logger.warn('SECURITY: Refresh token reuse detected — possible session hijacking', {
        userId: storedToken.userId,
        familyId: storedToken.familyId,
        tokenId: storedToken.id,
        ip: ipAddress,
      });

      // Revoke entire token family
      await this.revokeTokenFamily(storedToken.familyId);

      // Create security alert
      createSecurityAlert({
        userId: storedToken.userId,
        alertType: 'token_reuse',
        message: 'Possible session hijacking detected. A previously used refresh token was presented again. All sessions in this login chain have been revoked for your safety.',
        metadata: {
          familyId: storedToken.familyId,
          ip: ipAddress || 'unknown',
          device: deviceInfo || 'unknown',
        },
      }).catch(() => {}); // fire-and-forget

      throw new UnauthorizedError('Token reuse detected. Session revoked for security.');
    }

    // 5. CHECK DEVICE FINGERPRINT
    if (
      storedToken.deviceFingerprint &&
      requestFingerprint &&
      storedToken.deviceFingerprint !== requestFingerprint
    ) {
      logger.warn('SECURITY: Device fingerprint mismatch on refresh token', {
        userId: storedToken.userId,
        familyId: storedToken.familyId,
        expected: storedToken.deviceFingerprint.substring(0, 8) + '...',
        received: requestFingerprint.substring(0, 8) + '...',
      });

      // Revoke this family and force re-auth
      await this.revokeTokenFamily(storedToken.familyId);

      createSecurityAlert({
        userId: storedToken.userId,
        alertType: 'device_mismatch',
        message: 'A refresh token was used from a different device than it was issued to. The session has been revoked for your safety.',
        metadata: {
          familyId: storedToken.familyId,
          ip: ipAddress || 'unknown',
          device: deviceInfo || 'unknown',
        },
      }).catch(() => {});

      throw new UnauthorizedError('Device mismatch detected. Please re-authenticate.');
    }

    // 6. ROTATE: generate new token in same family
    const newRefreshToken = await this.generateRefreshToken(
      storedToken.userId,
      deviceInfo,
      ipAddress,
      storedToken.familyId, // same family
      storedToken.deviceFingerprint || requestFingerprint // preserve original fingerprint
    );

    // 7. Mark old token as rotated (not revoked, but replaced)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        replacedByToken: newRefreshToken,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    // 8. Generate new access token
    const newAccessToken = this.generateAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
      name: storedToken.user.name || '',
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ============================================================
  // VERIFY REFRESH TOKEN (read-only, for non-rotation scenarios)
  // ============================================================

  /**
   * Verify a refresh token without rotating it.
   * Used for validation-only scenarios (e.g., checking if a session is valid).
   */
  async verifyRefreshToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret) as JWTPayload;

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          token,
          isRevoked: false,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              tokenVersion: true,
            },
          },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedError('Refresh token not found or has been revoked');
      }

      // Check if already rotated
      if (storedToken.replacedByToken) {
        throw new UnauthorizedError('Refresh token has already been rotated');
      }

      // Check expiration
      if (new Date() > storedToken.expiresAt) {
        throw new UnauthorizedError('Refresh token has expired');
      }

      // Check token version against JWT
      if (decoded.tokenVersion !== storedToken.tokenVersion) {
        throw new UnauthorizedError('Invalid token version');
      }

      // Check global user version
      if (storedToken.tokenVersion < storedToken.user.tokenVersion) {
        throw new UnauthorizedError('Session has been invalidated');
      }

      // Update last used timestamp
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        name: storedToken.user.name || '',
        type: 'refresh',
        tokenVersion: storedToken.tokenVersion,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Refresh token verification failed:', {
        error: error.message,
        name: error.name,
      });

      throw new UnauthorizedError(`Invalid or expired refresh token: ${error.message}`);
    }
  }

  // ============================================================
  // REVOCATION
  // ============================================================

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  /**
   * Revoke an entire token family (all tokens in a login chain)
   * Used when theft is detected
   */
  async revokeTokenFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  /**
   * Increment user's global token version.
   * This instantly invalidates ALL refresh tokens for that user,
   * regardless of family. Used for "Revoke All Sessions" or security incidents.
   */
  async incrementUserTokenVersion(userId: string): Promise<number> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    // Also revoke all existing tokens for immediate effect
    await this.revokeAllUserTokens(userId);

    return user.tokenVersion;
  }

  /**
   * Clean up expired tokens (run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  // ============================================================
  // DEVICE / SESSION MANAGEMENT
  // ============================================================

  /**
   * Get user's active devices (refresh tokens)
   */
  async getUserDevices(userId: string) {
    return prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        replacedByToken: null, // Only show current (non-rotated) tokens
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * Revoke a specific device (refresh token by ID)
   */
  async revokeDevice(userId: string, tokenId: string): Promise<void> {
    // Find the token to get its familyId
    const token = await prisma.refreshToken.findFirst({
      where: { id: tokenId, userId },
    });

    if (token) {
      // Revoke the entire family for this device
      await this.revokeTokenFamily(token.familyId);
    }
  }

  // Legacy methods for backward compatibility
  generateToken(payload: JWTPayload): string {
    return this.generateAccessToken(payload);
  }

  verifyToken(token: string): JWTPayload {
    return this.verifyAccessToken(token);
  }
}

export const jwtService = new JWTService();
