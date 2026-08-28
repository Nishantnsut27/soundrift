import { fetchJson, API_BASE_URL } from './apiClient';

const AUTH_BASE_URL = `${API_BASE_URL}/api/auth`;

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'suspended' | 'pending';
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user: UserProfile;
  token?: string;
  error?: string;
}

interface OtpResponse {
  success: boolean;
  message: string;
}

export const authApi = {
  async register(data: { fullName: string; email: string; password: string }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>(`${AUTH_BASE_URL}/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string; rememberMe?: boolean }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>(`${AUTH_BASE_URL}/login`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`${AUTH_BASE_URL}/logout`, {
      method: 'POST',
    });
  },

  async getCurrentUser(): Promise<AuthResponse> {
    return fetchJson<AuthResponse>(`${AUTH_BASE_URL}/me`, {
      method: 'GET',
    });
  },

  getGoogleAuthUrl(): string {
    return `${AUTH_BASE_URL}/google`;
  },

  async sendOtp(data: { fullName: string; email: string; password: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/send-otp`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resendOtp(data: { email: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/resend-otp`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async verifyOtp(data: { email: string; otp: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async forgotPassword(data: { email: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/forgot-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async verifyResetOtp(data: { email: string; otp: string }): Promise<OtpResponse & { resetToken?: string }> {
    return fetchJson<OtpResponse & { resetToken?: string }>(`${AUTH_BASE_URL}/verify-reset-otp`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resendResetOtp(data: { email: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/resend-reset-otp`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resetPassword(data: { email: string; newPassword: string; resetToken: string }): Promise<OtpResponse> {
    return fetchJson<OtpResponse>(`${AUTH_BASE_URL}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
