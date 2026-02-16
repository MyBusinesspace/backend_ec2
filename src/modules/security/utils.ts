/**
 * Security utility functions for device fingerprinting and user-agent parsing
 */
import crypto from 'crypto';

export interface ParsedDevice {
  browser: string;
  os: string;
  deviceName: string;
  fingerprint: string;
}

/**
 * Parse user-agent string to extract browser, OS, and device info
 * Lightweight parsing without external dependencies
 */
export function parseUserAgent(userAgent: string | undefined): Omit<ParsedDevice, 'fingerprint'> {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', deviceName: 'Unknown Device' };
  }

  const ua = userAgent.toLowerCase();

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('opr/') || ua.includes('opera/')) {
    browser = 'Opera';
  } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('msie') || ua.includes('trident/')) {
    browser = 'Internet Explorer';
  }

  // Extract browser version
  const versionPatterns: Record<string, RegExp> = {
    'Microsoft Edge': /edg?\/(\d+)/,
    Opera: /opr\/(\d+)/,
    Chrome: /chrome\/(\d+)/,
    Firefox: /firefox\/(\d+)/,
    Safari: /version\/(\d+)/,
  };

  const versionMatch = versionPatterns[browser]?.exec(ua);
  if (versionMatch) {
    browser = `${browser} ${versionMatch[1]}`;
  }

  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows nt 10') || ua.includes('windows nt 11')) {
    os = 'Windows';
  } else if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac os x') || ua.includes('macintosh')) {
    os = 'macOS';
  } else if (ua.includes('iphone')) {
    os = 'iOS (iPhone)';
  } else if (ua.includes('ipad')) {
    os = 'iOS (iPad)';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  } else if (ua.includes('cros')) {
    os = 'Chrome OS';
  }

  // Build device name
  const isMobile = ua.includes('mobile') || ua.includes('iphone') || ua.includes('android');
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const deviceName = `${os} ${deviceType} - ${browser}`;

  return { browser, os, deviceName };
}

/**
 * Generate a device fingerprint from user-agent and other stable identifiers
 * This creates a stable hash that identifies the same browser/device combo
 */
export function generateDeviceFingerprint(userAgent: string | undefined): string {
  const { browser, os } = parseUserAgent(userAgent);
  // Use browser + OS as the fingerprint base (stable across sessions)
  // We normalize to avoid minor version differences creating new fingerprints
  const baseBrowser = browser.split(' ')[0]; // Remove version
  const baseString = `${baseBrowser}:${os}:${userAgent || 'unknown'}`;
  return crypto.createHash('sha256').update(baseString).digest('hex').substring(0, 32);
}

/**
 * Normalize an IP address (handle IPv6-mapped IPv4, etc.)
 */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  // Remove IPv6-mapped IPv4 prefix
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  // Handle localhost
  if (ip === '::1') return '127.0.0.1';
  return ip;
}
