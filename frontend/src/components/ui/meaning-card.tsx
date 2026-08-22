/** Shared muted left accent bar for meaning cards under data-theme=v2.
 *
 * One treatment everywhere — KPI, stickers, banking tiles, cash/bank snapshot,
 * balances overview, FX/headline figures. Paint comes from CSS
 * (`[data-meaning-card] > [data-accent-bar]`); pages do not copy bar styles.
 */

export const ACCENT_BAR = {
  green: "var(--accent-bar-green)",
  red: "var(--accent-bar-red)",
  amber: "var(--accent-bar-amber)",
  blue: "var(--accent-bar-blue)",
  gray: "var(--accent-bar-gray)",
} as const;

export type AccentBarTone = keyof typeof ACCENT_BAR;

/** Absolute bar node — must be a direct child of [data-meaning-card]. */
export function MeaningCardAccentBar() {
  return <span data-accent-bar aria-hidden />;
}
