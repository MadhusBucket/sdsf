"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IndianRupee, MapPin, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { groupCompanies } from "@/lib/companies/grouping";
import { companyColor, companyInitials } from "@/lib/companies/colors";
import { daysSince, isActiveInvoice, periodRange, rupees, type Period } from "@/lib/ledger/compute";
import { cn } from "@/lib/utils";

import { Chip, MoneyCards, PeriodChips, ProgressBar } from "./LedgerBits";
import { RecordPaymentDialog, type PaymentStart } from "./RecordPaymentDialog";
import { useLedger } from "./useLedger";

type Filter = "pending" | "all" | "clear";
type Sort = "pending" | "oldest" | "name";

const PREFS_KEY = "ledger-prefs";

export function LedgerClient() {
  const { data, ledger, failed, reload } = useLedger();
  // The last search and filters come back (this browser tab only). Nothing shows until the
  // data loads, so reading them on first render is safe.
  const [saved] = useState<Partial<{ query: string; period: Period; filter: Filter; sort: Sort }>>(() => {
    try {
      return (typeof window !== "undefined" && JSON.parse(sessionStorage.getItem(PREFS_KEY) ?? "null")) || {};
    } catch {
      return {};
    }
  });
  const [query, setQuery] = useState(saved.query ?? "");
  const [period, setPeriod] = useState<Period>(saved.period ?? "fy");
  const [filter, setFilter] = useState<Filter>(saved.filter ?? "pending");
  const [sort, setSort] = useState<Sort>(saved.sort ?? "pending");
  const [start, setStart] = useState<PaymentStart | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFS_KEY, JSON.stringify({ query, period, filter, sort }));
    } catch {}
  }, [query, period, filter, sort]);

  const groups = useMemo(() => (data ? groupCompanies(data.companies) : []), [data]);

  const totals = useMemo(() => {
    if (!data || !ledger) return null;
    const { from, to, label } = periodRange(period);
    const inRange = (d: string) => d >= from && d <= to;
    const billed = data.invoices
      .filter((i) => isActiveInvoice(i) && inRange(i.date))
      .reduce((s, i) => s + Number(i.grand_total), 0);
    // Money recorded here, plus old bills marked "Paid" by hand (counted on their bill date).
    const received =
      data.payments
        .filter((p) => !p.voided_at && p.kind === "payment" && inRange(p.paid_on))
        .reduce((s, p) => s + Number(p.amount) + Number(p.tds), 0) +
      data.invoices
        .filter((i) => ledger.invoices.get(i.id)?.markedPaid && inRange(i.date))
        .reduce((s, i) => s + Number(i.grand_total), 0);
    let pending = 0;
    let owing = 0;
    for (const c of ledger.companies.values()) {
      pending += c.pending;
      if (c.pending > 0) owing += 1;
    }
    return { billed, received, pending, owing, label };
  }, [data, ledger, period]);

  const rows = useMemo(() => {
    if (!ledger) return [];
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = groups
      .map((g) => ({ g, s: ledger.companies.get(g.key) }))
      .filter((r): r is { g: (typeof groups)[number]; s: NonNullable<typeof r.s> } => !!r.s && r.s.billCount + r.s.received > 0)
      .filter(({ g }) =>
        words.every((w) =>
          [g.name, ...g.branches.map((b) => b.branch ?? "")].join(" ").toLowerCase().includes(w)
        )
      )
      .filter(({ s }) => (filter === "pending" ? s.pending > 0 : filter === "clear" ? s.pending <= 0 : true));
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      pending: (a, b) => b.s.pending - a.s.pending,
      oldest: (a, b) => (a.s.oldestUnpaidDate ?? "9999").localeCompare(b.s.oldestUnpaidDate ?? "9999"),
      name: (a, b) => a.g.name.localeCompare(b.g.name),
    };
    return list.sort(by[sort]);
  }, [groups, ledger, query, filter, sort]);

  if (failed) {
    return (
      <div className="rounded-[24px] bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
        The ledger could not load. Check your internet and refresh.
      </div>
    );
  }
  if (!data || !ledger || !totals) {
    return <div className="rounded-[24px] bg-white p-8 text-center text-zinc-500 ring-1 ring-black/[0.06] dark:bg-card">Loading ledger…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Ledger</h1>
          <p className="text-zinc-500">Who owes you, and how much.</p>
        </div>
        <Button
          type="button"
          className="h-12 w-full rounded-xl px-5 text-base sm:w-auto"
          disabled={!data.paymentsReady}
          onClick={() => setStart({})}
        >
          <IndianRupee className="size-5" />
          Record money received
        </Button>
      </div>

      {!data.paymentsReady && (
        <p className="rounded-[20px] bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          Payments are not switched on yet. Until then this page only shows bills.
        </p>
      )}

      <PeriodChips value={period} onChange={setPeriod} />
      <MoneyCards
        items={[
          { label: "Billed", value: totals.billed, note: totals.label },
          { label: "Received", value: totals.received, tone: "good", note: totals.label },
          {
            label: "Pending",
            value: totals.pending,
            tone: "bad",
            note: `${totals.owing} ${totals.owing === 1 ? "company owes" : "companies owe"} · as of today`,
          },
        ]}
      />

      <div className="border-t border-black/[0.08] pt-5 dark:border-white/10">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Companies</h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block sm:w-1/2">
          <Search className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company"
            aria-label="Search company"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white pr-11 pl-11 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort"
          className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-base sm:flex-1 dark:border-input dark:bg-background"
        >
          <option value="pending">Most pending first</option>
          <option value="oldest">Waiting longest</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip on={filter === "pending"} onClick={() => setFilter("pending")}>
          Has pending
        </Chip>
        <Chip on={filter === "clear"} onClick={() => setFilter("clear")}>
          Fully paid
        </Chip>
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-black/15 px-4 py-10 text-center text-zinc-500">
          {data.invoices.length === 0 ? "No invoices yet." : filter === "pending" && !query ? "Nobody owes you anything." : "No company matches."}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map(({ g, s }) => {
            const color = companyColor(g.name);
            return (
              <li key={g.key} className="min-w-0">
                <Link
                  href={`/ledger/${g.branches[0].id}`}
                  className="flex h-full flex-col gap-3 rounded-[24px] bg-white p-5 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-md dark:bg-card dark:ring-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: color.soft, color: color.text }}
                      aria-hidden
                    >
                      {companyInitials(g.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold leading-snug">{g.name}</p>
                      {g.branches.length > 1 && (
                        <p className="flex items-center gap-1 text-sm text-zinc-500">
                          <MapPin className="size-3.5" />
                          {g.branches.length} branches
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        s.pending > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      )}
                    >
                      {s.pending > 0 ? "Pending" : "All paid"}
                    </span>
                  </div>
                  <ProgressBar total={s.billed} done={s.billed - s.pending} />
                  <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <span className="text-zinc-500">
                      Billed<b className="block text-base text-foreground">{rupees(s.billed)}</b>
                    </span>
                    <span className="text-zinc-500">
                      Received<b className="block text-base text-emerald-700 dark:text-emerald-400">{rupees(s.received)}</b>
                    </span>
                    <span className="text-zinc-500">
                      Pending
                      <b className="block text-base text-foreground">
                        {rupees(s.pending)}
                      </b>
                    </span>
                  </div>
                  {(s.oldestUnpaidDate || s.extra > 0) && (
                    <div className="border-t border-dashed border-black/10 pt-3 text-sm dark:border-white/10">
                      {s.oldestUnpaidDate && (
                        <p className="text-zinc-500">Oldest unpaid bill: {daysSince(s.oldestUnpaidDate)} days ago</p>
                      )}
                      {s.extra > 0 && (
                        <p className="text-emerald-700 dark:text-emerald-400">
                          {rupees(s.extra)} extra received, adjusts in the next bill
                        </p>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <RecordPaymentDialog start={start} data={data} ledger={ledger} onClose={() => setStart(null)} onSaved={reload} />
    </div>
  );
}
