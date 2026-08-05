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
        // `secondary` was `bg-background` — the page's own colour behind a
        // hairline border, so on a white page 75 buttons read as outlines of
        // nothing. `ghost` had neither background nor border and appeared only
        // on hover, which does not exist on a phone: 53 buttons that looked
        // like plain text. Both now carry the primary tint, which is colour
        // enough to read as an action while staying clearly subordinate to the
        // filled primary. Callers' own colours still win — className is last.
        // No background fill: a caller that recolours this button — Void
        // passes destructive border and text — would otherwise keep a blue
        // tint under red text, because tailwind-merge resolves the text and
        // border but has nothing to override the background with.
        variant === "secondary" &&
          "border border-primary/40 text-primary hover:bg-primary/10",
        variant === "ghost" && "text-primary hover:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}
