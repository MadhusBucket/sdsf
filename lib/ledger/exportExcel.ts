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
      ? "not charged; bill closed"
      : e.kind === "marked"
        ? ""
        : [
            e.mode ? MODE_LABELS[e.mode] : "",
            e.reference ?? "",
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

/** Rough row height so wrapped text is never cut off. */
const heightFor = (texts: [string, number][]) =>
  Math.max(
    20,
    Math.max(...texts.map(([t, width]) => (t || "").split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / (width * 1.2))), 0))) * 14 + 6
  );

/* Table look for the statement */
const HEAD_DARK = "FF27272A";
const RED = "FFB91C1C";
const RED_BG = "FFFEE2E2";
const RED_SOFT = "FFFFF5F5";
const GREEN_BG = "FFDCFCE7";
const GRID: Partial<Borders> = {
  top: { style: "thin", color: { argb: LINE } },
  bottom: { style: "thin", color: { argb: LINE } },
  left: { style: "thin", color: { argb: LINE } },
  right: { style: "thin", color: { argb: LINE } },
};

/** The balance cell: red while something is due, green "Nil" when cleared. */
function balanceCell(cell: Cell, value: number, strong: boolean) {
  if (Math.round(value * 100) <= 0) {
    cell.value = "Nil";
    cell.font = font({ bold: strong, color: GREEN, size: strong ? 11 : 10 });
    cell.fill = fill(strong ? GREEN_BG : SOFT_BG);
    cell.alignment = { horizontal: "right", vertical: "top" };
    return;
  }
  money(cell, value, { bold: strong, color: RED, size: strong ? 11 : 10 });
  cell.fill = fill(strong ? RED_BG : RED_SOFT);
}

