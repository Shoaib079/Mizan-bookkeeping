"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { backLinkForPathname } from "@/lib/nav-sections";

export function PageBackLink() {
  const pathname = usePathname();
  const back = backLinkForPathname(pathname);
  if (!back) return null;

  return (
    <div className="mb-4">
      <Link href={back.href} className="text-sm text-primary hover:underline">
        ← {back.label}
      </Link>
    </div>
  );
}
