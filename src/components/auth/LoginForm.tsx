import React, { useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { useAuthStore } from '../../store/authStore';
import { MailIcon, CheckIcon, AlertCircleIcon, LoaderIcon, UserIcon, GoogleIcon } from './AuthIcons';
import { authApi } from '../../services/authApi';

const handleGoogleLogin = () => {
  window.location.href = authApi.getGoogleAuthUrl();
};

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
  onSuccess?: (userEmail: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup, onForgotPassword, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { login, isLoading, error: storeError, clearError } = useAuthStore();

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) newErrors.email = 'Email address is required';
    else if (!emailRegex.test(email.trim())) newErrors.email = 'Please enter a valid email address';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validateForm()) return;
    const success = await login({ email, password, rememberMe });
    if (success && onSuccess) onSuccess(email);
  };

  return (
    <form className="auth-glass-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-silhouette-avatar"><UserIcon size={54} /></div>

      {storeError && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{storeError}</span>
        </div>
      )}

      <div className="auth-glass-field">
        <div className="auth-input-wrapper">
          <span className="auth-input-icon-left"><MailIcon size={18} /></span>
          <input id="login-email" name="email" type="email" className={`auth-glass-input ${errors.email ? 'is-invalid' : ''}`} value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); if (storeError) clearError(); }} placeholder="Email ID" disabled={isLoading} autoComplete="email" />
        </div>
        {errors.email && <span className="auth-field-error" role="alert">{errors.email}</span>}
      </div>

      <PasswordInput id="login-password" name="password" value={password} onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); if (storeError) clearError(); }} placeholder="Password" error={errors.password} disabled={isLoading} autoComplete="current-password" />

      <div className="auth-glass-options">
        <label className="auth-glass-checkbox-label">
          <input type="checkbox" className="auth-glass-checkbox-input" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} disabled={isLoading} />
          <span className="auth-glass-checkbox-custom"><CheckIcon size={10} /></span>
          Remember me
        </label>
        <button type="button" className="auth-forgot-link" onClick={onForgotPassword} disabled={isLoading}>Forgot Password?</button>
      </div>

      <button type="submit" className="auth-glass-btn" disabled={isLoading}>
        {isLoading ? <><LoaderIcon size={18} /> LOGGING IN...</> : 'LOGIN'}
      </button>

      <div className="auth-divider"><span>or</span></div>

      <a href={authApi.getGoogleAuthUrl()} className="auth-google-btn" onClick={(e) => { e.preventDefault(); handleGoogleLogin(); }}>
        <GoogleIcon size={18} />
        Continue with Google
      </a>

      <div className="auth-flip-trigger-footer">
        Don't have an account?
        <button type="button" className="auth-flip-trigger-btn" onClick={() => { clearError(); onSwitchToSignup(); }} disabled={isLoading}>Sign Up</button>
      </div>
    </form>
  );
};
