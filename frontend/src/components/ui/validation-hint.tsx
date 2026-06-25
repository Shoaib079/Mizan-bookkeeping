/** Inline validation hint — DESIGN_SYSTEM §10 (plain language while editing). */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "error" | "hint" | "warning";

const variantClass: Record<Variant, string> = {
  error: "text-destructive",
  hint: "text-muted-foreground",
  warning: "text-warning",
};

type Props = {
  variant?: Variant;
  children?: ReactNode;
  className?: string;
};

export function ValidationHint({
  variant = "error",
  children,
  className,
}: Props) {
  if (!children) return null;
  return (
    <p className={cn("text-xs", variantClass[variant], className)}>{children}</p>
  );
}
