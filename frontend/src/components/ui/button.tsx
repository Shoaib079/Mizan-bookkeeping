import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // h-9 is 36px and callers drop to h-8 (32px) for dense rows; both are
        // under the 44px a thumb needs. Raised on phones only — and these are
        // Void and Edit on ledger rows, where a mis-tap costs a journal entry.
        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        MOBILE_TOUCH_TARGET,
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" &&
          "border border-border bg-background hover:bg-muted",
        variant === "ghost" && "hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
