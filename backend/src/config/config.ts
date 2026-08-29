import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined || value === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const readGroqApiKeys = (): string[] => {
  const collected: string[] = [];

  for (let slot = 1; slot <= 6; slot++) {
    const raw = process.env[`GROQ_API_KEY_${slot}`] || process.env[`GROQ_API_${slot}`] || '';
    const key = raw.trim();
    if (key) collected.push(key);
  }

  const legacyKey = (process.env.GROQ_API_KEY || '').trim();
  if (legacyKey) collected.push(legacyKey);

  return [...new Set(collected)];
};

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'notify_music_player',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || '',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  cookieSecret: process.env.COOKIE_SECRET || '',
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE) ?? (process.env.NODE_ENV === 'production'),
  cookieSameSite: (process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')).toLowerCase() as 'lax' | 'strict' | 'none',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
  frontendUrl: process.env.FRONTEND_URL || '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  jiosaavnApiUrl: process.env.JIOSAAVN_API_URL || 'https://notify-music-api.vercel.app',
  jamendoApiUrl: process.env.JAMENDO_API_URL || 'https://api.jamendo.com/v3.0',
  jamendoClientId: process.env.JAMENDO_CLIENT_ID || '',
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '8000', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000,https://notify-music.vercel.app,https://www.soundrift.tech,https://soundrift.tech').split(',').map(origin => origin.trim()).filter(Boolean),
  rateLimitSearchWindowMs: parseInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS || '60000', 10),
  rateLimitSearchMax: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '300', 10),
  rateLimitMetadataWindowMs: parseInt(process.env.RATE_LIMIT_METADATA_WINDOW_MS || '60000', 10),
  rateLimitMetadataMax: parseInt(process.env.RATE_LIMIT_METADATA_MAX || '600', 10),
  slowDownSearchDelayAfter: parseInt(process.env.SLOW_DOWN_SEARCH_DELAY_AFTER || '100', 10),
  slowDownSearchDelayMs: parseInt(process.env.SLOW_DOWN_SEARCH_DELAY_MS || '500', 10),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqDiscoveryModel: process.env.GROQ_DISCOVERY_MODEL || 'openai/gpt-oss-20b',
  discoveryTimezone: process.env.DISCOVERY_TIMEZONE || 'Asia/Kolkata',
  discoveryRefreshCrons: (process.env.DISCOVERY_REFRESH_CRONS || '0 3 * * *|35 12 * * *').split('|').map(value => value.trim()).filter(Boolean),
  discoverySectionSize: parseInt(process.env.DISCOVERY_SECTION_SIZE || '12', 10),
  discoverySnapshotTtlHours: parseInt(process.env.DISCOVERY_SNAPSHOT_TTL_HOURS || '26', 10),
  discoveryMatchThreshold: (() => {
    const raw = Number.parseFloat(process.env.DISCOVERY_MATCH_THRESHOLD || '0.72');
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.72;
  })(),
  discoverySectionIntervalMinutes: parseInt(process.env.DISCOVERY_SECTION_INTERVAL_MINUTES || '5', 10),
  discoveryRefreshOnStartup: process.env.DISCOVERY_REFRESH_ON_STARTUP !== 'false',

  // Brevo Email Configuration
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'contactsoundrift@gmail.com',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Soundrift',

  groqApiKeys: readGroqApiKeys(),
  groqApiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
  groqModel: process.env.GROQ_CURATION_MODEL || 'openai/gpt-oss-120b',
  groqRequestTimeoutMs: parseInt(process.env.GROQ_REQUEST_TIMEOUT_MS || '45000', 10),

  curationSchedulerEnabled: (process.env.CURATION_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  curationBackfillOnStartup: (process.env.CURATION_BACKFILL_ON_STARTUP || 'true').toLowerCase() !== 'false',
};

// Configure Cloudinary SDK
cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  secure: true,
});

export { cloudinary };

export const validateConfig = (): void => {
  if (!config.mongodbUri) {
    throw new Error('❌ Startup Error: MONGODB_URI environment variable is missing.');
  }
  if (!config.jwtSecret) {
    throw new Error('❌ Startup Error: JWT_SECRET environment variable is missing.');
  }
  if (!config.refreshTokenSecret) {
    throw new Error('❌ Startup Error: REFRESH_TOKEN_SECRET environment variable is missing.');
  }
  if (config.jwtSecret === config.refreshTokenSecret) {
    throw new Error('❌ Startup Error: JWT_SECRET and REFRESH_TOKEN_SECRET must be different values.');
  }
  if (!config.cookieSecret) {
    throw new Error('❌ Startup Error: COOKIE_SECRET environment variable is missing.');
  }
  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
    throw new Error('❌ Startup Error: COOKIE_SAME_SITE must be one of "lax", "strict", or "none".');
  }
  if (config.cookieSameSite === 'none' && !config.cookieSecure) {
    throw new Error('❌ Startup Error: COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
  }
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error('❌ Startup Error: Cloudinary environment variables are missing.');
  }
  if (config.nodeEnv === 'production') {
    const weakSecrets = (
      [
        ['JWT_SECRET', config.jwtSecret],
        ['REFRESH_TOKEN_SECRET', config.refreshTokenSecret],
        ['COOKIE_SECRET', config.cookieSecret],
      ] as const
    ).filter(([, value]) => value.length < 32);

    if (weakSecrets.length > 0) {
      throw new Error(
        `❌ Startup Error: ${weakSecrets
          .map(([name]) => name)
          .join(', ')} must be at least 32 characters in production.`
      );
    }
    if (config.allowedOrigins.length === 0) {
      throw new Error('❌ Startup Error: ALLOWED_ORIGINS must list at least one origin in production.');
    }
  }

  const anyGoogleSet = Boolean(config.googleClientId || config.googleClientSecret || config.googleCallbackUrl);
  if (anyGoogleSet) {
    if (!config.googleClientId || !config.googleClientSecret || !config.googleCallbackUrl) {
      throw new Error('❌ Startup Error: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL must all be set to enable Google OAuth.');
    }
    if (!config.frontendUrl) {
      throw new Error('❌ Startup Error: FRONTEND_URL must be set when Google OAuth is enabled.');
    }
  }
};
