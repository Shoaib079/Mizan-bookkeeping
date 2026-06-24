import { apiFetch } from "@/lib/api";

type EntitySetting = { key: string; value: string };

/** Read a boolean entity setting (`"true"` / `"false"`). Missing → false. */
export async function isEntitySettingEnabled(
  entityId: string,
  key: string,
): Promise<boolean> {
  const res = await apiFetch<{ items: EntitySetting[] }>(
    `/entities/${entityId}/settings?limit=200`,
  );
  const row = res.items.find((s) => s.key === key);
  return row !== undefined && row.value.trim().toLowerCase() === "true";
}
