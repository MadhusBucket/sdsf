import type { Borders, Cell, Fill, Worksheet } from "exceljs";

import { formatDay, MODE_LABELS, todayISO, type BillEvent, type LedgerEntry } from "./compute";

/**
 * Builds a clean, printable Excel ledger (opens in Excel and Google Sheets).
 * Runs in the browser only; nothing is sent anywhere.
 */

export interface ExportBill {
  docNumber: string;
  branch: string;
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

export interface ExportInput {
  business: { name: string; address: string; gstin: string; phone: string };
  company: { name: string; detail: string };
  bills: ExportBill[];
  /** Full statement with running balance; left out when only some bills are chosen. */
  statement: { opening: number; rows: LedgerEntry[]; closing: number } | null;
}

/* ---------- Look ---------- */
const INK = "FF18181B";
const MUTED = "FF71717A";
const LINE = "FFE4E4E7";
const HEAD_BG = "FFF4F4F5";
const SOFT_BG = "FFFAFAFA";
const BRAND = "FF2F4BE0";
const STATUS: Record<ExportBill["status"], { bg: string; fg: string }> = {
  Paid: { bg: "FFE7F6EC", fg: "FF15803D" },
  "Part paid": { bg: "FFFEF3C7", fg: "FF92400E" },
  "Not paid": { bg: "FFFEE2E2", fg: "FFB91C1C" },
};
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

function money(cell: Cell, value: number, o: Parameters<typeof font>[0] = {}) {
  cell.value = Math.round(value * 100) / 100;
  cell.numFmt = INR;
  cell.font = font(o);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function heading(ws: Worksheet, input: ExportInput, title: string, sub: string, lastCol: string) {
  const { business } = input;
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = business.name || "Ledger";
  ws.getCell("A1").font = font({ size: 18, bold: true });
  ws.getRow(1).height = 28;

  const line2 = [business.address, business.gstin ? `GSTIN ${business.gstin}` : "", business.phone ? `Ph ${business.phone}` : ""]
    .filter(Boolean)
    .join("   ·   ");
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = line2;
  ws.getCell("A2").font = font({ size: 10, color: MUTED });

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell("A3").border = bottom(BRAND, "medium");
  ws.getRow(3).height = 6;

  ws.mergeCells(`A5:${lastCol}5`);
  ws.getCell("A5").value = title;
  ws.getCell("A5").font = font({ size: 14, bold: true });
  ws.getRow(5).height = 22;
  ws.mergeCells(`A6:${lastCol}6`);
  ws.getCell("A6").value = sub;
  ws.getCell("A6").font = font({ size: 10, color: MUTED });
}

function printSetup(ws: Worksheet, headerRow: number) {
  ws.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false }];
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: "&L&8&K71717APage &P of &N&R&8&K71717AGenerated on &D" };
}

function headerRow(ws: Worksheet, row: number, labels: string[], rightFrom: number) {
  const r = ws.getRow(row);
  labels.forEach((label, i) => {
    const c = r.getCell(i + 1);
    c.value = label;
    c.font = font({ size: 10, bold: true, color: MUTED });
    c.fill = fill(HEAD_BG);
    c.border = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } } };
    c.alignment = { vertical: "middle", horizontal: i >= rightFrom ? "right" : "left" };
  });
  r.height = 24;
}

