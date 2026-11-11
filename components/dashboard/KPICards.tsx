"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { Payment } from "@/lib/ledger/types";
import type { DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

import type { DashboardDocument } from "./SearchBar";

export type DashPeriod = "today" | "week" | "month" | "year";

const PERIODS: { value: DashPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

interface KPICardsProps {
  documents: DashboardDocument[];
  type: DocumentType;
  /** Pending worked out from recorded payments (all bills, as of today). */
  pending?: { amount: number; count: number };
  /** Recorded payments; null until the payments table is set up. */
  payments?: Payment[] | null;
  /** Quotation id → invoice numbers made from it. */
  madeInto?: Record<string, string[]>;
  period: DashPeriod;
  onPeriodChange: (p: DashPeriod) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LINE = "#7c5cf2"; // purple from the inspiration

/* ---------- Dates as YYYY-MM-DD in local time ---------- */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const docDay = (doc: DashboardDocument) => (doc.date || doc.created_at || "").slice(0, 10);

interface Range {
  from: string;
  to: string;
}

/** The chosen period, the same stretch just before it (for up/down), and the graph buckets. */
function periodInfo(period: DashPeriod, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  let current: Range;
  let previous: Range;
  let label: string;
  let compare: string;
  let buckets: { label: string; range: Range }[];

  if (period === "today") {
    current = { from: iso(today), to: iso(today) };
    previous = { from: iso(addDays(today, -1)), to: iso(addDays(today, -1)) };
    label = `Today, ${dayMonth(today)}`;
    compare = "vs yesterday";
  } else if (period === "week") {
    current = { from: iso(addDays(today, -6)), to: iso(today) };
    previous = { from: iso(addDays(today, -13)), to: iso(addDays(today, -7)) };
    label = `${dayMonth(addDays(today, -6))} – ${dayMonth(today)}`;
    compare = "vs the 7 days before";
  } else if (period === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const prevSameDay = new Date(prevFirst.getFullYear(), prevFirst.getMonth(), Math.min(today.getDate(), prevLastDay));
    current = { from: iso(first), to: iso(today) };
    previous = { from: iso(prevFirst), to: iso(prevSameDay) };
    label = `${MONTHS[today.getMonth()]} ${today.getFullYear()} (1–${today.getDate()})`;
    compare = `vs 1–${prevSameDay.getDate()} ${MONTHS[prevFirst.getMonth()]}`;
  } else {
    const fyStart = new Date(fyStartYear, 3, 1);
    const prevStart = new Date(fyStartYear - 1, 3, 1);
    const prevSame = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    current = { from: iso(fyStart), to: iso(today) };
    previous = { from: iso(prevStart), to: iso(prevSame) };
    label = `Apr ${fyStartYear} – today`;
    compare = "vs same time last year";
  }

  if (period === "today" || period === "week") {
    buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { label: i === 6 ? "Today" : dayMonth(d), range: { from: iso(d), to: iso(d) } };
    });
  } else if (period === "month") {
    buckets = Array.from({ length: today.getDate() }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), i + 1);
      return { label: String(i + 1), range: { from: iso(d), to: iso(d) } };
    });
  } else {
    const months = (today.getFullYear() - fyStartYear) * 12 + today.getMonth() - 3 + 1;
    buckets = Array.from({ length: months }, (_, i) => {
      const start = new Date(fyStartYear, 3 + i, 1);
      const end = new Date(fyStartYear, 4 + i, 0);
      return { label: MONTHS[start.getMonth()], range: { from: iso(start), to: iso(end) } };
    });
  }
  return { current, previous, label, compare, buckets };
}

const inRange = (day: string, r: Range) => day >= r.from && day <= r.to;
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
 * Dashboard numbers for the chosen period: billed (or quoted) with up/down against the same
 * stretch before, money received, what is pending today, and a graph.
 * Cancelled and replaced documents are never counted.
 */
