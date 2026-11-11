"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { companyColor } from "@/lib/companies/colors";
import { companyKey } from "@/lib/companies/grouping";
import type { DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

import type { DashboardDocument } from "./SearchBar";

export type KpiPeriod = "today" | "7days" | "30days" | "all";

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  today: "Today",
  "7days": "Last 7 days",
  "30days": "Last 30 days",
  all: "All time",
};
const PERIOD_COMPARE: Record<KpiPeriod, string> = {
  today: "vs yesterday",
  "7days": "vs previous 7 days",
  "30days": "vs previous 30 days",
  all: "",
};

interface KPICardsProps {
  documents: DashboardDocument[];
  type: DocumentType;
  period: KpiPeriod;
  onPeriodChange: (p: KpiPeriod) => void;
}

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local midnight of the document's own date. */
function dayOf(doc: DashboardDocument) {
  const raw = (doc.date || doc.created_at || "").slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : 0;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const shortDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * The two analytics cards at the top of Invoices / Quotations.
 * Counts every document except cancelled and replaced ones; nothing depends on statuses.
 */
export function KPICards({ documents, type, period, onPeriodChange }: KPICardsProps) {
  const word = type === "invoice" ? "invoice" : "quotation";

  const stats = useMemo(() => {
    const docs = documents.filter(
      (d) => d.type === type && d.status !== "void" && d.status !== "replaced" && dayOf(d) > 0
    );
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const span = period === "today" ? 1 : period === "7days" ? 7 : period === "30days" ? 30 : 0;
    const from = span ? today - (span - 1) * DAY : Math.min(today, ...docs.map(dayOf));
    const current = docs.filter((d) => dayOf(d) >= from);
    const previous = span
      ? docs.filter((d) => dayOf(d) >= from - span * DAY && dayOf(d) < from)
      : [];

    const sum = (list: DashboardDocument[]) => list.reduce((s, d) => s + Number(d.grand_total ?? 0), 0);
    const total = sum(current);
    const prevTotal = sum(previous);
    const change = span && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
    const countChange = span && previous.length > 0 ? current.length - previous.length : null;

    // Share of the total by company (all branches together), biggest first.
    const byCompany = new Map<string, { name: string; amount: number }>();
    for (const d of current) {
      const name = d.companies?.name ?? "Unknown company";
      const key = companyKey(name);
      const entry = byCompany.get(key) ?? { name, amount: 0 };
      entry.amount += Number(d.grand_total ?? 0);
      byCompany.set(key, entry);
    }
    const ranked = [...byCompany.values()].sort((a, b) => b.amount - a.amount);
    const top = ranked.slice(0, 5).map((c) => ({ ...c, color: companyColor(c.name).solid }));
    const othersAmount = ranked.slice(5).reduce((s, c) => s + c.amount, 0);
    const segments = othersAmount > 0 ? [...top, { name: "Others", amount: othersAmount, color: "#c9ced6" }] : top;

    // Little chart: running total of what was billed, day by day (month by month for "All time").
    const perStep: number[] = [];
    const buckets = perStep;
    if (period === "all") {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      for (let i = 0; i < 12; i++) {
        const a = new Date(start.getFullYear(), start.getMonth() + i, 1).getTime();
        const b = new Date(start.getFullYear(), start.getMonth() + i + 1, 1).getTime();
        buckets.push(sum(docs.filter((d) => dayOf(d) >= a && dayOf(d) < b)));
      }
    } else {
      const days = Math.max(span, 7);
      for (let i = days - 1; i >= 0; i--) {
        const t = today - i * DAY;
        buckets.push(sum(docs.filter((d) => dayOf(d) === t)));
      }
    }

    for (let i = 1; i < perStep.length; i++) perStep[i] += perStep[i - 1];

    return {
      total,
      count: current.length,
      change,
      countChange,
      average: current.length ? total / current.length : 0,
      withGst: current.filter((d) => (d.cgst_amount ?? 0) > 0 || (d.sgst_amount ?? 0) > 0 ||
        Number(d.grand_total ?? 0) - Number(d.subtotal ?? 0) - Number(d.round_off ?? 0) > 0).length,
      from: current.length || span ? from : today,
      to: today,
      segments,
      buckets,
    };
  }, [documents, type, period]);

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Card 1: money billed, split by company */}
      <article className="rounded-[24px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 pt-1.5 text-[15px] font-medium whitespace-nowrap text-zinc-600 dark:text-zinc-300">
            {type === "invoice" ? "Total invoiced" : "Total quoted"}
            <Info
              className="size-4 text-zinc-300"
              aria-label="Adds up every document except cancelled and replaced ones"
            />
          </p>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as KpiPeriod)}>
            <SelectTrigger className="h-9 w-auto shrink-0 gap-1.5 rounded-xl border-black/10 px-3 text-sm font-medium shadow-none" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as KpiPeriod[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="font-heading text-[32px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
            {rupees(stats.total)}
          </p>
          {stats.change !== null && (
            <p className="text-sm text-zinc-500">
              <span className={cn("font-semibold", stats.change >= 0 ? "text-emerald-600" : "text-red-600")}>
                {stats.change >= 0 ? "+" : ""}
                {stats.change.toFixed(1)}%
              </span>{" "}
              {PERIOD_COMPARE[period]}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-between text-xs text-zinc-400">
          <span>{shortDate(stats.from)}</span>
          <span>{shortDate(stats.to)}</span>
        </div>
        {stats.segments.length === 0 ? (
          <div className="mt-2 grid h-12 place-items-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-white/5">
            No {word}s in this period
          </div>
        ) : (
          <>
            <div className="mt-2 flex h-12 gap-1.5" role="img" aria-label="Share by company">
              {stats.segments.map((s) => (
                <div
                  key={s.name}
                  title={`${s.name}: ${rupees(s.amount)}`}
                  className="min-w-2 rounded-md"
                  style={{ flexGrow: s.amount, flexBasis: 0, backgroundColor: s.color }}
                />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {stats.segments.map((s) => (
                <li key={s.name} className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-zinc-700 dark:text-zinc-200">{s.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-zinc-500">{rupees(s.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>

      {/* Card 2: how many, trend, average */}
      <article className="flex flex-col overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card">
        <div className="p-5 pb-4">
          <p className="flex items-center gap-1.5 text-[15px] font-medium text-zinc-600 dark:text-zinc-300">
            Number of {word}s
            <Info className="size-4 text-zinc-300" aria-label="Cancelled and replaced ones are not counted" />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-heading text-[32px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
              {stats.count}
            </p>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {PERIOD_LABELS[period]}
            </span>
            {stats.countChange !== null && stats.countChange !== 0 && (
              <span className="text-sm text-zinc-500">
                <span className={cn("font-semibold", stats.countChange > 0 ? "text-emerald-600" : "text-red-600")}>
                  {stats.countChange > 0 ? "+" : ""}
                  {stats.countChange}
                </span>{" "}
                {PERIOD_COMPARE[period]}
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-[3fr_2fr] border-t border-black/[0.06] dark:border-white/10">
          <Sparkline
            values={stats.buckets}
            label={period === "all" ? "Total billed, building up over the last 12 months" : "Total billed, building up day by day"}
          />
          <div className="flex flex-col justify-center gap-0.5 px-4 py-4">
            <p className="font-heading text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {rupees(stats.average)}
            </p>
            <p className="text-sm text-zinc-500">average per {word}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {stats.withGst} of {stats.count} with GST
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}

/** Small area chart in the inspiration's orange, ending in a vertical "today" line. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const n = Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [(i / n) * 100, 36 - (v / max) * 30] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L100,40 L0,40 Z`;
  return (
    <div className="relative h-28 border-r-2 border-[#f26b1d]" role="img" aria-label={label}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d={area} fill="#fdebe0" />
        <path d={line} fill="none" stroke="#f26b1d" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
