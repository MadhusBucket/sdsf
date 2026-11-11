"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { branchLabel, groupCompanies } from "@/lib/companies/grouping";
import { companyColor, companyInitials } from "@/lib/companies/colors";
import { useSubmitLock } from "@/lib/hooks/useSubmitLock";
import { formatDay, MODE_LABELS, rupees, todayISO, type LedgerResult } from "@/lib/ledger/compute";
import type { LedgerData } from "@/lib/ledger/data";
import { asLedgerClient, type PaymentInsert, type PaymentMode } from "@/lib/ledger/types";
import { SHOW_TDS } from "@/lib/ledger/flags";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Where the flow starts. Leave out what is not known yet and the dialog asks. */
export interface PaymentStart {
  /** Company key (all branches of one company). */
  groupKey?: string;
  /** A bill id, or null for "general payment, not for one bill". Undefined = ask. */
  invoiceId?: string | null;
}

interface Props {
  start: PaymentStart | null;
  data: LedgerData;
  ledger: LedgerResult;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordPaymentDialog(props: Props) {
  // Mounting only while open gives a fresh, empty form every time.
  if (!props.start) return null;
  return <Flow {...props} start={props.start} />;
}

const MODES: PaymentMode[] = ["upi", "bank", "cheque", "cash"];
/** Keeps what was typed as a money amount: digits, one dot, at most 2 paise digits, Indian commas. */
function cleanAmount(raw: string) {
  const s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  const whole = (dot === -1 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, "").slice(0, 10);
  const paise = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const withCommas = whole ? Number(whole).toLocaleString("en-IN") : paise !== null ? "0" : "";
  return paise === null ? withCommas : `${withCommas}.${paise}`;
}
const toNumber = (s: string) => Math.round((Number(s.replace(/[^\d.]/g, "")) || 0) * 100) / 100;
const asTyped = (n: number) => (n ? cleanAmount(n.toFixed(2).replace(/\.00$/, "")) : "");

const fieldClass =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Flow({ start, data, ledger, onClose, onSaved }: Props & { start: PaymentStart }) {
  const groups = useMemo(() => groupCompanies(data.companies), [data.companies]);
  const [groupKey, setGroupKey] = useState<string | undefined>(start.groupKey);
  const [invoiceId, setInvoiceId] = useState<string | null | undefined>(start.invoiceId);
  const [busy, setBusy] = useState(false);

  const group = groups.find((g) => g.key === groupKey);
  const unpaid = useMemo(() => {
    if (!group) return [];
    const ids = new Set(group.branches.map((b) => b.id));
    return data.invoices
      .filter((i) => ids.has(i.company_id))
      .map((inv) => ({ inv, bal: ledger.invoices.get(inv.id) }))
      .filter((x): x is { inv: typeof x.inv; bal: NonNullable<typeof x.bal> } => !!x.bal && x.bal.pending > 0)
      .sort((a, b) => a.inv.date.localeCompare(b.inv.date) || a.inv.doc_number.localeCompare(b.inv.doc_number));
  }, [group, data.invoices, ledger]);

  const step = !group ? "company" : invoiceId === undefined ? "bill" : "form";
  // Back goes to the previous step only if that step was asked in this dialog.
  const back =
    step === "bill" && !start.groupKey
      ? () => setGroupKey(undefined)
      : step === "form" && start.invoiceId === undefined
        ? () => setInvoiceId(undefined)
        : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[24px] sm:max-w-lg">
        {back && (
          <button
            type="button"
            onClick={back}
            className="-mt-1 inline-flex min-h-10 items-center gap-1 justify-self-start rounded-full pr-3 text-sm font-medium text-zinc-600 hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
            Back
          </button>
        )}
        {step === "company" && <PickCompany groups={groups} ledger={ledger} onPick={setGroupKey} />}
        {step === "bill" && group && (
          <PickBill
            name={group.name}
            unpaid={unpaid}
            branchOf={
              group.branches.length > 1
                ? (id) => {
                    const b = group.branches.find((x) => x.id === id);
                    return b ? branchLabel(b) : "";
                  }
                : undefined
            }
            onPick={setInvoiceId}
          />
        )}
        {step === "form" && group && (
          <PaymentForm
            data={data}
            companyName={group.name}
            companyIds={group.branches.map((b) => b.id)}
            companyPending={ledger.companies.get(group.key)?.pending ?? 0}
            bill={invoiceId ? unpaid.find((u) => u.inv.id === invoiceId) ?? null : null}
            onBusy={setBusy}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ name }: { name: string }) {
  const c = companyColor(name);
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold"
      style={{ backgroundColor: c.soft, color: c.text }}
      aria-hidden
    >
      {companyInitials(name)}
    </span>
  );
}

function PickCompany({
  groups,
  ledger,
  onPick,
}: {
  groups: ReturnType<typeof groupCompanies<LedgerData["companies"][number]>>;
  ledger: LedgerResult;
  onPick: (key: string) => void;
}) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = groups
    .filter((g) => words.every((w) => g.name.toLowerCase().includes(w)))
    .sort((a, b) => (ledger.companies.get(b.key)?.pending ?? 0) - (ledger.companies.get(a.key)?.pending ?? 0));
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className="text-xl">Who paid?</DialogTitle>
        <DialogDescription>Pick the company the money came from.</DialogDescription>
      </DialogHeader>
      <label className="relative block">
        <Search className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-zinc-400" />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company"
          aria-label="Search company"
          className={cn(fieldClass, "pl-11")}
        />
      </label>
      <ul className="-mx-2 max-h-[55dvh] overflow-y-auto">
        {list.length === 0 && <li className="px-2 py-6 text-center text-zinc-500">No company matches.</li>}
        {list.map((g) => {
          const pending = ledger.companies.get(g.key)?.pending ?? 0;
          return (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => onPick(g.key)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-muted"
              >
                <Avatar name={g.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="block text-sm text-zinc-500">
                    {pending > 0 ? `Pending ${rupees(pending)}` : "Nothing pending"}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-zinc-400" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type UnpaidRow = {
  inv: LedgerData["invoices"][number];
  bal: NonNullable<ReturnType<LedgerResult["invoices"]["get"]>>;
};

function PickBill({
  name,
  unpaid,
  branchOf,
  onPick,
}: {
  name: string;
  unpaid: UnpaidRow[];
  branchOf?: (companyId: string) => string;
  onPick: (invoiceId: string | null) => void;
}) {
  return (
    <>
      <DialogHeader className="text-left">
        <DialogDescription>Money received from</DialogDescription>
        <DialogTitle className="text-xl leading-tight">{name}</DialogTitle>
        <p className="text-sm text-zinc-500">Which bill is this for?</p>
      </DialogHeader>
      <ul className="grid gap-2">
        {unpaid.map(({ inv, bal }) => (
          <li key={inv.id}>
            <button
              type="button"
              onClick={() => onPick(inv.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-left hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold tabular-nums">{inv.doc_number}</span>
                <span className="block truncate text-sm text-zinc-500">
                  {[formatDay(inv.date), branchOf?.(inv.company_id), inv.subject].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-zinc-500">Pending</span>
                <span className="block font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{rupees(bal.pending)}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-black/20 px-4 py-3 text-left hover:bg-zinc-50 dark:border-white/20"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Not sure / not for one bill</span>
              <span className="block text-sm text-zinc-500">
                {unpaid.length > 0 ? "It will clear the oldest bill first." : "It will be adjusted in the next bill."}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </>
  );
}

function PaymentForm({
  data,
  companyName,
  companyIds,
  companyPending,
  bill,
  onBusy,
  onClose,
  onSaved,
}: {
  data: LedgerData;
  companyName: string;
  companyIds: string[];
  companyPending: number;
  bill: UnpaidRow | null;
  onBusy: (b: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { busy, run } = useSubmitLock();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("upi");
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [showTds, setShowTds] = useState(false);
  const [tds, setTds] = useState("");
  const [closeBill, setCloseBill] = useState(false);
  const [error, setError] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const pending = bill ? bill.bal.pending : companyPending;
  const amt = toNumber(amount);
  const tdsAmt = showTds ? toNumber(tds) : 0;
  const leftOver = Math.round((pending - amt - tdsAmt) * 100) / 100;
  const canClose = !!bill && amt + tdsAmt > 0 && leftOver > 0;
  const total = Math.round((amt + tdsAmt) * 100) / 100;
  const extra = Math.round((total - pending) * 100) / 100;

  // Same company, same amount, same day, already saved: probably entered twice.
  const ids = new Set(companyIds);
  const duplicate = data.payments.find(
    (p) =>
      !p.voided_at &&
      p.kind === "payment" &&
      ids.has(p.company_id) &&
      p.paid_on === date &&
      Math.round((Number(p.amount) + Number(p.tds)) * 100) === Math.round(total * 100)
  );

  const quick: { value: number; label: string }[] = [];
  if (pending > 0) {
    quick.push({ value: pending, label: `Full pending ${rupees(pending)}` });
    if (bill && bill.bal.received === 0) {
      const half = Math.round(pending / 2);
      quick.push({ value: half, label: `Half ${rupees(half)}` });
    }
  }

  const save = () =>
    run(async () => {
      if (total <= 0) {
        setError("Enter the amount received.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO() || date < "2000-01-01") {
        setError("Choose the date the money came. It cannot be a future date.");
        return;
      }
      if (duplicate && !confirmDuplicate) {
        setConfirmDuplicate(true);
        setError("");
        return;
      }
      setError("");
      onBusy(true);
      // A bill's payment belongs to that bill's branch. A general payment goes to the first
      // branch; all branches of a company share one balance, so it does not matter which.
      const base = {
        user_id: data.userId,
        company_id: bill ? bill.inv.company_id : companyIds[0],
        invoice_id: bill ? bill.inv.id : null,
        paid_on: date,
      };
      const rows: PaymentInsert[] = [
        { ...base, kind: "payment", amount: amt, tds: tdsAmt, mode, reference: reference.trim() || null },
      ];
      if (canClose && closeBill) {
        rows.push({ ...base, kind: "adjustment", amount: leftOver, tds: 0, mode: null, note: "Client will not pay the rest" });
      }
      // Only ever adds new rows to the payments table. Invoices are never changed.
      let insertError: { code?: string; message?: string } | null = null;
      try {
        insertError = (await asLedgerClient(createClient()).from("payments").insert(rows)).error;
      } catch (e) {
        insertError = { message: String(e) };
      } finally {
        onBusy(false);
      }
      if (insertError) {
        console.error(insertError);
        setError(
          insertError.code === "42P01" || insertError.code === "PGRST205"
            ? "Payments are not switched on yet. Please ask Madhu."
            : "Could not save. Check your internet and try again."
        );
        return;
      }
      toast.success(
        canClose && closeBill ? `${rupees(total)} saved. Bill closed.` : `${rupees(total)} saved`
      );
      onSaved();
      onClose();
    });

  return (
    <>
      <DialogHeader className="text-left">
        <DialogDescription>Money received from</DialogDescription>
        <DialogTitle className="text-xl leading-tight">{companyName}</DialogTitle>
        <p className="text-sm text-zinc-500">
          {bill
            ? `For ${bill.inv.doc_number} · Pending ${rupees(pending)}`
            : pending > 0
              ? `Total pending ${rupees(pending)}. Clears the oldest bill first.`
              : "Nothing pending now. It will be adjusted in the next bill."}
        </p>
      </DialogHeader>

      <div className="grid gap-2">
        <label htmlFor="pay-amount" className="font-medium">
          How much?
        </label>
        <input
          id="pay-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="₹ 0"
          className={cn(fieldClass, "h-14 text-2xl font-bold tabular-nums")}
          value={amount}
          onChange={(e) => {
            setAmount(cleanAmount(e.target.value));
            setConfirmDuplicate(false);
          }}
        />
        {quick.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                className="min-h-10 rounded-full border border-black/10 bg-white px-4 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
                onClick={() => setAmount(asTyped(q.value))}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <span className="font-medium">How was it paid?</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-12 rounded-xl border px-3 text-base font-medium",
                mode === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-black/10 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="pay-date" className="font-medium">
            Date received
          </label>
          <input
            id="pay-date"
            type="date"
            className={fieldClass}
            value={date}
            max={todayISO()}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirmDuplicate(false);
            }}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="pay-ref" className="font-medium">
            Reference <span className="text-sm font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="pay-ref"
            className={fieldClass}
            placeholder="UTR / cheque number"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>

      {!SHOW_TDS ? null : showTds ? (
        <div className="grid gap-2">
          <label htmlFor="pay-tds" className="font-medium">
            TDS kept by client
          </label>
          <input
            id="pay-tds"
            inputMode="decimal"
            placeholder="₹ 0"
            className={cn(fieldClass, "tabular-nums")}
            value={tds}
            onChange={(e) => setTds(cleanAmount(e.target.value))}
          />
          <p className="text-sm text-zinc-500">Only if the client says they cut TDS. Not sure? Leave it empty.</p>
        </div>
      ) : (
        <button
          type="button"
          className="justify-self-start text-sm font-medium text-primary underline underline-offset-4"
          onClick={() => setShowTds(true)}
        >
          Client cut TDS? Add it
        </button>
      )}

      {canClose && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-muted">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-[var(--primary)]"
            checked={closeBill}
            onChange={(e) => setCloseBill(e.target.checked)}
          />
          <span>
            <span className="font-medium">Close this bill</span>
            <span className="block text-sm text-zinc-500">
              Tick only if the client will not pay the remaining {rupees(leftOver)}. The bill then shows as paid.
            </span>
          </span>
        </label>
      )}

      {extra > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This is {rupees(extra)} more than {bill ? "this bill's" : "the"} pending amount. The extra is kept and adjusted in
          the {bill ? "oldest other unpaid bill or the next bill" : "next bill"}. Check the amount if that is a mistake.
        </p>
      )}
      {confirmDuplicate && duplicate && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          {rupees(total)} from this company on this date is already saved. Is this a second payment? Tap Save again to
          save it, or Cancel.
        </p>
      )}
      {error && <p className="font-medium text-destructive">{error}</p>}

      <div className="grid gap-2">
        <Button type="button" className="h-12 text-base" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : confirmDuplicate ? "Yes, save again" : total > 0 ? `Save ${rupees(total)}` : "Save"}
        </Button>
        <Button type="button" variant="outline" className="h-12 text-base" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  );
}
