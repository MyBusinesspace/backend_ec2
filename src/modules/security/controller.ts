import { Request, Response, NextFunction } from 'express';
import {
  getSecurityOverview,
  getLoginHistory,
  getLoginHistoryCount,
  getTrustedDevices,
  addTrustedDevice,
  removeTrustedDevice,
  getSecurityAlerts,
  markAlertsAsRead,
  dismissAlert,
  getActiveSessions,
  getUnreadAlertCount,
} from './db';
import { parseUserAgent, normalizeIp, generateDeviceFingerprint } from './utils';
import { jwtService } from '@/utils/jwt';
import { UnauthorizedError, BadRequestError } from '@/utils/errors';

const ensureString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0];
  return value || '';
};

/**
 * GET /api/security/overview
 * Single endpoint that returns all security data for the dashboard
 * This reduces frontend API calls from 5+ to 1
 */
export const handleGetSecurityOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const overview = await getSecurityOverview(req.user.userId);

    // Identify current session
    const currentRefreshToken = req.headers['x-refresh-token'] as string;
    let currentSessionId: string | null = null;

    if (currentRefreshToken) {
      // Find the matching refresh token to identify current session
      const currentSession = overview.activeSessions.find((s) => {
        // We can't compare tokens directly, but we can match by IP + device
        const currentIp = normalizeIp(
          (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress
        );
        const currentFingerprint = generateDeviceFingerprint(req.headers['user-agent']);
        const sessionFingerprint = generateDeviceFingerprint(s.deviceInfo || undefined);
        return sessionFingerprint === currentFingerprint && s.ipAddress === currentIp;
      });
      currentSessionId = currentSession?.id || null;
    }

    res.json({
      success: true,
      data: {
        ...overview,
        currentSessionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/security/sessions
 * Get active sessions
 */
export const handleGetSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const sessions = await getActiveSessions(req.user.userId);

    // Enrich with parsed device info
    const enrichedSessions = sessions.map((session) => {
      const parsed = parseUserAgent(session.deviceInfo || undefined);
      return {
        ...session,
        ipAddress: normalizeIp(session.ipAddress || undefined),
        browser: parsed.browser,
        os: parsed.os,
        deviceName: parsed.deviceName,
      };
    });

    res.json({
      success: true,
      data: enrichedSessions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/security/sessions/:sessionId
 * Revoke a specific session (logout from that device)
 */
export const handleRevokeSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const sessionId = ensureString(req.params.sessionId);
    if (!sessionId) {
      throw new BadRequestError('Session ID is required');
    }

    await jwtService.revokeDevice(req.user.userId, sessionId);

    res.json({
      success: true,
      message: 'Session revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/security/sessions/revoke-all
 * Revoke all sessions except current
 */
export const handleRevokeAllSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { exceptSessionId } = req.body;

    // Revoke all tokens
    await jwtService.revokeAllUserTokens(req.user.userId);

    res.json({
      success: true,
      message: 'All other sessions revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/security/history
 * Get login history with pagination
 */
export const handleGetLoginHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [history, total] = await Promise.all([
      getLoginHistory(req.user.userId, limit, offset),
      getLoginHistoryCount(req.user.userId),
    ]);

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/security/trusted-devices
 * Get trusted devices
 */
export const handleGetTrustedDevices = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const devices = await getTrustedDevices(req.user.userId);

    res.json({
      success: true,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/security/trusted-devices
 * Trust the current device
 */
export const handleTrustCurrentDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    const device = await addTrustedDevice(req.user.userId, userAgent, ipAddress);

    res.json({
      success: true,
      data: device,
      message: 'Device marked as trusted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/security/trusted-devices/by-fingerprint
 * Trust a device by its fingerprint (from login history / alerts)
 */
export const handleTrustDeviceByFingerprint = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { deviceInfo, ipAddress } = req.body;
    if (!deviceInfo) {
      throw new BadRequestError('Device info is required');
    }

    const device = await addTrustedDevice(req.user.userId, deviceInfo, ipAddress);

    res.json({
      success: true,
      data: device,
      message: 'Device marked as trusted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/security/trusted-devices/:deviceId
 * Remove a trusted device
 */
export const handleRemoveTrustedDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const deviceId = ensureString(req.params.deviceId);
    if (!deviceId) {
      throw new BadRequestError('Device ID is required');
    }

    await removeTrustedDevice(req.user.userId, deviceId);

    res.json({
      success: true,
      message: 'Trusted device removed',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/security/alerts
 * Get security alerts
 */
export const handleGetAlerts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const includeRead = req.query.includeRead === 'true';
    const alerts = await getSecurityAlerts(req.user.userId, includeRead);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/security/alerts/count
 * Get unread alert count (for badge display)
 */
export const handleGetAlertCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const count = await getUnreadAlertCount(req.user.userId);

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/security/alerts/read
 * Mark alerts as read
 */
export const handleMarkAlertsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { alertIds } = req.body;
    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      throw new BadRequestError('Alert IDs array is required');
    }

    await markAlertsAsRead(req.user.userId, alertIds);

    res.json({
      success: true,
      message: 'Alerts marked as read',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/security/alerts/:alertId
 * Dismiss an alert
 */
export const handleDismissAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const alertId = ensureString(req.params.alertId);
    if (!alertId) {
      throw new BadRequestError('Alert ID is required');
    }

    await dismissAlert(req.user.userId, alertId);

    res.json({
      success: true,
      message: 'Alert dismissed',
    });
  } catch (error) {
    next(error);
  }
};
