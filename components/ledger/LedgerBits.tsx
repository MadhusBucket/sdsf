"use client";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSubmitLock } from "@/lib/hooks/useSubmitLock";
import { PERIOD_LABELS, rupees, type InvoiceBalance, type Period } from "@/lib/ledger/compute";
import { asLedgerClient, type Payment } from "@/lib/ledger/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Three figures side by side on laptop, stacked rows on phone. */
export function MoneyCards({
  items,
}: {
  items: { label: string; value: number; tone?: "good" | "bad"; note?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3.5 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] sm:block dark:bg-card dark:ring-white/10"
        >
          <div>
            <p className="text-sm font-medium text-zinc-500">{it.label}</p>
            {it.note && <p className="text-xs text-muted-foreground sm:order-last">{it.note}</p>}
          </div>
          <p
            className={cn(
              "font-heading whitespace-nowrap text-2xl font-bold tabular-nums sm:mt-1",
              it.tone === "good" && "text-emerald-700 dark:text-emerald-400",
              it.tone === "bad" && "text-amber-700 dark:text-amber-400"
            )}
          >
            {rupees(it.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ total, done }: { total: number; done: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden>
      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function payState(bal: InvoiceBalance | undefined): { label: string; className: string } {
  if (!bal) return { label: "Cancelled", className: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  if (bal.pending <= 0) return { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (bal.received > 0) return { label: "Part paid", className: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "Not paid", className: "bg-red-100 text-red-700 border-red-200" };
}

export function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", className)}>
      {label}
    </span>
  );
}

export function PeriodChips({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <Chip key={p} on={value === p} onClick={() => onChange(p)}>
          {PERIOD_LABELS[p]}
        </Chip>
      ))}
    </div>
  );
}

export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-4 text-sm font-medium",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-black/10 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
      )}
    >
      {children}
    </button>
  );
}

/** Confirm, then mark a payment as removed. It stays visible, crossed out. */
export function RemovePaymentDialog({
  payment,
  allPayments,
  onClose,
  onDone,
}: {
  payment: Payment | null;
  /** All payments, to find a write-off saved together with this payment. */
  allPayments: Payment[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, run } = useSubmitLock();
  if (!payment) return null;
  const linkedWriteOff =
    payment.kind === "payment" && payment.invoice_id
      ? allPayments.find(
          (p) =>
            p.kind === "adjustment" &&
            !p.voided_at &&
            p.invoice_id === payment.invoice_id &&
            p.created_at === payment.created_at
        )
      : undefined;
  const value = Number(payment.amount) + Number(payment.tds);
  const isAdjustment = payment.kind === "adjustment";

  const remove = () =>
    run(async () => {
      // Never deleted: the payment is only marked as removed, so history stays.
      // A "close this bill" write-off saved together with this payment is removed with it,
      // otherwise the bill would stay closed for money that was never received.
      const db = asLedgerClient(createClient());
      const now = new Date().toISOString();
      let error = (await db.from("payments").update({ voided_at: now }).eq("id", payment.id).is("voided_at", null)).error;
      if (!error && linkedWriteOff) {
        error = (await db.from("payments").update({ voided_at: now }).eq("id", linkedWriteOff.id).is("voided_at", null)).error;
      }
      if (error) {
        toast.error("Could not remove. Try again.");
        return;
      }
      toast.success(isAdjustment ? "Bill opened again" : "Payment removed");
      onDone();
      onClose();
    });

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAdjustment ? `Undo the write-off of ${rupees(value)}?` : `Remove this payment of ${rupees(value)}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAdjustment
              ? "The bill will show the remaining amount as pending again."
              : `Use this only if it was entered by mistake. It stays in the list, crossed out, so you can always see what happened.${
                  linkedWriteOff ? ` The bill was closed with this payment, so it will open again (${rupees(Number(linkedWriteOff.amount))} written off is removed too).` : ""
                }`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>No, keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            {busy ? "Removing…" : isAdjustment ? "Yes, undo" : "Yes, remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
