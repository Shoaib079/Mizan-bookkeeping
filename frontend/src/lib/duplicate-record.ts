/** Detect duplicate-record 409 responses and retry with acknowledge_duplicate. */

import { ApiError } from "@/lib/api";

export type DuplicateRecordDetail = {
  code: "duplicate_record";
  message: string;
  record_kind: string;
  existing_id: string | null;
};

export function isDuplicateRecordDetail(
  detail: unknown,
): detail is DuplicateRecordDetail {
  if (typeof detail !== "object" || detail === null) return false;
  const d = detail as DuplicateRecordDetail;
  return d.code === "duplicate_record" && typeof d.message === "string";
}

export function isDuplicateRecordError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    isDuplicateRecordDetail(err.detail)
  );
}

export function withAcknowledgeDuplicate<T extends Record<string, unknown>>(
  payload: T,
  acknowledged: boolean,
): T & { acknowledge_duplicate?: boolean } {
  if (!acknowledged) return payload;
  return { ...payload, acknowledge_duplicate: true };
}
