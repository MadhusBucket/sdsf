import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import { companyKey } from "@/lib/companies/grouping";
import type { createClient } from "@/lib/supabase/client";
import type { Company } from "@/lib/types/database";

import type { LedgerInvoice } from "./compute";
import { asLedgerClient, type Payment } from "./types";

type Client = ReturnType<typeof createClient>;

const INVOICE_FIELDS = "id, company_id, doc_number, date, subject, grand_total, status, created_at";

export interface LedgerData {
  userId: string;
  companies: Company[];
  invoices: LedgerInvoice[];
  payments: Payment[];
  /** False until the payments table has been added in Supabase. */
  paymentsReady: boolean;
  /** Company id → company key (branches of one company share a key). */
  keyOf: (companyId: string) => string;
}

export async function getUserId(supabase: Client): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getEffectiveUserId(supabase, user.id, user.email!);
}

/** Reads payments only. Never writes. Returns null if the table is not set up yet. */
export async function fetchPayments(supabase: Client, userId: string): Promise<Payment[] | null> {
  const { data, error } = await asLedgerClient(supabase).from("payments").select("*").eq("user_id", userId);
  if (error) {
    console.warn("payments not available", error.message);
    return null;
  }
  return (data ?? []) as Payment[];
}

/** Loads everything the ledger needs (read only). */
export async function fetchLedgerData(supabase: Client): Promise<LedgerData | null> {
  const userId = await getUserId(supabase);
  if (!userId) return null;

  const [companies, invoices, payments] = await Promise.all([
    supabase.from("companies").select("*").eq("user_id", userId),
    supabase.from("documents").select(INVOICE_FIELDS).eq("user_id", userId).eq("type", "invoice"),
    fetchPayments(supabase, userId),
  ]);
  if (companies.error) throw companies.error;
  if (invoices.error) throw invoices.error;

  const list = (companies.data ?? []) as Company[];
  const keys = new Map(list.map((c) => [c.id, companyKey(c.name)]));

  return {
    userId,
    companies: list,
    invoices: (invoices.data ?? []) as LedgerInvoice[],
    payments: payments ?? [],
    paymentsReady: payments !== null,
    keyOf: (id) => keys.get(id) ?? id,
  };
}
