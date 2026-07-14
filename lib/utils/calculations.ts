import type { LineItem } from "@/lib/types/database";

const roundTo2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateLineTotal(qty: number, rate: number) {
  return roundTo2(qty * rate);
}

export function calculateSubtotal(items: LineItem[]) {
  return roundTo2(items.reduce((sum, item) => sum + item.amount, 0));
}

export function calculateGST(subtotal: number, rate: number) {
  return roundTo2((subtotal * rate) / 100);
}

export function calculateGrandTotal(
  subtotal: number,
  cgst: number,
  sgst: number,
  igst = 0
) {
  return roundTo2(subtotal + cgst + sgst + igst);
}

export type GstType = "intra" | "inter";

/** Infer GST mode from persisted document amounts (no extra DB column required). */
export function inferGstFromDocument(amounts: {
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  grand_total: number;
  round_off?: number;
}): { gstEnabled: boolean; gstType: GstType } {
  const cgst = amounts.cgst_amount ?? 0;
  const sgst = amounts.sgst_amount ?? 0;
  if (cgst > 0 || sgst > 0) {
    return { gstEnabled: true, gstType: "intra" };
  }
  const roundOff = amounts.round_off ?? 0;
  const impliedTax = roundTo2(
    (amounts.grand_total ?? 0) - (amounts.subtotal ?? 0) - roundOff
  );
  if (impliedTax > 0) {
    return { gstEnabled: true, gstType: "inter" };
  }
  return { gstEnabled: false, gstType: "intra" };
}
