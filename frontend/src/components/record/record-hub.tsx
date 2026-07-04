"use client";

import { ChevronDown, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { useRecordActions } from "@/components/quick-actions";
import { Button } from "@/components/ui/button";
import { getTopActions } from "@/lib/action-usage";
import { shouldShowNewMenu } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import {
  filterRecordActions,
  RECORD_ACTIONS,
  RECORD_SECTION_LABELS,
  recordActionsBySection,
  type RecordActionDef,
  type RecordSectionId,
} from "@/lib/record-actions";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

const SECTION_ORDER: RecordSectionId[] = [
  "today",
  "upload",
  "cashFx",
  "salesCards",
  "people",
  "suppliers",
];

export function RecordHub() {
  const { openRecordAction, deliveryEnabled } = useRecordActions();
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const topActions = useMemo(() => {
    if (!entityId) return [];
    const topIds = getTopActions(entityId, 4);
    const available = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled });
    return topIds
      .map((id) => available.find((a) => a.id === id))
      .filter((a): a is RecordActionDef => a !== undefined);
  }, [entityId, deliveryEnabled]);

  if (!shouldShowNewMenu(role)) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        View only — you can review figures under Reports and Balances, but
        recording is limited to users with operations access.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {topActions.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Star className="size-3.5" />
            Most used
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {topActions.map((action) => (
              <RecordCard
                key={action.id}
                action={action}
                onOpen={() => openRecordAction(action.id)}
              />
            ))}
          </div>
        </section>
      )}

      {SECTION_ORDER.map((section) => {
        const actions = recordActionsBySection(section, { deliveryEnabled });
        if (actions.length === 0) return null;

        const primary = actions.filter((action) => !action.advanced);
        const advanced = actions.filter((action) => action.advanced);

        return (
          <section key={section}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {RECORD_SECTION_LABELS[section]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {primary.map((action) => (
                <RecordCard
                  key={action.id}
                  action={action}
                  onOpen={() => openRecordAction(action.id)}
                />
              ))}
            </div>
            {advanced.length > 0 && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="mb-2 h-8 px-2 text-muted-foreground"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  Advanced
                  <ChevronDown
                    className={cn(
                      "ml-1 size-4 transition",
                      advancedOpen && "rotate-180",
                    )}
                  />
                </Button>
                {advancedOpen && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {advanced.map((action) => (
                      <RecordCard
                        key={action.id}
                        action={action}
                        onOpen={() => openRecordAction(action.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RecordCard({
  action,
  onOpen,
}: {
  action: RecordActionDef;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="group rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
      onClick={onOpen}
    >
      <action.icon className="mb-3 size-5 text-primary" />
      <h3 className="font-semibold group-hover:text-primary">{action.label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
    </button>
  );
}

export function visibleRecordActionCount(opts: {
  deliveryEnabled: boolean;
}): number {
  return filterRecordActions(
    SECTION_ORDER.flatMap((section) => recordActionsBySection(section, opts)),
    opts,
  ).length;
}
