/** The product mark: three stacked discs.
 *
 * Read either as a stack of plates seen from the side or a stack of coins,
 * which is the whole idea — a restaurant and its money in one shape. Three
 * flat ellipses and nothing else, so it survives being drawn small.
 *
 * The fills come from --brand-1/2/3, not from --primary. The brand and the UI
 * colour change for unrelated reasons: a rebrand should not restyle every
 * button, and a new button colour should not repaint the logo. Both are in
 * globals.css, so changing the identity later is an edit to four lines.
 *
 * `tone="mono"` drops to the current text colour for places where a single
 * colour has to carry it — a dark header, a print stylesheet, a favicon.
 */

import { cn } from "@/lib/utils";

export function Logo({
  size = 26,
  tone = "brand",
  /** Hide from screen readers. Use wherever the name is already announced
   * next to the mark — otherwise every such place is read out twice. */
  decorative = false,
  className,
}: {
  size?: number;
  tone?: "brand" | "mono";
  decorative?: boolean;
  className?: string;
}) {
  const mono = tone === "mono";
  // Back to front: the top disc is the lightest, so the stack reads as depth
  // rather than as three unrelated lines.
  const discs = [
    { cy: 21, fill: mono ? "currentColor" : "var(--brand-1)", opacity: mono ? 0.45 : 1 },
    { cy: 33, fill: mono ? "currentColor" : "var(--brand-2)", opacity: mono ? 0.72 : 1 },
    { cy: 45, fill: mono ? "currentColor" : "var(--brand-3)", opacity: 1 },
  ];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Mizan"}
      aria-hidden={decorative || undefined}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {discs.map((disc) => (
        <ellipse
          key={disc.cy}
          cx="32"
          cy={disc.cy}
          rx="21"
          ry="7"
          fill={disc.fill}
          opacity={disc.opacity}
        />
      ))}
    </svg>
  );
}
