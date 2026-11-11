import type { Document } from "@/lib/types/database";

import type { Payment, PaymentMode } from "./types";

/** Invoice fields the ledger needs. */
export type LedgerInvoice = Pick<
  Document,
  "id" | "company_id" | "doc_number" | "date" | "subject" | "grand_total" | "status" | "created_at"
>;

/** One line in a bill's payment story. */
export interface BillEvent {
  key: string;
  date: string;
  /** payment = paid for this bill; general = part of a general payment that cleared this bill. */
  kind: "payment" | "general" | "writeoff" | "marked";
  /** Plain words: Advance, Part payment, Final payment, Full payment, Written off, Marked paid. */
  label: string;
  amount: number;
  tds: number;
  mode: PaymentMode | null;
  reference: string | null;
  paymentId: string | null;
}

export interface InvoiceBalance {
  id: string;
  total: number;
  /** Money (incl. TDS) applied to this bill, from direct or general payments. */
  received: number;
  /** Amount written off when the bill was closed short. */
  writtenOff: number;
  pending: number;
  /** Marked "Paid" on the invoice before any payment was recorded here. */
  markedPaid: boolean;
  /** Every payment that went to this bill, oldest first, with plain labels. */
  events: BillEvent[];
  /** Date the bill was fully paid or closed, if it is. */
  closedOn: string | null;
  /** Date of the latest money for this bill. */
  lastPaidOn: string | null;
}

export interface CompanySummary {
  billed: number;
  received: number;
  writtenOff: number;
  pending: number;
  /** Money received that is not yet covered by any bill. */
  extra: number;
  billCount: number;
  oldestUnpaidDate: string | null;
  lastActivity: string | null;
}

export interface LedgerResult {
  invoices: Map<string, InvoiceBalance>;
  companies: Map<string, CompanySummary>;
}

export const MODE_LABELS: Record<PaymentMode, string> = {
  upi: "UPI",
  bank: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

// Work in paise so totals never drift.
const p = (rupees: number | string | null | undefined) => Math.round(Number(rupees ?? 0) * 100);
const r = (paise: number) => paise / 100;

export const isActiveInvoice = (d: Pick<Document, "status">) =>
  d.status !== "void" && d.status !== "replaced";

export const invoiceOrder = (a: Pick<LedgerInvoice, "date" | "doc_number">, b: Pick<LedgerInvoice, "date" | "doc_number">) =>
  a.date.localeCompare(b.date) || a.doc_number.localeCompare(b.doc_number, "en", { numeric: true });

const paymentOrder = (a: Payment, b: Payment) =>
  a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at);

/**
 * The company a payment counts for. A payment for a bill follows that bill, even if
 * the bill was later moved to another company; otherwise the company it was saved under.
 */
export function paymentCompanyId(pay: Payment, invoiceCompany: Map<string, string>) {
  return (pay.invoice_id && invoiceCompany.get(pay.invoice_id)) || pay.company_id;
}

/**
 * An invoice already marked "Paid" (by hand, before the ledger) with no payment
 * recorded against it is shown as paid. Nothing is written to the invoice.
 * Once a payment is recorded for it, the payments decide instead.
 */
function markedPaidBills(invoices: LedgerInvoice[], payments: Payment[]) {
  const withPayments = new Set(payments.filter((x) => !x.voided_at && x.invoice_id).map((x) => x.invoice_id));
  return new Set(invoices.filter((i) => i.status === "paid" && !withPayments.has(i.id)).map((i) => i.id));
}

/**
 * Works out what is paid and pending for every invoice and company.
 * Payments tied to a bill go to that bill. General payments (and anything paid
 * beyond a bill's total) fill the oldest unpaid bills first.
 *
 * `keyOf` groups branches of one company together (same name = one company), so
 * a general payment can clear a bill at any branch. Results are keyed by it.
 */
