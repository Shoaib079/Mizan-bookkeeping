import { apiFetch } from "@/lib/api";

type Idempotency = {
  beginSubmit: () => string;
  completeSubmit: () => void;
};

export async function saveEntitySetting(
  targetEntityId: string,
  key: string,
  enabled: boolean,
  existingKeys: Set<string>,
  idempotency: Idempotency,
) {
  const value = enabled ? "true" : "false";
  if (existingKeys.has(key)) {
    const idempotencyKey = idempotency.beginSubmit();
    await apiFetch(`/entities/${targetEntityId}/settings/${key}`, {
      method: "PATCH",
      idempotencyKey,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } else {
    const idempotencyKey = idempotency.beginSubmit();
    await apiFetch(`/entities/${targetEntityId}/settings`, {
      method: "POST",
      idempotencyKey,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  }
  idempotency.completeSubmit();
}
