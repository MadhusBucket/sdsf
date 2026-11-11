"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Building2, CalendarDays, ChevronRight, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";

import { matchedItemLine, searchWords, type DashboardDocument } from "./SearchBar";

interface DocumentListProps {
  documents: DashboardDocument[];
  documentType?: "invoice" | "quotation";
  /** Current search text, used to show which item matched. */
  query?: string;
}

/** Wraps the searched words in a highlight. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
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

export function DocumentList({ documents, documentType, query = "" }: DocumentListProps) {
  const words = searchWords(query);
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        {words.length
          ? "Nothing matches your search. Try a shorter word, like “jali” or “sheet”."
          : `No ${documentType === "quotation" ? "quotations" : "invoices"} here yet.`}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {documents.map((doc) => {
        const addressLines =
          doc.companies?.address
            ?.split("\n")
            .map((l) => l.trim())
            .filter(Boolean) ?? [];
        const hasIntraGst = (doc.cgst_amount ?? 0) > 0 || (doc.sgst_amount ?? 0) > 0;
        const hasInterGst =
          !hasIntraGst && (doc.grand_total ?? 0) - (doc.subtotal ?? 0) - (doc.round_off ?? 0) > 0;
        const hasGst = hasIntraGst || hasInterGst;
        const itemHit = matchedItemLine(doc, query);
        const company = doc.companies?.name ?? "Unknown company";
        const branch = doc.companies?.branch?.trim();
        const inactive = doc.status === "void" || doc.status === "replaced";

        return (
          <li key={doc.id} className="min-w-0">
            <Link
              href={`/document/${doc.id}`}
              className={cn(
                "group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.995]",
                inactive && "opacity-60"
              )}
            >
              {/* 1. The document: number, status, date */}
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div className="min-w-0 space-y-1.5">
                  <Badge variant="outline" className={cn(STATUS_STYLES[doc.status], "text-xs font-medium")}>
                    {STATUS_LABELS[doc.status]}
                  </Badge>
                  <p className="text-lg font-bold leading-tight tracking-tight tabular-nums">
                    <Highlight text={doc.doc_number} words={words} />
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Created on</p>
                  <p className="flex items-center justify-end gap-1 text-sm font-medium">
                    <CalendarDays className="size-3.5 text-muted-foreground" />
                    {format(new Date(doc.created_at), "dd MMM yyyy")}
                  </p>
                </div>
              </div>

              {/* 2. The client: company, branch, address */}
              <div className="mx-4 mt-3 flex gap-3 rounded-lg bg-muted/50 p-3">
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold leading-snug">
                    <Highlight text={company} words={words} />
                  </p>
                  {branch && (
                    <Badge variant="secondary" className="w-fit gap-1 text-xs">
                      <MapPin className="size-3" />
                      <Highlight text={branch} words={words} />
                    </Badge>
                  )}
                  {addressLines.length > 0 && (
                    <p className="text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                      {addressLines.join("\n")}
                    </p>
                  )}
                </div>
              </div>

              {/* 3. The work: subject, and the item that matched a search */}
              {(doc.subject || itemHit) && (
                <div className="space-y-2 px-4 pt-3">
                  {doc.subject && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Subject</p>
                      <p className="line-clamp-2 text-sm font-medium">
                        <Highlight text={doc.subject} words={words} />
                      </p>
                    </div>
                  )}
                  {itemHit && (
                    <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm dark:bg-yellow-950/40">
                      <span className="text-muted-foreground">Item: </span>
                      <Highlight text={itemHit} words={words} />
                    </p>
                  )}
                </div>
              )}

              {/* 4. The money (kept at the bottom so cards side by side line up) */}
              <div className="min-h-4 flex-1" />
              <div className="flex items-end justify-between gap-3 border-t px-4 pt-3 pb-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total amount</p>
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums text-primary",
                      inactive && "text-muted-foreground line-through"
                    )}
                  >
                    {formatIndianCurrency(doc.grand_total)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={hasGst ? "secondary" : "outline"} className="text-xs whitespace-nowrap">
                    {hasGst ? "Incl. 18% GST" : "No GST"}
                  </Badge>
                  <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
