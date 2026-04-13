"use client";

import { formatIndianCurrency } from "@/lib/utils/formatting";

import type { DashboardDocument } from "./SearchBar";

interface KPICardsProps {
  documents: DashboardDocument[];
}

export function KPICards({ documents }: KPICardsProps) {
  const invoices = documents.filter((doc) => doc.type === "invoice");
  const quotations = documents.filter((doc) => doc.type === "quotation");

  const totalRevenue = invoices
    .filter((doc) => doc.status === "paid")
    .reduce((sum, doc) => sum + doc.grand_total, 0);

  const pendingPayments = invoices
    .filter((doc) => doc.status === "sent")
    .reduce((sum, doc) => sum + doc.grand_total, 0);

  const convertedQuotes = quotations.filter((doc) => doc.status === "replaced").length;
  const conversionRate =
    quotations.length === 0 ? 0 : (convertedQuotes / quotations.length) * 100;

  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <article className="rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">Total Revenue</p>
        <p className="mt-0.5 text-base font-semibold tabular-nums">
          {formatIndianCurrency(totalRevenue)}
        </p>
      </article>
      <article className="rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">Pending Payments</p>
        <p className="mt-0.5 text-base font-semibold tabular-nums">
          {formatIndianCurrency(pendingPayments)}
        </p>
      </article>
      {false && (
        <article className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Quote Conversion %</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {conversionRate.toFixed(1)}%
          </p>
        </article>
      )}
    </section>
  );
}
