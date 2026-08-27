import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config.js';
import { verificationEmailHtml } from '../templates/verificationEmail.js';
import { resetPasswordEmailHtml } from '../templates/resetPasswordEmail.js';

const client = config.brevoApiKey ? new Brevo.BrevoClient({ apiKey: config.brevoApiKey }) : null;

export class EmailService {
  private static ensureConfigured(): void {
    if (!client) {
      console.warn('[EmailService] BREVO_API_KEY not configured. Skipping email send.');
    }
  }

  static async sendVerificationOtp(email: string, otp: string): Promise<void> {
    this.ensureConfigured();
    if (!client) return;

    try {
      await client.transactionalEmails.sendTransacEmail({
        subject: 'Verify your Soundrift account',
        htmlContent: verificationEmailHtml(otp),
        sender: { name: config.emailFromName, email: config.emailFrom },
        to: [{ email }],
      });
    } catch (err) {
      console.error('[EmailService] Failed to send verification OTP:', err);
      throw new Error('Failed to send verification email.');
    }
  }

  static async sendPasswordResetOtp(email: string, otp: string): Promise<void> {
    this.ensureConfigured();
    if (!client) return;

    try {
      await client.transactionalEmails.sendTransacEmail({
        subject: 'Reset your Soundrift password',
        htmlContent: resetPasswordEmailHtml(otp),
        sender: { name: config.emailFromName, email: config.emailFrom },
        to: [{ email }],
      });
    } catch (err) {
      console.error('[EmailService] Failed to send password reset OTP:', err);
      throw new Error('Failed to send password reset email.');
    }
  }
}
