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
  sgst: number
) {
  return roundTo2(subtotal + cgst + sgst);
}
