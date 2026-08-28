import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/config.js';

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  picture?: string;
}

const oauthClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleCallbackUrl
);

const STATE_TTL_MS = 10 * 60 * 1000;

export const SCOPES = ['openid', 'email', 'profile'];

export function generateOAuthState(): string {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', config.cookieSecret).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const parts = decoded.split('.');
  if (parts.length !== 3) return false;
  const [, expiresAtRaw, signature] = parts;
  const payload = `${parts[0]}.${parts[1]}`;
  const expectedSignature = crypto.createHmac('sha256', config.cookieSecret).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;
  const expiresAt = parseInt(expiresAtRaw, 10);
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

export function buildAuthorizationUrl(state: string): string {
  return oauthClient.generateAuthUrl({
    access_type: 'online',
    scope: SCOPES,
    state,
    prompt: 'select_account',
  });
}

export async function validateGoogleCode(code: string): Promise<VerifiedGoogleIdentity> {
  const { tokens } = await oauthClient.getToken(code);
  if (!tokens.id_token) {
    throw new Error('Google did not return an identity token.');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Google identity token payload is missing.');
  }

  if (payload.aud && !String(payload.aud).split(' ').includes(config.googleClientId)) {
    throw new Error('Google identity token audience does not match this application.');
  }

  if (!payload.sub) {
    throw new Error('Google identity token is missing the subject identifier.');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  if (!email) {
    throw new Error('Google account did not provide an email address.');
  }

  return {
    sub: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    fullName: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
