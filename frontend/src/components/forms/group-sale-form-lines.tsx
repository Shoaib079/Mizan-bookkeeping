"use client";

/** Menu lines grid for GroupSaleForm (pax + rate ↔ total). */

import {
  derivedRateText,
  derivedTotalText,
  type GroupSaleLineDraft,
  type ParsedGroupSaleLine,
  parseRateMinor,
  minorToText,
} from "@/components/forms/group-sale-line-helpers";
import { GroupSaleMenuPicker } from "@/components/forms/group-sale-menu-picker";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ratePerPersonLabel } from "@/lib/group-sale-form-copy";
import type { GroupMenuRow } from "@/lib/group-sales-types";
import { formatFxNative } from "@/lib/fx-money";
import { menuPriceNote } from "@/lib/menu-prefill";
import { formatTry } from "@/lib/money";

export type GroupSaleFormLinesProps = {
  menus: GroupMenuRow[];
  currency: string;
  isForex: boolean;
  lines: GroupSaleLineDraft[];
  parsedLines: ParsedGroupSaleLine[];
  onUpdateLine: (key: string, patch: Partial<GroupSaleLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
};

export function GroupSaleFormLines({
  menus,
  currency,
  isForex,
  lines,
  parsedLines,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
}: GroupSaleFormLinesProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Menu lines</Label>
        <Button type="button" variant="secondary" onClick={onAddLine}>
          Add line
        </Button>
      </div>
      {lines.map((line, index) => (
        <div
          key={line.key}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
            <Label className="text-xs">Menu</Label>
            <GroupSaleMenuPicker
              menus={menus}
              currency={currency}
              line={line}
              onChange={(patch) => onUpdateLine(line.key, patch)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Pax</Label>
            <Input
              inputMode="numeric"
              value={line.paxText}
              onChange={(e) =>
                onUpdateLine(line.key, { paxText: e.target.value })
              }
              placeholder="e.g. 10"
            />
          </div>
          {/* Fill either one. Whichever you type drives the other, and
              the one you typed is the figure that posts — enter a total of
              94,00 for 6 and 94,00 posts, not the 94,02 a rounded 15,67
              would multiply to. */}
          <div className="sm:col-span-4">
            <Label className="text-xs">{ratePerPersonLabel(currency)}</Label>
            <MoneyInput
              value={
                parsedLines[index]?.pricedBy === "total"
                  ? derivedRateText(parsedLines[index], currency)
                  : line.rateText
              }
              disabled={parsedLines[index]?.pricedBy === "total"}
              onChange={(text) => {
                const typedRate = parseRateMinor(currency, text);
                const pax = Number.parseInt(line.paxText.trim(), 10);
                const validPax = Number.isFinite(pax) && pax > 0;
                const autoTotal =
                  validPax && typedRate !== null && typedRate > 0
                    ? minorToText(pax * typedRate, currency)
                    : "";
                onUpdateLine(line.key, {
                  rateText: text,
                  totalText: autoTotal,
                });
              }}
              placeholder={isForex ? "e.g. 12,00" : "e.g. 350,00"}
            />
            {(() => {
              // A note, never a block: agencies negotiate, and a line at
              // a price the catalogue does not carry is ordinary. The
              // point is to make sure it was meant.
              const note = menuPriceNote(
                menus.find((m) => m.id === line.group_menu_id) ?? null,
                currency,
                parsedLines[index]?.rate ?? null,
              );
              return note ? (
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              ) : null;
            })()}
          </div>
          <div className="sm:col-span-4">
            <Label className="text-xs">
              Total for the line ({isForex ? currency : "₺"})
            </Label>
            <MoneyInput
              value={
                parsedLines[index]?.pricedBy === "rate"
                  ? derivedTotalText(parsedLines[index], currency)
                  : line.totalText
              }
              onChange={(text) =>
                onUpdateLine(line.key, { totalText: text, rateText: "" })
              }
              placeholder={isForex ? "e.g. 94,00" : "e.g. 3.500,00"}
            />
          </div>
          <div className="flex items-end justify-between sm:col-span-2">
            <p className="text-sm tabular-nums text-muted-foreground">
              {parsedLines[index]?.lineTotalMinor != null
                ? isForex
                  ? formatFxNative(
                      parsedLines[index].lineTotalMinor!,
                      currency,
                    )
                  : formatTry(parsedLines[index].lineTotalMinor!)
                : "—"}
            </p>
            {lines.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => onRemoveLine(line.key)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
