import * as Sentry from "@sentry/nextjs";

/**
 * Browser error monitoring. No-op until NEXT_PUBLIC_SENTRY_DSN is set.
 * Next runs this before hydration (native support, no build plugin needed).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production",
  });
}

// Instruments client-side navigations for tracing (no-op when uninitialised).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
