"use client";

/** Day close-out page — atomic sales + expenses (Phase 11 Slice 11.15). */

import { DayCloseoutForm } from "@/components/forms/day-closeout-form";

export default function CloseDayPage() {
  return (
    <>
      <p className="mb-4 max-w-xl text-sm text-muted-foreground">
        Enter daily cash and card sales, add quick drawer expenses, and post
        everything in one step. The same date, drawer, and period-lock rules
        apply as manual sales and expenses.
      </p>
      <DayCloseoutForm />
    </>
  );
}
