import type { Borders, Cell, Fill, Worksheet } from "exceljs";

import { formatDay, MODE_LABELS, todayISO, type BillEvent, type LedgerEntry } from "./compute";

/**
 * A payment statement to send to a client (opens in Excel and Google Sheets).
 * Written for the client: what was billed, what they have paid and when, and what is left.
 * No internal figures. Runs in the browser only; nothing is sent anywhere.
 */

export interface ExportBill {
  docNumber: string;
  /** Site: branch / landmark and the full address, one under the other. */
  site: string;
  date: string;
  subject: string;
  total: number;
  received: number;
  writtenOff: number;
  pending: number;
  status: "Paid" | "Part paid" | "Not paid";
  closedOn: string | null;
  events: BillEvent[];
}

export interface Business {
  name: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  signatory: string;
  bank: { bankName: string; accountName: string; accountNumber: string; ifsc: string; branch: string } | null;
}

export interface ExportInput {
  business: Business;
  client: { name: string; gstin: string };
  bills: ExportBill[];
  /** Full amount of each payment, to say "part of ₹X" when one payment covered several bills. */
  paymentTotals: Record<string, number>;
  /** Only when every bill is in the file: money paid that no bill has used yet. */
  advanceWithUs: number;
  /** Only when every bill is in the file: every bill and payment with the balance after each. */
  statement: { opening: number; rows: LedgerEntry[]; closing: number } | null;
}

/* ---------- Look ---------- */
const INK = "FF18181B";
const MUTED = "FF71717A";
const LINE = "FFE4E4E7";
const HEAD_BG = "FFF4F4F5";
const SOFT_BG = "FFFAFAFA";
const BRAND = "FF2F4BE0";
const GREEN = "FF15803D";
/** ₹ with Indian grouping: ₹1,23,45,678.00 */
const INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00';
const font = (o: Partial<{ size: number; bold: boolean; color: string; italic: boolean }> = {}) => ({
  name: "Calibri",
  size: o.size ?? 11,
  bold: o.bold ?? false,
  italic: o.italic ?? false,
  color: { argb: o.color ?? INK },
});
const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bottom = (argb = LINE, style: "thin" | "medium" | "double" = "thin"): Partial<Borders> => ({ bottom: { style, color: { argb } } });
const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function money(cell: Cell, value: number, o: Parameters<typeof font>[0] = {}) {
  cell.value = Math.round(value * 100) / 100;
  cell.numFmt = INR;
  cell.font = font(o);
  cell.alignment = { horizontal: "right", vertical: "top" };
}

/** A line of text across the given columns. */
function line(ws: Worksheet, row: number, from: string, to: string, value: string, f: Parameters<typeof font>[0] = {}, height?: number) {
  ws.mergeCells(`${from}${row}:${to}${row}`);
  const c = ws.getCell(`${from}${row}`);
  c.value = value;
  c.font = font(f);
  c.alignment = { vertical: "middle", wrapText: true };
  if (height) ws.getRow(row).height = height;
  return c;
}

/** Plain words a client understands. */
function eventWords(e: BillEvent, totals: Record<string, number>) {
  const title =
    e.kind === "writeoff"
      ? "Balance waived"
      : e.kind === "marked"
        ? "Paid"
        : e.label === "Advance"
          ? "Advance received"
          : `${e.label} received`;
  const full = e.paymentId ? totals[e.paymentId] : undefined;
  const detail =
    e.kind === "writeoff"
      ? `Remaining ${inr(e.amount)} not charged; bill closed`
      : e.kind === "marked"
        ? ""
        : [
            e.mode ? MODE_LABELS[e.mode] : "",
            e.reference ?? "",
            e.tds > 0 ? `incl. TDS ${inr(e.tds)} deducted by you` : "",
            full && Math.round(full * 100) > Math.round(e.amount * 100) ? `part of ${inr(full)} paid` : "",
          ]
            .filter(Boolean)
            .join(" · ");
  return { title, detail };
}

function header(ws: Worksheet, b: Business, last: string) {
  line(ws, 1, "A", last, b.name || "Payment statement", { size: 18, bold: true }, 28);
  if (b.address) line(ws, 2, "A", last, b.address, { size: 10, color: MUTED });
  const contact = [b.gstin ? `GSTIN ${b.gstin}` : "", b.phone ? `Phone ${b.phone}` : "", b.email].filter(Boolean).join("   ·   ");
  if (contact) line(ws, 3, "A", last, contact, { size: 10, color: MUTED });
  ws.mergeCells(`A4:${last}4`);
  ws.getCell("A4").border = bottom(BRAND, "medium");
  ws.getRow(4).height = 6;
}