function billsSheet(ws: Worksheet, input: ExportInput) {
  const today = formatDay(todayISO());
  ws.columns = [
    { width: 16 }, // A Bill no
    { width: 30 }, // B Branch & address
    { width: 14 }, // C Bill date
    { width: 38 }, // D Work
    { width: 17 }, // E Bill amount
    { width: 17 }, // F Received
    { width: 17 }, // G Pending
    { width: 13 }, // H Status
  ];
  const n = input.bills.length;
  heading(
    ws,
    input,
    `Ledger — ${input.company.name}`,
    `${input.company.detail ? `${input.company.detail}   ·   ` : ""}${n} ${n === 1 ? "bill" : "bills"}   ·   As of ${today}`,
    "H"
  );

  // Summary
  const billed = input.bills.reduce((s, b) => s + b.total, 0);
  const received = input.bills.reduce((s, b) => s + b.received, 0);
  const pending = input.bills.reduce((s, b) => s + b.pending, 0);
  const boxes: [string, string, number, string][] = [
    ["A", "B", billed, INK],
    ["C", "D", received, "FF15803D"],
    ["E", "F", pending, pending > 0 ? "FFB91C1C" : INK],
  ];
  const names = ["Total billed", "Total received", "Pending"];
  boxes.forEach(([from, to, value, color], i) => {
    ws.mergeCells(`${from}8:${to}8`);
    ws.mergeCells(`${from}9:${to}9`);
    const label = ws.getCell(`${from}8`);
    label.value = names[i];
    label.font = font({ size: 10, color: MUTED });
    const v = ws.getCell(`${from}9`);
    money(v, value, { size: 16, bold: true, color });
    v.alignment = { horizontal: "left", vertical: "middle" };
  });
  ws.getRow(9).height = 24;

  const head = 11;
  headerRow(ws, head, ["Bill no.", "Branch & address", "Bill date", "Work / payment", "Bill amount", "Received", "Pending", "Status"], 4);
  ws.getCell(`H${head}`).alignment = { horizontal: "center", vertical: "middle" };

  let row = head + 1;
  for (const b of input.bills) {
    const r = ws.getRow(row);
    r.getCell(1).value = b.docNumber;
    r.getCell(1).font = font({ bold: true });
    r.getCell(2).value = b.branch;
    r.getCell(3).value = formatDay(b.date);
    r.getCell(4).value = b.subject;
    money(r.getCell(5), b.total, { bold: true });
    money(r.getCell(6), b.received, { color: "FF15803D" });
    money(r.getCell(7), b.pending, { bold: b.pending > 0, color: b.pending > 0 ? "FFB91C1C" : MUTED });
    const st = r.getCell(8);
    st.value = b.status;
    st.font = font({ size: 10, bold: true, color: STATUS[b.status].fg });
    st.fill = fill(STATUS[b.status].bg);
    st.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).alignment = { vertical: "top", wrapText: c === 2 || c === 4 };
      if (c > 1) r.getCell(c).font = font({ color: c === 4 ? INK : MUTED });
    }
    // Taller row when the address has several lines, so nothing is cut off.
    const lines = Math.max(b.branch.split("\n").length, Math.ceil(b.subject.length / 40), 1);
    r.height = Math.max(22, lines * 15 + 6);
    for (const c of [5, 6, 7, 8]) r.getCell(c).alignment = { ...r.getCell(c).alignment, vertical: "top" };
    row++;

    // The bill's payment story, one line each.
    for (const e of b.events) {
      const pr = ws.getRow(row);
      for (let c = 1; c <= 8; c++) pr.getCell(c).fill = fill(SOFT_BG);
      pr.getCell(2).value = `   ↳ ${e.label}`;
      pr.getCell(2).font = font({ size: 10, color: MUTED });
      pr.getCell(3).value = formatDay(e.date);
      pr.getCell(3).font = font({ size: 10, color: MUTED });
      const how =
        e.kind === "writeoff"
          ? "Client will not pay the rest"
          : e.kind === "marked"
            ? "Payment details not entered"
            : [
                e.mode ? MODE_LABELS[e.mode] : "",
                e.reference ?? "",
                e.tds > 0 ? `incl. TDS ₹${e.tds.toLocaleString("en-IN")}` : "",
                e.kind === "general" ? "from a general payment" : "",
              ]
                .filter(Boolean)
                .join(" · ");
      pr.getCell(4).value = how;
      pr.getCell(4).font = font({ size: 10, color: MUTED, italic: e.kind !== "payment" });
      money(pr.getCell(6), e.amount, { size: 10, color: e.kind === "writeoff" ? MUTED : "FF15803D" });
      if (e.kind === "writeoff") pr.getCell(6).numFmt = `"written off "${INR.split(";")[2]}`;
      row++;
    }
    for (let c = 1; c <= 8; c++) ws.getRow(row - 1).getCell(c).border = bottom();
  }

  // Totals
  const t = ws.getRow(row);
  t.getCell(1).value = "Total";
  t.getCell(1).font = font({ bold: true });
  money(t.getCell(5), billed, { bold: true });
  money(t.getCell(6), received, { bold: true, color: "FF15803D" });
  money(t.getCell(7), pending, { bold: true, color: pending > 0 ? "FFB91C1C" : INK });
  for (let c = 1; c <= 8; c++) t.getCell(c).border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
  t.height = 24;

  ws.mergeCells(`A${row + 2}:H${row + 2}`);
  const note = ws.getCell(`A${row + 2}`);
  note.value = "Received includes TDS kept by the client. Lines starting with ↳ show each payment and the date it came.";
  note.font = font({ size: 9, color: MUTED, italic: true });

  printSetup(ws, head);
}

