"use client";

import type { DocumentType } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";

import type { DashboardDocument } from "./SearchBar";

interface KPICardsProps {
  documents: DashboardDocument[];
  type: DocumentType;
}

/**
 * Totals that never depend on someone marking a status.
 * Cancelled and replaced documents are left out.
 * (Received / pending money comes with the ledger.)
 */
export function KPICards({ documents, type }: KPICardsProps) {
  const counted = documents.filter(
    (doc) => doc.type === type && doc.status !== "void" && doc.status !== "replaced"
  );
  const total = counted.reduce((sum, doc) => sum + Number(doc.grand_total ?? 0), 0);
  const word = type === "invoice" ? "invoice" : "quotation";

  return (
    <section className="grid grid-cols-2 gap-2">
      <article className="rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          {type === "invoice" ? "Total invoiced" : "Total quoted"}
        </p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums sm:text-3xl">
          {formatIndianCurrency(total)}
        </p>
      </article>
      <article className="rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">Number of {word}s</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums sm:text-3xl">{counted.length}</p>
      </article>
    </section>
  );
}
