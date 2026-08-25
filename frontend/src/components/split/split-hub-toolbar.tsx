"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import type { SourceTab } from "@/components/split/split-hub-types";

type Props = {
  tab: SourceTab;
  onTabChange: (tab: SourceTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export function SplitHubToolbar({
  tab,
  onTabChange,
  search,
  onSearchChange,
}: Props) {
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          className={tab === "bank_expense" ? undefined : "opacity-60"}
          onClick={() => onTabChange("bank_expense")}
        >
          Bank expenses
        </Button>
        <Button
          type="button"
          className={tab === "supplier_payment" ? undefined : "opacity-60"}
          onClick={() => onTabChange("supplier_payment")}
        >
          Supplier payments
        </Button>
      </div>

      <div className="mb-4 max-w-md">
        <Label htmlFor="split-search">Search</Label>
        <Input
          id="split-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            tab === "supplier_payment" ? "Metro, payment…" : "SGK, rent…"
          }
        />
      </div>
    </>
  );
}
