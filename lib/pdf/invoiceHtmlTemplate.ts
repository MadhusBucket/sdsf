import { format } from "date-fns";

import type { BankDetails, MerchantDetails } from "@/lib/pdf/merchantFromEnv";
import type { Company, Document, LineItem } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";

import { escapeHtml } from "./escapeHtml";

export interface InvoiceHtmlPayload {
  document: Document;
  company: Company;
  merchant: MerchantDetails;
  bank: BankDetails;
  signatoryName: string;
}

function parseDocDate(dateStr: string): Date {
  const d = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function filterLineItems(items: LineItem[]): LineItem[] {
  return items.filter((i) => {
    const desc = String(i.description ?? "").trim();
    const amount = Number(i.amount ?? 0);
    const qty = Number(i.qty ?? 0);
    return desc !== "" || amount !== 0 || qty !== 0;
  });
}

export function buildInvoiceHtml(p: InvoiceHtmlPayload): string {
  const { document: doc, company, merchant, bank, signatoryName } = p;
  const title = doc.type === "invoice" ? "INVOICE" : "QUOTATION";
  const issueDate = format(parseDocDate(doc.date ?? ""), "dd MMMM yyyy").toUpperCase();
  const docIdLabel = doc.type === "invoice" ? "Invoice ID" : "Quotation ID";
  const rows = filterLineItems(Array.isArray(doc.items) ? doc.items : []);
  const subtotal = doc.subtotal ?? 0;
  const cgst = doc.cgst_amount ?? 0;
  const sgst = doc.sgst_amount ?? 0;
  const grandTotal = doc.grand_total ?? 0;
  const subject = doc.subject?.trim();

  const merchantGstin = merchant.gstin?.trim() || "N/A";
  const billGstin = company.gstin?.trim() || "N/A";
  const merchantLines = Array.isArray(merchant.addressLines) ? merchant.addressLines : [];
  const companyAddrLines = (company.address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const dash = (v: string | null | undefined) => escapeHtml((v ?? "").trim() || "—");

  const poRow =
    doc.type === "invoice" && doc.po_number
      ? `
            <div class="meta-row">
                <div class="meta-row" style="border:none; width:100%">
                    <div class="meta-label">PO Number</div>
                    <div class="meta-value">${escapeHtml(doc.po_number)}</div>
                </div>
            </div>`
      : "";

  const tableBodyRows = rows
    .map((item) => {
      const sub = item.subtext?.trim();
      const qty = Number(item.qty ?? 0);
      const rate = Number(item.rate ?? 0);
      const amount = Number(item.amount ?? 0);
      return `
            <tr>
                <td>${escapeHtml(String(item.sl_no ?? ""))}</td>
                <td>
                    <span class="item-title">${escapeHtml(item.description || "—")}</span>
                    ${sub ? `<span class="item-sub">${escapeHtml(sub)}</span>` : ""}
                </td>
                <td class="text-center bold-num">${escapeHtml(String(qty))}</td>
                <td class="text-center">${escapeHtml(item.unit ?? "")}</td>
                <td class="text-right bold-num">${escapeHtml(formatIndianCurrency(rate))}</td>
                <td class="text-right bold-num">${escapeHtml(formatIndianCurrency(amount))}</td>
            </tr>`;
    })
    .join("");

  const subjectBlock =
    subject && subject.length > 0
      ? `
    <div class="subject">
        <strong>Subject:</strong>
        <span>${escapeHtml(subject)}</span>
    </div>`
      : "";

  const termsLine =
    doc.type === "quotation"
      ? `<p style="margin-top: 20px; font-size: 11px; line-height: 1.5;">Terms &amp; Conditions: Valid for 7 days from quote date</p>`
      : "";

  const paymentColumn = `
        <div class="payment-info">
            <strong>Payment Information</strong>
            <div class="payment-data">
                <span>Bank</span> <span>${dash(bank.bankName)}</span>
                <span>A/C No</span> <span>${dash(bank.accountNumber)}</span>
                <span>IFSC</span> <span>${dash(bank.ifsc)}</span>
                <span>Branch</span> <span>${dash(bank.branch)}</span>
            </div>
            ${termsLine}
        </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(doc.doc_number ?? "")}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        @page {
    margin: 50px;
}

body {
    font-family: 'Inter', sans-serif;
    background-color: #fff;
    color: #000;
    padding: 0;
    -webkit-print-color-adjust: exact;
}

.container {
    padding: 50px 0;
}

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        /* HEADER */
        header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding-bottom: 20px;
            border-bottom: 10px solid #000;
            margin-bottom: 40px;
        }

        .brand h1 {
            font-size: 60px;
            font-weight: 900;
            letter-spacing: -2px;
            line-height: 0.8;
            text-transform: uppercase;
        }

        .brand p {
            font-size: 11px;
            font-weight: 700;
            margin-top: 12px;
            letter-spacing: 0.2px;
        }

        /* METADATA BOX */
        .meta-box {
            width: 250px;
            border: 1px solid #d2d2d2;
        }

        .meta-row {
            display: flex;
            border-bottom: 1px solid #d2d2d2;
        }

        .meta-row:last-child { border-bottom: none; }

        .meta-label {
            width: 90px;
            background: #f4f4f4;
            padding: 8px 8px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            border-right: 1px solid #d2d2d2;
        }

        .meta-value {
            padding: 8px 8px;
            font-size: 10px;
            font-weight: 700;
        }

        /* ADDRESS GRID */
        .address-grid {
            display: grid;
            grid-template-columns: 250px 250px;
            gap: 60px;
            margin-bottom: 20px;
        }

        .address-block p {
            font-size: 12px;
            margin-bottom: 2px;
        }

        .address-block strong {
            font-size: 14px;
            display: block;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .label {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #666;
            margin-bottom: 15px;
            display: block;
        }

        .gst-bold {
            font-weight: 700;
            font-size: 12px;
            margin-top: 10px;
            display: block;
        }

        /* SUBJECT */
        .subject {
            border-top: 1px solid #d2d2d2;
            border-bottom: 1px solid #d2d2d2;
            padding: 10px 0;
            margin-bottom: 40px;
            display: flex;
            align-items: baseline;
        }

        .subject strong {
            font-size: 10px;
            text-transform: uppercase;
            margin-right: 15px;
            white-space: nowrap;
        }

        .subject span {
            font-size: 13px;
            font-weight: 600;
        }

        /* TABLE */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 50px;
        }

        th {
            text-align: left;
            padding: 12px 5px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            border-bottom: 3px solid #000;
        }

        td {
            padding: 20px 5px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
        }
        td:first-child {
            font-size: 11px;
        }

        .item-title {
            font-weight: 700;
            font-size: 13px;
            display: block;
            margin-bottom: 4px;
        }

        .item-sub {
            font-size: 12px;
            color: #666;
            line-height: 1.5;
        }

        .text-right { text-align: right; }
        .text-center { text-align: center;font-size: 12px; justify-content: center; }
        .bold-num { font-weight: 400; font-size: 13px; }
        

        /* TOTALS */
        .totals-container {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .totals-box {
            width: 280px;
            border: 1px solid #d2d2d2;
        }

        .total-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 12px;
            font-size: 13px;
            border-bottom: 1px solid #d2d2d2;
        }

        .total-row.main {
            background: #ffffff;
            color: #000000;
            padding: 6px 12px;
            border-bottom: none;
        }

        .total-row.main span:first-child {
            font-size: 14px;
            font-weight: 700;
        }

        .total-row.main span:last-child {
            font-size: 14px;
            font-weight: 700;
        }

        /* FOOTER */
        .footer-grid {
              display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 100px;
    page-break-inside: avoid;
    break-inside: avoid;
        }

        .payment-info {
    page-break-inside: avoid;
    break-inside: avoid;
}

        .payment-info strong {
            display: block;
            font-size: 11px;
            text-transform: uppercase;
            border-bottom: 1px solid #d2d2d2;
            padding-bottom: 6px;
            margin-bottom: 12px;
        }

        .payment-data {
            display: grid;
            grid-template-columns: 80px 1fr;
            font-size: 12px;
            gap: 4px;
        }

        .auth-sign {
            text-align: right;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
        }

        .sign-line {
            border-bottom: 1px solid #d2d2d2;
            margin-bottom: 10px;
        }

        .auth-sign p {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .auth-sign p[style*="14px"] {
            font-size: 14px;
        }
    </style>
</head>
<body>

<div class="container">
    <header>
        <div class="brand">
            <h1>${escapeHtml(title)}</h1>
            ${merchant.name ? `<p style="color: red;">${escapeHtml(merchant.name)}</p>` : ""}
        </div>

        <div class="meta-box">
            <div class="meta-row">
                <div class="meta-label">Date</div>
                <div class="meta-value">${escapeHtml(issueDate)}</div>
            </div>
            <div class="meta-row">
                <div class="meta-label">${escapeHtml(docIdLabel)}</div>
                <div class="meta-value">${escapeHtml(doc.doc_number ?? "—")}</div>
            </div>
            ${poRow}
        </div>
    </header>

    <div class="address-grid">
        <div class="address-block">
            <span class="label">From</span>
            ${merchant.name ? `<strong>${escapeHtml(merchant.name)}</strong>` : ""}
            ${merchantLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
            ${merchant.phone ? `<p>${escapeHtml(merchant.phone)}</p>` : ""}
            ${merchant.email ? `<p>${escapeHtml(merchant.email)}</p>` : ""}
            <p>GSTIN: ${escapeHtml(merchantGstin)}</p>
        </div>
        <div class="address-block">
            <span class="label">Bill To</span>
            <strong>${escapeHtml(company.name)}</strong>
            ${companyAddrLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
            <p>GST: ${escapeHtml(billGstin)}</p>
        </div>
    </div>

    ${subjectBlock}

    <table>
        <thead>
            <tr>
                <th style="width: 50px;">SL</th>
                <th>Description of Work</th>
                <th class="text-center" style="width: 60px;">Qty</th>
                <th class="text-center" style="width: 60px;">Unit</th>
                <th class="text-right" style="width: 120px;">Unit Price</th>
                <th class="text-right" style="width: 140px;">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${tableBodyRows}
        </tbody>
    </table>

    <div class="totals-container">
        <div class="totals-box">
            <div class="total-row">
                <span>Subtotal</span>
                <span class="bold-num">${escapeHtml(formatIndianCurrency(subtotal))}</span>
            </div>
            <div class="total-row">
                <span>CGST (9%)</span>
                <span class="bold-num">${escapeHtml(formatIndianCurrency(cgst))}</span>
            </div>
            <div class="total-row">
                <span>SGST (9%)</span>
                <span class="bold-num">${escapeHtml(formatIndianCurrency(sgst))}</span>
            </div>
            <div class="total-row main">
                <span>TOTAL</span>
                <span>${escapeHtml(formatIndianCurrency(grandTotal))}</span>
            </div>
        </div>
    </div>

    <div class="footer-grid">
        ${paymentColumn}
        <div class="auth-sign">
            <p style="padding-bottom: 10px; font-size: 14px;">${escapeHtml(signatoryName)}</p>
            <div class="sign-line"></div>
            <p>Authorised Signatory</p>
        </div>
    </div>
</div>

</body>
</html>`;
}
