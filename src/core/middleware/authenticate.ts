import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';
import { processAuthEvent } from '@/modules/security/db';
import { generateDeviceFingerprint } from '@/modules/security/utils';

/**
 * Enhanced JWT Authentication Middleware with Token Rotation
 *
 * Flow:
 * 1. Try to verify access token (5 min expiry)
 * 2. If access token expired, check refresh token (15 day expiry)
 * 3. If refresh token valid, ROTATE it: issue new access + refresh token pair
 * 4. Attach new tokens to response headers and proceed
 *
 * Headers:
 * - Authorization: Bearer <access_token>
 * - X-Refresh-Token: <refresh_token>
 *
 * Response Headers (when token rotated):
 * - X-New-Access-Token: <new_access_token>
 * - X-New-Refresh-Token: <new_refresh_token>
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const refreshToken = req.headers['x-refresh-token'] as string;

    logger.debug('Auth header received:', authHeader);
    logger.debug('Refresh token present:', !!refreshToken);

    // No authorization header at all
    if (!authHeader) {
      throw new UnauthorizedError('No authorization header provided');
    }

    // Parse access token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    const accessToken = parts[1];
    logger.debug('Access token extracted:', accessToken.substring(0, 20) + '...');

    // ============================================
    // STEP 1: Try to verify access token
    // ============================================
    try {
      const payload = jwtService.verifyAccessToken(accessToken);
      logger.debug('Access token verified successfully:', payload);

      // Attach user to request
      req.user = payload;

      return next();
    } catch (accessTokenError: any) {
      logger.debug('Access token verification failed:', accessTokenError.message);

      // ============================================
      // STEP 2: Access token failed, try refresh token rotation
      // ============================================
      if (!refreshToken) {
        logger.error('Access token expired and no refresh token provided');
        throw new UnauthorizedError(
          'Access token expired. Please provide refresh token or re-authenticate.'
        );
      }

      try {
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const requestFingerprint = generateDeviceFingerprint(userAgent);

        // ============================================
        // STEP 3: Rotate refresh token (issues new pair)
        // ============================================
        logger.debug('Attempting refresh token rotation...');
        const rotationResult = await jwtService.rotateRefreshToken(
          refreshToken,
          userAgent,
          ipAddress,
          requestFingerprint
        );

        logger.debug('Token rotation successful');

        // Attach new tokens to response headers
        res.setHeader('X-New-Access-Token', rotationResult.accessToken);
        res.setHeader('X-New-Refresh-Token', rotationResult.refreshToken);

        // Decode the new access token to get user payload
        const newPayload = jwtService.verifyAccessToken(rotationResult.accessToken);

        // Attach user to request
        req.user = {
          userId: newPayload.userId,
          email: newPayload.email,
          name: newPayload.name,
        };

        // Track token refresh event for security (fire-and-forget)
        processAuthEvent(newPayload.userId, ipAddress, userAgent, 'token_refresh').catch(() => {});

        logger.debug('Token rotated successfully, proceeding with request');
        return next();
      } catch (refreshTokenError: any) {
        logger.error('Refresh token rotation failed:', refreshTokenError.message);
        throw new UnauthorizedError(
          'Both access and refresh tokens are invalid. Please re-authenticate.'
        );
      }
    }
  } catch (error) {
    logger.error('Authentication failed:', error);
    next(error);
  }
};

/**
 * Optional authentication middleware
 * Doesn't fail if no token provided, but validates if present.
 * Also supports token rotation when access token is expired.
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const accessToken = parts[1];

        try {
          const payload = jwtService.verifyAccessToken(accessToken);
          req.user = payload;
        } catch (error) {
          // Try refresh token rotation
          const refreshToken = req.headers['x-refresh-token'] as string;
          if (refreshToken) {
            try {
              const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
              const userAgent = req.headers['user-agent'];
              const requestFingerprint = generateDeviceFingerprint(userAgent);

              const rotationResult = await jwtService.rotateRefreshToken(
                refreshToken,
                userAgent,
                ipAddress,
                requestFingerprint
              );

              res.setHeader('X-New-Access-Token', rotationResult.accessToken);
              res.setHeader('X-New-Refresh-Token', rotationResult.refreshToken);

              const newPayload = jwtService.verifyAccessToken(rotationResult.accessToken);
              req.user = {
                userId: newPayload.userId,
                email: newPayload.email,
                name: newPayload.name,
              };
            } catch (refreshError) {
              // Fail silently for optional auth
            }
          }
        }
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth
    next();
  }
};
