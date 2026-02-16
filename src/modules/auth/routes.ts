import { Router } from 'express';
import passport from './config/passport';
import {
  googleCallback,
  getCurrentUser,
  logout,
  logoutAll,
  refreshAccessToken,
  getUserDevices,
  revokeDevice,
  revokeAllSessions,
  authFailure,
  googleMobileLogin,
  requestPhoneLink,
  verifyPhoneLink,
  unlinkPhone,
  requestPhoneLogin,
  verifyPhoneLogin,
} from './controller';
import { authenticateJWT } from '@/middleware/authenticate';

export const authRouter = Router();

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Start Google OAuth authentication
 *     description: Redirects user to Google authentication page
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
authRouter.get(
    '/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

/**
 * @swagger
 * /api/auth/google/mobile:
 * post:
 * summary: Exchange Google ID Token for App JWT (Mobile)
 * tags: [Authentication]
 */
authRouter.post('/auth/google/mobile', googleMobileLogin);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Google redirects here after authentication. Generates a JWT and redirects to frontend
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to frontend with JWT token in query params
 *       401:
 *         description: Authentication error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get(
    '/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/api/auth/failure',
        session: false,
    }),
    googleCallback
);

/**
 * @swagger
 * /api/auth/failure:
 *   get:
 *     summary: Authentication failure endpoint
 *     description: Endpoint to which the user is redirected when Google authentication fails
 *     tags: [Authentication]
 *     responses:
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get('/auth/failure', authFailure);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user information
 *     description: Returns authenticated user information and their companies
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get('/auth/me', authenticateJWT, getCurrentUser);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     description: Invalidates the current user session
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Session closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 */
authRouter.post('/auth/logout', logout);

// Logout from all devices
authRouter.post('/auth/logout-all', authenticateJWT, logoutAll);

// Refresh access token
authRouter.post('/auth/refresh', refreshAccessToken);

// Get user's active devices
authRouter.get('/auth/devices', authenticateJWT, getUserDevices);

// Revoke specific device
authRouter.delete('/auth/devices/:tokenId', authenticateJWT, revokeDevice);

// Revoke ALL sessions (increments global token version)
authRouter.post('/auth/revoke-all-sessions', authenticateJWT, revokeAllSessions);

// Phone OTP — Link (authenticated)
authRouter.post('/auth/phone/link/request', authenticateJWT, requestPhoneLink);
authRouter.post('/auth/phone/link/verify', authenticateJWT, verifyPhoneLink);
authRouter.delete('/auth/phone/unlink', authenticateJWT, unlinkPhone);

// Phone OTP — Login (public)
authRouter.post('/auth/phone/login/request', requestPhoneLogin);
authRouter.post('/auth/phone/login/verify', verifyPhoneLogin);
