"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, ChevronRight, MapPin, Wallet } from "lucide-react";

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

/** Money received against an invoice. Comes from the ledger later; until then the card shows a neutral state. */
export interface PaymentSummary {
  received: number;
}

// Soft, readable colors for the company badge. The same company always gets the same color.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-700",
];

function companyInitials(name: string) {
  const words = name
    .replace(/\b(pvt|private|ltd|limited|llp|and|&|the)\b\.?/gi, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

function avatarColor(name: string) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** "06 Nov 2026" from the document's own date (the date printed on the PDF). */
function invoiceDate(doc: DashboardDocument) {
  const raw = doc.date || doc.created_at;
  const [y, m, d] = raw.slice(0, 10).split("-").map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), "dd MMM yyyy") : "";
}

function PaymentLine({ doc, payment }: { doc: DashboardDocument; payment?: PaymentSummary }) {
  const total = Number(doc.grand_total ?? 0);
  const received = payment ? payment.received : doc.status === "paid" ? total : 0;
  const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  const full = received >= total && total > 0;
  const part = !full && received > 0;
  const label = full ? "Paid in full" : part ? "Advance received" : payment ? "No advance yet" : "No advance recorded yet";
  const tone = full
    ? "text-emerald-700 dark:text-emerald-400"
    : part
      ? "text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Wallet className="size-3.5" />
          Payment
        </span>
        <span className={cn("font-semibold", tone)}>{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10" aria-hidden>
        <div
          className={cn("h-full rounded-full", full ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {part && (
        <div className="flex justify-between gap-2 text-xs tabular-nums">
          <span className="text-emerald-700 dark:text-emerald-400">Received {formatIndianCurrency(received)}</span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            Pending {formatIndianCurrency(total - received)}
          </span>
        </div>
      )}
    </div>
  );
}

export function DocumentList({
  documents,
  documentType,
  query = "",
  payments,
}: DocumentListProps & { payments?: Record<string, PaymentSummary> }) {
  const words = searchWords(query);
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {words.length
          ? "Nothing matches your search. Try a shorter word, like “jali” or “sheet”."
          : `No ${documentType === "quotation" ? "quotations" : "invoices"} here yet.`}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
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
        const isInvoice = doc.type === "invoice";

        return (
          <li key={doc.id}>
            <Link
              href={`/document/${doc.id}`}
              className={cn(
                "group block rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.995] sm:p-5 dark:border-white/10 dark:bg-card",
                inactive && "opacity-60"
              )}
            >
              {/* Date and status */}
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" />
                  {invoiceDate(doc)}
                </span>
                <Badge variant="outline" className={cn(STATUS_STYLES[doc.status], "rounded-full px-2.5 text-xs font-semibold")}>
                  {STATUS_LABELS[doc.status]}
                </Badge>
              </div>

              {/* Company, branch, number, subject, address */}
              <div className="mt-3 flex gap-3">
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold",
                    avatarColor(company)
                  )}
                  aria-hidden
                >
                  {companyInitials(company)}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-heading text-base font-semibold leading-snug sm:text-lg">
                      <Highlight text={company} words={words} />
                    </p>
                    {branch && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <MapPin className="size-3" />
                        <Highlight text={branch} words={words} />
                      </span>
                    )}
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold tabular-nums">
                      <Highlight text={doc.doc_number} words={words} />
                    </span>
                    {doc.subject && (
                      <span className="text-muted-foreground">
                        {" "}· <Highlight text={doc.subject} words={words} />
                      </span>
                    )}
                  </p>
                  {addressLines.length > 0 && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {addressLines.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {itemHit && (
                <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm dark:bg-yellow-950/40">
                  <span className="text-muted-foreground">Item: </span>
                  <Highlight text={itemHit} words={words} />
                </p>
              )}

              {/* Money */}
              <div className="mt-4 space-y-3 rounded-xl bg-[#f8f9fa] p-3 dark:bg-muted/40">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Total amount</p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                        hasGst
                          ? "bg-violet-100/70 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                          : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      )}
                    >
                      {hasGst ? "Incl. 18% GST" : "No GST"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums tracking-tight text-primary",
                        inactive && "text-muted-foreground line-through"
                      )}
                    >
                      {formatIndianCurrency(doc.grand_total)}
                    </p>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
                {isInvoice && !inactive && <PaymentLine doc={doc} payment={payments?.[doc.id]} />}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
