/** Static Turkish sample figures for the interactive `/preview` shell. */

export const PREVIEW_RESTAURANT = "Sandbox Demo Restaurant";

export const PREVIEW_SALES = [
  {
    id: "sale-1",
    date: "05.08.2026",
    amountKurus: 2_000_00,
    status: "posted" as const,
    corrected: true,
    tone: "in" as const,
    detail: "Cash + card · Main drawer",
  },
  {
    id: "sale-2",
    date: "04.08.2026",
    amountKurus: 1_750_00,
    status: "posted" as const,
    corrected: false,
    tone: "in" as const,
    detail: "Cash only · Main drawer",
  },
  {
    id: "sale-3",
    date: "03.08.2026",
    amountKurus: 980_00,
    status: "posted" as const,
    corrected: false,
    tone: "neutral" as const,
    detail: "Card batch · needs settlement",
  },
] as const;

export const PREVIEW_SUPPLIER_ACTIVITY = [
  {
    id: "sup-1",
    date: "02.08.2026",
    type: "Invoice",
    amount: "12.450,00 ₺",
    detail: "02.08.2026 · Invoice · 12.450,00 ₺",
  },
  {
    id: "sup-2",
    date: "28.07.2026",
    type: "Payment",
    amount: "5.000,00 ₺",
    detail: "28.07.2026 · Payment · 5.000,00 ₺",
  },
] as const;

export const PREVIEW_CUSTOMER_LEDGER = [
  {
    id: "cust-1",
    date: "01.08.2026",
    description: "Veg Menu 1 · 10 pax × $12,00 — deposit paid",
    amount: "$120,00",
  },
  {
    id: "cust-2",
    date: "25.07.2026",
    description: "Lunch Menu · 8 pax × 450,00 ₺",
    amount: "3.600,00 ₺",
  },
] as const;

export const PREVIEW_VOID_DETAIL = "05.08.2026 · Invoice · 12.450,00 ₺";
