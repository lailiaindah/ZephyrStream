"use client";

// Global Error Boundary — catches errors that occur during prerendering
// and in the root layout. Must be a client component.
// https://nextjs.org/docs/app/building-your-application/routing/error-handling

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: "#0a0e14",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "500px", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#22d3ee" }}>
            ZephyrStream — Something went wrong
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          {error?.message && (
            <pre
              style={{
                background: "#0f172a",
                padding: "1rem",
                borderRadius: "8px",
                fontSize: "0.75rem",
                overflow: "auto",
                marginBottom: "1.5rem",
                color: "#f87171",
              }}
            >
              {error.message}
            </pre>
          )}
          <button
            onClick={() => reset()}
            style={{
              background: "#22d3ee",
              color: "#0a0e14",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
