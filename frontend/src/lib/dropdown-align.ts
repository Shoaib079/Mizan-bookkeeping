/** Keep absolute dropdown panels inside the viewport (phone + desktop). */

export const DROPDOWN_VIEWPORT_MAX_W = "max-w-[calc(100vw-1.75rem)]";

export type DropdownHAlign = "left" | "right";

/** Pick left vs right anchor so a min-width menu does not spill off-screen.
 *
 * Left anchor = menu grows to the right of the trigger. Right anchor = grows
 * left. Header "…" and Download sit on the right edge — left-anchoring them
 * shoved the panel past the viewport and forced horizontal page scroll.
 */
export function dropdownHAlignFromRect(
  trigger: { left: number; right: number },
  viewportWidth: number,
  menuMinWidthPx: number,
  edgePadPx = 14,
): DropdownHAlign {
  const spaceRight = viewportWidth - trigger.right - edgePadPx;
  const spaceLeft = trigger.left - edgePadPx;
  if (spaceRight >= menuMinWidthPx) return "left";
  if (spaceLeft >= menuMinWidthPx) return "right";
  return spaceLeft >= spaceRight ? "right" : "left";
}

export function dropdownHAlignClass(align: DropdownHAlign): string {
  return align === "right" ? "right-0 left-auto" : "left-0 right-auto";
}
