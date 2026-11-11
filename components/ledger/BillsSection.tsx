"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, FileSpreadsheet, IndianRupee, LayoutGrid, Rows3, X } from "lucide-react";
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
import type { ExportBill } from "@/lib/ledger/exportExcel";
import type { Payment } from "@/lib/ledger/types";
import { cn } from "@/lib/utils";

type Filter = "unpaid" | "paid" | "all";
type View = "cards" | "table";
type Status = ExportBill["status"];

export interface BillRow {
  inv: LedgerInvoice;
  bal: InvoiceBalance;
  branch: string;
  status: Status;
}

interface Props {
  rows: BillRow[];
  payments: Payment[];
  paymentsReady: boolean;
  companyName: string;
  companyDetail: string;
  business: { name: string; address: string; gstin: string; phone: string };
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

const STATUS_STYLE: Record<Status, { dot: string; pill: string }> = {
  Paid: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  "Part paid": { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  "Not paid": { dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200" },
};

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1", STATUS_STYLE[status].pill)}>
      <span className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {status}
    </span>
  );
}

const EVENT_STYLE: Record<string, string> = {
  Advance: "text-sky-700 bg-sky-50",
  "Part payment": "text-amber-800 bg-amber-50",
  "Final payment": "text-emerald-700 bg-emerald-50",
  "Full payment": "text-emerald-700 bg-emerald-50",
  "Written off (bill closed)": "text-zinc-600 bg-zinc-100",
  "Marked paid": "text-zinc-600 bg-zinc-100",
};

function eventDetail(e: BillEvent) {
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

/** The bill's story as a small timeline: bill made, then each payment with its date. */
function Timeline({
  row,
  payments,
  onRemove,
}: {
  row: BillRow;
  payments: Payment[];
  onRemove: (p: Payment) => void;
}) {
  const byId = new Map(payments.map((p) => [p.id, p]));
  return (
    <ol className="relative space-y-3 border-l-2 border-dashed border-black/10 pl-5 dark:border-white/15">
      <li className="relative">
        <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white bg-zinc-400 dark:border-card" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <p className="text-sm">
            <span className="font-semibold">Bill made</span>
            <span className="text-zinc-500"> · {formatDay(row.inv.date)}</span>
          </p>
          <p className="text-sm font-semibold tabular-nums">{rupees(row.bal.total)}</p>
        </div>
      </li>
      {row.bal.events.map((e) => {
        const pay = e.paymentId ? byId.get(e.paymentId) : undefined;
        const removable = pay && !pay.voided_at && (e.kind === "payment" || e.kind === "writeoff");
        return (
          <li key={e.key} className="relative">
            <span
              className={cn(
                "absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white dark:border-card",
                e.kind === "writeoff" || e.kind === "marked" ? "bg-zinc-400" : "bg-emerald-500"
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="text-sm">
                <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", EVENT_STYLE[e.label] ?? "bg-zinc-100")}>{e.label}</span>
                <span className="text-zinc-500"> · {formatDay(e.date)}</span>
                {eventDetail(e) && <span className="text-zinc-500"> · {eventDetail(e)}</span>}
              </p>
              <p className={cn("text-sm font-semibold tabular-nums", e.kind === "writeoff" ? "text-zinc-500" : "text-emerald-700 dark:text-emerald-400")}>
                {e.kind === "writeoff" ? "" : "− "}
                {rupees(e.amount)}
              </p>
            </div>
            {removable && (
              <button
                type="button"
                onClick={() => onRemove(pay)}
                className="mt-0.5 min-h-8 text-xs text-zinc-500 underline underline-offset-4"
              >
                {e.kind === "writeoff" ? "Undo" : "Wrong? Remove"}
              </button>
            )}
          </li>
        );
      })}
      {row.bal.pending > 0 && (
        <li className="relative">
          <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white bg-red-500 dark:border-card" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Still to collect</p>
            <p className="text-sm font-bold tabular-nums text-red-700 dark:text-red-400">{rupees(row.bal.pending)}</p>
          </div>
        </li>
      )}
    </ol>
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

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = shown.length > 0 && shown.every((r) => selected.has(r.inv.id));

  const startExport = () => {
    setSelected(new Set(shown.map((r) => r.inv.id)));
    setExporting(true);
  };

  const download = async () => {
    const chosen = shown.filter((r) => selected.has(r.inv.id));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const { downloadLedgerExcel } = await import("@/lib/ledger/exportExcel");
      await downloadLedgerExcel({
        business: props.business,
        company: { name: props.companyName, detail: props.companyDetail },
        bills: chosen.map((r) => ({
          docNumber: r.inv.doc_number,
          branch: r.branch,
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
        // The full statement only makes sense when every bill is in the file.
        statement: chosen.length === rows.length ? props.statement : null,
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

  return (
    <section className="space-y-4 rounded-[24px] bg-white p-4 ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(16,24,40,0.04)] sm:p-5 dark:bg-card dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">Bills</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-white/10" role="group" aria-label="View">
            {(
              [
                { v: "cards", label: "Cards", icon: LayoutGrid },
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
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={startExport} disabled={shown.length === 0}>
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

      {/* Export bar */}
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
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-zinc-500">
                {exporting && <th className="w-10 border-b border-black/[0.06] py-3 pl-4 sm:pl-2" />}
                <th className="w-8 border-b border-black/[0.06] py-3 pl-4 sm:pl-2" />
                <th className="border-b border-black/[0.06] py-3 pr-3 font-medium">Bill</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 font-medium">Branch</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 font-medium">Bill date</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 text-right font-medium">Amount</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 text-right font-medium">Received</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 text-right font-medium">Pending</th>
                <th className="border-b border-black/[0.06] py-3 pr-3 font-medium">Status</th>
                <th className="border-b border-black/[0.06] py-3 pr-4 font-medium">Last payment</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = open.has(r.inv.id);
                return (
                  <Fragment key={r.inv.id}>
                    <tr
                      onClick={() => (exporting ? toggleSel(r.inv.id) : toggleOpen(r.inv.id))}
                      className={cn("cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-white/5", isOpen && "bg-zinc-50 dark:bg-white/5")}
                    >
                      {exporting && (
                        <td className="border-b border-black/[0.06] py-3.5 pl-4 sm:pl-2">
                          <Check checked={selected.has(r.inv.id)} onChange={() => toggleSel(r.inv.id)} label={`Select ${r.inv.doc_number}`} />
                        </td>
                      )}
                      <td className="border-b border-black/[0.06] py-3.5 pl-4 sm:pl-2">
                        <button
                          type="button"
                          aria-label={isOpen ? "Hide payments" : "Show payments"}
                          aria-expanded={isOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOpen(r.inv.id);
                          }}
                          className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100"
                        >
                          <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                        </button>
                      </td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-3">
                        <p className="font-semibold tabular-nums">{r.inv.doc_number}</p>
                        {r.inv.subject && <p className="max-w-[220px] truncate text-xs text-zinc-500">{r.inv.subject}</p>}
                      </td>
                      <td className="max-w-[180px] truncate border-b border-black/[0.06] py-3.5 pr-3 text-zinc-600 dark:text-zinc-300">{r.branch}</td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-3 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{formatDay(r.inv.date)}</td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-3 text-right font-semibold whitespace-nowrap tabular-nums">{rupees(r.bal.total)}</td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-3 text-right whitespace-nowrap tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.bal.received > 0 ? rupees(r.bal.received) : "—"}
                      </td>
                      <td className={cn("border-b border-black/[0.06] py-3.5 pr-3 text-right whitespace-nowrap tabular-nums", r.bal.pending > 0 ? "font-semibold text-red-700 dark:text-red-400" : "text-zinc-400")}>
                        {r.bal.pending > 0 ? rupees(r.bal.pending) : "—"}
                      </td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="border-b border-black/[0.06] py-3.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                        {r.bal.closedOn && r.bal.pending <= 0 ? (
                          <span>Closed {formatDay(r.bal.closedOn)}</span>
                        ) : r.bal.lastPaidOn ? (
                          formatDay(r.bal.lastPaidOn)
                        ) : (
                          <span className="text-zinc-400">None yet</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={exporting ? 10 : 9} className="border-b border-black/[0.06] bg-zinc-50/70 px-4 py-4 sm:pl-12 dark:bg-white/5">
                          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                            <div className="max-w-2xl">
                              <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Payments for {r.inv.doc_number}</p>
                              <Timeline row={r} payments={payments} onRemove={onRemove} />
                            </div>
                            <div className="flex flex-wrap items-start gap-2 md:flex-col">
                              {r.bal.pending > 0 && paymentsReady && (
                                <Button type="button" className="h-10 rounded-xl" onClick={() => onRecord(r.inv.id)}>
                                  <IndianRupee className="size-4" />
                                  Record payment
                                </Button>
                              )}
                              <Button asChild variant="outline" className="h-10 rounded-xl">
                                <Link href={`/document/${r.inv.id}`}>Open bill</Link>
                              </Button>
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
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((r) => (
            <li
              key={r.inv.id}
              onClick={exporting ? () => toggleSel(r.inv.id) : undefined}
              className={cn(
                "min-w-0 rounded-[20px] p-4 ring-1 ring-black/[0.06] dark:ring-white/10",
                exporting && "cursor-pointer",
                exporting && selected.has(r.inv.id) && "ring-2 ring-primary/50"
              )}
            >
              <div className="flex items-start gap-3">
                {exporting && (
                  <div className="pt-0.5">
                    <Check checked={selected.has(r.inv.id)} onChange={() => toggleSel(r.inv.id)} label={`Select ${r.inv.doc_number}`} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/document/${r.inv.id}`} className="font-semibold tabular-nums underline-offset-4 hover:underline">
                      {r.inv.doc_number}
                    </Link>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="truncate text-sm text-zinc-500">{[r.branch, r.inv.subject].filter(Boolean).join(" · ")}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
                <span className="text-zinc-500">
                  Amount<b className="block text-base text-foreground">{rupees(r.bal.total)}</b>
                </span>
                <span className="text-zinc-500">
                  Received<b className="block text-base text-emerald-700 dark:text-emerald-400">{rupees(r.bal.received)}</b>
                </span>
                <span className="text-zinc-500">
                  Pending
                  <b className={cn("block text-base", r.bal.pending > 0 ? "text-red-700 dark:text-red-400" : "text-foreground")}>{rupees(r.bal.pending)}</b>
                </span>
              </div>

              <div className="mt-4 border-t border-dashed border-black/10 pt-4 dark:border-white/10">
                <Timeline row={r} payments={payments} onRemove={onRemove} />
              </div>

              {!exporting && r.bal.pending > 0 && paymentsReady && (
                <Button type="button" variant="outline" className="mt-4 h-11 w-full rounded-xl" onClick={() => onRecord(r.inv.id)}>
                  <IndianRupee className="size-4" />
                  Record payment
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
