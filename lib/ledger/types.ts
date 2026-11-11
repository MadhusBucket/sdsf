import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Types for the new `payments` table. Kept here (not in lib/types) so the
 * existing invoice and quotation code is never touched.
 */
export type PaymentKind = "payment" | "adjustment";
export type PaymentMode = "upi" | "bank" | "cheque" | "cash" | "other";

export interface Payment {
  id: string;
  user_id: string;
  company_id: string;
  invoice_id: string | null;
  kind: PaymentKind;
  paid_on: string;
  amount: number;
  tds: number;
  mode: PaymentMode | null;
  reference: string | null;
  note: string | null;
  voided_at: string | null;
  created_at: string;
}

/** Which invoice was made from which quotation (new table; documents are never changed). */
export interface QuotationInvoiceLink {
  id: string;
  user_id: string;
  quotation_id: string;
  invoice_id: string;
  created_at: string;
}

export type PaymentInsert = Omit<Payment, "id" | "created_at" | "voided_at" | "tds" | "reference" | "note"> & {
  tds?: number;
  reference?: string | null;
  note?: string | null;
};

type Tables = Database["public"]["Tables"];

export interface LedgerDatabase {
  public: {
    Tables: Tables & {
      payments: {
        Row: Payment & Record<string, unknown>;
        Insert: PaymentInsert & Record<string, unknown>;
        Update: Partial<Payment> & Record<string, unknown>;
        Relationships: [];
      };
      quotation_invoices: {
        Row: QuotationInvoiceLink & Record<string, unknown>;
        Insert: Omit<QuotationInvoiceLink, "id" | "created_at"> & Record<string, unknown>;
        Update: Partial<QuotationInvoiceLink> & Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export type LedgerClient = SupabaseClient<LedgerDatabase>;

/** The app's normal Supabase client, seen with the payments table added. */
export function asLedgerClient(client: unknown): LedgerClient {
  return client as LedgerClient;
}
