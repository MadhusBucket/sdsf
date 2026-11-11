"use client";

import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Nov 2026" from the document's own date (the date printed on the PDF). */
function docDay(doc: DashboardDocument) {
  const raw = doc.date || doc.created_at;
  const [y, m, d] = raw.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : "";
}

/** ₹82,364 for round amounts, ₹82,364.50 only when there are paise. */
function amountText(value: number) {
  const n = Number(value ?? 0);
  if (Number.isInteger(n)) return `₹${n.toLocaleString("en-IN")}`;
  return formatIndianCurrency(n);
}

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
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {documents.map((doc) => {
        const hasIntraGst = (doc.cgst_amount ?? 0) > 0 || (doc.sgst_amount ?? 0) > 0;
        const hasInterGst =
          !hasIntraGst && (doc.grand_total ?? 0) - (doc.subtotal ?? 0) - (doc.round_off ?? 0) > 0;
        const hasGst = hasIntraGst || hasInterGst;
        const itemHit = matchedItemLine(doc, query);
        const company = doc.companies?.name ?? "Unknown company";
        const branch = doc.companies?.branch?.trim();
        const inactive = doc.status === "void" || doc.status === "replaced";
        const day = docDay(doc);

        return (
          <li key={doc.id} className="min-w-0">
            <Link
              href={`/document/${doc.id}`}
              aria-label={`${doc.doc_number}, ${company}${branch ? `, ${branch}` : ""}, ${amountText(doc.grand_total)}, ${STATUS_LABELS[doc.status]}`}
              className={cn(
                "group flex h-full flex-col gap-2.5 rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.99]",
                inactive && "opacity-60"
              )}
            >
              {/* Who and how much: what you look for first */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-base font-semibold leading-snug">
                    <Highlight text={company} words={words} />
                  </p>
                  {branch && (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        <Highlight text={branch} words={words} />
                      </span>
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums leading-tight sm:text-xl",
                      inactive && "line-through"
                    )}
                  >
                    {amountText(doc.grand_total)}
                  </p>
                  <p className="text-xs text-muted-foreground">{hasGst ? "incl. GST" : "no GST"}</p>
                </div>
              </div>

              {/* What the work was */}
              {doc.subject && (
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  <Highlight text={doc.subject} words={words} />
                </p>
              )}

              {itemHit && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Item: </span>
                  <Highlight text={itemHit} words={words} />
                </p>
              )}

              {/* Which bill and when */}
              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
                <p className="min-w-0 truncate text-sm">
                  <span className="font-semibold tabular-nums">
                    <Highlight text={doc.doc_number} words={words} />
                  </span>
                  {day && <span className="text-muted-foreground"> · {day}</span>}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className={cn(STATUS_STYLES[doc.status], "text-xs font-medium")}>
                    {STATUS_LABELS[doc.status]}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
