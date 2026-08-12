"use client";

/** Paid from: cash drawer | partner — TRY salary only (partner-funded path). */

import { Combobox } from "@/components/ui/combobox";
import { Label, Select } from "@/components/ui/input";
import type { MoneyAccountOption } from "@/lib/load-money-accounts";

export type SalaryFundingMode = "cash" | "partner";

type PartnerOption = { id: string; name: string };

type Props = {
  fundingMode: SalaryFundingMode;
  onFundingModeChange: (mode: SalaryFundingMode) => void;
  tryAccounts: MoneyAccountOption[];
  paymentGlAccountId: string;
  onPaymentGlAccountIdChange: (id: string) => void;
  partners: PartnerOption[];
  partnerId: string;
  onPartnerIdChange: (id: string) => void;
  showAccountRequiredHint: boolean;
};

export function StaffSalaryFundingFields({
  fundingMode,
  onFundingModeChange,
  tryAccounts,
  paymentGlAccountId,
  onPaymentGlAccountIdChange,
  partners,
  partnerId,
  onPartnerIdChange,
  showAccountRequiredHint,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="pay-funding">Paid from</Label>
        <Select
          id="pay-funding"
          value={fundingMode}
          onChange={(e) =>
            onFundingModeChange(e.target.value as SalaryFundingMode)
          }
        >
          <option value="cash">Cash drawer</option>
          <option value="partner">Partner (owe partner)</option>
        </Select>
      </div>
      {fundingMode === "cash" ? (
        <div>
          <Label htmlFor="pay-account">
            Pay from{showAccountRequiredHint ? " (only if paying now)" : ""}
          </Label>
          <Combobox
            id="pay-account"
            value={paymentGlAccountId}
            onValueChange={onPaymentGlAccountIdChange}
            options={tryAccounts.map((a) => ({
              value: a.gl_account_id,
              label: `${a.name} (${a.account_kind})`,
            }))}
            placeholder="Pay from account…"
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="pay-partner">Partner</Label>
          <Combobox
            id="pay-partner"
            value={partnerId}
            onValueChange={onPartnerIdChange}
            options={partners.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            placeholder="Partner…"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Partner pays from pocket — repay later via Pay partner.
          </p>
        </div>
      )}
    </div>
  );
}
