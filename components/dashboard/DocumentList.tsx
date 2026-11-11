"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, Check, ChevronRight, Clock3, MapPin, Wallet } from "lucide-react";

import type { DocumentStatus } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
import { companyColor, companyInitials } from "@/lib/companies/colors";

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

/** "06 Nov 2026" from the document's own date (the date printed on the PDF). */
function invoiceDate(doc: DashboardDocument) {
  const raw = doc.date || doc.created_at;
  const [y, m, d] = raw.slice(0, 10).split("-").map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), "dd MMM yyyy") : "";
}

// Status pill: colored dot + label, like the legend dots in the inspiration.
const STATUS_DOT: Record<DocumentStatus, string> = {
  draft: "bg-zinc-400",
  sent: "bg-[#5b8def]",
  paid: "bg-[#8cc63f]",
  void: "bg-red-400",
  replaced: "bg-[#b98cf0]",
};

// Thin ticks of fixed width, so the bar looks the same on a phone and a laptop.
const ticks = (color: string) => `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 8px)`;

/** Tick bar from the inspiration: filled ticks = money received, light ticks = still pending. */
function PaymentTicks({ pct, tone }: { pct: number; tone: "full" | "part" | "none" }) {
  const on = tone === "full" ? "#8cc63f" : "#f2c94c";
  return (
    <div
      className="relative h-7 w-full overflow-hidden [--tick-off:rgba(0,0,0,0.08)] dark:[--tick-off:rgba(255,255,255,0.12)]"
      aria-hidden
    >
      <div className="absolute inset-0" style={{ background: ticks("var(--tick-off)") }} />
      <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: ticks(on) }} />
    </div>
  );
}

function Chip({ icon, children, className }: { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#f6f6f8] px-3 py-1 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
        className
      )}
    >
      {icon}
      {children}
    </span>
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
      <div className="rounded-[28px] border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {words.length
          ? "Nothing matches your search. Try a shorter word, like “jali” or “sheet”."
          : `No ${documentType === "quotation" ? "quotations" : "invoices"} here yet.`}
      </div>
    );
  }

  return (
    <ul className="space-y-4">
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
        const showPayment = doc.type === "invoice" && !inactive;
        const color = companyColor(company);

        // Payment: real numbers come from the ledger later; until then Paid = full, otherwise nothing recorded.
        const total = Number(doc.grand_total ?? 0);
        const known = payments?.[doc.id];
        const received = known ? known.received : doc.status === "paid" ? total : 0;
        const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
        const tone: "full" | "part" | "none" = received >= total && total > 0 ? "full" : received > 0 ? "part" : "none";

        return (
          <li key={doc.id}>
            <Link
              href={`/document/${doc.id}`}
              className={cn(
                "group block rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)] transition-all hover:shadow-[0_6px_24px_rgba(16,24,40,0.08)] active:scale-[0.995] sm:p-6 dark:border-white/10 dark:bg-card",
                inactive && "opacity-60"
              )}
            >
              {/* Date and status */}
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <CalendarDays className="size-4" />
                  {invoiceDate(doc)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#f6f6f8] px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                  <span className={cn("size-2 rounded-full", STATUS_DOT[doc.status])} />
                  {STATUS_LABELS[doc.status]}
                </span>
              </div>

              {/* Company, then branch · invoice number on one row */}
              <div className="mt-4 flex items-center gap-3.5">
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-full text-base font-bold"
                  style={{ backgroundColor: color.soft, color: color.text }}
                  aria-hidden
                >
                  {companyInitials(company)}
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                    <Highlight text={company} words={words} />
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-zinc-500">
                    {branch && (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5 shrink-0" />
                          <Highlight text={branch} words={words} />
                        </span>
                        <span aria-hidden className="text-zinc-300">•</span>
                      </>
                    )}
                    <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                      <Highlight text={doc.doc_number} words={words} />
                    </span>
                  </p>
                </div>
              </div>

              {/* Subject and address */}
              {(doc.subject || addressLines.length > 0) && (
                <div className="mt-4 space-y-1">
                  {doc.subject && (
                    <p className="text-[15px] leading-snug font-medium text-zinc-800 dark:text-zinc-100">
                      <Highlight text={doc.subject} words={words} />
                    </p>
                  )}
                  {addressLines.length > 0 && (
                    <p className="text-xs leading-relaxed text-zinc-500">{addressLines.join(", ")}</p>
                  )}
                </div>
              )}

              {itemHit && (
                <p className="mt-3 rounded-2xl bg-[#fdf6dc] px-3.5 py-2 text-sm dark:bg-yellow-950/40">
                  <span className="text-zinc-500">Item: </span>
                  <Highlight text={itemHit} words={words} />
                </p>
              )}

              {/* Divider between who/what and the money */}
              <div className="mt-5 border-t border-dashed border-black/10 dark:border-white/10" />

              {/* Total */}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-500">Total amount</p>
                  <p
                    className={cn(
                      "font-heading text-[28px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50",
                      inactive && "text-zinc-400 line-through"
                    )}
                  >
                    {formatIndianCurrency(doc.grand_total)}
                  </p>
                </div>
                <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/15 dark:text-zinc-200">
                  <span className={cn("size-2 rounded-full", hasGst ? "bg-[#b98cf0]" : "bg-zinc-300")} />
                  {hasGst ? "Incl. 18% GST" : "No GST"}
                </span>
              </div>

              {/* Payment (invoices only) */}
              {showPayment && (
                <div className="mt-4 space-y-3">
                  <PaymentTicks pct={pct} tone={tone} />
                  <div className="flex flex-wrap items-center gap-2">
                    {tone === "none" ? (
                      <Chip icon={<Wallet className="size-3.5" />}>No advance recorded yet</Chip>
                    ) : (
                      <>
                        <Chip icon={<Check className="size-3.5 text-[#5c8a12]" />}>
                          Received {formatIndianCurrency(received)}
                        </Chip>
                        {tone === "part" && (
                          <Chip icon={<Clock3 className="size-3.5 text-[#a17a05]" />}>
                            Pending {formatIndianCurrency(total - received)}
                          </Chip>
                        )}
                        {tone === "full" && <Chip>Paid in full</Chip>}
                      </>
                    )}
                    <ChevronRight className="ml-auto size-5 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              )}
              {!showPayment && (
                <div className="mt-3 flex justify-end">
                  <ChevronRight className="size-5 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
