"use client";

/** Last-resort error boundary — catches root layout crashes (audit C2a). */

import "./globals.css";

const themeBootstrapScript = `
try {
  var stored = localStorage.getItem("mizan:theme");
  var dark =
    stored === "dark" ||
    (stored !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="flex min-h-dvh items-center justify-center bg-background p-8 font-sans text-foreground antialiased">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-lg font-semibold">
            Mizan hit an unexpected error
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Your data is safe — nothing was posted or changed.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
