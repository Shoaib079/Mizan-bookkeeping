"use client";

/** One opening-balance line: type, target picker, amount, remove. */

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import {
  defaultBankAccountId,
  defaultMainDrawerId,
  formatMoneyAccountOptionLabel,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import type { NamedRow } from "@/lib/opening-balances-draft";
import type {
  OpeningBalanceAccount,
  OpeningBalanceLineDraft,
  OpeningBalanceLineTarget,
} from "@/lib/settings-types";

type Props = {
  line: OpeningBalanceLineDraft;
  lineHint: string | null;
  canRemove: boolean;
  obAccounts: OpeningBalanceAccount[];
  moneyAccounts: MoneyAccountOption[];
  cashAccountCount: number;
  suppliers: NamedRow[];
  partners: NamedRow[];
  customers: NamedRow[];
  onUpdate: (id: string, patch: Partial<OpeningBalanceLineDraft>) => void;
  onRemove: (id: string) => void;
};

function TargetPicker({
  line,
  obAccounts,
  moneyAccounts,
  cashAccountCount,
  suppliers,
  partners,
  customers,
  onUpdate,
}: Omit<Props, "lineHint" | "canRemove" | "onRemove">) {
  switch (line.target) {
    case "account":
      return (
        <>
          <Combobox
            value={line.accountCode}
            onValueChange={(code) => {
              const acct = obAccounts.find((a) => a.code === code);
              onUpdate(line.id, {
                accountCode: code,
                side: acct?.normal_balance ?? "",
              });
            }}
            className="min-w-[10rem]"
            options={[
              { value: "", label: "Account…" },
              ...obAccounts.map((a) => ({
                value: a.code,
                label: formatChartAccountLabel(a),
              })),
            ]}
            placeholder="Account…"
          />
          <Select
            value={line.side}
            onChange={(e) =>
              onUpdate(line.id, {
                side: e.target.value as "debit" | "credit",
              })
            }
            className="w-28"
          >
            <option value="">Side</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </Select>
        </>
      );
    case "money_account":
      return (
        <Combobox
          value={line.moneyAccountId}
          onValueChange={(moneyAccountId) =>
            onUpdate(line.id, { moneyAccountId })
          }
          className="min-w-[12rem]"
          options={[
            { value: "", label: "Bank / cash…" },
            ...moneyAccounts.map((a) => ({
              value: a.id,
              label: formatMoneyAccountOptionLabel(a, { cashAccountCount }),
            })),
          ]}
          placeholder="Bank / cash…"
        />
      );
    case "supplier":
      return (
        <Combobox
          value={line.supplierId}
          onValueChange={(supplierId) => onUpdate(line.id, { supplierId })}
          className="min-w-[12rem]"
          options={[
            { value: "", label: "Supplier…" },
            ...suppliers.map((s) => ({ value: s.id, label: s.name })),
          ]}
          placeholder="Supplier…"
        />
      );
    case "partner":
      return (
        <Combobox
          value={line.partnerId}
          onValueChange={(partnerId) => onUpdate(line.id, { partnerId })}
          className="min-w-[12rem]"
          options={[
            { value: "", label: "Partner…" },
            ...partners.map((p) => ({ value: p.id, label: p.name })),
          ]}
          placeholder="Partner…"
        />
      );
    case "customer":
      return (
        <Combobox
          value={line.customerId}
          onValueChange={(customerId) => onUpdate(line.id, { customerId })}
          className="min-w-[12rem]"
          options={[
            { value: "", label: "Customer…" },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          placeholder="Customer…"
        />
      );
    default:
      return null;
  }
}

export function OpeningBalancesLineRow(props: Props) {
  const { line, lineHint, canRemove, onUpdate, onRemove, moneyAccounts } =
    props;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
      <div>
        <Label>Type</Label>
        <Select
          value={line.target}
          onChange={(e) => {
            const target = e.target.value as OpeningBalanceLineTarget;
            const patch: Partial<OpeningBalanceLineDraft> = {
              target,
              accountCode: "",
              side: "",
              moneyAccountId: "",
              supplierId: "",
              partnerId: "",
              customerId: "",
            };
            if (target === "money_account") {
              patch.moneyAccountId =
                defaultMainDrawerId(moneyAccounts) ??
                defaultBankAccountId(moneyAccounts) ??
                "";
            }
            onUpdate(line.id, patch);
          }}
          className="w-36"
        >
          <option value="account">GL account</option>
          <option value="money_account">Bank / cash account</option>
          <option value="supplier">Supplier</option>
          <option value="partner">Partner</option>
          <option value="customer">Customer</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <TargetPicker {...props} />
      </div>
      <div>
        <Label>Amount (₺)</Label>
        <MoneyInput
          id={`ob-amount-${line.id}`}
          className="w-28"
          value={line.amountTry}
          onChange={(value) => onUpdate(line.id, { amountTry: value })}
          placeholder="0,00"
          showPreview={false}
          showInvalidHint={false}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={!canRemove}
        onClick={() => onRemove(line.id)}
      >
        Remove
      </Button>
      {lineHint && (
        <div className="w-full">
          <ValidationHint>{lineHint}</ValidationHint>
        </div>
      )}
    </div>
  );
}
