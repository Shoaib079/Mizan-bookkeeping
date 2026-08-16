"use client";

/** The row that heads a group of ledger rows and carries their total.
 *
 * A profit allocation is never written as one row: the engine splits the gross
 * share into the part that cleared open drawings and the part credited to the
 * partner. A reader seeing only those two has to add them back up to learn
 * what they earned — which the owner did, twice, and asked where their 75.000
 * had gone. So the band carries the gross and the rows beneath it read as the
 * breakdown.
 *
 * It is a heading, not a movement: no running balance, no actions. Giving it
 * either would make the column count the share twice.
 */

import { formatTry } from "@/lib/money";

type Props = {
  title: string;
  /** The group's total. Null renders the cell empty rather than "0,00 ₺". */
  grossKurus: number | null;
  /** Whether the rows beneath are a breakdown or a single movement. */
  hasParts: boolean;
  /** Columns before the amount, and after it. The frame knows its own shape;
   * each ledger tells it how wide. */
  leadingColumns: number;
  trailingColumns: number;
};

export function LedgerBandHeading({
  title,
  grossKurus,
  hasParts,
  leadingColumns,
  trailingColumns,
}: Props) {
  return (
    <tr className="bg-muted/40">
      <td
        colSpan={leadingColumns}
        className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-primary"
      >
        {title}
        {hasParts && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">
            — share applied as follows
          </span>
        )}
      </td>
      <td className="px-4 py-1.5 text-right text-sm font-semibold tabular-nums text-primary">
        {grossKurus != null && formatTry(grossKurus)}
      </td>
      <td colSpan={trailingColumns} />
    </tr>
  );
}
