/** Build + POST period salary (cash or partner-funded). Keep dialog thin. */

import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import type { SalaryFundingMode } from "@/components/forms/staff-salary-funding-fields";

export type PeriodPayload = {
  period_year: number;
  period_month: number;
  period_salary_minor: number;
  amount_minor: number;
  extra_days?: number;
  per_day_minor?: number;
};

type PostArgs = {
  entityId: string;
  employeeId: string;
  actorId: string;
  description: string;
  dateText: string;
  isTry: boolean;
  payCurrency: string;
  fundingMode: SalaryFundingMode;
  partnerId: string;
  paymentGlAccountId: string;
  fxWalletId: string;
  tryCostText: string;
  payload: PeriodPayload;
  beginSubmit: () => string;
  submitWithDuplicateGuard: (
    run: (acknowledged: boolean) => Promise<unknown>,
  ) => Promise<unknown>;
};

export async function postStaffSalaryPayment(
  args: PostArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const paymentDateParsed = parseTrDate(args.dateText);
  if (!paymentDateParsed) {
    return { ok: false, error: "Date must be DD.MM.YYYY." };
  }
  const partnerFunded =
    args.isTry &&
    args.fundingMode === "partner" &&
    args.payload.amount_minor > 0;
  if (partnerFunded && !args.partnerId) {
    return { ok: false, error: "Choose the partner who paid." };
  }
  if (
    args.payload.amount_minor > 0 &&
    args.isTry &&
    args.fundingMode === "cash" &&
    !args.paymentGlAccountId
  ) {
    return { ok: false, error: "Choose a cash or bank account." };
  }
  if (args.payload.amount_minor > 0 && !args.isTry && !args.fxWalletId) {
    return { ok: false, error: `No ${args.payCurrency} wallet found.` };
  }

  const body: Record<string, unknown> = {
    payment_date: paymentDateParsed,
    amount_minor: args.payload.amount_minor,
    description: args.description,
    actor_id: args.actorId,
    period_year: args.payload.period_year,
    period_month: args.payload.period_month,
    period_salary_minor: args.payload.period_salary_minor,
  };
  if (args.payload.extra_days != null && args.payload.per_day_minor != null) {
    body.extra_days = args.payload.extra_days;
    body.per_day_minor = args.payload.per_day_minor;
  }
  if (partnerFunded) {
    body.partner_id = args.partnerId;
  } else if (args.isTry && args.payload.amount_minor > 0) {
    body.payment_account_id = args.paymentGlAccountId;
  } else if (args.payload.amount_minor > 0) {
    const tryCostKurus = parseTryToKurus(args.tryCostText);
    if (tryCostKurus === null || tryCostKurus <= 0) {
      return { ok: false, error: "Enter a valid TRY cost for this payment." };
    }
    body.fx_money_account_id = args.fxWalletId;
    body.try_cost_kurus = tryCostKurus;
  }

  const path = partnerFunded
    ? `/entities/${args.entityId}/staff/employees/${args.employeeId}/partner-funded-payments`
    : `/entities/${args.entityId}/staff/employees/${args.employeeId}/payments`;

  try {
    const idempotencyKey = args.beginSubmit();
    await args.submitWithDuplicateGuard(async (acknowledgedDuplicate) =>
      apiFetch(path, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withAcknowledgeDuplicate(body, acknowledgedDuplicate),
        ),
      }),
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
}
