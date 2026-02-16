import { Router } from 'express';
import { authenticateJWT } from '@/middleware/authenticate';
import {
  handleGetSecurityOverview,
  handleGetSessions,
  handleRevokeSession,
  handleRevokeAllSessions,
  handleGetLoginHistory,
  handleGetTrustedDevices,
  handleTrustCurrentDevice,
  handleTrustDeviceByFingerprint,
  handleRemoveTrustedDevice,
  handleGetAlerts,
  handleGetAlertCount,
  handleMarkAlertsRead,
  handleDismissAlert,
} from './controller';

export const securityRouter = Router();

// All routes require authentication
securityRouter.use(authenticateJWT);

// ── Overview (single endpoint for dashboard) ──
securityRouter.get('/security/overview', handleGetSecurityOverview);

// ── Active Sessions ──
securityRouter.get('/security/sessions', handleGetSessions);
securityRouter.delete('/security/sessions/:sessionId', handleRevokeSession);
securityRouter.post('/security/sessions/revoke-all', handleRevokeAllSessions);

// ── Login History ──
securityRouter.get('/security/history', handleGetLoginHistory);

// ── Trusted Devices ──
securityRouter.get('/security/trusted-devices', handleGetTrustedDevices);
securityRouter.post('/security/trusted-devices', handleTrustCurrentDevice);
securityRouter.post('/security/trusted-devices/by-fingerprint', handleTrustDeviceByFingerprint);
securityRouter.delete('/security/trusted-devices/:deviceId', handleRemoveTrustedDevice);

// ── Alerts ──
securityRouter.get('/security/alerts', handleGetAlerts);
securityRouter.get('/security/alerts/count', handleGetAlertCount);
securityRouter.patch('/security/alerts/read', handleMarkAlertsRead);
securityRouter.delete('/security/alerts/:alertId', handleDismissAlert);