export function computeLedger(
  invoices: LedgerInvoice[],
  payments: Payment[],
  keyOf: (companyId: string) => string = (id) => id
): LedgerResult {
  const markedPaid = markedPaidBills(invoices, payments);
  const invoiceCompany = new Map(invoices.map((i) => [i.id, i.company_id]));
  const payKey = (x: Payment) => keyOf(paymentCompanyId(x, invoiceCompany));
  const companyIds = new Set<string>([...invoices.map((i) => keyOf(i.company_id)), ...payments.map(payKey)]);
  const invoiceResult = new Map<string, InvoiceBalance>();
  const companyResult = new Map<string, CompanySummary>();

  for (const companyId of companyIds) {
    const bills = invoices
      .filter((i) => keyOf(i.company_id) === companyId && isActiveInvoice(i))
      .sort(invoiceOrder);
    type Row = { total: number; received: number; writtenOff: number; events: BillEvent[] };
    const rows = new Map<string, Row>(
      bills.map((b) => {
        const total = p(b.grand_total);
        const marked = markedPaid.has(b.id);
        return [
          b.id,
          {
            total,
            received: marked ? total : 0,
            writtenOff: 0,
            events: marked
              ? [{ key: `m-${b.id}`, date: b.date, kind: "marked", label: "", amount: r(total), tds: 0, mode: null, reference: null, paymentId: null }]
              : [],
          },
        ];
      })
    );
    // Money not tied to a bill (or more than a bill needed), used for the oldest unpaid bills.
    const pool: { pay: Payment; left: number }[] = [];
    let received = bills.filter((b) => markedPaid.has(b.id)).reduce((s, b) => s + p(b.grand_total), 0);
    let writtenOff = 0;
    let lastActivity: string | null = null;
    const writeOffs: { row: Row; pay: Payment }[] = [];

    for (const pay of payments.filter((x) => payKey(x) === companyId && !x.voided_at).sort(paymentOrder)) {
      if (!lastActivity || pay.paid_on > lastActivity) lastActivity = pay.paid_on;
      const row = pay.invoice_id ? rows.get(pay.invoice_id) : undefined;
      if (pay.kind === "adjustment") {
        if (row) writeOffs.push({ row, pay });
        continue;
      }
      const value = p(pay.amount) + p(pay.tds);
      received += value;
      if (!row) {
        pool.push({ pay, left: value });
        continue;
      }
      // Paid for this bill: use what the bill still needs, keep any extra for other bills.
      const used = Math.min(value, row.total - row.received);
      if (used > 0) {
        row.received += used;
        row.events.push({
          key: `p-${pay.id}`,
          date: pay.paid_on,
          kind: "payment",
          label: "",
          amount: r(used),
          tds: r(Math.min(p(pay.tds), used)),
          mode: pay.mode,
          reference: pay.reference,
          paymentId: pay.id,
        });
      }
      if (value - used > 0) pool.push({ pay, left: value - used });
    }

    // A write-off only covers what is still unpaid (if the client paid after all, it shrinks).
    for (const { row, pay } of writeOffs) {
      const used = Math.min(p(pay.amount), row.total - row.received - row.writtenOff);
      if (used <= 0) continue;
      row.writtenOff += used;
      writtenOff += used;
      row.events.push({ key: `w-${pay.id}`, date: pay.paid_on, kind: "writeoff", label: "", amount: r(used), tds: 0, mode: null, reference: null, paymentId: pay.id });
    }

    pool.sort((a, b) => paymentOrder(a.pay, b.pay));
    let billed = 0;
    let pending = 0;
    let oldestUnpaidDate: string | null = null;
    for (const bill of bills) {
      const row = rows.get(bill.id)!;
      for (const chunk of pool) {
        const need = row.total - row.received - row.writtenOff;
        if (need <= 0) break;
        if (chunk.left <= 0) continue;
        const take = Math.min(need, chunk.left);
        chunk.left -= take;
        row.received += take;
        row.events.push({
          key: `g-${chunk.pay.id}-${bill.id}`,
          date: chunk.pay.paid_on,
          kind: "general",
          label: "",
          amount: r(take),
          tds: 0,
          mode: chunk.pay.mode,
          reference: chunk.pay.reference,
          paymentId: chunk.pay.id,
        });
      }
      const rowPending = Math.max(0, row.total - row.received - row.writtenOff);
      billed += row.total;
      pending += rowPending;
      if (rowPending > 0 && !oldestUnpaidDate) oldestUnpaidDate = bill.date;
      if (!lastActivity || bill.date > lastActivity) lastActivity = bill.date;

      // Plain labels, oldest first: Advance → Part payment → Final payment (or Full payment).
      const order = { marked: 0, payment: 1, general: 1, writeoff: 2 };
      const events = row.events.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
      let sum = 0;
      let closedOn: string | null = null;
      let lastPaidOn: string | null = null;
      events.forEach((e, i) => {
        sum += p(e.amount);
        const closes = sum >= row.total && !closedOn;
        if (closes) closedOn = e.date;
        if (e.kind === "marked") e.label = "Marked paid";
        else if (e.kind === "writeoff") e.label = "Written off (bill closed)";
        else {
          lastPaidOn = e.date;
          e.label = closes ? (i === 0 ? "Full payment" : "Final payment") : i === 0 ? "Advance" : "Part payment";
        }
      });

      invoiceResult.set(bill.id, {
        id: bill.id,
        total: r(row.total),
        received: r(row.received),
        writtenOff: r(row.writtenOff),
        pending: r(rowPending),
        markedPaid: markedPaid.has(bill.id),
        events,
        closedOn: rowPending <= 0 ? closedOn ?? bill.date : null,
        lastPaidOn,
      });
    }

    companyResult.set(companyId, {
      billed: r(billed),
      received: r(received),
      writtenOff: r(writtenOff),
      pending: r(pending),
      extra: r(pool.reduce((s, c) => s + c.left, 0)),
      billCount: bills.length,
      oldestUnpaidDate,
      lastActivity,
    });
  }

  return { invoices: invoiceResult, companies: companyResult };
}

/* ---------- Periods ---------- */

export type Period = "fy" | "last" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  fy: "This year",
  last: "Last year",
  all: "All time",
};

