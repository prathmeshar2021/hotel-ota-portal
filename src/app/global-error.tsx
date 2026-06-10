"use client";

import { useEffect } from "react";
import "./globals.css";

// global-error replaces the root layout when the layout itself throws, so it
// must render its own <html>/<body>. Keep it dependency-light.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#071209", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => unstable_retry()}
              style={{
                background: "#F59E0B",
                color: "#000",
                fontWeight: 700,
                border: "none",
                padding: "10px 20px",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
