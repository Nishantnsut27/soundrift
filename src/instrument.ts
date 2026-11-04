import * as Sentry from '@sentry/react'
import { BACKEND_URL } from './config/constants'

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
export const sentryEnabled = Boolean(dsn)

if (sentryEnabled) {
  const configuredRate = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE?.trim()
  const rate = Number(configuredRate)
  const defaultRate = import.meta.env.DEV ? 1 : 0.1
  const backendUrl = BACKEND_URL.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: configuredRate && Number.isFinite(rate) && rate >= 0 && rate <= 1
      ? rate
      : defaultRate,
    tracePropagationTargets: [/^\/api(?:\/|$)/, new RegExp(`^${backendUrl}/api(?:/|$)`)],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
  })

  // Temporary production verification; only the explicit test URL triggers this.
  if (window.location.hash === '#sentry-verify-20261104-c93a74b1') {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    window.setTimeout(() => {
      throw new Error('Soundrift frontend Sentry verification 20261104-c93a74b1')
    }, 1000)
  }
}
