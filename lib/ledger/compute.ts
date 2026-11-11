import type { Document } from "@/lib/types/database";

import type { Payment, PaymentMode } from "./types";

/** Invoice fields the ledger needs. */
export type LedgerInvoice = Pick<
  Document,
  "id" | "company_id" | "doc_number" | "date" | "subject" | "grand_total" | "status" | "created_at"
>;

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

const invoiceOrder = (a: LedgerInvoice, b: LedgerInvoice) =>
  a.date.localeCompare(b.date) || a.doc_number.localeCompare(b.doc_number);

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
    const rows = new Map(
      bills.map((b) => {
        const total = p(b.grand_total);
        return [b.id, { total, received: markedPaid.has(b.id) ? total : 0, writtenOff: 0 }];
      })
    );
    let pool = 0;
    let received = bills.filter((b) => markedPaid.has(b.id)).reduce((s, b) => s + p(b.grand_total), 0);
    let writtenOff = 0;
    let lastActivity: string | null = null;

    for (const pay of payments
      .filter((x) => payKey(x) === companyId && !x.voided_at)
      .sort(paymentOrder)) {
      if (!lastActivity || pay.paid_on > lastActivity) lastActivity = pay.paid_on;
      const row = pay.invoice_id ? rows.get(pay.invoice_id) : undefined;
      if (pay.kind === "adjustment") {
        if (row) {
          row.writtenOff += p(pay.amount);
          writtenOff += p(pay.amount);
        }
        continue;
      }
      const value = p(pay.amount) + p(pay.tds);
      received += value;
      if (row) row.received += value;
      else pool += value;
    }

    // Anything paid beyond a bill's balance becomes general credit.
    for (const row of rows.values()) {
      const over = row.received + row.writtenOff - row.total;
      if (over > 0) {
        const fromReceived = Math.min(over, row.received);
        row.received -= fromReceived;
        pool += fromReceived;
      }
    }

    let billed = 0;
    let pending = 0;
    let oldestUnpaidDate: string | null = null;
    for (const bill of bills) {
      const row = rows.get(bill.id)!;
      const take = Math.min(Math.max(0, row.total - row.received - row.writtenOff), pool);
      row.received += take;
      pool -= take;
      const rowPending = Math.max(0, row.total - row.received - row.writtenOff);
      billed += row.total;
      pending += rowPending;
      if (rowPending > 0 && !oldestUnpaidDate) oldestUnpaidDate = bill.date;
      if (!lastActivity || bill.date > lastActivity) lastActivity = bill.date;
      invoiceResult.set(bill.id, {
        id: bill.id,
        total: r(row.total),
        received: r(row.received),
        writtenOff: r(row.writtenOff),
        pending: r(rowPending),
        markedPaid: markedPaid.has(bill.id),
      });
    }

    companyResult.set(companyId, {
      billed: r(billed),
      received: r(received),
      writtenOff: r(writtenOff),
      pending: r(pending),
      extra: r(pool),
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
        detail: [pay.note, forBill ? `for ${forBill}` : ""].filter(Boolean).join(" · "),
        amount: -Number(pay.amount),
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
