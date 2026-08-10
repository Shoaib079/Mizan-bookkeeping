// @vitest-environment jsdom

/** A classification you have chosen survives whatever refreshes underneath it.
 *
 * Reported from the books: pick where a bank line should go, wait a few
 * seconds without posting, and the picker changes back on its own. The cause
 * was `pickers` sitting in an effect's dependency list — a fresh object every
 * render, so any re-render above (a poll finishing, a window refocus, the
 * delivery-platform fetch landing after the others) re-hydrated the form with
 * the auto-guess and discarded the choice.
 *
 * Nothing flashed, nothing errored, and the only way to catch it was to look
 * back at the picker before pressing Post. What it costs when you do not look
 * is a payment posted against the wrong account — which is why this is pinned
 * by rendering rather than described in a comment.
 *
 * Two properties, and the second is the one the memoisation alone would not
 * have given: a new object with the same data must not reset the form, and
 * *genuinely* new picker data must not either. Only moving to another line
 * may.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/statement-review-actions", () => ({
  classifyStatementLine: vi.fn(),
  correctStatementLine: vi.fn(),
}));
vi.mock("@/components/forms/staff-salary-payment-dialog", () => ({
  StaffSalaryPaymentDialog: () => null,
}));
vi.mock("@/components/forms/add-expense-category-button", () => ({
  AddExpenseCategoryButton: () => null,
}));

/** The picker, as a plain <select>, so the test can read and set it.
 *
 * `onValueChange`, which is what the real component takes — a mock factory is
 * outside the type checker, so a wrong prop name here would give a select that
 * renders, accepts a change, and tells the bar nothing. Every assertion below
 * would then pass by holding a value the component never received. */
vi.mock("@/components/banking/classification-picker", () => ({
  ClassificationPicker: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (next: string) => void;
  }) => (
    <select
      data-testid="classification"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="supplier_payment">Supplier payment</option>
      <option value="card_settlement">Card settlement</option>
      <option value="bank_fee">Bank fee</option>
    </select>
  ),
}));

const { StatementClassifyBar } = await import(
  "@/components/statement-classify-bar"
);

/** Typed, not cast.
 *
 * This was `as unknown as BankStatementLine` with three invented fields —
 * `value_date`, `row_index`, `balance_kurus` — none of which the type has. The
 * cast switched off the one check that would have said so, and every test in
 * this file died inside `formatTrDate(line.transaction_date)`. The same
 * mistake as mocking `onChange` where the component takes `onValueChange`:
 * stepping around the type checker and then trusting the result. */
const LINE: BankStatementLine = {
  id: "line-1",
  statement_id: "st-1",
  transaction_date: "2026-05-01",
  amount_kurus: -12500,
  description: "ODEME - ACME GIDA",
  reference: null,
  classification: "unclassified",
  status: "needs_review",
  supplier_id: null,
  review_reason: null,
  journal_entry_id: null,
};

/** A fresh object each call — which is exactly what the page used to hand over
 *  on every render, and what must now change nothing. */
function pickers(
  overrides: Partial<StatementClassificationPickers> = {},
): StatementClassificationPickers {
  return {
    suppliers: [{ id: "sup-1", name: "Acme Gida" }],
    customers: [],
    employees: [],
    partners: [],
    moneyAccounts: [],
    creditCards: [],
    expenseAccounts: [],
    incomeAccounts: [],
    deliveryPlatforms: [],
    deliveryPlatformsError: null,
    loading: false,
    error: null,
    reload: async () => undefined,
    appendExpenseAccount: () => undefined,
    ...overrides,
  };
}

function bar(props: { line: BankStatementLine; pickers: StatementClassificationPickers }) {
  return (
    <StatementClassifyBar
      statementId="st-1"
      line={props.line}
      queueIndex={0}
      queueTotal={3}
      pickers={props.pickers}
      onPosted={() => undefined}
    />
  );
}

const chosen = () =>
  (screen.getByTestId("classification") as HTMLSelectElement).value;

/** The "Learn as" box, which hydration fills from the line's description. */
const learnAs = () => screen.getByLabelText(/Learn as/) as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("a chosen classification is not overwritten", () => {
  it("survives a re-render that only replaces the pickers object", () => {
    const { rerender } = render(bar({ line: LINE, pickers: pickers() }));

    fireEvent.change(screen.getByTestId("classification"), {
      target: { value: "card_settlement" },
    });
    expect(chosen()).toBe("card_settlement");

    // The page re-renders for an unrelated reason and builds a new object.
    rerender(bar({ line: LINE, pickers: pickers() }));
    expect(chosen()).toBe("card_settlement");
  });

  it("survives picker data actually changing", () => {
    // Memoising the hook would stop the identity churn but not this: a
    // supplier added in another tab, or the thirty-second refresh returning
    // something new, is a real change and still must not touch the form.
    const { rerender } = render(bar({ line: LINE, pickers: pickers() }));

    fireEvent.change(screen.getByTestId("classification"), {
      target: { value: "bank_fee" },
    });

    rerender(
      bar({
        line: LINE,
        pickers: pickers({
          suppliers: [
            { id: "sup-1", name: "Acme Gida" },
            { id: "sup-2", name: "Yeni Tedarikci" },
          ],
        }),
      }),
    );
    expect(chosen()).toBe("bank_fee");
  });

  it("survives the same line arriving as a new object", () => {
    // Posting a neighbouring line patches the statement, so this line's object
    // is replaced even though the line itself did not change.
    const { rerender } = render(bar({ line: LINE, pickers: pickers() }));

    fireEvent.change(screen.getByTestId("classification"), {
      target: { value: "card_settlement" },
    });

    rerender(bar({ line: { ...LINE }, pickers: pickers() }));
    expect(chosen()).toBe("card_settlement");
  });
});

describe("moving to another line does re-hydrate", () => {
  it("fills the form from the next line in the queue", () => {
    /* Guard the guard: if the effect never re-ran, every test above would pass
     * over a form that had simply stopped working.
     *
     * Asserted on "Learn as", which hydration sets to the line's description —
     * a fact about the new line, not about what the classifier guessed from
     * it. Asserting the classification changed would depend on two
     * descriptions guessing differently, which is a property of the matcher
     * and not of this. */
    const { rerender } = render(bar({ line: LINE, pickers: pickers() }));
    expect(learnAs().value).toBe("ODEME - ACME GIDA");

    fireEvent.change(screen.getByTestId("classification"), {
      target: { value: "bank_fee" },
    });
    expect(chosen()).toBe("bank_fee");

    rerender(
      bar({
        line: { ...LINE, id: "line-2", description: "POS HESAP" },
        pickers: pickers(),
      }),
    );
    expect(learnAs().value).toBe("POS HESAP");
  });
});

describe("a guess made before the pickers arrive is redone once", () => {
  it("re-hydrates when the lists land, and not again after", () => {
    // The line can arrive before the pickers do. A guess made without them
    // cannot resolve a supplier, so it is redone — exactly once.
    const { rerender } = render(
      bar({ line: LINE, pickers: pickers({ loading: true, suppliers: [] }) }),
    );

    rerender(bar({ line: LINE, pickers: pickers() }));
    const afterLoad = chosen();

    fireEvent.change(screen.getByTestId("classification"), {
      target: { value: "card_settlement" },
    });
    rerender(bar({ line: LINE, pickers: pickers() }));
    expect(chosen(), `re-hydrated a second time (was ${afterLoad})`).toBe(
      "card_settlement",
    );
  });
});
