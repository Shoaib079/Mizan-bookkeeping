"use client";

import { FormEvent } from "react";

import { FormSection } from "@/components/page/form-page";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { vknValidationMessage } from "@/lib/vkn";

type Props = {
  profileName: string;
  profileLegalName: string;
  profileVkn: string;
  profileLoading: boolean;
  profileSaving: boolean;
  profileError: string | null;
  hasProfile: boolean;
  onNameChange: (value: string) => void;
  onLegalNameChange: (value: string) => void;
  onVknChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Company identity fields — display name, legal name, VKN. */
export function CompanyProfilePanel({
  profileName,
  profileLegalName,
  profileVkn,
  profileLoading,
  profileSaving,
  profileError,
  hasProfile,
  onNameChange,
  onLegalNameChange,
  onVknChange,
  onSubmit,
}: Props) {
  return (
    <FormSection id="company-profile">
      <p className="text-sm text-muted-foreground">
        Your registered business details — used to identify your company on
        e-Fatura uploads (buyer vs supplier).
      </p>
      {profileLoading && !hasProfile ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => void onSubmit(event)}
        >
          <div>
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={profileName}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={profileSaving}
            />
          </div>
          <div>
            <Label htmlFor="profile-legal-name">Legal name (optional)</Label>
            <Input
              id="profile-legal-name"
              value={profileLegalName}
              onChange={(e) => onLegalNameChange(e.target.value)}
              placeholder="Registered company name"
              disabled={profileSaving}
            />
          </div>
          <div>
            <Label htmlFor="profile-vkn">Vergi numarası (VKN)</Label>
            <Input
              id="profile-vkn"
              value={profileVkn}
              onChange={(e) => onVknChange(e.target.value)}
              placeholder="10–11 digits"
              inputMode="numeric"
              disabled={profileSaving}
            />
          </div>
          {profileError && (
            <p className="text-sm text-destructive">{profileError}</p>
          )}
          <Button
            type="submit"
            disabled={
              profileSaving ||
              !profileName.trim() ||
              !!vknValidationMessage(profileVkn)
            }
          >
            {profileSaving ? "Saving…" : "Save company profile"}
          </Button>
        </form>
      )}
    </FormSection>
  );
}
