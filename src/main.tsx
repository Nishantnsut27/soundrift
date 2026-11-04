import { sentryEnabled } from './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { PwaProvider } from './pwa/PwaProvider'
import { initializePlayer } from './services/playerPlayback'

initializePlayer()

createRoot(document.getElementById('root')!, sentryEnabled ? {
  onUncaughtError: reactErrorHandler((error, errorInfo) => {
    console.error('Unhandled React Error:', error, errorInfo)
  }),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler((error, errorInfo) => {
    console.error('Recoverable React Error:', error, errorInfo)
  }),
} : undefined).render(
  <StrictMode>
    <PwaProvider />
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'rgba(18, 18, 24, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#ffffff',
          borderRadius: '12px',
          backdropFilter: 'blur(16px)',
          fontSize: '0.85rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    />
  </StrictMode>,
)