function pageSetup(ws: Worksheet, headRow: number) {
  ws.views = [{ state: "frozen", ySplit: headRow, showGridLines: false }];
  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${headRow}:${headRow}`,
  };
  ws.headerFooter = { oddFooter: "&L&8&K71717APage &P of &N" };
}

function tableHead(ws: Worksheet, row: number, labels: string[], rightFrom: number) {
  const r = ws.getRow(row);
  labels.forEach((label, i) => {
    const c = r.getCell(i + 1);
    c.value = label;
    c.font = font({ size: 10, bold: true, color: MUTED });
    c.fill = fill(HEAD_BG);
    c.border = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } } };
    c.alignment = { vertical: "middle", horizontal: i >= rightFrom ? "right" : "left", wrapText: true };
  });
  r.height = 24;
}

/** Rough row height so wrapped text is never cut off. */
const heightFor = (texts: [string, number][]) =>
  Math.max(20, Math.max(...texts.map(([t, width]) => (t || "").split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / width)), 0))) * 15 + 6);

function statementSheet(ws: Worksheet, input: ExportInput) {
  const { business: b, bills } = input;
  const today = formatDay(todayISO());
  ws.columns = [
    { width: 15 }, // A Bill no
    { width: 13 }, // B Bill date
    { width: 30 }, // C Site: branch and full address
    { width: 36 }, // D Work / payment
    { width: 16 }, // E Bill amount
    { width: 16 }, // F Paid
    { width: 16 }, // G Balance
  ];
  header(ws, b, "G");

  // Who it is for
  line(ws, 6, "A", "D", "PAYMENT STATEMENT", { size: 10, bold: true, color: BRAND });
  line(ws, 7, "A", "D", input.client.name, { size: 14, bold: true }, 22);
  line(ws, 6, "E", "G", `Date: ${today}`, { size: 10, color: MUTED }).alignment = { horizontal: "right" };
  const billWord = bills.length === 1 ? `Bill ${bills[0].docNumber}` : `${bills.length} bills`;
  line(ws, 7, "E", "G", billWord, { size: 10, color: MUTED }).alignment = { horizontal: "right", vertical: "middle" };

  // The one number the client looks for
  const billed = bills.reduce((s, x) => s + x.total, 0);
  const paid = bills.reduce((s, x) => s + x.received, 0);
  const waived = bills.reduce((s, x) => s + x.writtenOff, 0);
  const due = bills.reduce((s, x) => s + x.pending, 0);
  const net = Math.max(0, Math.round((due - input.advanceWithUs) * 100) / 100);
  ws.mergeCells("A10:C10");
  ws.mergeCells("A11:C11");
  const dueLabel = ws.getCell("A10");
  const dueValue = ws.getCell("A11");
  dueLabel.value = "Balance due";
  dueLabel.font = font({ size: 10, color: MUTED });
  if (net > 0) {
    money(dueValue, net, { size: 20, bold: true });
    dueValue.alignment = { horizontal: "left", vertical: "middle" };
  } else {
    dueValue.value = "Nil — fully paid. Thank you!";
    dueValue.font = font({ size: 16, bold: true, color: GREEN });
  }
  ws.getRow(11).height = 30;
  line(ws, 10, "E", "G", `Billed ${inr(billed)}   ·   Paid ${inr(paid)}${waived > 0 ? `   ·   Waived ${inr(waived)}` : ""}`, {
    size: 10,
    color: MUTED,
  }).alignment = { horizontal: "right", vertical: "middle", wrapText: true };

  const head = 13;
  tableHead(ws, head, ["Bill no.", "Bill date", "Site", "Work / payment", "Bill amount", "Paid", "Balance due"], 4);

  let row = head + 1;
  for (const bill of bills) {
    const r = ws.getRow(row);
    r.getCell(1).value = bill.docNumber;
    r.getCell(1).font = font({ bold: true });
    r.getCell(2).value = formatDay(bill.date);
    r.getCell(3).value = bill.site;
    r.getCell(4).value = bill.subject || "—";
    for (const c of [1, 2, 3, 4]) {
      r.getCell(c).alignment = { vertical: "top", wrapText: true };
      if (c > 1) r.getCell(c).font = font({ color: c === 4 ? INK : MUTED });
    }
    money(r.getCell(5), bill.total, { bold: true });
    money(r.getCell(6), bill.received, { color: bill.received > 0 ? GREEN : MUTED });
    if (bill.pending > 0) money(r.getCell(7), bill.pending, { bold: true });
    else {
      r.getCell(7).value = "Paid";
      r.getCell(7).font = font({ bold: true, color: GREEN });
      r.getCell(7).alignment = { horizontal: "right", vertical: "top" };
    }
    r.height = heightFor([
      [bill.site, 30],
      [bill.subject, 36],
    ]);
    row++;

    // What the client has paid for this bill, and when.
    if (bill.events.length === 0) {
      const pr = ws.getRow(row);
      for (let c = 1; c <= 7; c++) pr.getCell(c).fill = fill(SOFT_BG);
      pr.getCell(2).value = "   No payment received yet";
      pr.getCell(2).font = font({ size: 10, italic: true, color: MUTED });
      row++;
    } else {
      for (const e of bill.events) {
        const { title, detail } = eventWords(e, input.paymentTotals);
        const pr = ws.getRow(row);
        for (let c = 1; c <= 7; c++) pr.getCell(c).fill = fill(SOFT_BG);
        ws.mergeCells(`B${row}:C${row}`);
        pr.getCell(2).value = `   ↳ ${title}`;
        pr.getCell(2).font = font({ size: 10, color: e.kind === "writeoff" ? MUTED : INK });
        pr.getCell(2).alignment = { vertical: "top" };
        const text = [formatDay(e.date), detail].filter(Boolean).join(" · ");
        pr.getCell(4).value = text;
        pr.getCell(4).font = font({ size: 10, color: MUTED });
        pr.getCell(4).alignment = { wrapText: true, vertical: "top" };
        // A waived amount was not paid, so it stays out of the Paid column.
        if (e.kind !== "writeoff") money(pr.getCell(6), e.amount, { size: 10, color: GREEN });
        pr.height = heightFor([[text, 36]]);
        row++;
      }
    }
    for (let c = 1; c <= 7; c++) ws.getRow(row - 1).getCell(c).border = bottom();
  }

  // Totals
  const t = ws.getRow(row);
  t.getCell(1).value = "Total";
  t.getCell(1).font = font({ bold: true });
  money(t.getCell(5), billed, { bold: true });
  money(t.getCell(6), paid, { bold: true, color: GREEN });
  if (due > 0) money(t.getCell(7), due, { bold: true });
  else {
    t.getCell(7).value = "Nil";
    t.getCell(7).font = font({ bold: true, color: GREEN });
    t.getCell(7).alignment = { horizontal: "right", vertical: "top" };
  }
  for (let c = 1; c <= 7; c++)
    t.getCell(c).border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
  t.height = 24;
  row += 1;

  if (input.advanceWithUs > 0 && due <= 0) {
    // Nothing due: just say how much advance is with us.
    const n = ws.getRow(row);
    ws.mergeCells(`A${row}:F${row}`);
    n.getCell(1).value = "Advance remaining with us (adjusted in your next bill)";
    n.getCell(1).font = font({ bold: true });
    money(n.getCell(7), input.advanceWithUs, { bold: true, color: GREEN });
    row++;
  } else if (input.advanceWithUs > 0) {
    const a = ws.getRow(row);
    ws.mergeCells(`A${row}:F${row}`);
    a.getCell(1).value = "Less: advance already paid, not yet adjusted against any bill";
    a.getCell(1).font = font({ size: 10, color: MUTED });
    money(a.getCell(7), input.advanceWithUs, { size: 10, color: GREEN });
    a.getCell(7).numFmt = `"− "${INR.split(";")[2]}`;
    row++;
    const n = ws.getRow(row);
    ws.mergeCells(`A${row}:F${row}`);
    n.getCell(1).value = net > 0 ? "Balance due" : "Advance remaining with us (adjusted in your next bill)";
    n.getCell(1).font = font({ bold: true });
    money(n.getCell(7), net > 0 ? net : input.advanceWithUs - due, { bold: true, color: net > 0 ? INK : GREEN });
    row++;
  }

  // How to pay
  row += 1;
  if (net > 0 && b.bank && (b.bank.accountNumber || b.bank.bankName)) {
    line(ws, row++, "A", "D", "Banking details", { size: 10, bold: true });
    const bankLines = [
      b.bank.accountName && `Account name: ${b.bank.accountName}`,
      b.bank.bankName && `Bank: ${b.bank.bankName}${b.bank.branch ? `, ${b.bank.branch}` : ""}`,
      b.bank.accountNumber && `Account no.: ${b.bank.accountNumber}`,
      b.bank.ifsc && `IFSC: ${b.bank.ifsc}`,
    ].filter(Boolean) as string[];
    for (const l of bankLines) line(ws, row++, "A", "D", l, { size: 10 });
    row += 1;
  }
  const notes = [b.phone ? `For any questions about this statement, please call ${b.phone}.` : ""].filter(Boolean);
  for (const n of notes) line(ws, row++, "A", "G", n, { size: 9, italic: true, color: MUTED });
  row += 1;
  if (b.name) line(ws, row, "D", "G", `For ${b.name}`, { size: 10, bold: true }).alignment = { horizontal: "right", wrapText: true };
  if (b.signatory) line(ws, row + 3, "D", "G", b.signatory, { size: 10, color: MUTED }).alignment = { horizontal: "right" };

  pageSetup(ws, head);
}

/** Second sheet, only when every bill is included: classic running balance. */
function runningBalanceSheet(ws: Worksheet, input: ExportInput) {
  const st = input.statement!;
  ws.columns = [{ width: 14 }, { width: 50 }, { width: 17 }, { width: 17 }, { width: 19 }];
  header(ws, input.business, "E");
  line(ws, 6, "A", "E", "RUNNING BALANCE", { size: 10, bold: true, color: BRAND });
  line(ws, 7, "A", "E", input.client.name, { size: 14, bold: true }, 22);
  line(ws, 8, "A", "E", "Every bill and payment in date order, with the balance after each line.", { size: 10, color: MUTED });
  const head = 10;
  tableHead(ws, head, ["Date", "Details", "Billed", "Paid", "Balance"], 2);

  const balance = (cell: Cell, value: number, bold = false) => {
    money(cell, Math.abs(value), { bold, color: value < 0 ? GREEN : INK });
    if (value < 0) cell.numFmt = `"Advance "${INR.split(";")[2]}`;
  };
  // Client wording; entries removed as mistakes are left out.
  const words = (e: LedgerEntry) => {
    if (e.kind === "bill") return [e.title, e.detail].filter(Boolean).join(" — ");
    if (e.kind === "marked") return `Paid — ${e.title.replace("Marked paid · ", "")}`;
    if (e.kind === "tds") return "TDS deducted by you";
    if (e.kind === "adjustment") return `Balance waived${e.detail ? ` — ${e.detail.replace("Client will not pay the rest", "").replace(/^ · /, "")}` : ""}`;
    return [e.title.replace("Received ·", "Payment ·"), e.detail.replace("general payment", "").replace(/ · $/, "")]
      .filter(Boolean)
      .join(" — ");
  };

  let row = head + 1;
  const edge = (label: string, value: number) => {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = font({ bold: true });
    balance(r.getCell(5), value, true);
    for (let c = 1; c <= 5; c++) r.getCell(c).fill = fill(HEAD_BG);
    r.height = 22;
    row++;
  };
  edge("Opening balance", st.opening);
  for (const e of st.rows.filter((x) => !x.voided && x.amount !== 0)) {
    const r = ws.getRow(row);
    const text = words(e);
    r.getCell(1).value = formatDay(e.date);
    r.getCell(1).font = font({ color: MUTED });
    r.getCell(1).alignment = { vertical: "top" };
    r.getCell(2).value = text;
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(2).font = font();
    if (e.amount >= 0) money(r.getCell(3), e.amount);
    else money(r.getCell(4), -e.amount, { color: GREEN });
    balance(r.getCell(5), e.balance);
    r.height = heightFor([[text, 50]]);
    for (let c = 1; c <= 5; c++) r.getCell(c).border = bottom();
    row++;
  }
  edge(st.closing < 0 ? "Advance with us (adjusted in your next bill)" : "Balance due", st.closing);
  pageSetup(ws, head);
}

/** The workbook as file bytes. */
export async function buildLedgerWorkbook(input: ExportInput) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.business.name || "Statement";
  wb.created = new Date();
  statementSheet(wb.addWorksheet("Statement", { properties: { tabColor: { argb: BRAND } } }), input);
  if (input.statement) runningBalanceSheet(wb.addWorksheet("Running balance"), input);
  return wb.xlsx.writeBuffer();
}

export function statementFileName(input: ExportInput) {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const which = input.bills.length === 1 ? safe(input.bills[0].docNumber) : `${input.bills.length} bills`;
  return `Statement - ${safe(input.client.name)} - ${which} - ${formatDay(todayISO())}.xlsx`;
}

export async function downloadLedgerExcel(input: ExportInput) {
  const buffer = await buildLedgerWorkbook(input);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = statementFileName(input);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
