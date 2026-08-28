import { Schema, model, Document } from 'mongoose';

export interface IAvatar {
  url: string;
  public_id: string;
}

export const AUTH_PROVIDERS = ['google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface IAuthProvider {
  provider: AuthProvider;
  providerId: string;
}

export interface IUser extends Document {
  fullName: string;
  email: string;
  password?: string;
  avatar?: string | IAvatar;
  avatarUrl?: string;
  avatarPublicId?: string;
  authProviders: IAuthProvider[];
  refreshTokenHash?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'suspended' | 'pending';
  isEmailVerified: boolean;
  lastLoginAt?: Date;

  verificationOtpHash?: string;
  verificationOtpExpiresAt?: Date;
  verificationAttempts?: number;

  resetOtpHash?: string;
  resetOtpExpiresAt?: Date;
  resetAttempts?: number;

  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    authProviders: {
      type: [
        {
          provider: { type: String, enum: AUTH_PROVIDERS, required: true },
          providerId: { type: String, required: true },
          _id: false,
        },
      ],
      default: [],
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    avatarPublicId: {
      type: String,
      default: '',
    },
    refreshTokenHash: {
      type: String,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'pending'],
      default: 'active',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },

    verificationOtpHash: {
      type: String,
      select: false,
    },
    verificationOtpExpiresAt: {
      type: Date,
      select: false,
    },
    verificationAttempts: {
      type: Number,
      default: 0,
    },

    resetOtpHash: {
      type: String,
      select: false,
    },
    resetOtpExpiresAt: {
      type: Date,
      select: false,
    },
    resetAttempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index(
  { 'authProviders.provider': 1, 'authProviders.providerId': 1 },
  { unique: true, partialFilterExpression: { 'authProviders.0': { $exists: true } } }
);

export const User = model<IUser>('User', userSchema);
