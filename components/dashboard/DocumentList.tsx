"use client";

import Link from "next/link";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";

import type { DashboardDocument } from "./SearchBar";

interface DocumentListProps {
  documents: DashboardDocument[];
  documentType?: "invoice" | "quotation";
}

const STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  void: "bg-red-100 text-red-700 border-red-200",
  replaced: "bg-purple-100 text-purple-700 border-purple-200",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Cancelled",
  replaced: "Replaced",
};

export function DocumentList({ documents, documentType }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        No documents yet. Create your first{" "}
        {documentType === "quotation" ? "quotation" : "invoice"}!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => {
        const addressLines = doc.companies?.address
          ?.split("\n")
          .map((l) => l.trim())
          .filter(Boolean) ?? [];
        const hasIntraGst =
          (doc.cgst_amount ?? 0) > 0 || (doc.sgst_amount ?? 0) > 0;
        const hasInterGst =
          !hasIntraGst &&
          (doc.grand_total ?? 0) - (doc.subtotal ?? 0) - (doc.round_off ?? 0) > 0;
        const hasGst = hasIntraGst || hasInterGst;

        return (
          <Link
            key={doc.id}
            href={`/document/${doc.id}`}
            className="block rounded-lg border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
          >
            {/* Top row: status badge + created date */}
            <div className="mb-1 flex items-center justify-between">
              <Badge
                variant="outline"
                className={cn(STATUS_STYLES[doc.status], "text-xs font-medium")}
              >
                {STATUS_LABELS[doc.status]}
              </Badge>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Created on</div>
                <div className="text-sm font-medium">
                  {format(new Date(doc.created_at), "dd MMM yyyy")}
                </div>
              </div>
            </div>

            {/* Document number */}
            <p className="mt-2 text-lg font-bold leading-tight tracking-tight">
              {doc.doc_number}
            </p>

            {/* Company info */}
            <div className="mt-1 space-y-1">
              {doc.companies?.branch && (
                <Badge variant="secondary" className="w-fit text-xs">
                  {doc.companies.branch}
                </Badge>
              )}
              <p className="text-sm font-medium">
                {doc.companies?.name ?? "Unknown company"}
              </p>
              {addressLines.length > 0 && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  {addressLines.join("\n")}
                </p>
              )}
            </div>

            {/* Subject */}
            {doc.subject && (
              <div className="mt-4 rounded-lg border bg-muted/50 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Subject</p>
                <p className="line-clamp-2 text-sm font-medium">{doc.subject}</p>
              </div>
            )}

            {/* Bottom row: total + GST badge */}
            <div className="-mx-4 mt-4 flex items-end justify-between border-t px-4 pt-3">
              <div>
                <p className="mb-0.5 text-xs text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {formatIndianCurrency(doc.grand_total)}
                </p>
              </div>
              <Badge
                variant={hasGst ? "secondary" : "outline"}
                className="text-xs whitespace-nowrap"
              >
                {hasGst ? "Incl. 18% GST" : "No GST"}
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
