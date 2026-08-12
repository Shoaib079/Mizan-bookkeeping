export const staffMovementLabels: Record<string, string> = {
  opening_balance: "Opening balance",
  salary_accrued: "Salary accrual",
  advance_paid: "Advance paid",
  advance_applied: "Advance applied",
  advance_returned: "Advance returned",
  salary_payment: "Salary payment",
  incentive_paid: "Incentive / company expense",
  extra_days_accrued: "Extra days accrued",
  extra_days_paid: "Extra days pay",
};

export const partnerMovementLabels: Record<string, string> = {
  opening_balance: "Opening balance",
  expense_fronted: "Expense fronted",
  reimbursement_paid: "Reimbursement paid",
  drawing: "Drawing",
  drawing_repayment: "Drawing repayment",
  capital_contribution: "Capital contribution",
  partner_loan_received: "Partner loan received",
  partner_loan_repaid: "Partner loan repaid",
  // Both halves say "Profit allocation" so adding the rows gives the "Profit
  // allocated" total. Kept identical to app/core/excel/labels.py — the same
  // movement must not read one way on screen and another in the export.
  profit_allocation: "Profit allocation — added to capital",
  profit_settlement: "Profit allocation — cleared earlier drawings",
  profit_paid: "Profit paid",
};

export const customerMovementLabels: Record<string, string> = {
  opening_balance: "Opening balance",
  adjustment: "Adjustment",
  credit_sale: "Group sale",
  payment_received: "Payment received",
  discount: "Discount (write-off)",
};
