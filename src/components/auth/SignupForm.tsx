import React, { useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { OtpInput } from './OtpInput';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../services/authApi';
import { ApiError } from '../../services/apiClient';
import { useCountdown } from '../../hooks/useCountdown';
import { UserIcon, MailIcon, SendIcon, CheckCircleIcon, AlertCircleIcon, TimerIcon, LoaderIcon, CheckIcon, GoogleIcon } from './AuthIcons';

interface SignupFormProps {
  onSwitchToLogin: () => void;
  onSuccess?: (userEmail: string) => void;
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin, onSuccess }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; confirmPassword?: string; terms?: string; }>({});
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const { signup, error: storeError, clearError } = useAuthStore();
  const { countdown, startCountdown, isActive: isTimerActive } = useCountdown(60);

  const calculatePasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', className: '' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const classes = ['', 'strength-weak', 'strength-fair', 'strength-good', 'strength-strong'];
    return { score, label: labels[score], className: classes[score] };
  };
  const strengthInfo = calculatePasswordStrength(password);

  const validateStep1 = () => {
    const newErrors: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!email.trim()) newErrors.email = 'Email address is required';
    else if (!emailRegex.test(email.trim())) newErrors.email = 'Please enter a valid email address';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (!confirmPassword) newErrors.confirmPassword = 'Confirming password is required';
    else if (confirmPassword !== password) newErrors.confirmPassword = 'Passwords do not match';
    if (!agreeTerms) newErrors.terms = 'You must accept the Terms of Service';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSendError(null);
    if (!validateStep1()) return;
    setIsSendingOtp(true);
    try {
      await authApi.sendOtp({ fullName: fullName.trim(), email: email.trim(), password });
      setShowOtpStep(true);
      startCountdown();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError(null);
    setOtp('');
    setIsSendingOtp(true);
    try {
      await authApi.resendOtp({ email: email.trim() });
      startCountdown();
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError(null);
    if (otp.length !== 6) { setOtpError('Please enter the complete 6-digit code.'); return; }
    setIsVerifyingOtp(true);
    try {
      await authApi.verifyOtp({ email: email.trim(), otp });
      setIsEmailVerified(true);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Invalid verification code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleCreateAccount = async () => {
    clearError();
    setIsSendingOtp(true);
    try {
      const success = await signup({ fullName: fullName.trim(), email: email.trim(), password });
      if (success && onSuccess) onSuccess(email);
    } finally {
      setIsSendingOtp(false);
    }
  };

  if (isEmailVerified) {
    return (
      <div className="auth-glass-form">
        <div className="auth-silhouette-avatar"><CheckCircleIcon size={54} style={{ color: '#1db954' }} /></div>
        <div className="email-verified-banner"><CheckCircleIcon size={20} /> <span>Email verified successfully</span></div>
        {storeError && (<div className="auth-alert auth-alert-error" role="alert"><AlertCircleIcon size={18} /><span>{storeError}</span></div>)}
        <button type="button" className="auth-glass-btn" onClick={handleCreateAccount} disabled={isSendingOtp}>
          {isSendingOtp ? <><LoaderIcon size={18} /> CREATING ACCOUNT...</> : 'CREATE ACCOUNT'}
        </button>
        <div className="auth-flip-trigger-footer">
          Already have an account?
          <button type="button" className="auth-flip-trigger-btn" onClick={() => { clearError(); onSwitchToLogin(); }} disabled={isSendingOtp}>Log In</button>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-glass-form" onSubmit={handleSendVerificationCode} noValidate>
      <div className="auth-silhouette-avatar"><UserIcon size={54} /></div>

      {(sendError || storeError) && !showOtpStep && (
        <div className="auth-alert auth-alert-error" role="alert"><AlertCircleIcon size={18} /><span>{sendError || storeError}</span></div>
      )}

      {!showOtpStep ? (
        <>
          <div className="auth-glass-field">
            <div className="auth-input-wrapper">
              <span className="auth-input-icon-left"><UserIcon size={18} /></span>
              <input id="signup-name" name="fullName" type="text" className={`auth-glass-input ${errors.fullName ? 'is-invalid' : ''}`} value={fullName} onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined })); }} placeholder="Full Name" disabled={isSendingOtp} autoComplete="name" />
            </div>
            {errors.fullName && <span className="auth-field-error" role="alert">{errors.fullName}</span>}
          </div>

          <div className="auth-glass-field">
            <div className="auth-input-wrapper">
              <span className="auth-input-icon-left"><MailIcon size={18} /></span>
              <input id="signup-email" name="email" type="email" className={`auth-glass-input ${errors.email ? 'is-invalid' : ''}`} value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }} placeholder="Email ID" disabled={isSendingOtp} autoComplete="email" />
            </div>
            {errors.email && <span className="auth-field-error" role="alert">{errors.email}</span>}
          </div>

          <PasswordInput id="signup-password" name="password" value={password} onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }} placeholder="Password" error={errors.password} disabled={isSendingOtp} autoComplete="new-password" />

          {password.length > 0 && (
            <div className="password-strength-container">
              <div className="password-strength-bars">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className={`password-strength-bar ${strengthInfo.score >= step ? strengthInfo.className : ''}`} />
                ))}
              </div>
              <div className="password-strength-label">
                <span>Strength:</span>
                <span className={`strength-text ${strengthInfo.className}`}>{strengthInfo.label}</span>
              </div>
            </div>
          )}

          <PasswordInput id="signup-confirm-password" name="confirmPassword" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: undefined })); }} placeholder="Confirm Password" error={errors.confirmPassword} disabled={isSendingOtp} autoComplete="new-password" />

          <div className="auth-glass-field">
            <label className="auth-glass-checkbox-label">
              <input type="checkbox" className="auth-glass-checkbox-input" checked={agreeTerms} onChange={(e) => { setAgreeTerms(e.target.checked); if (errors.terms) setErrors((p) => ({ ...p, terms: undefined })); }} disabled={isSendingOtp} />
              <span className="auth-glass-checkbox-custom"><CheckIcon size={10} /></span>
              I agree to the <a href="/terms" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = '/terms'; }} className="auth-legal-link">Terms</a> &amp; <a href="/privacy" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = '/privacy'; }} className="auth-legal-link">Privacy Policy</a>
            </label>
            {errors.terms && <span className="auth-field-error" role="alert">{errors.terms}</span>}
          </div>

          <button type="submit" className="auth-glass-btn" disabled={isSendingOtp}>
            {isSendingOtp ? <><LoaderIcon size={18} /> SENDING CODE...</> : <><MailIcon size={18} /> SEND VERIFICATION CODE</>}
          </button>

          <div className="auth-divider"><span>or</span></div>

          <a href={authApi.getGoogleAuthUrl()} className="auth-google-btn" onClick={(e) => { e.preventDefault(); window.location.href = authApi.getGoogleAuthUrl(); }}>
            <GoogleIcon size={18} />
            Continue with Google
          </a>
        </>
      ) : (
        <div className="otp-step-container">
          <p className="forgot-password-instruction" style={{ marginBottom: '1.25rem' }}>
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
          <OtpInput value={otp} onChange={(val) => { setOtp(val); setOtpError(null); }} disabled={isVerifyingOtp} error={otpError || undefined} />
          <button type="button" className="auth-glass-btn" onClick={handleVerifyOtp} disabled={isVerifyingOtp || otp.length !== 6}>
            {isVerifyingOtp ? <><LoaderIcon size={18} /> VERIFYING...</> : 'VERIFY CODE'}
          </button>
          <div className="otp-resend-container">
            {isTimerActive ? (
              <span className="otp-resend-timer"><TimerIcon size={14} /> Resend code in {countdown}s</span>
            ) : (
              <button type="button" className="otp-resend-btn" onClick={handleResendOtp} disabled={isSendingOtp}>
                <SendIcon size={14} /> {isSendingOtp ? 'Resending...' : 'Resend Code'}
              </button>
            )}
          </div>
        </div>
      )}

      {!showOtpStep && (
        <div className="auth-flip-trigger-footer">
          Already have an account?
          <button type="button" className="auth-flip-trigger-btn" onClick={() => { clearError(); onSwitchToLogin(); }} disabled={isSendingOtp}>Log In</button>
        </div>
      )}
    </form>
  );
};
