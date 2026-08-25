"use client";

import { Tags, UserCircle, Users } from "lucide-react";

import type { PaletteRow } from "@/components/command-palette-types";
import { formatTry } from "@/lib/money";

export function rowKey(row: PaletteRow, index: number): string {
  switch (row.kind) {
    case "supplier":
      return `s-${row.supplier.id}`;
    case "customer":
      return `c-${row.customer.id}`;
    case "item":
      return `i-${row.item.id}`;
    case "page":
      return `p-${row.href}`;
    case "action":
      return `a-${row.action.id}`;
    default:
      return `r-${index}`;
  }
}

export function RowIcon({ row }: { row: PaletteRow }) {
  switch (row.kind) {
    case "supplier":
      return <Users className="size-4 shrink-0 text-blue-500" />;
    case "customer":
      return <UserCircle className="size-4 shrink-0 text-violet-500" />;
    case "item":
      return <Tags className="size-4 shrink-0 text-emerald-500" />;
    case "page":
      return <row.icon className="size-4 shrink-0" />;
    case "action":
      return <row.action.icon className="size-4 shrink-0 text-primary" />;
  }
}

export function rowLabel(row: PaletteRow): string {
  switch (row.kind) {
    case "supplier":
      return row.supplier.name;
    case "customer":
      return row.customer.name;
    case "item":
      return row.item.canonical_name;
    case "page":
      return row.label;
    case "action":
      return row.action.label;
  }
}

export function rowBadge(
  row: PaletteRow,
  supplierSpend: Map<string, number>,
  itemSpend: Map<string, number>,
): string {
  switch (row.kind) {
    case "supplier": {
      const spend = supplierSpend.get(row.supplier.id);
      return spend ? formatTry(spend) : "Supplier";
    }
    case "customer":
      return "Customer";
    case "item": {
      const spend = itemSpend.get(row.item.id);
      return spend ? formatTry(spend) : "Item";
    }
    case "page":
      return row.group;
    case "action":
      return "Record";
  }
}
