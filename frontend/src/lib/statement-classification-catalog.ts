/** Full classification chart + Combobox search keywords. */

import type { StatementLineClassification } from "@/lib/banking-types";

import type { ClassificationOption } from "@/lib/statement-classification-types";

/** All classifications the backend supports (excluding unclassified). */
export const STATEMENT_CLASSIFICATION_OPTIONS: ClassificationOption[] = [
  {
    value: "pos_settlement",
    label: "Card acquirer deposit (clears card sales)",
    hint: "NET SATIŞ / POS batch — links to recorded card sales",
    direction: "inflow",
    target: null,
  },
  {
    value: "pos_commission",
    label: "Card commission",
    hint: "Bank deducted card processing commission — Dr Card Commission (5310) / Cr bank",
    direction: "outflow",
    target: null,
  },
  {
    value: "delivery_settlement",
    label: "Delivery app payment",
    hint: "Trendyol, Getir, Yemeksepeti, Migros…",
    direction: "inflow",
    target: "delivery_platform",
  },
  {
    value: "customer_payment",
    label: "Customer payment",
    hint: "Receivable collected to bank",
    direction: "inflow",
    target: "customer",
  },
  {
    value: "loan_receipt",
    label: "Loan received (money in)",
    hint: "Bank or other lender — increases 2200 Loans Payable (not a partner)",
    direction: "inflow",
    target: null,
  },
  {
    value: "partner_capital_contribution",
    label: "Partner capital (money in)",
    hint: "Partner invests equity — Cr 3300 Partner Capital (not a loan)",
    direction: "inflow",
    target: "partner",
  },
  {
    value: "partner_loan_receipt",
    label: "Partner loan received",
    hint: "Partner lends to the business — Cr 2200, tracked per partner",
    direction: "inflow",
    target: "partner",
  },
  {
    value: "partner_drawing_repayment",
    label: "Partner repayment (money in)",
    hint: "Partner returns a prior drawing",
    direction: "inflow",
    target: "partner",
  },
  {
    value: "transfer",
    label: "Transfer between your accounts",
    hint: "Bank ↔ cash ↔ another bank — not revenue or expense",
    direction: "both",
    target: "transfer",
  },
  {
    value: "supplier_payment",
    label: "Supplier payment",
    hint: "Pay a supplier invoice from bank",
    direction: "outflow",
    target: "supplier",
  },
  {
    value: "staff_payment",
    label: "Salary payment",
    hint: "Pay a month’s salary — accrues at post time; partial pay OK",
    direction: "outflow",
    target: "employee",
  },
  {
    value: "staff_incentive",
    label: "Staff incentive / company expense",
    hint: "Meals, transport, bonus — expense, not salary payable",
    direction: "outflow",
    target: "employee",
  },
  {
    value: "staff_advance",
    label: "Salary advance",
    hint: "Advance paid before accrual",
    direction: "outflow",
    target: "employee",
  },
  {
    value: "partner_drawing",
    label: "Partner withdrawal",
    hint: "Partner takes money out of the business",
    direction: "outflow",
    target: "partner",
  },
  {
    value: "partner_profit_paid",
    label: "Partner profit paid",
    hint: "Pay allocated profit from bank — Dr 3300 / Cr bank (do not also Pay profit manually)",
    direction: "outflow",
    target: "partner",
  },
  {
    value: "partner_reimbursement",
    label: "Repay partner (partner-paid expenses)",
    hint: "Pay back what you owe the partner — not an expense",
    direction: "outflow",
    target: "partner",
  },
  {
    value: "partner_loan_payment",
    label: "Repay partner loan",
    hint: "Pay back a partner who lent money — reduces 2200 per partner",
    direction: "outflow",
    target: "partner",
  },
  {
    value: "loan_payment",
    label: "Loan repayment",
    hint: "Repay bank or other lender — reduces 2200 Loans Payable",
    direction: "outflow",
    target: null,
  },
  {
    value: "credit_card_payment",
    label: "Credit card bill payment",
    hint: "Pay card liability from bank — not an expense",
    direction: "outflow",
    target: "credit_card",
  },
  {
    value: "store_purchase",
    label: "Store / grocery purchase",
    hint: "Migros, BİM, A101… — Dr supplies / Cr bank (no supplier invoice)",
    direction: "outflow",
    target: "expense",
  },
  {
    value: "rent_utility",
    label: "Expense from bank",
    hint: "Pick GL account: 5000 rent, 5210 utilities, 5230 repairs, 5220 supplies, 5240 advertising…",
    direction: "outflow",
    target: "expense",
  },
  // The inflow twin of "Expense from bank". Without it, money in that isn't a
  // customer, settlement, loan or partner contribution — bank interest, a
  // supplier refund, an insurance payout — had nowhere to go, so the line
  // stayed in review and the account could never reconcile.
  {
    value: "other_income",
    label: "Income to bank",
    hint: "Pick GL account: interest earned, refunds, other income — Dr bank / Cr income",
    direction: "inflow",
    target: "income",
  },
  {
    value: "bank_fee",
    label: "Bank fee / charge",
    hint: "BSM, havale, EFT, account fees — Dr bank charges / Cr bank",
    direction: "outflow",
    target: null,
  },
  {
    value: "unknown",
    label: "Decide later (no ledger)",
    hint: "Marks line only — nothing posts to P&L or balance sheet",
    direction: "both",
    target: null,
  },
];

/** Aliases for the searchable classification picker (English + Turkish bank text). */
export const CLASSIFICATION_SEARCH_KEYWORDS: Partial<
  Record<StatementLineClassification, string>
> = {
  pos_settlement:
    "card acquirer pos kart net satış deposit settlement clearing bkm sanal visa mastercard ökc",
  pos_commission: "card commission komisyon pos kart bkm acquirer",
  delivery_settlement:
    "delivery trendyol getir yemeksepeti migros yemek platform marketplace",
  customer_payment: "customer receivable alacak tahsilat",
  loan_receipt: "loan kredi borç alınan",
  partner_capital_contribution: "partner capital ortak sermaye yatırım",
  partner_loan_receipt: "partner loan ortak borç",
  partner_drawing_repayment: "partner repayment drawing geri ödeme ortak",
  transfer: "transfer virman between accounts cash drawer bank",
  supplier_payment:
    "supplier tedarikçi invoice fatura payment ödeme havale eft metro",
  staff_payment: "salary maaş maas payroll ücret personel",
  staff_incentive: "staff incentive bonus yemek yol prim",
  staff_advance: "salary advance avans personel",
  partner_drawing: "partner withdrawal drawing ortak çekim",
  partner_profit_paid: "partner profit paid kar dağıtım ortak ödeme",
  partner_reimbursement: "partner reimbursement masraf ortak geri ödeme",
  partner_loan_payment: "partner loan repay ortak borç ödeme",
  loan_payment: "loan repay kredi taksit faiz bank loan",
  credit_card_payment: "credit card kredi kartı bill ödeme",
  store_purchase: "store grocery migros bim a101 şok market alışveriş",
  rent_utility:
    "expense rent utility kira elektrik su gider vergi tax sgk gib muhtasar belediye resmi ödeme government statutory",
  other_income: "income interest refund gelir faiz iade",
  bank_fee: "bank fee charge masraf havale eft bsm ücret commission masraf",
  unknown: "decide later review unknown",
};
