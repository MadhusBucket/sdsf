"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, ExternalLink, FileSpreadsheet, IndianRupee, LayoutList, Rows3, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  formatDay,
  invoiceOrder,
  MODE_LABELS,
  rupees,
  type BillEvent,
  type InvoiceBalance,
  type LedgerEntry,
  type LedgerInvoice,
} from "@/lib/ledger/compute";
import type { Business, ExportBill } from "@/lib/ledger/exportExcel";
import type { Payment } from "@/lib/ledger/types";
import { cn } from "@/lib/utils";

type Filter = "unpaid" | "paid" | "all";
type View = "cards" | "table";
type Status = ExportBill["status"];

export interface BillRow {
  inv: LedgerInvoice;
  bal: InvoiceBalance;
  /** Landmark / branch name, may be empty. */
  branch: string;
  /** Full address of that branch, may be several lines. */
  address: string;
  status: Status;
}

interface Props {
  rows: BillRow[];
  payments: Payment[];
  paymentsReady: boolean;
  companyName: string;
  companyDetail: string;
  clientGstin: string;
  /** Money the company paid that no bill has used yet. */
  advanceWithUs: number;
  business: Business;
  statement: { opening: number; rows: LedgerEntry[]; closing: number };
  onRecord: (invoiceId: string) => void;
  onRemove: (payment: Payment) => void;
}

const PREFS = "ledger-bills-prefs";

export function billStatus(bal: InvoiceBalance): Status {
  if (bal.pending <= 0) return "Paid";
  if (bal.received > 0) return "Part paid";
  return "Not paid";
}

/* Soft colours, like tags: only the status and money received are coloured. */
const STATUS_STYLE: Record<Status, string> = {
  Paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "Part paid": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Not paid": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function StatusTag({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", STATUS_STYLE[status])}>
      {status}
    </span>
  );
}

const LABEL_COLOR: Record<string, string> = {
  Advance: "text-sky-700 dark:text-sky-400",
  "Part payment": "text-amber-700 dark:text-amber-400",
  "Final payment": "text-emerald-700 dark:text-emerald-400",
  "Full payment": "text-emerald-700 dark:text-emerald-400",
  "Written off (bill closed)": "text-zinc-500",
  "Marked paid": "text-zinc-500",
};

function howPaid(e: BillEvent) {
  if (e.kind === "writeoff") return "Client will not pay the rest";
  if (e.kind === "marked") return "Payment details not entered";
  return [
    e.mode ? MODE_LABELS[e.mode] : "",
    e.reference ?? "",
    e.tds > 0 ? `incl. TDS ${rupees(e.tds)}` : "",
    e.kind === "general" ? "from a general payment" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Where the work was: landmark in dark, full address under it. Never cut off. */
function Place({ row, className }: { row: BillRow; className?: string }) {
  if (!row.branch && !row.address) return <span className="text-zinc-400">—</span>;
  return (
    <div className={cn("min-w-0 leading-snug break-words", className)}>
      {row.branch && <p className="font-medium text-zinc-800 dark:text-zinc-200">{row.branch}</p>}
      {row.address && <p className="text-zinc-500 whitespace-pre-line">{row.address}</p>}
    </div>
  );
}

/**
 * The bill's story as a tidy list with a guide line:
 * Bill made, then each payment (label, date, how, amount), then what is still to collect.
 */
function PaymentList({ row, payments, onRemove }: { row: BillRow; payments: Payment[]; onRemove: (p: Payment) => void }) {
  const byId = new Map(payments.map((p) => [p.id, p]));
  const line = "relative pl-6 before:absolute before:top-1/2 before:left-0 before:h-px before:w-4 before:bg-black/15 dark:before:bg-white/20";
  const cols = "grid grid-cols-[minmax(7.5rem,auto)_1fr_auto] items-baseline gap-x-4 gap-y-0.5 py-2";
  return (
    <div className="border-l border-black/15 dark:border-white/20">
      <div className={cn(line, cols)}>
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Bill made</span>
        <span className="text-sm text-zinc-500">{formatDay(row.inv.date)}</span>
        <span className="text-right text-sm font-semibold tabular-nums">{rupees(row.bal.total)}</span>
      </div>
      {row.bal.events.map((e) => {
        const pay = e.paymentId ? byId.get(e.paymentId) : undefined;
        const removable = pay && !pay.voided_at && (e.kind === "payment" || e.kind === "writeoff");
        return (
          <div key={e.key} className={cn(line, cols)}>
            <span className={cn("text-sm font-semibold", LABEL_COLOR[e.label] ?? "text-zinc-600")}>{e.label}</span>
            <span className="text-sm text-zinc-500">
              {formatDay(e.date)}
              {howPaid(e) && <span className="block text-zinc-400">{howPaid(e)}</span>}
              {removable && (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onRemove(pay);
                  }}
                  className="mt-0.5 block min-h-7 text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-700"
                >
                  {e.kind === "writeoff" ? "Undo" : "Wrong? Remove"}
                </button>
              )}
            </span>
            <span className={cn("text-right text-sm font-semibold tabular-nums", e.kind === "writeoff" || e.kind === "marked" ? "text-zinc-500" : "text-emerald-700 dark:text-emerald-400")}>
              {e.kind === "writeoff" ? "" : "− "}
              {rupees(e.amount)}
            </span>
          </div>
        );
      })}
      {row.bal.pending > 0 && (
        <div className={cn(line, cols)}>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Still to collect</span>
          <span />
          <span className="text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{rupees(row.bal.pending)}</span>
        </div>
      )}
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="size-5 cursor-pointer rounded accent-[var(--primary)]"
    />
  );
}

