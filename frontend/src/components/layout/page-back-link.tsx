"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { previousNavPath } from "@/lib/nav-history";
import { backLinkForPathname, pageTitleForPathname } from "@/lib/nav-sections";

/** History-aware back link (audit A4): prefer where the user actually came
 * from; fall back to the static parent for direct loads/bookmarks. */
export function PageBackLink() {
  const pathname = usePathname();
  const back = backLinkForPathname(pathname);
  const [fromPath, setFromPath] = useState<string | null>(null);

  useEffect(() => {
    if (!back) {
      setFromPath(null);
      return;
    }
    setFromPath(previousNavPath(pathname));
  }, [pathname, back?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!back) return null;

  const staticTarget = back.href;
  const fromPathname = fromPath?.split("?")[0] ?? null;
  const useHistory =
    fromPath !== null && fromPathname !== null && fromPathname !== staticTarget;
  const href = useHistory ? fromPath : staticTarget;
  const label = useHistory ? pageTitleForPathname(fromPathname!) : back.label;

  return (
    <div className="mb-4">
      <Link href={href} className="text-sm text-primary hover:underline">
        ← {label}
      </Link>
    </div>
  );
}
