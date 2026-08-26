import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config, validateConfig } from './config/config.js';
import { connectDatabase, getDatabaseState } from './config/database.js';
import { musicRouter } from './routes/musicRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { healthLimiter } from './middleware/rateLimit.middleware.js';
import { botProtectionMiddleware, recordIpViolation } from './middleware/security.middleware.js';
import { errorHandlerMiddleware } from './middleware/error.middleware.js';

// Validate required environment variables on startup
validateConfig();

const app = express();

app.disable('x-powered-by');

// Trust the first proxy hop (required on Render/Heroku/etc. for express-rate-limit
// to correctly read the real client IP from the X-Forwarded-For header)
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
    const domainSuffix = allowed.slice(wildcardIndex + 4);
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
    callback(new Error('Origin not permitted by CORS policy.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
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
const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(config.port, () => {
      console.log(`🚀 Soundrift Backend running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('💥 Fatal Startup Failure:', err);
    process.exit(1);
  }
};

startServer();

export default app;