function Actions({ row, paymentsReady, onRecord }: { row: BillRow; paymentsReady: boolean; onRecord: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.bal.pending > 0 && paymentsReady && (
        <Button
          type="button"
          className="h-10 rounded-xl"
          onClick={(e) => {
            e.stopPropagation();
            onRecord(row.inv.id);
          }}
        >
          <IndianRupee className="size-4" />
          Record payment
        </Button>
      )}
      <Button asChild variant="outline" className="h-10 rounded-xl">
        <Link href={`/document/${row.inv.id}`} onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="size-4" />
          Open bill
        </Link>
      </Button>
    </div>
  );
}

export function BillsSection(props: Props) {
  const { rows, payments, paymentsReady, onRecord, onRemove } = props;
  const [prefs, setPrefs] = useState<{ filter: Filter; view: View }>(() => {
    try {
      const saved = typeof window !== "undefined" ? JSON.parse(localStorage.getItem(PREFS) ?? "null") : null;
      return { filter: saved?.filter ?? "unpaid", view: saved?.view ?? "cards" };
    } catch {
      return { filter: "unpaid", view: "cards" };
    }
  });
  const update = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS, JSON.stringify(next));
    } catch {}
  };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const counts = useMemo(
    () => ({
      unpaid: rows.filter((r) => r.bal.pending > 0).length,
      paid: rows.filter((r) => r.bal.pending <= 0).length,
      all: rows.length,
    }),
    [rows]
  );
  const shown = useMemo(
    () =>
      rows
        .filter((r) => (prefs.filter === "unpaid" ? r.bal.pending > 0 : prefs.filter === "paid" ? r.bal.pending <= 0 : true))
        .sort((a, b) => invoiceOrder(a.inv, b.inv)),
    [rows, prefs.filter]
  );

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = shown.length > 0 && shown.every((r) => selected.has(r.inv.id));

  const download = async () => {
    const chosen = shown.filter((r) => selected.has(r.inv.id));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const { downloadLedgerExcel } = await import("@/lib/ledger/exportExcel");
      const everything = chosen.length === rows.length;
      await downloadLedgerExcel({
        business: props.business,
        client: { name: props.companyName, gstin: props.clientGstin },
        bills: chosen.map((r) => ({
          docNumber: r.inv.doc_number,
          // Branch and full address, so the client sees exactly which site each bill is for.
          site: [r.branch, r.address].filter(Boolean).join("\n"),
          date: r.inv.date,
          subject: r.inv.subject ?? "",
          total: r.bal.total,
          received: r.bal.received,
          writtenOff: r.bal.writtenOff,
          pending: r.bal.pending,
          status: r.status,
          closedOn: r.bal.closedOn,
          events: r.bal.events,
        })),
        paymentTotals: Object.fromEntries(payments.map((p) => [p.id, Number(p.amount) + Number(p.tds)])),
        // Advance and the running balance only make sense when every bill is in the file.
        advanceWithUs: everything ? props.advanceWithUs : 0,
        statement: everything ? props.statement : null,
      });
      toast.success(`Excel file with ${chosen.length} ${chosen.length === 1 ? "bill" : "bills"} downloaded`);
      setExporting(false);
    } catch (e) {
      console.error(e);
      toast.error("Could not make the file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { value: Filter; label: string }[] = [
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
    { value: "all", label: "All bills" },
  ];

  const lastPayment = (r: BillRow) =>
    r.bal.closedOn && r.bal.pending <= 0 ? (
      <span>
        Closed
        <span className="block text-zinc-500">{formatDay(r.bal.closedOn)}</span>
      </span>
    ) : r.bal.lastPaidOn ? (
      formatDay(r.bal.lastPaidOn)
    ) : (
      <span className="text-zinc-400">None yet</span>
    );

  return (
    <section className="space-y-4 rounded-[24px] bg-white p-4 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] sm:p-6 dark:bg-card dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">Bills</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-white/10" role="group" aria-label="View">
            {(
              [
                { v: "cards", label: "Cards", icon: LayoutList },
                { v: "table", label: "Table", icon: Rows3 },
              ] as const
            ).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                aria-pressed={prefs.view === v}
                onClick={() => update({ view: v })}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                  prefs.view === v ? "bg-white text-zinc-900 shadow-sm dark:bg-card dark:text-white" : "text-zinc-500"
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          {!exporting && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              disabled={shown.length === 0}
              onClick={() => {
                setSelected(new Set(shown.map((r) => r.inv.id)));
                setExporting(true);
              }}
            >
              <Download className="size-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Paid / unpaid */}
      <div className="flex flex-wrap gap-1 border-b border-black/[0.06] dark:border-white/10" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={prefs.filter === t.value}
            onClick={() => {
              update({ filter: t.value });
              setSelected(new Set());
              setExporting(false);
            }}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium",
              prefs.filter === t.value ? "border-primary text-zinc-900 dark:text-white" : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", prefs.filter === t.value ? "bg-primary/10 text-primary" : "bg-zinc-100 text-zinc-500 dark:bg-white/10")}>
              {counts[t.value]}
            </span>
          </button>
        ))}
      </div>

      {exporting && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/[0.06] p-3 ring-1 ring-primary/20">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
            <Check
              checked={allSelected}
              label="Select all bills"
              onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((r) => r.inv.id)))}
            />
            Select all ({shown.length})
          </label>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={() => setExporting(false)} disabled={busy}>
              <X className="size-4" />
              Cancel
            </Button>
            <Button type="button" className="h-10 rounded-xl" onClick={() => void download()} disabled={busy || selected.size === 0}>
              <FileSpreadsheet className="size-4" />
              {busy ? "Making file…" : `Download Excel (${selected.size})`}
            </Button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">
          {prefs.filter === "unpaid" ? "Nothing pending. All bills are paid." : prefs.filter === "paid" ? "No fully paid bills yet." : "No bills yet."}
        </p>
      ) : prefs.view === "table" ? (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[13px] text-zinc-400">
                {exporting && <th className="w-9 pb-3 font-normal" />}
                <th className="w-9 pb-3 font-normal" />
                <th className="pb-3 pr-4 font-normal">Bill</th>
                <th className="pb-3 pr-4 font-normal">Branch &amp; address</th>
                <th className="pb-3 pr-4 font-normal whitespace-nowrap">Bill date</th>
                <th className="pb-3 pr-4 text-right font-normal">Amount</th>
                <th className="pb-3 pr-4 text-right font-normal">Received</th>
                <th className="pb-3 pr-4 text-right font-normal">Pending</th>
                <th className="pb-3 pr-4 font-normal">Status</th>
                <th className="pb-3 font-normal whitespace-nowrap">Last payment</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = open.has(r.inv.id);
                // While a bill is open, the others fade to grey so the open one stands out.
                const dimmed = open.size > 0 && !isOpen;
                const cell = cn(
                  "border-t border-black/[0.06] py-4 align-top transition-[background-color,opacity] dark:border-white/10",
                  isOpen && "bg-white dark:bg-card",
                  dimmed && "bg-zinc-50 opacity-50 dark:bg-white/5"
                );
                return (
                  <Fragment key={r.inv.id}>
                    <tr
                      onClick={() => (exporting ? toggle(setSelected, r.inv.id) : toggle(setOpen, r.inv.id))}
                      className={cn(
                        "cursor-pointer transition-colors",
                        !isOpen && !dimmed && "hover:bg-zinc-50 dark:hover:bg-white/5",
                        dimmed && "[&>td]:hover:opacity-80"
                      )}
                    >
                      {exporting && (
                        <td className={cell}>
                          <div className="pt-0.5">
                            <Check checked={selected.has(r.inv.id)} onChange={() => toggle(setSelected, r.inv.id)} label={`Select ${r.inv.doc_number}`} />
                          </div>
                        </td>
                      )}
                      <td className={cell}>
                        <button
                          type="button"
                          aria-label={isOpen ? "Hide payments" : "Show payments"}
                          aria-expanded={isOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(setOpen, r.inv.id);
                          }}
                          className="-mt-0.5 grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100"
                        >
                          <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                        </button>
                      </td>
                      <td className={cn(cell, "pr-4")}>
                        <p className="font-semibold whitespace-nowrap tabular-nums text-zinc-900 dark:text-zinc-50">{r.inv.doc_number}</p>
                        {r.inv.subject && <p className="mt-0.5 max-w-[220px] text-zinc-500 break-words">{r.inv.subject}</p>}
                      </td>
                      <td className={cn(cell, "w-[260px] pr-4")}>
                        <Place row={r} />
                      </td>
                      <td className={cn(cell, "pr-4 whitespace-nowrap text-zinc-700 dark:text-zinc-300")}>{formatDay(r.inv.date)}</td>
                      <td className={cn(cell, "pr-4 text-right font-semibold whitespace-nowrap tabular-nums text-zinc-900 dark:text-zinc-50")}>
                        {rupees(r.bal.total)}
                      </td>
                      <td className={cn(cell, "pr-4 text-right whitespace-nowrap tabular-nums", r.bal.received > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-300")}>
                        {r.bal.received > 0 ? rupees(r.bal.received) : "—"}
                      </td>
                      <td className={cn(cell, "pr-4 text-right whitespace-nowrap tabular-nums", r.bal.pending > 0 ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-300")}>
                        {r.bal.pending > 0 ? rupees(r.bal.pending) : "—"}
                      </td>
                      <td className={cn(cell, "pr-4")}>
                        <StatusTag status={r.status} />
                      </td>
                      <td className={cn(cell, "whitespace-nowrap text-zinc-700 dark:text-zinc-300")}>{lastPayment(r)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={exporting ? 10 : 9} className="pb-5">
                          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_-12px_rgba(16,24,40,0.18)] ring-1 ring-black/[0.06] dark:bg-card dark:ring-white/10">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payments for {r.inv.doc_number}</p>
                              <Actions row={r} paymentsReady={paymentsReady} onRecord={onRecord} />
                            </div>
                            <div className="max-w-3xl">
                              <PaymentList row={r} payments={payments} onRemove={onRemove} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li
              key={r.inv.id}
              onClick={exporting ? () => toggle(setSelected, r.inv.id) : undefined}
              className={cn(
                "rounded-[20px] p-4 ring-1 ring-black/[0.07] sm:p-5 dark:ring-white/10",
                exporting && "cursor-pointer",
                exporting && selected.has(r.inv.id) && "bg-primary/[0.03] ring-2 ring-primary/40"
              )}
            >
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                {/* Left: what and where, and the money */}
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    {exporting && (
                      <div className="pt-0.5">
                        <Check checked={selected.has(r.inv.id)} onChange={() => toggle(setSelected, r.inv.id)} label={`Select ${r.inv.doc_number}`} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold tabular-nums">{r.inv.doc_number}</p>
                        <StatusTag status={r.status} />
                      </div>
                      <p className="text-sm text-zinc-500">Bill date {formatDay(r.inv.date)}</p>
                    </div>
                  </div>
                  {r.inv.subject && <p className="mt-3 text-sm font-medium break-words text-zinc-800 dark:text-zinc-200">{r.inv.subject}</p>}
                  <Place row={r} className="mt-1 text-sm" />

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-50 p-3 text-sm tabular-nums dark:bg-white/5">
                    <span className="text-zinc-500">
                      Amount<b className="block text-base text-zinc-900 dark:text-zinc-50">{rupees(r.bal.total)}</b>
                    </span>
                    <span className="text-zinc-500">
                      Received<b className="block text-base text-emerald-700 dark:text-emerald-400">{rupees(r.bal.received)}</b>
                    </span>
                    <span className="text-zinc-500">
                      Pending<b className="block text-base text-zinc-900 dark:text-zinc-50">{rupees(r.bal.pending)}</b>
                    </span>
                  </div>
                  {!exporting && (
                    <div className="mt-4">
                      <Actions row={r} paymentsReady={paymentsReady} onRecord={onRecord} />
                    </div>
                  )}
                </div>

                {/* Right: the payment story */}
                <div className="min-w-0 md:border-l md:border-black/[0.06] md:pl-5 dark:md:border-white/10">
                  <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payments</p>
                  <PaymentList row={r} payments={payments} onRemove={onRemove} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
