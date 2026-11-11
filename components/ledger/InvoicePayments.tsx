"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, IndianRupee } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDay, MODE_LABELS, rupees } from "@/lib/ledger/compute";
import type { Payment } from "@/lib/ledger/types";
import { cn } from "@/lib/utils";

import { MoneyCards, ProgressBar, RemovePaymentDialog } from "./LedgerBits";
import { RecordPaymentDialog, type PaymentStart } from "./RecordPaymentDialog";
import { useLedger } from "./useLedger";

/** Payments section on an invoice: received, pending, and the button to add money. Reads only; adds payments, never edits the invoice. */
export function InvoicePayments({ invoiceId, companyId }: { invoiceId: string; companyId: string }) {
  const { data, ledger, failed, reload } = useLedger();
  const [start, setStart] = useState<PaymentStart | null>(null);
  const [removing, setRemoving] = useState<Payment | null>(null);

  const shell = "space-y-4 rounded-[24px] bg-white p-5 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:bg-card dark:ring-white/10";

  if (failed) return null;
  if (!data || !ledger) return <section className={cn(shell, "text-sm text-zinc-500")}>Loading payments…</section>;

  const bal = ledger.invoices.get(invoiceId);
  if (!bal) {
    // Cancelled or replaced: the bill no longer counts. Money already recorded for it is
    // not lost; it counts for the company and clears its oldest unpaid bill.
    const kept = data.payments
      .filter((p) => p.invoice_id === invoiceId && !p.voided_at && p.kind === "payment")
      .reduce((s, p) => s + Number(p.amount) + Number(p.tds), 0);
    if (kept <= 0) return null;
    return (
      <section className="rounded-[24px] bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
        This bill is cancelled, but {rupees(kept)} was recorded for it. That money still counts for the company and
        clears its oldest unpaid bill.{" "}
        <Link href={`/ledger/${companyId}`} className="font-medium underline underline-offset-4">
          See company ledger
        </Link>
      </section>
    );
  }

  const groupKey = data.keyOf(companyId);
  const own = data.payments
    .filter((p) => p.invoice_id === invoiceId)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));
  const directValue = own
    .filter((p) => !p.voided_at && p.kind === "payment")
    .reduce((s, p) => s + Number(p.amount) + Number(p.tds), 0);
  const fromGeneral = bal.markedPaid ? 0 : Math.round(bal.received - Math.min(directValue, bal.total));
  const closed = bal.pending <= 0;

  return (
    <section className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">Payments</h2>
        <Link href={`/ledger/${companyId}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Company ledger
        </Link>
      </div>

      <MoneyCards
        items={[
          { label: "Bill total", value: bal.total },
          { label: "Received", value: bal.received, tone: "good" },
          { label: "Pending", value: bal.pending, tone: bal.pending > 0 ? "bad" : undefined },
        ]}
      />
      <ProgressBar total={bal.total} done={bal.total - bal.pending} />

      {closed ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          {bal.markedPaid ? "Marked as paid. Payment details not entered." : "Fully paid. This bill is closed."}
        </div>
      ) : data.paymentsReady ? (
        <Button
          type="button"
          className="h-12 w-full rounded-xl text-base sm:w-auto sm:px-6"
          onClick={() => setStart({ groupKey, invoiceId })}
        >
          <IndianRupee className="size-5" />
          Record payment
        </Button>
      ) : null}

      <div>
        {own.length === 0 && fromGeneral <= 0 ? (
          !bal.markedPaid && <p className="text-sm text-zinc-500">No payment recorded yet.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-black/10 dark:divide-white/10">
            {own.map((p) => (
              <PaymentRow key={p.id} payment={p} onRemove={() => setRemoving(p)} />
            ))}
          </ul>
        )}
        {fromGeneral > 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            {rupees(fromGeneral)} came from a general payment, adjusted here automatically.
          </p>
        )}
      </div>

      <RecordPaymentDialog start={start} data={data} ledger={ledger} onClose={() => setStart(null)} onSaved={reload} />
      <RemovePaymentDialog payment={removing} allPayments={data.payments} onClose={() => setRemoving(null)} onDone={reload} />
    </section>
  );
}

function PaymentRow({ payment: p, onRemove }: { payment: Payment; onRemove: () => void }) {
  const voided = !!p.voided_at;
  const isAdj = p.kind === "adjustment";
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className={cn("font-medium", voided && "text-zinc-400 line-through")}>
          {isAdj ? "Written off (bill closed)" : MODE_LABELS[p.mode ?? "other"]}
          {voided && <span className="ml-1">(removed)</span>}
        </p>
        <p className="text-sm text-zinc-500">{[formatDay(p.paid_on), p.reference, p.note].filter(Boolean).join(" · ")}</p>
        {Number(p.tds) > 0 && (
          <p className="text-sm">
            + TDS kept by client: <b className="tabular-nums">{rupees(Number(p.tds))}</b>
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-semibold tabular-nums",
            voided ? "text-zinc-400 line-through" : isAdj ? "text-zinc-500" : "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {rupees(Number(p.amount))}
        </p>
        {!voided && (
          <button type="button" onClick={onRemove} className="min-h-9 text-sm text-zinc-500 underline underline-offset-4">
            {isAdj ? "Undo" : "Wrong? Remove"}
          </button>
        )}
      </div>
    </li>
  );
}
