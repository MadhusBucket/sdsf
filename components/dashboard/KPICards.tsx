"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

import type { DashboardDocument } from "./SearchBar";

interface KPICardsProps {
  documents: DashboardDocument[];
  type: DocumentType;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LINE = "#7c5cf2"; // purple from the inspiration

/** Month index (year*12 + month) of the document's own date. */
function monthOf(doc: DashboardDocument) {
  const raw = (doc.date || doc.created_at || "").slice(0, 7);
  const [y, m] = raw.split("-").map(Number);
  return y && m ? y * 12 + (m - 1) : -1;
}

/** Day of month (1–31) of the document's own date. */
function dayOfMonth(doc: DashboardDocument) {
  return Number((doc.date || doc.created_at || "").slice(8, 10)) || 0;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Short money for chart labels: ₹50K, ₹1.5L, ₹2Cr. */
function short(n: number) {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}K`;
  return `₹${Math.round(n)}`;
}

/** A round step for the chart's guide lines (₹25K, ₹50K, ₹1L, ₹2L, ...). */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/**
 * Earnings card: this month's total with up/down against last month,
 * what is still pending (invoices), and a 12-month line graph.
 * Cancelled and replaced documents are never counted.
 */
export function KPICards({ documents, type }: KPICardsProps) {
  const isInvoice = type === "invoice";
  const word = isInvoice ? "invoice" : "quotation";

  const s = useMemo(() => {
    const docs = documents.filter((d) => d.type === type && d.status !== "void" && d.status !== "replaced");
    const now = new Date();
    const thisMonth = now.getFullYear() * 12 + now.getMonth();
    const months = Array.from({ length: 12 }, (_, i) => thisMonth - 11 + i);
    const totals = months.map((m) =>
      docs.filter((d) => monthOf(d) === m).reduce((t, d) => t + Number(d.grand_total ?? 0), 0)
    );
    const counts = months.map((m) => docs.filter((d) => monthOf(d) === m).length);
    const current = totals[11];
    // Fair comparison: this month so far vs the same days of last month (e.g. 1–11 Nov vs 1–11 Oct).
    const today = now.getDate();
    const previous = docs
      .filter((d) => monthOf(d) === thisMonth - 1 && dayOfMonth(d) <= today)
      .reduce((t, d) => t + Number(d.grand_total ?? 0), 0);
    const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
    const lastMonthName = MONTHS[(thisMonth - 1) % 12];
    const compareLabel = `vs 1–${Math.min(today, 31)} ${lastMonthName}`;
    // Pending: invoices not marked Paid. Becomes exact once payments are recorded in the ledger.
    const pendingDocs = docs.filter((d) => d.status !== "paid");
    const pending = pendingDocs.reduce((t, d) => t + Number(d.grand_total ?? 0), 0);
    return { months, totals, counts, current, previous, change, compareLabel, pending, pendingCount: pendingDocs.length };
  }, [documents, type]);

  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? 11;

  const step = niceStep(Math.max(...s.totals));
  const top = step * 4;
  const xs = s.totals.map((_, i) => (i / 11) * 100);
  const ys = s.totals.map((v) => 100 - (v / top) * 100);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)},${ys[i].toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  const label = (m: number) => MONTHS[m % 12];

  return (
    <section className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card">
      {/* Numbers */}
      <div className="m-2 grid grid-cols-1 gap-2 rounded-[18px] bg-[#f6f5fb] p-4 sm:grid-cols-2 sm:p-5 dark:bg-white/5">
        <div>
          <p className="text-sm text-zinc-500">{isInvoice ? "Billed this month" : "Quoted this month"}</p>
          <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
            {rupees(s.current)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {s.change !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  s.change >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-white",
                    s.change >= 0 ? "bg-emerald-500" : "bg-red-500"
                  )}
                >
                  {s.change >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                </span>
                {Math.abs(s.change).toFixed(0)}%
              </span>
            ) : null}
            <span className="text-zinc-500">
              {s.change !== null ? s.compareLabel : "Nothing in the same days last month"} ·{" "}
              {s.counts[11]} {s.counts[11] === 1 ? word : `${word}s`}
            </span>
          </div>
        </div>
        {isInvoice && (
          <div className="sm:border-l sm:border-black/[0.06] sm:pl-5 dark:sm:border-white/10">
            <p className="text-sm text-zinc-500">Pending</p>
            <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-amber-600">
              {rupees(s.pending)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {s.pendingCount} {s.pendingCount === 1 ? "invoice" : "invoices"} not marked paid
            </p>
          </div>
        )}
      </div>

      {/* 12-month graph */}
      <div className="px-4 pt-3 pb-4 sm:px-6">
        <p className="mb-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {isInvoice ? "Billed" : "Quoted"} each month
        </p>
        <div className="flex gap-2">
          {/* Y axis */}
          <div className="relative h-44 w-11 shrink-0 text-right text-[11px] text-zinc-400 tabular-nums">
            {[4, 3, 2, 1, 0].map((k) => (
              <span key={k} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - k * 25}%` }}>
                {short(step * k)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="relative h-44"
              onMouseLeave={() => setActive(null)}
              role="img"
              aria-label={`${isInvoice ? "Billed" : "Quoted"} each month for the last 12 months`}
            >
              {/* Guide lines */}
              {[0, 1, 2, 3, 4].map((k) => (
                <div
                  key={k}
                  className="absolute inset-x-0 border-t border-dashed border-black/[0.08] dark:border-white/10"
                  style={{ top: `${k * 25}%` }}
                />
              ))}
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                <defs>
                  <linearGradient id={`fill-${type}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={LINE} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={LINE} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill={`url(#fill-${type})`} />
                <path d={line} fill="none" stroke={LINE} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {/* Dashed line under the selected month */}
              <div
                className="absolute bottom-0 border-l-2 border-dashed"
                style={{ left: `${xs[shown]}%`, top: `${ys[shown]}%`, borderColor: `${LINE}55` }}
              />
              {/* Points: tap or hover to see a month */}
              {xs.map((x, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-label={`${label(s.months[i])}: ${rupees(s.totals[i])}`}
                  className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
                  style={{ left: `${x}%`, top: `${ys[i]}%` }}
                >
                  <span
                    className={cn(
                      "rounded-full border-2 bg-white transition-all",
                      i === shown ? "size-4 ring-4" : "size-2.5"
                    )}
                    style={{ borderColor: LINE, ["--tw-ring-color" as string]: `${LINE}33` }}
                  />
                </button>
              ))}
              {/* Value bubble */}
              <div
                className="pointer-events-none absolute z-10 rounded-full border border-black/10 bg-white px-3 py-1 text-xs whitespace-nowrap shadow-sm dark:bg-zinc-800"
                style={{
                  top: `${ys[shown]}%`,
                  left: `${xs[shown]}%`,
                  transform: `translate(${shown > 8 ? "-100%" : shown < 3 ? "0%" : "-50%"}, calc(-100% - 14px))`,
                }}
              >
                <span className="text-zinc-500">{label(s.months[shown])}</span>{" "}
                <b className="tabular-nums text-zinc-900 dark:text-zinc-50">{rupees(s.totals[shown])}</b>
              </div>
            </div>

            {/* X axis */}
            <div className="relative mt-2 h-4 text-[11px] text-zinc-400">
              {s.months.map((m, i) => (
                <span
                  key={m}
                  className={cn(
                    "absolute -translate-x-1/2",
                    i === shown && "font-semibold text-zinc-900 dark:text-zinc-50",
                    i % 2 === 1 && i !== shown && i !== 11 && "max-sm:hidden"
                  )}
                  style={{ left: `${xs[i]}%` }}
                >
                  {label(m)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
