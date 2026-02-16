import { prisma } from '@/database/prisma';
import { parseUserAgent, generateDeviceFingerprint, normalizeIp } from './utils';

// ============================================================
// LOGIN HISTORY
// ============================================================

interface RecordLoginParams {
  userId: string;
  ipAddress: string;
  userAgent: string | undefined;
  eventType: 'login' | 'token_refresh' | 'new_device' | 'new_ip';
}

/**
 * Record a login event in history
 * Lightweight — only called on actual logins and notable security events
 */
export const recordLoginEvent = async ({
  userId,
  ipAddress,
  userAgent,
  eventType,
}: RecordLoginParams) => {
  const ip = normalizeIp(ipAddress);
  const fingerprint = generateDeviceFingerprint(userAgent);
  const { browser, os } = parseUserAgent(userAgent);

  // Check if this device is trusted
  const trustedDevice = await prisma.trustedDevice.findUnique({
    where: {
      trusted_devices_user_fingerprint_unique: {
        userId,
        deviceFingerprint: fingerprint,
      },
    },
  });

  return prisma.loginHistory.create({
    data: {
      userId,
      ipAddress: ip,
      deviceInfo: userAgent || null,
      deviceFingerprint: fingerprint,
      browser,
      os,
      isTrustedDevice: !!trustedDevice,
      eventType,
    },
  });
};

/**
 * Get login history for a user (paginated)
 */
export const getLoginHistory = async (
  userId: string,
  limit: number = 50,
  offset: number = 0
) => {
  return prisma.loginHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      ipAddress: true,
      deviceInfo: true,
      deviceFingerprint: true,
      browser: true,
      os: true,
      city: true,
      country: true,
      isTrustedDevice: true,
      eventType: true,
      createdAt: true,
    },
  });
};

/**
 * Get login history count for a user
 */
export const getLoginHistoryCount = async (userId: string) => {
  return prisma.loginHistory.count({
    where: { userId },
  });
};

// ============================================================
// TRUSTED DEVICES
// ============================================================

/**
 * Add a device as trusted
 */
export const addTrustedDevice = async (
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
) => {
  const fingerprint = generateDeviceFingerprint(userAgent);
  const { browser, os, deviceName } = parseUserAgent(userAgent);
  const ip = normalizeIp(ipAddress);

  return prisma.trustedDevice.upsert({
    where: {
      trusted_devices_user_fingerprint_unique: {
        userId,
        deviceFingerprint: fingerprint,
      },
    },
    update: {
      lastIpAddress: ip,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      deviceFingerprint: fingerprint,
      deviceName,
      browser,
      os,
      lastIpAddress: ip,
    },
  });
};

/**
 * Remove a trusted device
 */
export const removeTrustedDevice = async (userId: string, deviceId: string) => {
  return prisma.trustedDevice.deleteMany({
    where: {
      id: deviceId,
      userId, // Ensure user owns the device
    },
  });
};

/**
 * Get all trusted devices for a user
 */