/** Financial year range (April to March) as YYYY-MM-DD strings. */
export function periodRange(period: Period, ref: Date = new Date()) {
  if (period === "all") return { from: "0000-01-01", to: "9999-12-31", label: "All time" };
  const start = (ref.getMonth() >= 3 ? ref.getFullYear() : ref.getFullYear() - 1) - (period === "last" ? 1 : 0);
  return {
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
    label: `Apr ${start} – Mar ${start + 1}`,
  };
}

/* ---------- Company ledger entries ---------- */

export interface LedgerEntry {
  key: string;
  date: string;
  kind: "bill" | "payment" | "tds" | "adjustment" | "marked";
  title: string;
  detail: string;
  /** + adds to what the client owes, − reduces it. */
  amount: number;
  balance: number;
  voided: boolean;
  invoiceId?: string;
  paymentId?: string;
}

export function companyEntries(
  invoices: LedgerInvoice[],
  payments: Payment[],
  period: Period
): { opening: number; rows: LedgerEntry[]; closing: number } {
  const raw: Omit<LedgerEntry, "balance">[] = [];
  const numberOf = new Map(invoices.map((i) => [i.id, i.doc_number]));
  const markedPaid = markedPaidBills(invoices, payments);
  // Write-offs count only for what was still unpaid (same rule as computeLedger).
  const usedWriteOff = new Map<string, number>();
  for (const bal of computeLedger(invoices, payments, () => "one").invoices.values()) {
    for (const e of bal.events) if (e.kind === "writeoff" && e.paymentId) usedWriteOff.set(e.paymentId, e.amount);
  }

  for (const inv of invoices.filter(isActiveInvoice)) {
    raw.push({
      key: `b-${inv.id}`,
      date: inv.date,
      kind: "bill",
      title: `Bill ${inv.doc_number}`,
      detail: inv.subject ?? "",
      amount: Number(inv.grand_total),
      voided: false,
      invoiceId: inv.id,
    });
    if (markedPaid.has(inv.id)) {
      raw.push({
        key: `m-${inv.id}`,
        date: inv.date,
        kind: "marked",
        title: `Marked paid · ${inv.doc_number}`,
        detail: "Payment details not entered",
        amount: -Number(inv.grand_total),
        voided: false,
        invoiceId: inv.id,
      });
    }
  }
  for (const pay of payments) {
    const forBill = pay.invoice_id && numberOf.get(pay.invoice_id);
    const extras = [pay.reference, pay.note, forBill ? `for ${forBill}` : "general payment"]
      .filter(Boolean)
      .join(" · ");
    if (pay.kind === "adjustment") {
      raw.push({
        key: `a-${pay.id}`,
        date: pay.paid_on,
        kind: "adjustment",
        title: "Written off (bill closed)",
        detail: [
          pay.note,
          forBill ? `for ${forBill}` : "",
          !pay.voided_at && (usedWriteOff.get(pay.id) ?? 0) < Number(pay.amount) ? "not needed, client paid later" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: -(pay.voided_at ? Number(pay.amount) : usedWriteOff.get(pay.id) ?? 0),
        voided: !!pay.voided_at,
        paymentId: pay.id,
      });
      continue;
    }
    if (Number(pay.amount) > 0) {
      raw.push({
        key: `p-${pay.id}`,
        date: pay.paid_on,
        kind: "payment",
        title: `Received · ${MODE_LABELS[pay.mode ?? "other"]}`,
        detail: extras,
        amount: -Number(pay.amount),
        voided: !!pay.voided_at,
        paymentId: pay.id,
      });
    }
    if (Number(pay.tds) > 0) {
      raw.push({
        key: `t-${pay.id}`,
        date: pay.paid_on,
        kind: "tds",
        title: "TDS kept by client",
        detail: "Counts as received",
        amount: -Number(pay.tds),
        voided: !!pay.voided_at,
        paymentId: pay.id,
      });
    }
  }

  const order = { bill: 0, marked: 1, payment: 2, tds: 3, adjustment: 4 };
  raw.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);

  const { from, to } = periodRange(period);
  let opening = 0;
  let balance = 0;
  const rows: LedgerEntry[] = [];
  for (const e of raw) {
    const effect = e.voided ? 0 : p(e.amount);
    if (e.date < from) {
      opening += effect;
      balance += effect;
      continue;
    }
    if (e.date > to) continue;
    balance += effect;
    rows.push({ ...e, balance: r(balance) });
  }
  return { opening: r(opening), rows, closing: r(balance) };
}

/* ---------- Small helpers ---------- */

export function todayISO(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysSince(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

const RUPEES = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const RUPEES_PAISE = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹1,23,456 — whole rupees; paise are shown only when there are any (₹1,23,456.50). */
export function rupees(amount: number) {
  const paise = Math.round(amount * 100);
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise);
  return `${sign}₹${abs % 100 === 0 ? RUPEES.format(abs / 100) : RUPEES_PAISE.format(abs / 100)}`;
}
