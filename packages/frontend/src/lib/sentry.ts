/**
 * Sentry — error monitoring and performance tracking.
 *
 * Initializes Sentry for the frontend (React) when VITE_SENTRY_DSN
 * environment variable is set. Falls back gracefully when not
 * configured (development mode).
 */
import * as Sentry from '@sentry/react';

const SENTRY_DSN = typeof import.meta !== 'undefined'
  ? import.meta.env?.VITE_SENTRY_DSN
  : undefined;

export function initSentry(): void {
  if (!SENTRY_DSN) {
    if (import.meta.env?.DEV) {
      console.log('[Sentry] Not configured (set VITE_SENTRY_DSN for error tracking)');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN as string,
    environment: import.meta.env?.MODE || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: import.meta.env?.PROD ? 0.1 : 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  console.log('[Sentry] Initialized for frontend monitoring');
}

export { Sentry };
export default Sentry;
