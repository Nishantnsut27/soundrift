import { Router, type RequestHandler } from 'express';
import { AuthController } from '../controllers/authController.js';
import {
  validateRegisterInput,
  validateLoginInput,
  validateEmailInput,
  validateOtpInput,
  validateResetPasswordInput,
  validateChangePasswordInput,
} from '../middleware/authValidation.middleware.js';
import { authenticateUser, attachUserIfPresent } from '../middleware/auth.middleware.js';
import { authLimiter, otpLimiter, forgotPasswordLimiter } from '../middleware/rateLimit.middleware.js';

export const authRouter = Router();

authRouter.post('/send-otp', authLimiter, validateRegisterInput as RequestHandler, AuthController.sendOtp as RequestHandler);
authRouter.post('/resend-otp', otpLimiter, validateEmailInput as RequestHandler, AuthController.resendOtp as RequestHandler);
authRouter.post('/verify-otp', otpLimiter, validateOtpInput as RequestHandler, AuthController.verifyOtp as RequestHandler);

authRouter.post('/register', authLimiter, validateRegisterInput as RequestHandler, AuthController.register as RequestHandler);
authRouter.post('/login', authLimiter, validateLoginInput, AuthController.login as RequestHandler);
authRouter.post('/refresh', AuthController.refresh as RequestHandler);
authRouter.post('/logout', attachUserIfPresent as RequestHandler, AuthController.logout as RequestHandler);

authRouter.post('/forgot-password', forgotPasswordLimiter, validateEmailInput as RequestHandler, AuthController.forgotPassword as RequestHandler);
authRouter.post('/verify-reset-otp', otpLimiter, validateOtpInput as RequestHandler, AuthController.verifyResetOtp as RequestHandler);
authRouter.post('/resend-reset-otp', otpLimiter, validateEmailInput as RequestHandler, AuthController.resendResetOtp as RequestHandler);
authRouter.post('/reset-password', forgotPasswordLimiter, validateResetPasswordInput as RequestHandler, AuthController.resetPassword as RequestHandler);

authRouter.post('/verify-email', AuthController.verifyEmail as RequestHandler);

authRouter.get('/google', authLimiter, AuthController.googleAuth as unknown as RequestHandler);
authRouter.get('/google/callback', AuthController.googleCallback as unknown as RequestHandler);

authRouter.get('/me', authenticateUser as RequestHandler, AuthController.getMe as RequestHandler);
authRouter.post('/change-password', authenticateUser as RequestHandler, validateChangePasswordInput as RequestHandler, AuthController.changePassword as RequestHandler);
