/** DateInput calendar open rules — click only, not focus (amends 11.17; dialog auto-focus 11.4). */

/** Dialog auto-focus must not open the calendar; user clicks the field or icon instead. */
export function shouldOpenCalendarOnFocus(): boolean {
  return false;
}

export function shouldOpenCalendarOnClick(disabled = false): boolean {
  return !disabled;
}
