"use client";

/**
 * Dashboard composition charts (DASH-A).
 * All data comes from the existing DashboardRead payload — no new API calls.
 */

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { formatTry } from "@/lib/money";

/* ── Shared ─────────────────────────────────────────────── */

const CHART_HEIGHT = 240;

const COLORS = {
  cash: "#2563eb",
  posCard: "#7c3aed",
  delivery: "#f59e0b",
  other: "#64748b",
  sales: "#2563eb",
  expenses: "#dc2626",
  net: "#16a34a",
  payables: "#dc2626",
  receivables: "#2563eb",
  tryPosition: "#16a34a",
} as const;

function kurusToLira(kurus: number): number {
  return kurus / 100;
}

function tryLabel(value: number): string {
  return formatTry(Math.round(value * 100));
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/* ── Sales mix (donut) ──────────────────────────────────── */

type SalesMixProps = {
  cashKurus: number;
  posCardKurus: number;
  deliveryKurus: number;
  otherKurus: number;
};

export function SalesMixChart({
  cashKurus,
  posCardKurus,
  deliveryKurus,
  otherKurus,
}: SalesMixProps) {
  const total = cashKurus + posCardKurus + deliveryKurus + otherKurus;
  if (total === 0) return null;

  const data = [
    { name: "Cash", value: kurusToLira(cashKurus), color: COLORS.cash },
    { name: "POS card", value: kurusToLira(posCardKurus), color: COLORS.posCard },
    { name: "Delivery", value: kurusToLira(deliveryKurus), color: COLORS.delivery },
    { name: "Other", value: kurusToLira(otherKurus), color: COLORS.other },
  ].filter((d) => d.value > 0);

  return (
    <ChartCard title="Sales mix">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => tryLabel(Number(v ?? 0))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ── Sales vs expenses vs net (3-bar) ───────────────────── */

type SalesExpensesNetProps = {
  salesKurus: number;
  expensesKurus: number;
  netKurus: number;
};

export function SalesExpensesNetChart({
  salesKurus,
  expensesKurus,
  netKurus,
}: SalesExpensesNetProps) {
  if (salesKurus === 0 && expensesKurus === 0 && netKurus === 0) return null;

  const data = [
    { name: "Sales", amount: kurusToLira(salesKurus), fill: COLORS.sales },
    { name: "Expenses", amount: kurusToLira(expensesKurus), fill: COLORS.expenses },
    { name: "Net", amount: kurusToLira(netKurus), fill: COLORS.net },
  ];

  return (
    <ChartCard title="Sales vs expenses">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} barCategoryGap="30%">
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => tryLabel(v)} width={90} />
          <Tooltip formatter={(v) => tryLabel(Number(v ?? 0))} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ── Owed / owing (payables, receivables, TRY position) ── */

type OwedOwingProps = {
  payablesKurus: number;
  receivablesKurus: number;
  tryPositionKurus: number;
};

export function OwedOwingChart({
  payablesKurus,
  receivablesKurus,
  tryPositionKurus,
}: OwedOwingProps) {
  if (payablesKurus === 0 && receivablesKurus === 0 && tryPositionKurus === 0)
    return null;

  const data = [
    { name: "Payables", amount: kurusToLira(payablesKurus), fill: COLORS.payables },
    { name: "Receivables", amount: kurusToLira(receivablesKurus), fill: COLORS.receivables },
    { name: "TRY position", amount: kurusToLira(tryPositionKurus), fill: COLORS.tryPosition },
  ];

  return (
    <ChartCard title="Owed / owing">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} barCategoryGap="30%">
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => tryLabel(v)} width={90} />
          <Tooltip formatter={(v) => tryLabel(Number(v ?? 0))} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
