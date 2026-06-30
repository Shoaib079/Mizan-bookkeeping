"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  defaultModuleDraft,
  EntityFeatureToggles,
} from "@/components/settings/entity-feature-toggles";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { saveEntitySetting } from "@/lib/save-entity-setting";
import {
  KNOWN_ENTITY_SETTINGS,
  type EntitySettingRow,
} from "@/lib/settings-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { normalizeVknInput, vknValidationMessage } from "@/lib/vkn";

type CreateRestaurantDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateRestaurantDialog({
  open,
  onClose,
}: CreateRestaurantDialogProps) {
  const { setEntityId, refreshEntities } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [newName, setNewName] = useState("");
  const [newLegalName, setNewLegalName] = useState("");
  const [newVkn, setNewVkn] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [wizardEntityId, setWizardEntityId] = useState<string | null>(null);
  const [wizardDraft, setWizardDraft] = useState(defaultModuleDraft);
  const [settings, setSettings] = useState<EntitySettingRow[]>([]);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [wizardSaving, setWizardSaving] = useState(false);

  const inModuleStep = wizardEntityId !== null;

  const resetForm = useCallback(() => {
    setNewName("");
    setNewLegalName("");
    setNewVkn("");
    setCreating(false);
    setCreateError(null);
    setWizardEntityId(null);
    setWizardDraft(defaultModuleDraft());
    setSettings([]);
    setSettingsError(null);
    setWizardSaving(false);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function loadWizardSettings(entityId: string) {
    const settingsRes = await apiFetch<{ items: EntitySettingRow[] }>(
      `/entities/${entityId}/settings?limit=200`,
    );
    setSettings(settingsRes.items);
  }

  async function onCreateRestaurant(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    const vknError = vknValidationMessage(newVkn);
    if (vknError) {
      setCreateError(vknError);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const body: { name: string; vkn: string; legal_name?: string } = {
        name: newName.trim(),
        vkn: normalizeVknInput(newVkn),
      };
      const legal = newLegalName.trim();
      if (legal) body.legal_name = legal;
      const entity = await apiFetch<{ id: string; name: string }>("/entities", {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      submitIdempotency.completeSubmit();
      await refreshEntities();
      setEntityId(entity.id);
      setWizardEntityId(entity.id);
      setWizardDraft(defaultModuleDraft());
      await loadWizardSettings(entity.id);
      toast("Restaurant created");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setCreateError("Sign in is required to create a restaurant.");
      } else {
        setCreateError(err instanceof Error ? err.message : "Create failed");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onWizardContinue() {
    if (!wizardEntityId) return;
    setWizardSaving(true);
    setSettingsError(null);
    try {
      const existingKeys = new Set(settings.map((s) => s.key));
      for (const def of KNOWN_ENTITY_SETTINGS) {
        const enabled = wizardDraft[def.key] ?? false;
        if (enabled || existingKeys.has(def.key)) {
          await saveEntitySetting(
            wizardEntityId,
            def.key,
            enabled,
            existingKeys,
            submitIdempotency,
          );
          existingKeys.add(def.key);
        }
      }
      toast("Modules saved");
      onClose();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setWizardSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={inModuleStep ? "Choose modules" : "Add restaurant"}
      onClose={onClose}
    >
      {inModuleStep ? (
        <div>
          <p className="text-sm text-muted-foreground">
            Choose which modules this restaurant needs. You can change these
            later in Restaurant settings.
          </p>
          {settingsError && (
            <p className="mt-3 text-sm text-destructive">{settingsError}</p>
          )}
          <EntityFeatureToggles
            settings={settings}
            checkedFor={(key) => wizardDraft[key] ?? false}
            onChange={(key, enabled) =>
              setWizardDraft((prev) => ({ ...prev, [key]: enabled }))
            }
            disabled={wizardSaving}
            savingKey={null}
            showKeyDebug={false}
          />
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Skip for now
            </Button>
            <Button
              type="button"
              disabled={wizardSaving}
              onClick={() => void onWizardContinue()}
            >
              {wizardSaving ? "Saving…" : "Save & close"}
            </Button>
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={onCreateRestaurant}>
          <div>
            <Label htmlFor="create-entity-name">Display name</Label>
            <Input
              id="create-entity-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Kadıköy branch"
            />
          </div>
          <div>
            <Label htmlFor="create-entity-vkn">Vergi numarası (VKN)</Label>
            <Input
              id="create-entity-vkn"
              value={newVkn}
              onChange={(e) => setNewVkn(e.target.value)}
              placeholder="10–11 digits"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="create-entity-legal-name">Legal name (optional)</Label>
            <Input
              id="create-entity-legal-name"
              value={newLegalName}
              onChange={(e) => setNewLegalName(e.target.value)}
              placeholder="Registered company name"
            />
          </div>
          {createError && (
            <p className="text-sm text-destructive">{createError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                creating || !newName.trim() || !!vknValidationMessage(newVkn)
              }
            >
              {creating ? "Creating…" : "Create restaurant"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
