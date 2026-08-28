import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';
import { setAuthCookies, clearAuthCookies } from '../utils/token.utils.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  generateOAuthState,
  verifyOAuthState,
  buildAuthorizationUrl,
  validateGoogleCode,
} from '../services/googleOAuthService.js';
import { config } from '../config/config.js';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToFrontend(res: Response, path: string): void {
  res.redirect(`${config.frontendUrl}${path}`);
}

export class AuthController {
  static async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fullName, email, password } = req.body;

      await AuthService.sendVerificationOtp({ fullName, email, password });

      res.status(200).json({
        success: true,
        message: 'Verification code sent successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required.' });
        return;
      }

      await AuthService.resendVerificationOtp(email);

      res.status(200).json({
        success: true,
        message: 'Verification code resent successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        res.status(400).json({ success: false, error: 'Email and verification code are required.' });
        return;
      }

      await AuthService.verifyEmailOtp(email, otp);

      res.status(200).json({
        success: true,
        message: 'Email verified successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, accessToken, refreshToken } = await AuthService.registerUser(req.body);

      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        user,
        token: accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, accessToken, refreshToken } = await AuthService.loginUser(req.body);

      setAuthCookies(res, accessToken, refreshToken);

      res.status(200).json({
        success: true,
        message: 'Login successful.',
        user,
        token: accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ success: false, error: 'Refresh token is required.' });
        return;
      }

      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = await AuthService.refreshToken(refreshToken);

      setAuthCookies(res, newAccessToken, newRefreshToken);

      res.status(200).json({
        success: true,
        token: newAccessToken,
        user,
      });
    } catch (error) {
      clearAuthCookies(res);
      next(error);
    }
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      await AuthService.revokeRefreshToken(req.user._id.toString()).catch(() => {});
    } else {
      const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (refreshToken) {
        await AuthService.revokeRefreshTokenByToken(refreshToken).catch(() => {});
      }
    }
    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  public static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Unauthenticated request.' });
        return;
      }

      const userProfile = await AuthService.getUserProfile(req.user._id.toString());

      res.status(200).json({
        success: true,
        user: userProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, error: 'Current password and new password are required.' });
        return;
      }

      await AuthService.changePassword(req.user!._id.toString(), currentPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required.' });
        return;
      }

      await AuthService.sendResetOtp(email);

      res.status(200).json({
        success: true,
        message: 'Password reset code sent successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyResetOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        res.status(400).json({ success: false, error: 'Email and reset code are required.' });
        return;
      }

      const { resetToken } = await AuthService.verifyResetOtp(email, otp);

      res.status(200).json({
        success: true,
        message: 'Reset code verified successfully.',
        resetToken,
      });
    } catch (error) {
      next(error);
    }
  }

  static async resendResetOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required.' });
        return;
      }

      await AuthService.resendResetOtp(email);

      res.status(200).json({
        success: true,
        message: 'Reset code resent successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, newPassword, resetToken } = req.body;
      if (!email || !newPassword || !resetToken) {
        res.status(400).json({ success: false, error: 'Email, new password, and reset authorization are required.' });
        return;
      }

      await AuthService.resetPassword(email, newPassword, resetToken);

      res.status(200).json({
        success: true,
        message: 'Password updated successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ success: false, error: 'Verification token is required.' });
        return;
      }

      const user = await AuthService.verifyEmail(token);

      res.status(200).json({
        success: true,
        message: 'Email address verified successfully.',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = generateOAuthState();
      res.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: OAUTH_STATE_MAX_AGE_MS,
      });
      res.redirect(buildAuthorizationUrl(state));
    } catch (error) {
      next(error);
    }
  }

  public static async googleCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error: paramError } = req.query;
    const storedState = req.cookies?.[OAUTH_STATE_COOKIE];

    if (storedState) {
      res.clearCookie(OAUTH_STATE_COOKIE, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/api/auth',
      });
    }

    if (paramError === 'access_denied' || paramError === 'user_cancelled') {
      redirectToFrontend(res, '/?auth=error&reason=cancelled');
      return;
    }
    if (paramError) {
      redirectToFrontend(res, '/?auth=error&reason=google');
      return;
    }
    if (!code || !state || !storedState || state !== storedState || !verifyOAuthState(String(state))) {
      redirectToFrontend(res, '/?auth=error&reason=state');
      return;
    }

    try {
      const identity = await validateGoogleCode(String(code));
      const { accessToken, refreshToken } = await AuthService.authenticateWithGoogle(identity);
      setAuthCookies(res, accessToken, refreshToken);
      redirectToFrontend(res, '/?auth=success');
    } catch {
      redirectToFrontend(res, '/?auth=error&reason=failed');
    }
  }
}
