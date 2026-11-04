import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { config, validateConfig } from './config/config.js';
import { connectDatabase, disconnectDatabase, getDatabaseState } from './config/database.js';
import { musicRouter } from './routes/musicRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { healthLimiter } from './middleware/rateLimit.middleware.js';
import { botProtectionMiddleware, recordIpViolation } from './middleware/security.middleware.js';
import { errorHandlerMiddleware } from './middleware/error.middleware.js';
import { curationScheduler } from './services/curationScheduler.js';
import { AppError } from './utils/AppError.js';
import { ensureRecentlyPlayedIndexes } from './models/recentlyPlayed.model.js';

// Validate required environment variables on startup
validateConfig();

const app = express();

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const isOriginAllowed = (origin: string): boolean => {
  return config.allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    const wildcardIndex = allowed.indexOf('://*.');
    if (wildcardIndex === -1) return false;
    const scheme = allowed.slice(0, wildcardIndex + 3);
    const domainSuffix = allowed.slice(wildcardIndex + 5);
    const originSchemeEnd = origin.indexOf('://');
    if (originSchemeEnd === -1) return false;
    const originHost = origin.slice(originSchemeEnd + 3);
    return origin.startsWith(scheme) && (originHost === domainSuffix || originHost.endsWith('.' + domainSuffix));
  });
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new AppError('Origin not permitted by CORS policy.', 403));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'sentry-trace', 'baggage', 'traceparent'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(compression());
// JSON only: form-encoded bodies are what cross-site <form> posts send along with SameSite=None cookies.
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser(config.cookieSecret));
app.use(botProtectionMiddleware);

// Health check endpoint reporting server & database connection status
app.get('/health', healthLimiter, (_req, res) => {
  const dbState = getDatabaseState();
  const isOk = dbState.connected;

  res.status(isOk ? 200 : 503).json({
    status: isOk ? 'ok' : 'degraded',
    service: 'Soundrift Backend',
    database: {
      status: dbState.state,
      connected: dbState.connected,
      name: dbState.dbName,
    },
    environment: config.nodeEnv,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Temporary production verification; remove after confirming the Sentry event.
const sentryVerificationPath = '/api/__sentry_verify_20261104_c93a74b1';
let sentryVerificationTriggered = false;
app.get(sentryVerificationPath, healthLimiter, (_req, res) => {
  res.json({ enabled: Sentry.isEnabled(), triggered: sentryVerificationTriggered });
});
app.post(sentryVerificationPath, healthLimiter, (_req, res) => {
  if (!Sentry.isEnabled()) {
    res.status(503).json({ error: 'Sentry is not enabled in this backend process.' });
    return;
  }
  if (sentryVerificationTriggered) {
    res.status(409).json({ error: 'Verification already triggered in this backend process.' });
    return;
  }
  sentryVerificationTriggered = true;
  throw new Error('Soundrift backend Sentry verification 20261104-c93a74b1');
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/music', musicRouter);

app.use((req, res) => {
  recordIpViolation(req.ip || req.socket.remoteAddress || 'unknown');
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.'
  });
});

app.use(errorHandlerMiddleware);

// Initialize database connection before listening for HTTP requests
const SHUTDOWN_TIMEOUT_MS = 10_000;

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled promise rejection:', reason);
});

const startServer = async () => {
  try {
    await connectDatabase();
    await ensureRecentlyPlayedIndexes();
    const server = app.listen(config.port, () => {
      console.log(`🚀 Soundrift Backend running on http://localhost:${config.port}`);
    });

    curationScheduler.start();

    const shutdown = (signal: NodeJS.Signals) => {
      console.log(`🛑 ${signal} received, shutting down gracefully...`);
      curationScheduler.stop();
      setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
      server.close(() => {
        disconnectDatabase().finally(async () => {
          await Sentry.close(2000);
          process.exit(0);
        });
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (err) {
    Sentry.captureException(err);
    console.error('💥 Fatal Startup Failure:', err);
    await Sentry.flush(2000);
    process.exit(1);
  }
};

startServer();

export default app;
