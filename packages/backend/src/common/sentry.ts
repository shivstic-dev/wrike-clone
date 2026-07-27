/**
 * Sentry — error monitoring and performance tracking for the backend.
 *
 * Initializes Sentry when SENTRY_DSN environment variable is set.
 * Falls back gracefully when not configured (development mode).
 */
import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env['SENTRY_DSN'];

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('[Sentry] Not configured (set SENTRY_DSN env var for error tracking)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env['NODE_ENV'] || 'production',
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
    integrations: [
      // Enable HTTP instrumentation
      Sentry.httpIntegration(),
      // Enable Express instrumentation
      Sentry.expressIntegration(),
    ],
  });

  console.log('[Sentry] Initialized for backend monitoring');
}

export default Sentry;
