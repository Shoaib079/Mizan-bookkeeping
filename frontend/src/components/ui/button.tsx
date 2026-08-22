import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      data-button-variant={variant}
      className={cn(
        // h-9 is 36px and callers drop to h-8 (32px) for dense rows; both are
        // under the 44px a thumb needs. Raised on phones only — and these are
        // Void and Edit on ledger rows, where a mis-tap costs a journal entry.
        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        MOBILE_TOUCH_TARGET,
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        // secondary renders exactly like primary: filled, same blue, white
        // text. An outline — however tinted — was reported as "border, no
        // colour" on five separate screens, and the tint that finally read as
        // colour was the one that filled.
        //
        // The variant is kept rather than collapsed into primary because
        // callers still use it to mean "the supporting action here", and
        // because Void recolours it wholesale. Two names, one look, on
        // purpose. Under data-theme=v2, CSS restyles secondary to white +
        // hairline (locked owner spec).
        variant === "secondary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "text-primary hover:bg-primary/15",
        // For actions that destroy something and cannot be undone. Filled, for
        // the same reason secondary is: an outline did not read as a button.
        //
        // Deliberately not used for Void. Voiding is recorded, reversible in
        // effect, and happens many times a week; if it looked like this, this
        // would stop meaning anything by the time it mattered. Right now the
        // only caller is deleting a restaurant. The variant exists so the next
        // irreversible action inherits the treatment instead of inventing one.
        // Under data-theme=v2: red text on blush tint (locked owner spec).
        variant === "destructive" &&
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        className,
      )}
      {...props}
    />
  );
}
