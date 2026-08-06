"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { MENU_CATEGORIES, type GroupMenuRow, type MenuCategory } from "@/lib/group-sales-types";
import { formatFxNativeInput, parseFxNative } from "@/lib/fx-money";

type Props = {
  open: boolean;
  onClose: () => void;
  menu?: GroupMenuRow | null;
  onSaved?: () => void;
};

export function GroupMenuForm({ open, onClose, menu, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const editing = Boolean(menu);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [surchargeText, setSurchargeText] = useState("");
  const [surchargeLabel, setSurchargeLabel] = useState("");
  const [category, setCategory] = useState<MenuCategory | "">("");
  const [sortOrder, setSortOrder] = useState("0");
  const [excludesVat, setExcludesVat] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(menu?.name ?? "");
    setPriceText(
      menu?.price_minor != null ? formatFxNativeInput(menu.price_minor) : "",
    );
    setCurrency(menu?.currency ?? "USD");
    setSurchargeText(
      menu?.surcharge_minor != null
        ? formatFxNativeInput(menu.surcharge_minor)
        : "",
    );
    setSurchargeLabel(menu?.surcharge_label ?? "");
    setCategory(menu?.category ?? "");
    setSortOrder(String(menu?.sort_order ?? 0));
    setExcludesVat(menu?.price_excludes_vat ?? true);
    setIsActive(menu?.is_active ?? true);
    setError(null);
  }, [open, menu]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const price = priceText.trim() ? parseFxNative(priceText) : null;
    if (priceText.trim() && (price === null || price < 0)) {
      setError("Enter a valid price, or leave it blank.");
      return;
    }
    const surcharge = surchargeText.trim() ? parseFxNative(surchargeText) : null;
    if (surchargeText.trim() && (surcharge === null || surcharge < 0)) {
      setError("Enter a valid surcharge, or leave it blank.");
      return;
    }
    setSubmitting(true);
    setError(null);
    // null, not omitted: sending null is how a price or a surcharge is
    // cleared. Omitting the field would leave the old value in place.
    const body = {
      name,
      price_minor: price,
      currency,
      surcharge_minor: surcharge,
      surcharge_label: surchargeLabel.trim() || null,
      price_excludes_vat: excludesVat,
      category: category || null,
      sort_order: Number(sortOrder) || 0,
      ...(editing ? { is_active: isActive } : {}),
    };
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        editing && menu
          ? `/entities/${entityId}/group-menus/${menu.id}`
          : `/entities/${entityId}/group-menus`,
        {
          method: editing ? "PATCH" : "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast(editing ? "Menu updated" : "Menu added");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit group menu" : "New group menu"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="group-menu-name">Menu name</Label>
          <Input
            id="group-menu-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Veg lunch, Non-veg dinner…"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="group-menu-price">Price per person</Label>
            <Input
              id="group-menu-price"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="e.g. 15,00"
            />
          </div>
          <div>
            <Label htmlFor="group-menu-currency">Currency</Label>
            <Select
              id="group-menu-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="TRY">TRY</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="group-menu-surcharge">Surcharge (optional)</Label>
            <Input
              id="group-menu-surcharge"
              value={surchargeText}
              onChange={(e) => setSurchargeText(e.target.value)}
              placeholder="e.g. 2,00"
            />
          </div>
          <div>
            <Label htmlFor="group-menu-surcharge-label">Surcharge is for</Label>
            <Input
              id="group-menu-surcharge-label"
              value={surchargeLabel}
              onChange={(e) => setSurchargeLabel(e.target.value)}
              placeholder="catering charges"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="group-menu-category">Category</Label>
            <Select
              id="group-menu-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as MenuCategory | "")}
            >
              <option value="">Not grouped</option>
              {MENU_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="group-menu-order">Order on the document</Label>
            <Input
              id="group-menu-order"
              value={sortOrder}
              inputMode="numeric"
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={excludesVat}
            onChange={(e) => setExcludesVat(e.target.checked)}
          />
          Price excludes KDV
        </label>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save" : "Add menu"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
