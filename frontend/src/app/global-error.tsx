"use client";

/** Last-resort error boundary — catches root layout crashes (audit C2a). */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            Mizan hit an unexpected error
          </h1>
          <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "1rem" }}>
            Your data is safe — nothing was posted or changed.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