function statementSheet(ws: Worksheet, input: ExportInput) {
  const { business: b, bills } = input;
  const today = formatDay(todayISO());
  ws.columns = [
    { width: 5 }, // A #
    { width: 15 }, // B Bill no.
    { width: 13 }, // C Date
    { width: 28 }, // D Site
    { width: 34 }, // E Details
    { width: 15 }, // F Bill amount
    { width: 15 }, // G Paid
    { width: 16 }, // H Balance
  ];

  // ----- Heading: who it is from, what it is -----
  line(ws, 1, "A", "E", b.name || "Statement", { size: 16, bold: true }, 26);
  line(ws, 1, "F", "H", "PAYMENT STATEMENT", { size: 13, bold: true, color: BRAND }).alignment = { horizontal: "right", vertical: "middle" };
  if (b.address) line(ws, 2, "A", "E", b.address, { size: 9, color: MUTED });
  line(ws, 2, "F", "H", `Date: ${today}`, { size: 10, color: MUTED }).alignment = { horizontal: "right", vertical: "middle" };
  const contact = [b.gstin ? `GSTIN ${b.gstin}` : "", b.phone ? `Phone ${b.phone}` : "", b.email].filter(Boolean).join("   ·   ");
  if (contact) line(ws, 3, "A", "E", contact, { size: 9, color: MUTED });
  const which = bills.length <= 3 ? bills.map((x) => x.docNumber).join(", ") : `${bills.length} bills`;
  line(ws, 3, "F", "H", which, { size: 10, color: MUTED }).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  ws.mergeCells("A4:H4");
  ws.getCell("A4").border = bottom(BRAND, "medium");
  ws.getRow(4).height = 6;

  // ----- Who it is for -----
  line(ws, 6, "A", "E", "Statement for", { size: 9, color: MUTED });
  line(ws, 7, "A", "E", input.client.name, { size: 14, bold: true }, 22);

  // ----- The three numbers -----
  const billed = bills.reduce((s2, x) => s2 + x.total, 0);
  const paid = bills.reduce((s2, x) => s2 + x.received, 0);
  const due = bills.reduce((s2, x) => s2 + x.pending, 0);
  const net = Math.max(0, Math.round((due - input.advanceWithUs) * 100) / 100);
  const box = (from: string, to: string, label: string, value: number, kind: "plain" | "paid" | "due") => {
    ws.mergeCells(`${from}9:${to}9`);
    ws.mergeCells(`${from}10:${to}10`);
    const l = ws.getCell(`${from}9`);
    const v = ws.getCell(`${from}10`);
    l.value = label;
    l.font = font({ size: 9, bold: true, color: kind === "due" ? (value > 0 ? RED : GREEN) : MUTED });
    l.alignment = { vertical: "bottom", indent: 1 };
    if (kind === "due" && value <= 0) {
      v.value = "Nil — fully paid";
      v.font = font({ size: 15, bold: true, color: GREEN });
    } else {
      money(v, value, { size: 15, bold: true, color: kind === "due" ? RED : kind === "paid" ? GREEN : INK });
    }
    v.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    const bg = kind === "due" ? (value > 0 ? RED_BG : GREEN_BG) : HEAD_BG;
    const edge = kind === "due" ? (value > 0 ? RED : GREEN) : LINE;
    for (const r of [9, 10]) {
      const c = ws.getCell(`${from}${r}`);
      c.fill = fill(bg);
      c.border = {
        top: r === 9 ? { style: "thin", color: { argb: edge } } : undefined,
        bottom: r === 10 ? { style: "thin", color: { argb: edge } } : undefined,
        left: { style: "thin", color: { argb: edge } },
        right: { style: "thin", color: { argb: edge } },
      };
    }
  };
  box("A", "C", "TOTAL BILLED", billed, "plain");
  box("D", "E", "TOTAL PAID", paid, "paid");
  box("F", "H", "BALANCE DUE", net, "due");
  ws.getRow(9).height = 18;
  ws.getRow(10).height = 30;

  // ----- Table -----
  const head = 12;
  const labels = ["#", "Bill no.", "Date", "Site", "Details", "Bill amount", "Paid", "Balance"];
  const hr = ws.getRow(head);
  labels.forEach((label, i) => {
    const c = hr.getCell(i + 1);
    c.value = label;
    c.font = font({ size: 10, bold: true, color: "FFFFFFFF" });
    c.fill = fill(i === 7 ? RED : HEAD_DARK);
    c.border = GRID;
    c.alignment = { vertical: "middle", horizontal: i >= 5 ? "right" : i === 0 ? "center" : "left" };
  });
  hr.height = 24;

  const grid = (rowNo: number) => {
    for (let c = 1; c <= 8; c++) ws.getRow(rowNo).getCell(c).border = GRID;
  };

  let row = head + 1;
  bills.forEach((bill, idx) => {
    // Bill line: what was billed. Balance starts at the bill amount.
    const r = ws.getRow(row);
    const hasPayments = bill.events.length > 0;
    r.getCell(1).value = idx + 1;
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(1).font = font({ color: MUTED });
    r.getCell(2).value = bill.docNumber;
    r.getCell(2).font = font({ bold: true });
    r.getCell(3).value = formatDay(bill.date);
    r.getCell(4).value = bill.site || "—";
    r.getCell(5).value = bill.subject ? `Bill: ${bill.subject}` : "Bill";
    for (const c of [2, 3, 4, 5]) r.getCell(c).alignment = { vertical: "top", wrapText: true };
    r.getCell(3).font = font({ color: MUTED });
    r.getCell(4).font = font({ color: MUTED });
    r.getCell(5).font = font({ bold: true });
    money(r.getCell(6), bill.total, { bold: true });
    balanceCell(r.getCell(8), bill.total, !hasPayments);
    r.height = heightFor([
      [bill.site, 28],
      [`Bill: ${bill.subject}`, 34],
    ]);
    grid(row);
    row++;

    // Each payment, with what is left after it.
    let left = bill.total;
    bill.events.forEach((e, i) => {
      const { title, detail } = eventWords(e, input.paymentTotals);
      left = Math.round((left - e.amount) * 100) / 100;
      const last = i === bill.events.length - 1;
      const pr = ws.getRow(row);
      pr.getCell(3).value = formatDay(e.date);
      pr.getCell(3).font = font({ size: 10, color: MUTED });
      pr.getCell(3).alignment = { vertical: "top" };
      const text = [title, detail].filter(Boolean).join(" · ");
      ws.mergeCells(`D${row}:E${row}`);
      pr.getCell(4).value = `↳ ${text}${e.kind === "writeoff" ? ` (${inr(e.amount)})` : ""}`;
      pr.getCell(4).font = font({ size: 10, color: e.kind === "writeoff" ? MUTED : INK, italic: e.kind === "writeoff" });
      pr.getCell(4).alignment = { vertical: "top", wrapText: true, indent: 1 };
      if (e.kind !== "writeoff") money(pr.getCell(7), e.amount, { size: 10, color: GREEN });
      balanceCell(pr.getCell(8), left, last);
      pr.height = heightFor([[text, 62]]);
      grid(row);
      row++;
    });
    if (!hasPayments) {
      // nothing paid yet: say so plainly, under the bill
      const pr = ws.getRow(row);
      ws.mergeCells(`D${row}:E${row}`);
      pr.getCell(4).value = "↳ No payment received yet";
      pr.getCell(4).font = font({ size: 10, italic: true, color: MUTED });
      pr.getCell(4).alignment = { indent: 1 };
      grid(row);
      row++;
    }
    // A slightly stronger line between bills
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getRow(row - 1).getCell(c);
      cell.border = { ...cell.border, bottom: { style: "thin", color: { argb: "FF71717A" } } };
    }
  });

  // Totals
  const t = ws.getRow(row);
  ws.mergeCells(`A${row}:E${row}`);
  t.getCell(1).value = "Total";
  t.getCell(1).font = font({ bold: true });
  t.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  money(t.getCell(6), billed, { bold: true });
  money(t.getCell(7), paid, { bold: true, color: GREEN });
  balanceCell(t.getCell(8), due, true);
  for (let c = 1; c <= 8; c++) {
    const cell = t.getCell(c);
    cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
    if (c < 8) cell.fill = fill(HEAD_BG);
    cell.alignment = { ...cell.alignment, vertical: "middle" };
  }
  t.height = 24;
  row++;

  if (input.advanceWithUs > 0) {
    const a = ws.getRow(row);
    ws.mergeCells(`A${row}:G${row}`);
    a.getCell(1).value =
      due > 0
        ? "Less: advance already paid, not yet used for any bill"
        : "Advance with us (will be adjusted in your next bill)";
    a.getCell(1).font = font({ size: 10, color: MUTED });
    a.getCell(1).alignment = { horizontal: "right" };
    money(a.getCell(8), input.advanceWithUs, { size: 10, color: GREEN });
    row++;
    if (due > 0) {
      const n = ws.getRow(row);
      ws.mergeCells(`A${row}:G${row}`);
      n.getCell(1).value = "Balance due";
      n.getCell(1).font = font({ bold: true });
      n.getCell(1).alignment = { horizontal: "right" };
      balanceCell(n.getCell(8), net, true);
      row++;
    }
  }

  // ----- Banking details (left) and signature (right) -----
  row += 1;
  const blockStart = row;
  if (b.bank && (b.bank.accountNumber || b.bank.bankName)) {
    const lines = [
      ["Account name", b.bank.accountName],
      ["Bank", [b.bank.bankName, b.bank.branch].filter(Boolean).join(", ")],
      ["Account no.", b.bank.accountNumber],
      ["IFSC", b.bank.ifsc],
    ].filter(([, v]) => v) as [string, string][];
    line(ws, row, "A", "E", "Banking details", { size: 10, bold: true }).fill = fill(HEAD_BG);
    row++;
    for (const [k, v] of lines) {
      ws.mergeCells(`A${row}:B${row}`);
      ws.getCell(`A${row}`).value = k;
      ws.getCell(`A${row}`).font = font({ size: 10, color: MUTED });
      line(ws, row, "C", "E", v, { size: 10, bold: k === "Account no." || k === "IFSC" });
      row++;
    }
    for (let r = blockStart; r < row; r++)
      for (const col of ["A", "B", "C", "D", "E"]) {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = {
          top: r === blockStart ? { style: "thin", color: { argb: LINE } } : undefined,
          bottom: r === row - 1 ? { style: "thin", color: { argb: LINE } } : undefined,
          left: col === "A" ? { style: "thin", color: { argb: LINE } } : undefined,
          right: col === "E" ? { style: "thin", color: { argb: LINE } } : undefined,
        };
      }
  }
  if (b.name) {
    line(ws, blockStart, "F", "H", `For ${b.name}`, { size: 10, bold: true }).alignment = { horizontal: "right", wrapText: true, vertical: "top" };
    ws.getRow(blockStart).height = Math.max(ws.getRow(blockStart).height ?? 15, b.name.length > 34 ? 30 : 18);
  }
  const signRow = Math.max(row - 1, blockStart + 4);
  if (b.signatory) line(ws, signRow, "F", "H", b.signatory, { size: 10, bold: true }).alignment = { horizontal: "right" };
  line(ws, signRow + 1, "F", "H", "Authorised signatory", { size: 9, color: MUTED }).alignment = { horizontal: "right" };
  row = signRow + 3;

  const notes = [
    "Balance = what is still to be paid after each line.",
    b.phone ? `For any questions about this statement, please call ${b.phone}.` : "",
  ].filter(Boolean);
  for (const n of notes) line(ws, row++, "A", "H", n, { size: 9, italic: true, color: MUTED });

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
  ["Date", "Details", "Billed", "Paid", "Balance"].forEach((label, i) => {
    const c = ws.getRow(head).getCell(i + 1);
    c.value = label;
    c.font = font({ size: 10, bold: true, color: "FFFFFFFF" });
    c.fill = fill(i === 4 ? RED : HEAD_DARK);
    c.border = GRID;
    c.alignment = { vertical: "middle", horizontal: i >= 2 ? "right" : "left" };
  });
  ws.getRow(head).height = 24;

  const balance = (cell: Cell, value: number, bold = false) => {
    if (value < 0) {
      money(cell, -value, { bold, color: GREEN });
      cell.numFmt = `"Advance "${INR.split(";")[2]}`;
      cell.fill = fill(GREEN_BG);
      return;
    }
    balanceCell(cell, value, bold);
  };
  // Client wording; entries removed as mistakes are left out.
  const words = (e: LedgerEntry) => {
    if (e.kind === "bill") return [e.title, e.detail].filter(Boolean).join(" — ");
    if (e.kind === "marked") return `Paid — ${e.title.replace("Marked paid · ", "")}`;
    if (e.kind === "tds") return "Payment";
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
    for (let c = 1; c <= 4; c++) r.getCell(c).fill = fill(HEAD_BG);
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
    for (let c = 1; c <= 5; c++) r.getCell(c).border = GRID;
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
