import crypto from 'crypto';
import { User, IUser } from '../models/user.model.js';
import { hashPassword, comparePassword } from '../utils/password.utils.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.utils.js';
import { AppError } from '../utils/AppError.js';
import { EmailService } from './emailService.js';

export interface RegisterDTO {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface SanitizedUser {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
  avatarPublicId?: string;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'suspended' | 'pending';
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

const OTP_MAX_ATTEMPTS = 5;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;

export class AuthService {
  public static sanitizeUser(user: IUser): SanitizedUser {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatarUrl || (typeof user.avatar === 'string' ? user.avatar : user.avatar?.url) || '',
      avatarPublicId: user.avatarPublicId || (typeof user.avatar === 'object' ? user.avatar?.public_id : ''),
      role: user.role,
      accountStatus: user.accountStatus,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  static async sendVerificationOtp(data: { fullName: string; email: string; password: string }): Promise<void> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && existingUser.isEmailVerified) {
      throw new AppError('An account with this email address is already registered.', 400);
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);

    await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        fullName: data.fullName.trim(),
        email: normalizedEmail,
        password: await hashPassword(data.password),
        verificationOtpHash: otpHash,
        verificationOtpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        verificationAttempts: 0,
        role: 'user',
        accountStatus: 'active',
        isEmailVerified: false,
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await EmailService.sendVerificationOtp(normalizedEmail, otp);
  }

  static async resendVerificationOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new AppError('No registration in progress for this email.', 400);
    }
    if (user.isEmailVerified) {
      throw new AppError('This email is already verified.', 400);
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);

    user.verificationOtpHash = otpHash;
    user.verificationOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    user.verificationAttempts = 0;
    await user.save();

