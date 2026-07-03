/** Amber count pill for nav rows and tabs. */

import { cn } from "@/lib/utils";

type NavCountBadgeProps = {
  count: number;
  className?: string;
};

export function NavCountBadge({ count, className }: NavCountBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-amber-800 dark:text-amber-200",
        className,
      )}
      aria-label={`${count} items need review`}
    >
      {label}
    </span>
  );
}
