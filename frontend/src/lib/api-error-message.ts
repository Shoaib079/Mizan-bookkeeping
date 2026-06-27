import { ApiError } from "@/lib/api";

/** User-visible message from a failed apiFetch (prefers ApiError). */
export function apiErrorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