export const getTrustedDevices = async (userId: string) => {
  return prisma.trustedDevice.findMany({
    where: { userId },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      deviceFingerprint: true,
      deviceName: true,
      browser: true,
      os: true,
      lastIpAddress: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
};

/**
 * Check if a device is trusted
 */
export const isDeviceTrusted = async (
  userId: string,
  userAgent: string | undefined
): Promise<boolean> => {
  const fingerprint = generateDeviceFingerprint(userAgent);

  const device = await prisma.trustedDevice.findUnique({
    where: {
      trusted_devices_user_fingerprint_unique: {
        userId,
        deviceFingerprint: fingerprint,
      },
    },
  });

  return !!device;
};

/**
 * Update trusted device last used timestamp and IP
 */
export const touchTrustedDevice = async (
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
) => {
  const fingerprint = generateDeviceFingerprint(userAgent);
  const ip = normalizeIp(ipAddress);

  return prisma.trustedDevice.updateMany({
    where: {
      userId,
      deviceFingerprint: fingerprint,
    },
    data: {
      lastUsedAt: new Date(),
      lastIpAddress: ip,
    },
  });
};

// ============================================================
// SECURITY ALERTS
// ============================================================

interface CreateAlertParams {
  userId: string;
  alertType: 'new_device' | 'new_location' | 'suspicious_ip' | 'multiple_failures' | 'token_reuse' | 'device_mismatch';
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a security alert
 */
export const createSecurityAlert = async ({
  userId,
  alertType,
  message,
  metadata,
}: CreateAlertParams) => {
  return prisma.securityAlert.create({
    data: {
      userId,
      alertType,
      message,
      metadata: (metadata as Record<string, unknown> as any) || undefined,
    },
  });
};

/**
 * Get unread security alerts for a user
 */
export const getSecurityAlerts = async (userId: string, includeRead: boolean = false) => {
  return prisma.securityAlert.findMany({
    where: {
      userId,
      isDismissed: false,
      ...(includeRead ? {} : { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      alertType: true,
      message: true,
      metadata: true,
      isRead: true,
      isDismissed: true,
      createdAt: true,
    },
  });
};

/**
 * Mark alerts as read
 */
export const markAlertsAsRead = async (userId: string, alertIds: string[]) => {
  return prisma.securityAlert.updateMany({
    where: {
      id: { in: alertIds },
      userId,
    },
    data: { isRead: true },
  });
};

/**
 * Dismiss an alert
 */
export const dismissAlert = async (userId: string, alertId: string) => {
  return prisma.securityAlert.updateMany({
    where: {
      id: alertId,
      userId,
    },
    data: { isDismissed: true },
  });
};

/**
 * Get unread alert count for a user (efficient count query)
 */
export const getUnreadAlertCount = async (userId: string) => {
  return prisma.securityAlert.count({
    where: {
      userId,
      isRead: false,
      isDismissed: false,
    },
  });
};

// ============================================================
// ACTIVE SESSIONS (from refresh tokens)
// ============================================================

/**
 * Get active sessions (non-revoked, non-expired refresh tokens) with enriched data
 */
export const getActiveSessions = async (userId: string) => {
  return prisma.refreshToken.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
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
};

// ============================================================
// SECURITY OVERVIEW (single efficient query)
// ============================================================

/**
 * Get a complete security overview for the user in a single batch
 * This avoids multiple API calls from the frontend
 */
export const getSecurityOverview = async (userId: string) => {
  const [
    activeSessions,
    trustedDevices,
    alerts,
    recentLogins,
    alertCount,
  ] = await Promise.all([
    getActiveSessions(userId),
    getTrustedDevices(userId),
    getSecurityAlerts(userId, true), // include read ones for the overview
    getLoginHistory(userId, 20), // last 20 events
    getUnreadAlertCount(userId),
  ]);

  // Build a set of trusted fingerprints for fast lookup
  const trustedFingerprints = new Set(trustedDevices.map((d) => d.deviceFingerprint));

  // Parse device info for sessions
  const enrichedSessions = activeSessions.map((session) => {
    const parsed = parseUserAgent(session.deviceInfo || undefined);
    const fingerprint = generateDeviceFingerprint(session.deviceInfo || undefined);
    const isTrusted = trustedFingerprints.has(fingerprint);

    return {
      ...session,
      ipAddress: normalizeIp(session.ipAddress || undefined),
      browser: parsed.browser,
      os: parsed.os,
      deviceName: parsed.deviceName,
      isTrustedDevice: isTrusted,
    };
  });

  return {
    activeSessions: enrichedSessions,
    trustedDevices,
    alerts,
    recentLogins,
    unreadAlertCount: alertCount,
  };
};

// ============================================================
// SECURITY EVENT TRACKING (called from auth middleware)
// ============================================================

/**
 * Process a login/auth event and generate alerts if needed
 * This is the core function called during authentication
 * Designed to be efficient — only does DB writes when something notable happens
 */
export const processAuthEvent = async (
  userId: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  eventType: 'login' | 'token_refresh' = 'login'
) => {
  const ip = normalizeIp(ipAddress);
  const fingerprint = generateDeviceFingerprint(userAgent);
  const { browser, os, deviceName } = parseUserAgent(userAgent);

  // Check if device is trusted
  const trustedDevice = await prisma.trustedDevice.findUnique({
    where: {
      trusted_devices_user_fingerprint_unique: {
        userId,
        deviceFingerprint: fingerprint,
      },
    },
  });

  // If trusted, just update the timestamp (cheap operation)
  if (trustedDevice) {
    await prisma.trustedDevice.update({
      where: { id: trustedDevice.id },
      data: {
        lastUsedAt: new Date(),
        lastIpAddress: ip,
      },
    });

    // Only record the login event (not token refreshes for trusted devices — too noisy)
    if (eventType === 'login') {
      await recordLoginEvent({ userId, ipAddress: ip, userAgent, eventType });
    }

    return { isNewDevice: false, isTrusted: true };
  }

  // Device is NOT trusted — check if we've seen it before in history
  const previousLogin = await prisma.loginHistory.findFirst({
    where: {
      userId,
      deviceFingerprint: fingerprint,
    },
    orderBy: { createdAt: 'desc' },
  });

  const isNewDevice = !previousLogin;

  // Check if IP is new for this user
  const previousIpLogin = await prisma.loginHistory.findFirst({
    where: {
      userId,
      ipAddress: ip,
    },
  });
  const isNewIp = !previousIpLogin;

  // Record the event
  const actualEventType = isNewDevice ? 'new_device' : isNewIp ? 'new_ip' : eventType;
  await recordLoginEvent({
    userId,
    ipAddress: ip,
    userAgent,
    eventType: actualEventType,
  });

  // Generate alerts for notable events
  if (isNewDevice) {
    await createSecurityAlert({
      userId,
      alertType: 'new_device',
      message: `New device detected: ${deviceName}`,
      metadata: {
        ip,
        browser,
        os,
        deviceName,
        fingerprint,
      },
    });
  }

  if (isNewIp && !isNewDevice) {
    await createSecurityAlert({
      userId,
      alertType: 'new_location',
      message: `Login from a new IP address: ${ip}`,
      metadata: {
        ip,
        browser,
        os,
        deviceName,
      },
    });
  }

  return { isNewDevice, isTrusted: false, isNewIp };
};

/**
 * Clean up old login history entries (keep last 90 days)
 * Run this periodically (e.g., daily cron job)
 */
export const cleanupOldHistory = async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const result = await prisma.loginHistory.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  return result.count;
};

/**
 * Clean up old dismissed alerts (keep last 30 days)
 */
export const cleanupOldAlerts = async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  const result = await prisma.securityAlert.deleteMany({
    where: {
      isDismissed: true,
      createdAt: { lt: cutoffDate },
    },
  });

  return result.count;
};
