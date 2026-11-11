"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";

import type { DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

import type { DashboardDocument } from "./SearchBar";

type Range = "month" | "year";

interface KPICardsProps {
  documents: DashboardDocument[];
  type: DocumentType;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local midnight of the document's own date (the date printed on the PDF). */
function dayOf(doc: DashboardDocument) {
  const raw = (doc.date || doc.created_at || "").slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : 0;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * One simple card: how much was billed (or quoted) this month or this financial
 * year, how many documents, and last month / last year as a plain number to compare.
 * Cancelled and replaced documents are not counted. Nothing depends on statuses.
 *
 * A second card ("To collect" for invoices, "Became invoices" for quotations)
 * will sit beside this one once payments and quotation conversion exist.
 */
export function KPICards({ documents, type }: KPICardsProps) {
  const [range, setRange] = useState<Range>("month");
  const word = type === "invoice" ? "invoice" : "quotation";

  const s = useMemo(() => {
    const docs = documents.filter((d) => d.type === type && d.status !== "void" && d.status !== "replaced");
    const now = new Date();
    let from: number, to: number, prevFrom: number, prevTo: number, label: string, prevLabel: string;
    if (range === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      prevTo = from;
      label = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
      prevLabel = `Last month (${MONTHS[new Date(prevFrom).getMonth()]})`;
    } else {
      // Financial year, April to March.
      const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      from = new Date(start, 3, 1).getTime();
      to = new Date(start + 1, 3, 1).getTime();
      prevFrom = new Date(start - 1, 3, 1).getTime();
      prevTo = from;
      label = `Apr ${start} – Mar ${start + 1}`;
      prevLabel = `Last year (${SHORT[3]} ${start - 1} – ${SHORT[2]} ${start})`;
    }
    const inRange = (a: number, b: number) => docs.filter((d) => dayOf(d) >= a && dayOf(d) < b);
    const cur = inRange(from, to);
    const prev = inRange(prevFrom, prevTo);
    const sum = (l: DashboardDocument[]) => l.reduce((t, d) => t + Number(d.grand_total ?? 0), 0);
    return { total: sum(cur), count: cur.length, prevTotal: sum(prev), prevCount: prev.length, label, prevLabel };
  }, [documents, type, range]);

  return (
    <section>
      <article className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-zinc-600 dark:text-zinc-300">
              {type === "invoice" ? "Billed" : "Quoted"}
            </p>
            {/* This month / This year */}
            <div className="flex rounded-xl border border-black/10 bg-[#f6f6f8] p-0.5 dark:border-white/10 dark:bg-white/5" role="group" aria-label="Period">
              {(["month", "year"] as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "min-h-9 rounded-[10px] px-3.5 text-sm font-medium transition-colors",
                    range === r
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  )}
                >
                  {r === "month" ? "This month" : "This year"}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-2 font-heading text-[36px] leading-tight font-bold tracking-tight tabular-nums text-zinc-900 sm:text-[40px] dark:text-zinc-50">
            {rupees(s.total)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {s.count} {s.count === 1 ? word : `${word}s`}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              <CalendarRange className="size-4" />
              {s.label}
            </span>
          </div>
        </div>

        {/* For comparison, as plain numbers */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-black/[0.06] bg-[#fafafb] px-5 py-3.5 sm:px-6 dark:border-white/10 dark:bg-white/[0.03]">
          <span className="text-sm text-zinc-500">{s.prevLabel}</span>
          <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
            <b className="font-semibold text-zinc-900 dark:text-zinc-100">{rupees(s.prevTotal)}</b>
            {" · "}
            {s.prevCount} {s.prevCount === 1 ? word : `${word}s`}
          </span>
        </div>
      </article>
    </section>
  );
}
