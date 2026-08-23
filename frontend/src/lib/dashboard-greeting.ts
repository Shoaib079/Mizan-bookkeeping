/** Time-of-day greeting for the v2 dashboard header (display-only). */

export type TimeOfDayGreeting =
  | "Good morning"
  | "Good afternoon"
  | "Good evening";

/** Local clock: morning <12, afternoon <18, else evening. */
export function timeOfDayGreeting(now = new Date()): TimeOfDayGreeting {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Good morning, Ada" or "Good morning" when the name is blank. */
export function dashboardGreetingLine(
  displayName: string | null | undefined,
  now = new Date(),
): string {
  const greet = timeOfDayGreeting(now);
  const name = displayName?.trim();
  return name ? `${greet}, ${name}` : greet;
}
