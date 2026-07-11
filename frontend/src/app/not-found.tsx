import Link from "next/link";

/** 404 — keep users inside the app instead of a bare Next.js page. */

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The link may be old — every page is reachable from the dashboard.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
