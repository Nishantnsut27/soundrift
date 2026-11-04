import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const configuredRate = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  const rate = Number(configuredRate);
  const defaultRate = environment === 'development' ? 1 : 0.1;

  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE
      || (process.env.RENDER_GIT_COMMIT ? `soundrift-backend@${process.env.RENDER_GIT_COMMIT}` : undefined),
    // The existing error middleware classifies client errors before reporting 5xx failures.
    integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
    tracesSampleRate: configuredRate && Number.isFinite(rate) && rate >= 0 && rate <= 1
      ? rate
      : defaultRate,
    tracePropagationTargets: [],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
  });
}