export function KPICards({ documents, type, pending, payments, madeInto, period, onPeriodChange }: KPICardsProps) {
  const isInvoice = type === "invoice";
  const word = isInvoice ? "invoice" : "quotation";

  const s = useMemo(() => {
    const info = periodInfo(period, new Date());
    const docs = documents.filter((d) => d.type === type && d.status !== "void" && d.status !== "replaced");
    const sum = (r: Range) => docs.filter((d) => inRange(docDay(d), r)).reduce((t, d) => t + Number(d.grand_total ?? 0), 0);
    const inPeriod = docs.filter((d) => inRange(docDay(d), info.current));
    const current = sum(info.current);
    const previous = sum(info.previous);
    const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
    const totals = info.buckets.map((b) => sum(b.range));

    const received = payments
      ? payments
          .filter((p) => !p.voided_at && p.kind === "payment" && inRange(p.paid_on, info.current))
          .reduce((t, p) => t + Number(p.amount) + Number(p.tds), 0)
      : null;
    const receivedCount = payments
      ? payments.filter((p) => !p.voided_at && p.kind === "payment" && inRange(p.paid_on, info.current)).length
      : 0;

    // Without the ledger: invoices not marked Paid (all time).
    const notPaid = docs.filter((d) => d.status !== "paid");
    const made = inPeriod.filter((d) => madeInto?.[d.id]?.length).length;

    return {
      ...info,
      current,
      count: inPeriod.length,
      change,
      totals,
      received,
      receivedCount,
      fallbackPending: notPaid.reduce((t, d) => t + Number(d.grand_total ?? 0), 0),
      fallbackPendingCount: notPaid.length,
      made,
    };
  }, [documents, type, payments, madeInto, period]);

  const [active, setActive] = useState<number | null>(null);
  const n = s.totals.length;
  const last = n - 1;
  const shown = active !== null && active < n ? active : last;

  const step = niceStep(Math.max(...s.totals));
  const top = step * 4;
  const xs = s.totals.map((_, i) => (n === 1 ? 50 : (i / last) * 100));
  const ys = s.totals.map((v) => 100 - (v / top) * 100);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)},${ys[i].toFixed(2)}`).join(" ");
  const area = `${line} L${xs[last]},100 L${xs[0]},100 Z`;
  // On a phone, show fewer x labels when there are many points.
  const every = n > 14 ? 5 : n > 8 ? 2 : 1;

  const pendingAmount = pending ? pending.amount : s.fallbackPending;
  const pendingCount = pending ? pending.count : s.fallbackPendingCount;

  return (
    <section className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card">
      {/* Period */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => {
                setActive(null);
                onPeriodChange(p.value);
              }}
              className={cn(
                "min-h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
                period === p.value
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-500">{s.label}</p>
      </div>

      {/* Numbers */}
      <div
        className={cn(
          "m-2 grid grid-cols-1 gap-4 rounded-[18px] bg-[#f6f5fb] p-4 sm:p-5 dark:bg-white/5",
          isInvoice ? "sm:grid-cols-3" : "sm:grid-cols-2"
        )}
      >
        <div>
          <p className="text-sm text-zinc-500">{isInvoice ? "Billed" : "Quoted"}</p>
          <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
            {rupees(s.current)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {s.change !== null ? (
              <span className={cn("inline-flex items-center gap-1 font-semibold", s.change >= 0 ? "text-emerald-600" : "text-red-600")}>
                <span className={cn("grid size-5 place-items-center rounded-full text-white", s.change >= 0 ? "bg-emerald-500" : "bg-red-500")}>
                  {s.change >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                </span>
                {Math.abs(s.change).toFixed(0)}%
              </span>
            ) : null}
            <span className="text-zinc-500">
              {s.change !== null ? s.compare : "Nothing to compare with"} · {s.count} {s.count === 1 ? word : `${word}s`}
            </span>
          </div>
        </div>

        {isInvoice ? (
          <>
            <div className="sm:border-l sm:border-black/[0.06] sm:pl-5 dark:sm:border-white/10">
              <p className="text-sm text-zinc-500">Received</p>
              <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
                {s.received === null ? "—" : rupees(s.received)}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {s.received === null
                  ? "Shows once payments are switched on"
                  : `${s.receivedCount} ${s.receivedCount === 1 ? "payment" : "payments"} in this period`}
              </p>
            </div>
            <div className="sm:border-l sm:border-black/[0.06] sm:pl-5 dark:sm:border-white/10">
              <p className="text-sm text-zinc-500">Pending today</p>
              <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-amber-600">
                {rupees(pendingAmount)}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {pending
                  ? `${pendingCount} ${pendingCount === 1 ? "bill" : "bills"} to collect · all time`
                  : `${pendingCount} ${pendingCount === 1 ? "invoice" : "invoices"} not marked paid · all time`}
              </p>
            </div>
          </>
        ) : (
          <div className="sm:border-l sm:border-black/[0.06] sm:pl-5 dark:sm:border-white/10">
            <p className="text-sm text-zinc-500">Made into invoices</p>
            <p className="font-heading text-[30px] leading-tight font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
              {s.made} <span className="text-lg font-semibold text-zinc-400">of {s.count}</span>
            </p>
            <p className="mt-1 text-sm text-zinc-500">Quotations from this period that became invoices</p>
          </div>
        )}
      </div>

      {/* Graph */}
      <div className="px-4 pt-3 pb-4 sm:px-6">
        <p className="mb-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {isInvoice ? "Billed" : "Quoted"} {period === "year" ? "each month" : "each day"}
        </p>
        <div className="flex gap-2">
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
              aria-label={`${isInvoice ? "Billed" : "Quoted"} ${period === "year" ? "each month" : "each day"}`}
            >
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
                {n > 1 && <path d={area} fill={`url(#fill-${type})`} />}
                {n > 1 && (
                  <path d={line} fill="none" stroke={LINE} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                )}
              </svg>
              <div
                className="absolute bottom-0 border-l-2 border-dashed"
                style={{ left: `${xs[shown]}%`, top: `${ys[shown]}%`, borderColor: `${LINE}55` }}
              />
              {xs.map((x, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-label={`${s.buckets[i].label}: ${rupees(s.totals[i])}`}
                  className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
                  style={{ left: `${x}%`, top: `${ys[i]}%` }}
                >
                  <span
                    className={cn("rounded-full border-2 bg-white transition-all", i === shown ? "size-4 ring-4" : n > 14 ? "size-1.5" : "size-2.5")}
                    style={{ borderColor: LINE, ["--tw-ring-color" as string]: `${LINE}33` }}
                  />
                </button>
              ))}
              <div
                className="pointer-events-none absolute z-10 rounded-full border border-black/10 bg-white px-3 py-1 text-xs whitespace-nowrap shadow-sm dark:bg-zinc-800"
                style={{
                  top: `${ys[shown]}%`,
                  left: `${xs[shown]}%`,
                  transform: `translate(${xs[shown] > 75 ? "-100%" : xs[shown] < 25 ? "0%" : "-50%"}, calc(-100% - 14px))`,
                }}
              >
                <span className="text-zinc-500">
                  {period === "month" ? `${s.buckets[shown].label} ${MONTHS[new Date().getMonth()]}` : s.buckets[shown].label}
                </span>{" "}
                <b className="tabular-nums text-zinc-900 dark:text-zinc-50">{rupees(s.totals[shown])}</b>
              </div>
            </div>

            <div className="relative mt-2 h-4 text-[11px] text-zinc-400">
              {s.buckets.map((b, i) => (
                <span
                  key={b.range.from}
                  className={cn(
                    "absolute -translate-x-1/2 whitespace-nowrap",
                    i === shown && "font-semibold text-zinc-900 dark:text-zinc-50",
                    i !== shown && i !== last && i % every !== 0 && "hidden",
                    i !== shown && i !== last && i % (every * 2) !== 0 && "max-sm:hidden"
                  )}
                  style={{ left: `${xs[i]}%` }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