function statementSheet(ws: Worksheet, input: ExportInput) {
  const st = input.statement!;
  ws.columns = [{ width: 14 }, { width: 46 }, { width: 18 }, { width: 18 }, { width: 20 }];
  heading(ws, input, `Statement of account — ${input.company.name}`, "Every bill and payment in date order, with the balance after each line", "E");
  const head = 8;
  headerRow(ws, head, ["Date", "Details", "Bill (+)", "Received (−)", "Balance"], 2);

  const balanceCell = (cell: Cell, value: number, bold = false) => {
    money(cell, Math.abs(value), { bold, color: value < 0 ? "FF15803D" : INK });
    if (value < 0) cell.numFmt = `"Extra "${INR.split(";")[2]}`;
  };

  let row = head + 1;
  const edge = (label: string, value: number) => {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = font({ bold: true });
    balanceCell(r.getCell(5), value, true);
    for (let c = 1; c <= 5; c++) r.getCell(c).fill = fill(HEAD_BG);
    r.height = 22;
    row++;
  };
  edge("Opening balance", st.opening);
  for (const e of st.rows) {
    const r = ws.getRow(row);
    r.getCell(1).value = formatDay(e.date);
    r.getCell(1).font = font({ color: MUTED });
    r.getCell(2).value = [e.title, e.detail].filter(Boolean).join(" — ") + (e.voided ? " (removed, not counted)" : "");
    r.getCell(2).font = font({ color: e.voided ? MUTED : INK, italic: e.voided });
    r.getCell(2).alignment = { wrapText: true, vertical: "middle" };
    if (e.amount >= 0) money(r.getCell(3), e.amount, { color: e.voided ? MUTED : INK });
    else money(r.getCell(4), -e.amount, { color: e.voided ? MUTED : "FF15803D" });
    balanceCell(r.getCell(5), e.balance);
    for (let c = 1; c <= 5; c++) r.getCell(c).border = bottom();
    row++;
  }
  edge(st.closing < 0 ? "Extra received (adjusts in next bill)" : "Balance due", st.closing);

  printSetup(ws, head);
}

/** The workbook as file bytes. */
export async function buildLedgerWorkbook(input: ExportInput) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.business.name || "Ledger";
  wb.created = new Date();
  billsSheet(wb.addWorksheet("Bills", { properties: { tabColor: { argb: BRAND } } }), input);
  if (input.statement) statementSheet(wb.addWorksheet("Statement"), input);
  return wb.xlsx.writeBuffer();
}

export async function downloadLedgerExcel(input: ExportInput) {
  const buffer = await buildLedgerWorkbook(input);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const name = `Ledger - ${safe(input.company.name)} - ${formatDay(todayISO())}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
