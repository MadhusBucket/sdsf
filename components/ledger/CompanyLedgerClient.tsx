"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, IndianRupee } from "lucide-react";

import { Button } from "@/components/ui/button";
import { branchLabel, companyKey, groupCompanies } from "@/lib/companies/grouping";
import { companyColor, companyInitials } from "@/lib/companies/colors";
import {
  companyEntries,
  formatDay,
  isActiveInvoice,
  paymentCompanyId,
  periodRange,
  rupees,
  todayISO,
  type Period,
} from "@/lib/ledger/compute";
import type { Payment } from "@/lib/ledger/types";
import { cn } from "@/lib/utils";

import { BillsSection, billStatus, type BillRow } from "./BillsSection";
import { MoneyCards, PeriodChips, RemovePaymentDialog } from "./LedgerBits";
import { RecordPaymentDialog, type PaymentStart } from "./RecordPaymentDialog";
import { useLedger } from "./useLedger";

const cardClass =
  "rounded-[24px] bg-white p-5 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:bg-card dark:ring-white/10";

/** One company (all its branches): unpaid bills, and every bill and payment with a running balance. */
export function CompanyLedgerClient({
  companyId,
  business,
}: {
  companyId: string;
  business: { name: string; address: string; gstin: string; phone: string };
}) {
  const { data, ledger, failed, reload } = useLedger();
  const [period, setPeriod] = useState<Period>("fy");
  const [start, setStart] = useState<PaymentStart | null>(null);
  const [removing, setRemoving] = useState<Payment | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const anchor = data.companies.find((c) => c.id === companyId);
    if (!anchor) return { missing: true as const };
    const key = companyKey(anchor.name);
    const branches = data.companies.filter((c) => companyKey(c.name) === key);
    const ids = new Set(branches.map((b) => b.id));
    const invoices = data.invoices.filter((i) => ids.has(i.company_id));
    const invoiceCompany = new Map(data.invoices.map((i) => [i.id, i.company_id]));
    const payments = data.payments.filter((p) => ids.has(paymentCompanyId(p, invoiceCompany)));
    // Same spelling as the Ledger list (the one used most often across branches).
    const name = groupCompanies(branches)[0]?.name ?? anchor.name;
    return { missing: false as const, key, anchor, name, branches, invoices, payments };
  }, [data, companyId]);

  const entries = useMemo(
    () => (view && !view.missing ? companyEntries(view.invoices, view.payments, period) : null),
    [view, period]
  );
  const fullStatement = useMemo(
    () => (view && !view.missing ? companyEntries(view.invoices, view.payments, "all") : null),
    [view]
  );

  if (failed) {
    return <div className="rounded-[24px] bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">The ledger could not load. Check your internet and refresh.</div>;
  }
  if (!data || !ledger || !view) {
    return <div className={cn(cardClass, "text-center text-zinc-500")}>Loading…</div>;
  }
  if (view.missing || !entries || !fullStatement) {
    return <div className={cn(cardClass, "text-center text-zinc-500")}>Company not found.</div>;
  }

  const { key, anchor, name, branches } = view;
  const many = branches.length > 1;
  const branchOf = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return many && b ? branchLabel(b) : "";
  };
  const s = ledger.companies.get(key) ?? { billed: 0, received: 0, writtenOff: 0, pending: 0, extra: 0, billCount: 0, oldestUnpaidDate: null, lastActivity: null };
  const billRows: BillRow[] = view.invoices
    .filter(isActiveInvoice)
    .map((inv) => ({ inv, bal: ledger.invoices.get(inv.id) }))
    .filter((x): x is { inv: typeof x.inv; bal: NonNullable<typeof x.bal> } => !!x.bal)
    .map(({ inv, bal }) => {
      const b = branches.find((x) => x.id === inv.company_id);
      return {
        inv,
        bal,
        // Landmark (if any) and the full address, both shown in full.
        branch: b?.branch?.trim() ?? "",
        address: b?.address?.trim() ?? "",
        status: billStatus(bal),
      };
    });
  const companyDetail = many
    ? `${branches.length} branches`
    : [anchor.branch, anchor.gstin ? `GSTIN ${anchor.gstin}` : null].filter(Boolean).join(" · ");
  const paymentById = new Map(view.payments.map((p) => [p.id, p]));
  const color = companyColor(name);

  return (
    <div className="space-y-5">
      <Link
        href="/ledger"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-black/10 bg-white pr-4 pl-2 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
      >
        <ChevronLeft className="size-5" />
        All companies
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full text-base font-bold"
            style={{ backgroundColor: color.soft, color: color.text }}
            aria-hidden
          >
            {companyInitials(name)}
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight">{name}</h1>
            <p className="text-sm text-zinc-500">
              {many ? `${branches.length} branches` : [anchor.branch, anchor.gstin ? `GST ${anchor.gstin}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="h-12 w-full rounded-xl px-5 text-base sm:w-auto"
          disabled={!data.paymentsReady}
          onClick={() => setStart({ groupKey: key })}
        >
          <IndianRupee className="size-5" />
          Record money received
        </Button>
      </div>

      <MoneyCards
        items={[
          { label: "Billed", value: s.billed, note: "All time" },
          { label: "Received", value: s.received, tone: "good", note: "All time" },
          { label: "Pending", value: s.pending, tone: s.pending > 0 ? "bad" : undefined, note: "As of today" },
        ]}
      />
      {s.extra > 0 && (
        <p className="rounded-[20px] bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {rupees(s.extra)} received extra. It will be adjusted in the next bill automatically.
        </p>
      )}

      <BillsSection
        rows={billRows}
        payments={view.payments}
        paymentsReady={data.paymentsReady}
        companyName={name}
        companyDetail={companyDetail}
        business={business}
        statement={fullStatement}
        onRecord={(invoiceId) => setStart({ groupKey: key, invoiceId })}
        onRemove={setRemoving}
      />

      <section className={cn(cardClass, "space-y-3")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-bold">All entries</h2>
          <PeriodChips value={period} onChange={setPeriod} />
        </div>
        <ul>
          <EdgeRow
            label={entries.opening < 0 ? "Extra at start" : "Balance at start"}
            sub={periodRange(period).label}
            value={Math.abs(entries.opening)}
          />
          {entries.rows.length === 0 && <li className="py-4 text-zinc-500">Nothing in this period.</li>}
          {entries.rows.map((e) => {
            const payment = e.paymentId ? paymentById.get(e.paymentId) : undefined;
            const branch = e.invoiceId ? branchOf(view.invoices.find((i) => i.id === e.invoiceId)?.company_id ?? "") : "";
            const body = (
              <>
                <div className="min-w-0">
                  <p className={cn("font-semibold", e.voided && "text-zinc-400 line-through")}>
                    {e.title}
                    {e.voided && <span className="ml-1 font-normal">(removed)</span>}
                  </p>
                  <p className="text-sm text-zinc-500">{[formatDay(e.date), branch, e.detail].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p
                    className={cn(
                      "font-bold",
                      e.voided && "text-zinc-400 line-through",
                      !e.voided && e.amount < 0 && e.kind !== "adjustment" && "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {e.amount < 0 ? `− ${rupees(-e.amount)}` : `+ ${rupees(e.amount)}`}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {e.balance < 0 ? `${rupees(-e.balance)} extra` : `Balance ${rupees(e.balance)}`}
                  </p>
                </div>
              </>
            );
            return (
              <li key={e.key} className="border-b border-dashed border-black/10 last:border-b-0 dark:border-white/10">
                {e.invoiceId ? (
                  <Link href={`/document/${e.invoiceId}`} className="flex justify-between gap-3 rounded-xl py-3 hover:bg-zinc-50 dark:hover:bg-muted/40">
                    {body}
                  </Link>
                ) : (
                  <div className="py-3">
                    <div className="flex justify-between gap-3">{body}</div>
                    {payment && !e.voided && e.kind !== "tds" && (
                      <button
                        type="button"
                        onClick={() => setRemoving(payment)}
                        className="mt-1 min-h-9 text-sm text-zinc-500 underline underline-offset-4"
                      >
                        {e.kind === "adjustment" ? "Undo" : "Wrong? Remove"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          <EdgeRow
            label={
              periodRange(period).to < todayISO()
                ? `${entries.closing < 0 ? "Extra" : "Pending"} on ${formatDay(periodRange(period).to)}`
                : entries.closing < 0
                  ? "Extra received"
                  : "Pending now"
            }
            sub={entries.closing < 0 ? "Adjusts in the next bill" : "+ bill added · − money received"}
            value={Math.abs(entries.closing)}
            tone={entries.closing > 0 ? "bad" : "good"}
          />
        </ul>
      </section>

      <RecordPaymentDialog start={start} data={data} ledger={ledger} onClose={() => setStart(null)} onSaved={reload} />
      <RemovePaymentDialog payment={removing} allPayments={data.payments} onClose={() => setRemoving(null)} onDone={reload} />
    </div>
  );
}

function EdgeRow({ label, sub, value, tone }: { label: string; sub: string; value: number; tone?: "good" | "bad" }) {
  return (
    <li className="my-1 flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-muted">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-zinc-500">{sub}</p>
      </div>
      <p
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "bad" && "text-amber-700 dark:text-amber-400",
          tone === "good" && "text-emerald-700 dark:text-emerald-400"
        )}
      >
        {rupees(value)}
      </p>
    </li>
  );
}
