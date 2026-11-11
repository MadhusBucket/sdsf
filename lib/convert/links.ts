import { asLedgerClient } from "@/lib/ledger/types";

/**
 * Quotation → invoice links. Reads and adds rows in the quotation_invoices table only.
 * Quotations and invoices themselves are never changed here.
 */

export interface LinkedDoc {
  id: string;
  doc_number: string;
  status: string;
}

const isActive = (status: string) => status !== "void" && status !== "replaced";

/** Invoices made from this quotation, split into still-valid and cancelled ones. Null if links cannot be read. */
export async function invoicesFromQuotation(
  client: unknown,
  quotationId: string
): Promise<{ active: LinkedDoc[]; cancelled: LinkedDoc[] } | null> {
  const db = asLedgerClient(client);
  const links = await db.from("quotation_invoices").select("invoice_id").eq("quotation_id", quotationId);
  if (links.error) return null;
  const ids = (links.data ?? []).map((l) => l.invoice_id as string);
  if (ids.length === 0) return { active: [], cancelled: [] };
  const docs = await db.from("documents").select("id, doc_number, status").in("id", ids);
  if (docs.error) return null;
  const list = (docs.data ?? []) as LinkedDoc[];
  return { active: list.filter((d) => isActive(d.status)), cancelled: list.filter((d) => !isActive(d.status)) };
}

/** The quotation an invoice was made from, if any. */
export async function quotationForInvoice(client: unknown, invoiceId: string): Promise<LinkedDoc | null> {
  const db = asLedgerClient(client);
  const link = await db.from("quotation_invoices").select("quotation_id").eq("invoice_id", invoiceId).maybeSingle();
  if (link.error || !link.data) return null;
  const doc = await db
    .from("documents")
    .select("id, doc_number, status")
    .eq("id", link.data.quotation_id as string)
    .maybeSingle();
  return (doc.data as LinkedDoc | null) ?? null;
}

/** All links for a user: quotation id → invoice ids. Empty if links cannot be read. */
export async function allLinks(client: unknown, userId: string): Promise<Map<string, string[]>> {
  const res = await asLedgerClient(client).from("quotation_invoices").select("quotation_id, invoice_id").eq("user_id", userId);
  const map = new Map<string, string[]>();
  if (res.error) return map;
  for (const l of res.data ?? []) {
    const q = l.quotation_id as string;
    map.set(q, [...(map.get(q) ?? []), l.invoice_id as string]);
  }
  return map;
}

export async function saveLink(client: unknown, link: { userId: string; quotationId: string; invoiceId: string }) {
  return asLedgerClient(client)
    .from("quotation_invoices")
    .insert({ user_id: link.userId, quotation_id: link.quotationId, invoice_id: link.invoiceId });
}
