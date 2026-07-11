/** Session-scoped navigation history so back links return to where the user
 * actually came from, falling back to the static parent (IA v2, audit A4). */

const KEY = "mizan:nav-history";
const MAX = 20;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function write(stack: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // storage full/blocked — back links degrade to static parents
  }
}

/** Record a visit. Call on every pathname change (dedupes consecutive repeats). */
export function pushNavHistory(pathWithSearch: string): void {
  const stack = read();
  if (stack[stack.length - 1] === pathWithSearch) return;
  stack.push(pathWithSearch);
  write(stack);
}

/** Previous distinct internal path, excluding the current one. */
export function previousNavPath(currentPathname: string): string | null {
  const stack = read();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    const entryPath = entry.split("?")[0];
    if (entryPath !== currentPathname) return entry;
  }
  return null;
}

/** Pop entries for the current page so going back doesn't bounce forward. */
export function popNavHistoryTo(target: string): void {
  const stack = read();
  const idx = stack.lastIndexOf(target);
  if (idx >= 0) write(stack.slice(0, idx + 1));
}
