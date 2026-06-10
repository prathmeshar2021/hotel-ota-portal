import * as Sentry from "@sentry/nextjs";

/**
 * Server / edge error monitoring. No-op until SENTRY_DSN (or
 * NEXT_PUBLIC_SENTRY_DSN) is set, so this is safe to ship before you create a
 * Sentry project. Runtime-only setup — we intentionally don't use the build
 * plugin (withSentryConfig), so no source-map auth token is required.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === "production",
    });
  }
}

// Captures errors thrown in server components, route handlers and middleware.
export const onRequestError = Sentry.captureRequestError;
