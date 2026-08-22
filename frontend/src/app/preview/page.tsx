"use client";

import Link from "next/link";

import { ThemePreviewGallery } from "@/components/preview/theme-preview-gallery";
import { useEntityAccess } from "@/lib/use-entity-access";
import { canAccessThemePreview } from "@/lib/entity-access";

export default function ThemePreviewPage() {
  const { role, membershipSettled } = useEntityAccess();

  if (!membershipSettled) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!canAccessThemePreview(role)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">403 — Preview restricted</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The mobile visual refresh preview is owner-only until approved for rollout.
        </p>
        <Link href="/" className="mt-2 text-sm font-medium text-primary hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md border-x border-border bg-background shadow-[var(--shadow-elevated)] min-[820px]:my-8 min-[820px]:min-h-[calc(100vh-4rem)] min-[820px]:rounded-[var(--radius-card)] min-[820px]:border">
        <ThemePreviewGallery className="p-4 pt-6" />
      </div>
    </div>
  );
}
