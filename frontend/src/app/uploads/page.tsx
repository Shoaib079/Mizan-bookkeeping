"use client";

/** Upload hub — photos, e-Fatura, statements (nav target for /uploads). */

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  FileText,
  Receipt,
  ShoppingBag,
  Truck,
  Upload,
} from "lucide-react";

import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useEntity } from "@/lib/entity-context";
import { cn } from "@/lib/utils";

type UploadKey = "receipt" | "posPhoto" | "efatura" | "deliveryReport" | null;

const uploadActions = [
  {
    key: "receipt" as const,
    title: "Expense receipt",
    description: "Photo of a receipt — line items extracted for review.",
    icon: Receipt,
  },
  {
    key: "posPhoto" as const,
    title: "POS summary (Z report)",
    description: "End-of-day POS slip photo — cash and card totals.",
    icon: ShoppingBag,
  },
  {
    key: "efatura" as const,
    title: "Supplier e-Fatura",
    description: "PDF or XML supplier invoice → draft for review.",
    icon: FileText,
  },
  {
    key: "deliveryReport" as const,
    title: "Delivery platform report",
    description: "Commission or sales report from Yemeksepeti, Getir, etc.",
    icon: Truck,
  },
] as const;

const reviewLinks = [
  {
    href: "/sales",
    label: "POS summaries",
    description: "Draft and needs-review daily sales",
  },
  {
    href: "/suppliers",
    label: "Supplier invoices",
    description: "e-Fatura drafts awaiting confirm",
  },
  {
    href: "/banking",
    label: "Bank statements",
    description: "Upload CSV on each bank account page",
  },
  {
    href: "/delivery/reports",
    label: "Delivery reports",
    description: "Platform reports awaiting confirm",
  },
] as const;

export default function UploadsPage() {
  const { entityId } = useEntity();
  const [active, setActive] = useState<UploadKey>(null);

  return (
    <AppShell title="Uploads">
      {!entityId && (
        <p className="mb-6 text-sm text-muted-foreground">
          Select a restaurant in the sidebar to upload documents.
        </p>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold">Upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a document type. Each upload goes to review before posting.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {uploadActions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.key}
                className="flex flex-col rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-sm font-medium">{action.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={!entityId}
                  onClick={() => setActive(action.key)}
                >
                  Upload
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-medium">Bank statement (CSV)</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a bank account under Banking, then use Upload statement on
              that account.
            </p>
            <Link
              href="/banking"
              className={cn(
                "mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted",
                !entityId && "pointer-events-none opacity-50",
              )}
              aria-disabled={!entityId}
              tabIndex={entityId ? 0 : -1}
            >
              Go to Banking
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Review pending</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a list to confirm or reject uploaded drafts.
        </p>
        <ul className="mt-4 space-y-2">
          {reviewLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:bg-sidebar-accent"
              >
                <span>
                  <span className="font-medium">{link.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {link.description}
                  </span>
                </span>
                <Upload className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ExpenseReceiptUploadForm
        open={active === "receipt"}
        onClose={() => setActive(null)}
      />
      <PosSummaryUploadForm
        open={active === "posPhoto"}
        onClose={() => setActive(null)}
      />
      <EfaturaUploadForm open={active === "efatura"} onClose={() => setActive(null)} />
      <DeliveryReportForm
        open={active === "deliveryReport"}
        onClose={() => setActive(null)}
      />
    </AppShell>
  );
}
