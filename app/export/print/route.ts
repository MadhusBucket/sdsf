import { NextRequest, NextResponse } from "next/server";

import { combineDocumentsHtml } from "@/lib/export/combineDocumentsHtml";
import { escapeHtml } from "@/lib/pdf/escapeHtml";
import { buildInvoiceHtml } from "@/lib/pdf/invoiceHtmlTemplate";
import {
  getBankFromEnv,
  getMerchantFromEnv,
  getSignatoryNameFromEnv,
} from "@/lib/pdf/merchantFromEnv";
import { createClient, getEffectiveUser } from "@/lib/supabase/server";
import type { Company, Document } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * READ-ONLY. Returns many invoices/quotations as one printable page, using the
 * same template as the single-document PDF. It only selects; it never writes.
 */
export async function GET(request: NextRequest) {
  const [supabase, user] = await Promise.all([createClient(), getEffectiveUser()]);
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const from = sp.get("from");
  const to = sp.get("to");
  const company = sp.get("company");
  const includeCancelled = sp.get("cancelled") === "1";

  let query = supabase.from("documents").select("*, companies(*)").eq("user_id", user.id);
  if (type === "invoice" || type === "quotation") query = query.eq("type", type);
  if (from && DATE_RE.test(from)) query = query.gte("date", from);
  if (to && DATE_RE.test(to)) query = query.lte("date", to);
  if (company && UUID_RE.test(company)) query = query.eq("company_id", company);
  if (!includeCancelled) query = query.not("status", "in", "(void,replaced)");

  const { data, error } = await query;
  if (error) {
    console.error("[export/print]", error.message);
    return new NextResponse("Could not load documents", { status: 500 });
  }

  const rows = (data ?? []) as (Document & { companies: Company | null })[];
  // Invoices first, then quotations; each oldest first by date and number.
  rows.sort(
    (a, b) =>
      (a.type === b.type ? 0 : a.type === "invoice" ? -1 : 1) ||
      a.date.localeCompare(b.date) ||
      a.doc_number.localeCompare(b.doc_number)
  );

  const merchant = getMerchantFromEnv();
  const bank = getBankFromEnv();
  const signatoryName = getSignatoryNameFromEnv();

  const pages: string[] = [];
  for (const row of rows) {
    const { companies: rowCompany, ...document } = row;
    if (!rowCompany) continue;
    pages.push(
      buildInvoiceHtml({
        document: document as Document,
        company: rowCompany,
        merchant,
        bank,
        signatoryName,
      })
    );
  }

  const label =
    type === "invoice" ? "Invoices" : type === "quotation" ? "Quotations" : "Invoices and Quotations";
  const html = combineDocumentsHtml(pages, escapeHtml(label));

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