    await EmailService.sendVerificationOtp(normalizedEmail, otp);
  }

  static async verifyEmailOtp(email: string, otp: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select(
      '+verificationOtpHash +verificationOtpExpiresAt +verificationAttempts'
    );

    if (!user || !user.verificationOtpHash || !user.verificationOtpExpiresAt) {
      throw new AppError('No verification code was requested. Please request a new one.', 400);
    }

    if ((user.verificationAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      user.verificationOtpHash = undefined;
      user.verificationOtpExpiresAt = undefined;
      user.verificationAttempts = 0;
      await user.save();
      throw new AppError('Too many incorrect attempts. Please request a new code.', 429);
    }

    if (new Date() > user.verificationOtpExpiresAt) {
      user.verificationOtpHash = undefined;
      user.verificationOtpExpiresAt = undefined;
      user.verificationAttempts = 0;
      await user.save();
      throw new AppError('Verification code has expired. Please request a new one.', 400);
    }

    const isValid = await comparePassword(otp, user.verificationOtpHash);
    if (!isValid) {
      user.verificationAttempts = (user.verificationAttempts || 0) + 1;
      await user.save();
      const remaining = OTP_MAX_ATTEMPTS - user.verificationAttempts;
      throw new AppError(
        remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : 'Too many incorrect attempts. Please request a new code.',
        400
      );
    }

    user.isEmailVerified = true;
    user.verificationOtpHash = undefined;
    user.verificationOtpExpiresAt = undefined;
    user.verificationAttempts = 0;
    await user.save();
  }

  public static async registerUser(data: RegisterDTO): Promise<{ user: SanitizedUser; accessToken: string; refreshToken: string }> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user || !user.password) {
      throw new AppError('Please complete email verification first.', 400);
    }
    if (!user.isEmailVerified) {
      throw new AppError('Email is not verified. Please verify your email first.', 400);
    }

    const isPasswordValid = await comparePassword(data.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (user.accountStatus !== 'active') {
      throw new AppError('Your account is currently suspended or inactive.', 403);
    }

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    user.refreshTokenHash = await hashPassword(refreshToken);
    user.lastLoginAt = new Date();
    await user.save();

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  public static async loginUser(data: LoginDTO): Promise<{ user: SanitizedUser; accessToken: string; refreshToken: string }> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+password +refreshTokenHash');

    if (!user || !user.password) {
      throw new AppError('Invalid email or password.', 401);
    }

    const isPasswordValid = await comparePassword(data.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (user.accountStatus !== 'active') {
      throw new AppError('Your account is currently suspended or inactive.', 403);
    }

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    user.refreshTokenHash = await hashPassword(refreshToken);
    user.lastLoginAt = new Date();
    await user.save();

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  public static async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string; user: SanitizedUser }> {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
    }

    const user = await User.findById(payload.userId).select('+refreshTokenHash');
    if (!user || !user.refreshTokenHash) {
      throw new AppError('User session not found.', 401);
    }

    const isMatch = await comparePassword(token, user.refreshTokenHash);
    if (!isMatch) {
      throw new AppError('Revoked or reused refresh token.', 401);
    }

    const newAccessToken = generateAccessToken(user._id.toString(), user.role);
    const newRefreshToken = generateRefreshToken(user._id.toString(), user.role);

    user.refreshTokenHash = await hashPassword(newRefreshToken);
    await user.save();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: this.sanitizeUser(user),
    };
  }

  public static async revokeRefreshToken(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
  }

  public static async revokeRefreshTokenByToken(token: string): Promise<void> {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return;
    }
    await User.findByIdAndUpdate(payload.userId, { $unset: { refreshTokenHash: 1 } });
  }

  public static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await User.findById(userId).select('+password');
    if (!user || !user.password) {
      throw new AppError('User not found', 404);
    }

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      throw new AppError('Current password is incorrect.', 400);
    }

    const isSameAsCurrent = await comparePassword(newPassword, user.password);
    if (isSameAsCurrent) {
      throw new AppError('New password must be different from your current password.', 400);
    }

    user.password = await hashPassword(newPassword);
    user.refreshTokenHash = undefined;
    await user.save();
  }

  static async sendResetOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);

    user.resetOtpHash = otpHash;
    user.resetOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    user.resetAttempts = 0;
    await user.save();

    await EmailService.sendPasswordResetOtp(normalizedEmail, otp);
  }

  static async verifyResetOtp(email: string, otp: string): Promise<{ resetToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select(
      '+resetOtpHash +resetOtpExpiresAt +resetAttempts'
    );

    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
      throw new AppError('No reset code was requested. Please request a new one.', 400);
    }

    if ((user.resetAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      user.resetOtpHash = undefined;
      user.resetOtpExpiresAt = undefined;
      user.resetAttempts = 0;
      await user.save();
      throw new AppError('Too many incorrect attempts. Please request a new code.', 429);
    }

    if (new Date() > user.resetOtpExpiresAt) {
      user.resetOtpHash = undefined;
      user.resetOtpExpiresAt = undefined;
      user.resetAttempts = 0;
      await user.save();
      throw new AppError('Reset code has expired. Please request a new one.', 400);
    }

    const isValid = await comparePassword(otp, user.resetOtpHash);
    if (!isValid) {
      user.resetAttempts = (user.resetAttempts || 0) + 1;
      await user.save();
      const remaining = OTP_MAX_ATTEMPTS - user.resetAttempts;
      throw new AppError(
        remaining > 0
          ? `Invalid reset code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : 'Too many incorrect attempts. Please request a new code.',
        400
      );
    }

    user.resetOtpHash = undefined;
    user.resetOtpExpiresAt = undefined;
    user.resetAttempts = 0;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.passwordResetToken = hashedResetToken;
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await user.save();

    return { resetToken };
  }

  static async resendResetOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);

    user.resetOtpHash = otpHash;
    user.resetOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    user.resetAttempts = 0;
    await user.save();

    await EmailService.sendPasswordResetOtp(normalizedEmail, otp);
  }

  public static async resetPassword(email: string, newPassword: string, resetToken: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    if (!resetToken) {
      throw new AppError('Reset authorization token is required.', 400);
    }

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.findOne({ 
      email: normalizedEmail,
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() }
    }).select('+password +passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new AppError('Invalid or expired reset authorization token.', 400);
    }

    user.password = await hashPassword(newPassword);

    if (user.refreshTokenHash) {
      user.refreshTokenHash = undefined;
    }
    
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();
  }

  public static async getUserProfile(userId: string): Promise<SanitizedUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User profile not found.', 404);
    }
    return this.sanitizeUser(user);
  }

  public static async requestPasswordReset(email: string): Promise<{ resetToken: string }> {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return { resetToken: crypto.randomBytes(32).toString('hex') };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = hashedResetToken;
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    await user.save();

    return { resetToken };
  }

  public static async verifyEmail(token: string): Promise<SanitizedUser> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new AppError('Email verification token is invalid or has expired.', 400);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return this.sanitizeUser(user);
  }
}
