import { NextRequest, NextResponse } from "next/server";

import { buildInvoiceHtml } from "@/lib/pdf/invoiceHtmlTemplate";
import {
  getBankFromEnv,
  getMerchantFromEnv,
  getSignatoryNameFromEnv,
} from "@/lib/pdf/merchantFromEnv";
import { createClient, getEffectiveUser } from "@/lib/supabase/server";
import type { Company, Document } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [supabase, user] = await Promise.all([createClient(), getEffectiveUser()]);
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*, companies(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const row = data as Document & { companies: Company | null };
  const company = row.companies;
  if (!company) {
    return new NextResponse("Company not found", { status: 404 });
  }

  const { companies: _c, ...document } = row;

  const html = buildInvoiceHtml({
    document: document as Document,
    company,
    merchant: getMerchantFromEnv(),
    bank: getBankFromEnv(),
    signatoryName: getSignatoryNameFromEnv(),
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
