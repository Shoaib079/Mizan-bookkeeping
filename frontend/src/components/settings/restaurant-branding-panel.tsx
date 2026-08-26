"use client";

/** What this restaurant's documents print (MENU_PLAN.md slice 3).
 *
 * The address, the phone numbers and the logo were typed into each Word menu
 * by hand, which is how one location's menu went out for a year carrying
 * another location's address. Held on the restaurant record, they are printed
 * from the same row as the name, so the two cannot disagree.
 *
 * This form owns only its own fields. It PATCHes them and nothing else, so
 * saving here cannot overwrite the company profile above it, and saving the
 * profile cannot blank the address — the two forms edit the same row without
 * needing to know about each other.
 */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { FormSection } from "@/components/page/form-page";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { apiDownload, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  newIdempotencyKey,
  useSubmitIdempotency,
} from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

type EntityBranding = {
  address: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  menu_terms: string | null;
  menu_validity_note: string | null;
  has_logo: boolean;
};

/** Kept in step with `logo.py` so the two limits cannot drift apart. */
const LOGO_ACCEPT = "image/png,image/jpeg";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

type Props = {
  /** When true, skip the section H2 — the parent tab already names this panel. */
  embedded?: boolean;
};

export function RestaurantBrandingPanel({ embedded = false }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const fileInput = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState("");
  const [validityNote, setValidityNote] = useState("");
  const [hasLogo, setHasLogo] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const applyBranding = useCallback((row: EntityBranding) => {
    setAddress(row.address ?? "");
    setPhonePrimary(row.phone_primary ?? "");
    setPhoneSecondary(row.phone_secondary ?? "");
    setEmail(row.email ?? "");
    setTerms(row.menu_terms ?? "");
    setValidityNote(row.menu_validity_note ?? "");
    setHasLogo(row.has_logo);
  }, []);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      applyBranding(await apiFetch<EntityBranding>(`/entities/${entityId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [entityId, applyBranding]);

  useEffect(() => {
    void load();
  }, [load]);

  // The logo is behind the same auth as everything else, so it is fetched as a
  // blob rather than pointed at with an <img src>. A plain URL would send no
  // Authorization header and render a broken image icon.
  useEffect(() => {
    if (!entityId || !hasLogo) {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { blob } = await apiDownload(`/entities/${entityId}/logo`);
        if (cancelled) return;
        setLogoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (!cancelled) setLogoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId, hasLogo]);

  useEffect(
    () => () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    [],
  );

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!entityId) return;
    setSaving(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<EntityBranding>(`/entities/${entityId}`, {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        // Empty string, not null: the API reads "" as "clear this" and null as
        // "leave it alone", so a field the user emptied has to arrive as "".
        body: JSON.stringify({
          address: address.trim(),
          phone_primary: phonePrimary.trim(),
          phone_secondary: phoneSecondary.trim(),
          email: email.trim(),
          menu_terms: terms.trim(),
          menu_validity_note: validityNote.trim(),
        }),
      });
      submitIdempotency.completeSubmit();
      applyBranding(updated);
      toast("Document details saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onPickLogo(file: File) {
    if (!entityId) return;
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("The logo must be smaller than 2 MB.");
      return;
    }
    setLogoBusy(true);
    setLogoError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const updated = await apiFetch<EntityBranding>(
        `/entities/${entityId}/logo`,
        { method: "PUT", body, idempotencyKey: newIdempotencyKey() },
      );
      applyBranding(updated);
      toast("Logo uploaded");
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onRemoveLogo() {
    if (!entityId) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const updated = await apiFetch<EntityBranding>(
        `/entities/${entityId}/logo`,
        { method: "DELETE", idempotencyKey: newIdempotencyKey() },
      );
      applyBranding(updated);
      toast("Logo removed");
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <FormSection id="branding">
      {!embedded && (
        <h2 className="text-sm font-semibold">Menu & Documents</h2>
      )}
      <p className={embedded ? "text-sm text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>
        What this restaurant prints on the menus you send to agencies. Each
        restaurant keeps its own — they are separate companies.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="mt-4">
            <Label htmlFor="branding-logo">Restaurant logo</Label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Restaurant logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="px-1 text-center text-xs text-muted-foreground">
                    No logo
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  id="branding-logo"
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onPickLogo(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={logoBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  {hasLogo ? "Replace logo" : "Upload logo"}
                </Button>
                {hasLogo && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={logoBusy}
                    onClick={() => void onRemoveLogo()}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              PNG or JPEG, under 2 MB. Those are the two formats the menu PDF
              can draw.
            </p>
            {logoError && (
              <p className="mt-2 text-sm text-destructive">{logoError}</p>
            )}
          </div>

          <form className="mt-6 space-y-3" onSubmit={(e) => void onSave(e)}>
            <div>
              <Label htmlFor="branding-address">Address</Label>
              <Textarea
                id="branding-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, district, city"
                disabled={saving}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="branding-phone-1">Phone</Label>
                <Input
                  id="branding-phone-1"
                  value={phonePrimary}
                  onChange={(e) => setPhonePrimary(e.target.value)}
                  placeholder="e.g. +90 212 000 00 00"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="branding-phone-2">
                  Second phone (optional)
                </Label>
                <Input
                  id="branding-phone-2"
                  value={phoneSecondary}
                  onChange={(e) => setPhoneSecondary(e.target.value)}
                  placeholder="e.g. +90 532 000 00 00"
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="branding-email">Email</Label>
              <Input
                id="branding-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. info@restaurant.com"
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="branding-validity">Validity note</Label>
              <Input
                id="branding-validity"
                value={validityNote}
                onChange={(e) => setValidityNote(e.target.value)}
                placeholder="e.g. Prices valid until 31 December 2026"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Printed under the prices, so an old menu cannot be quoted back
                at you next year.
              </p>
            </div>
            <div>
              <Label htmlFor="branding-terms">Terms and conditions</Label>
              <Textarea
                id="branding-terms"
                rows={6}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder={
                  "e.g. All prices are per person and exclude 10% KDV.\nMinimum 10 guests.\nFinal numbers confirmed 48 hours in advance."
                }
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One point per line. Printed on the last page of the menu.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save document details"}
            </Button>
          </form>
        </>
      )}
    </FormSection>
  );
}
