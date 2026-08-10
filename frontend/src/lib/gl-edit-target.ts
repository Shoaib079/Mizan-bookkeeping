import { type GlEditTarget } from "@/components/ledger/gl-edit-dialogs";
import { type CorrectableFxSpendRow } from "@/components/forms/correct-fx-ledger-form";

/** Turn the backend's `edit.kind` + `context` into the thing to open.
 *
 * Returns `null` for a kind this client does not know. That is not a failure
 * to hide: the caller says so out loud. The arm this replaces used to be
 * `default: return`, which is how the General ledger came to draw an Edit
 * button on supplier invoices that did nothing at all when pressed.
 *
 * A plain function rather than a method on the component, because it is a
 * translation and nothing else — no state, no effects, no rendering — and
 * because it can then be read in one screen next to `entry_capabilities.py`,
 * which is where the other half of the contract lives.
 *
 * `context` is `Record<string, unknown>` because it genuinely is: the shape
 * differs per kind and is decided by the backend. Every read is coerced here,
 * once, so that everything downstream has real types.
 */
export function editTargetFor(
  kind: string,
  ctx: Record<string, unknown>,
  journalEntryId: string,
): GlEditTarget | null {
  const text = (value: unknown) => String(value);
  const num = (value: unknown) => Number(value);
  const maybeText = (value: unknown) =>
    value == null ? null : String(value);

  switch (kind) {
    case "expense":
      return {
        kind: "expense",
        expense: {
          id: text(ctx.id),
          expense_date: text(ctx.expense_date),
          description: text(ctx.description),
          written_item_description: maybeText(ctx.written_item_description),
          notes: maybeText(ctx.notes),
          amount_kurus: num(ctx.amount_kurus),
          expense_account_id: text(ctx.expense_account_id),
          money_account_id: text(ctx.money_account_id),
          status: text(ctx.status),
          journal_entry_id: text(ctx.journal_entry_id),
        },
      };
    case "partner_profit_allocation":
      return {
        kind: "partner_profit_allocation",
        entry: {
          journal_entry_id: journalEntryId,
          allocation_date: text(ctx.allocation_date),
          description: text(ctx.description),
          profit_kurus: num(ctx.profit_kurus),
        },
      };
    case "partner_ledger":
      return {
        kind: "partner_ledger",
        partnerId: text(ctx.partner_id),
        entry: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          movement_type: text(ctx.movement_type),
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
        },
      };
    case "staff_ledger":
      return {
        kind: "staff_ledger",
        employeeId: text(ctx.employee_id),
        entry: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          movement_type: text(ctx.movement_type),
          amount_minor: num(ctx.amount_minor),
          description: text(ctx.description),
          extra_days: ctx.extra_days == null ? undefined : num(ctx.extra_days),
        },
      };
    case "customer_payment":
      return {
        kind: "customer_payment",
        customerId: text(ctx.customer_id),
        payment: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
          payment_native_quantity:
            ctx.payment_native_quantity == null
              ? null
              : num(ctx.payment_native_quantity),
          forex_currency: maybeText(ctx.forex_currency),
        },
      };
    case "fx_purchase":
      // `currency` is one hop off the money account and the row does not carry
      // it, which is the only reason this form was unreachable here.
      return {
        kind: "fx_purchase",
        fxAccountId: text(ctx.fx_money_account_id),
        currency: text(ctx.currency ?? ""),
        purchase: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          native_quantity: num(ctx.native_quantity),
          try_cost_kurus: num(ctx.try_cost_kurus),
          description: text(ctx.description),
        },
      };
    case "fx_ledger":
      return {
        kind: "fx_ledger",
        currency: text(ctx.currency ?? ""),
        entry: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          movement_type: text(ctx.movement_type),
          native_quantity: num(ctx.native_quantity),
          try_cost_kurus: num(ctx.try_cost_kurus),
          description: text(ctx.description),
          journal_source: text(ctx.journal_source),
          fx_money_account_id: text(ctx.fx_money_account_id),
        } as CorrectableFxSpendRow,
      };
    case "customer_write_off":
      // `balance_kurus` comes from the edit context because the dialog cannot
      // work it out here: raising a write-off is capped at the customer's
      // outstanding balance plus what this one already took off, and the
      // General ledger does not have that number.
      return {
        kind: "customer_write_off",
        customerId: text(ctx.customer_id),
        balanceKurus: num(ctx.balance_kurus),
        writeOff: {
          journal_entry_id: journalEntryId,
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
        },
      };
    case "customer_credit_sale":
      return {
        kind: "customer_credit_sale",
        customerId: text(ctx.customer_id),
        sale: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
        },
      };
    case "supplier_invoice":
      return {
        kind: "supplier_invoice",
        supplierId: text(ctx.supplier_id),
        invoice: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
        },
      };
    case "supplier_payment":
      return {
        kind: "supplier_payment",
        supplierId: text(ctx.supplier_id),
        payment: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          amount_kurus: num(ctx.amount_kurus),
          description: text(ctx.description),
        },
      };
    case "delivery_commission":
      return {
        kind: "delivery_commission",
        invoice: {
          journal_entry_id: journalEntryId,
          movement_date: text(ctx.movement_date),
          amount_kurus: num(ctx.gross_kurus),
          description: text(ctx.description),
        },
      };
    case "group_sale":
      // Only the id. The form wants the whole sale — lines, pax, rates,
      // currency — so the loader fetches it rather than the ledger
      // reassembling a shape the sale's own page already knows.
      return { kind: "group_sale", groupSaleId: text(ctx.group_sale_id) };
    default:
      return null;
  }
}
