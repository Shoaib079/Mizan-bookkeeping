"use client";

/**
 * Everything below this remounts when the restaurant changes.
 *
 * The rule (CURSOR_RULES §1.16) is that no page may show one entity's data
 * under another's name. It was enforced by asking each page to call
 * `useEntitySwitchReset` and clear its own state — 91 pages, and two that
 * remembered. The other 89 kept whatever they were holding: a supplier list,
 * a half-filled form, a table of invoices belonging to the restaurant you
 * just left, now sitting under the new one's heading.
 *
 * A remount is not a nicer way of doing the same thing. It is a different
 * kind of guarantee: there is no per-page step left to forget, so a page
 * written next month is covered without its author knowing the rule exists.
 *
 * What deliberately sits *above* this and survives a switch: React Query's
 * cache (its keys already carry the entity id, so entries cannot cross),
 * auth, toasts, and the unsaved-work prompt — which has to outlive the
 * remount, because warning you about work you are abandoning is precisely
 * its job.
 *
 * The cost is one extra remount at startup, when the stored entity id
 * arrives and the key goes from "" to real. Pages return early without an
 * entity id, so there is nothing to throw away.
 */

import { Fragment } from "react";

import { useEntity } from "@/lib/entity-context";
import { entityResetKey } from "@/lib/use-entity-reset";

export function EntityScopedTree({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  return <Fragment key={entityResetKey(entityId)}>{children}</Fragment>;
}
