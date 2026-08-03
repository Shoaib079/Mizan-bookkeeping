"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { NavCountBadge } from "@/components/ui/nav-count-badge";
import { isMobileTabRoot, mobileBackDestination } from "@/lib/mobile-shell";
import { previousNavPath } from "@/lib/nav-history";
import { backLinkForPathname } from "@/lib/nav-sections";
import { useEntity } from "@/lib/entity-context";
import { userInitials } from "@/lib/entity-visual";
import { useUnsavedWork } from "@/lib/unsaved-work";
import { cn } from "@/lib/utils";

type MobileTopBarProps = {
  title: string;
  reviewTotal: number;
  onReviewPage: boolean;
};

function ProfileAvatarButton({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const initials = userInitials(displayName, email);
  return (
    <Link
      href="/settings/profile"
      aria-label="Your profile"
      className={cn(
        "flex size-[34px] shrink-0 items-center justify-center rounded-full",
        "bg-primary text-[11px] font-semibold text-primary-foreground",
        "shadow-[0_2px_8px] shadow-primary/35 transition-transform active:scale-95",
      )}
    >
      {initials}
    </Link>
  );
}

export function MobileTopBar({
  title,
  reviewTotal,
  onReviewPage,
}: MobileTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { requestLeave } = useUnsavedWork();
  const { entities, entityId, userProfile } = useEntity();
  const onTabRoot = isMobileTabRoot(pathname);
  const entityName =
    entities.find((e) => e.id === entityId)?.name ?? "Restaurant";

  const [fromPath, setFromPath] = useState<string | null>(null);
  const back = backLinkForPathname(pathname);

  useEffect(() => {
    if (!back || onTabRoot) {
      setFromPath(null);
      return;
    }
    setFromPath(previousNavPath(pathname));
  }, [pathname, back, onTabRoot]);

  function handleBack() {
    const prev = fromPath ?? previousNavPath(pathname);
    const destination = mobileBackDestination(pathname, prev, back?.href ?? null);
    requestLeave(() => router.push(destination));
  }

  const displayName = userProfile?.display_name?.trim() ?? "";
  const email = userProfile?.email ?? "";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2",
        "border-b border-border/80 bg-background/95 px-2 backdrop-blur-md",
        "pt-[env(safe-area-inset-top,0px)]",
      )}
    >
      {!onTabRoot && (
        <button
          type="button"
          aria-label="Back"
          onClick={handleBack}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-primary active:bg-muted"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-[17px] font-semibold leading-tight">
          {title}
        </p>
        {onTabRoot && pathname === "/" && (
          <p className="truncate text-[11px] text-muted-foreground">
            {entityName}
          </p>
        )}
      </div>

      {reviewTotal > 0 && !onReviewPage && onTabRoot && (
        <Link
          href="/review"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200"
        >
          Review
          <NavCountBadge count={reviewTotal} className="bg-warning/25" />
        </Link>
      )}

      {onTabRoot && (
        <ProfileAvatarButton displayName={displayName} email={email} />
      )}
    </header>
  );
}
