import type { DocumentType } from "@/lib/types/database";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatIndianCurrency(amount: number) {
  return INR_FORMATTER.format(amount);
}

export function getCurrentFY(referenceDate: Date = new Date()) {
  const startYear =
    referenceDate.getMonth() >= 3
      ? referenceDate.getFullYear()
      : referenceDate.getFullYear() - 1;

  const start = String(startYear).slice(-2);
  const end = String(startYear + 1).slice(-2);

  return `${start}${end}`;
}

const DOC_NUMBER_RE = /^(INV|QUO)\/(\d{4})\/(\d{1,3})$/;

export function docPrefixForType(type: DocumentType) {
  return type === "invoice" ? "INV" : "QUO";
}

/** Full document number for a 1–999 serial (padded to 3 digits). */
export function formatDocNumber(
  type: DocumentType,
  financialYear: string,
  serial: number
) {
  const prefix = docPrefixForType(type);
  const n = Math.min(999, Math.max(0, Math.floor(serial)));
  const nextNumber = String(n).padStart(3, "0");
  return `${prefix}/${financialYear}/${nextNumber}`;
}

/** Next number string after last used serial (lastNum 0 ⇒ …/001). */
export function generateDocNumber(type: DocumentType, lastNum: number) {
  return formatDocNumber(type, getCurrentFY(), lastNum + 1);
}

export function parseDocNumberParts(
  number: string
): { type: DocumentType; financialYear: string; serial: number } | null {
  const m = number.trim().match(DOC_NUMBER_RE);
  if (!m) return null;
  const prefix = m[1];
  const financialYear = m[2];
  const serial = Number.parseInt(m[3], 10);
  if (!Number.isFinite(serial)) return null;
  const type: DocumentType = prefix === "INV" ? "invoice" : "quotation";
  return { type, financialYear, serial };
}

export function parseDocSerial(number: string): number | null {
  const parts = parseDocNumberParts(number);
  return parts?.serial ?? null;
}
