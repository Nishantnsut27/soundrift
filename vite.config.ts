import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sentryRelease = env.VITE_SENTRY_RELEASE
    || (env.VERCEL_GIT_COMMIT_SHA ? `soundrift-frontend@${env.VERCEL_GIT_COMMIT_SHA}` : undefined)
  const uploadSourceMaps = command === 'build'
    && Boolean(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT)

  if (command === 'build' && env.VITE_SENTRY_DSN && !uploadSourceMaps) {
    console.warn('[Sentry] Source-map upload skipped: set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in the build environment.')
  }

  return {
  define: sentryRelease ? { 'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(sentryRelease) } : {},
  build: { sourcemap: uploadSourceMaps ? 'hidden' : false },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'web-app-manifest-192x192.png',
        'web-app-manifest-512x512.png',
        'placeholder-album.svg',
      ],
      manifest: {
        id: '/',
        name: 'Soundrift',
        short_name: 'Soundrift',
        description: 'Drift Into Your Next Favorite. Discover and stream music you love.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/audio-cache-worker.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
        runtimeCaching: [
          {
            // Stream recovery must reach the server rather than replay cached URLs.
            urlPattern: ({ url }) => /\/api\/music\/song\/[^/]+$/.test(url.pathname)
              && url.searchParams.get('refresh') === '1',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/auth\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/user\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\.(?:woff2|woff|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
    ...(uploadSourceMaps ? [sentryVitePlugin({
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      authToken: env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: { name: sentryRelease },
      sourcemaps: {
        assets: './dist/**',
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    })] : []),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  }
})
