export type DocumentType = "invoice" | "quotation";

export type DocumentStatus =
  | "draft"
  | "sent"
  | "paid"
  | "void"
  | "replaced";

export type Unit =
  | "SFT"
  | "RFT"
  | "KG"
  | "NOS"
  | "MT"
  | "LTR"
  | "BOX"
  | "CFT"
  | "CUM"
  | "TRIP";

export interface LineItem {
  sl_no: number;
  description: string;
  subtext: string | null;
  qty: number;
  unit: Unit;
  rate: number;
  amount: number;
  is_lumpsum: boolean;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  address: string;
  gstin: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  biz_name: string | null;
  address: string | null;
  bank_json: Record<string, unknown> | null;
  last_inv_num: number;
  last_qt_num: number;
  created_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  company_id: string;
  type: DocumentType;
  doc_number: string;
  date: string;
  po_number: string | null;
  subject: string | null;
  items: LineItem[];
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  round_off: number;
  grand_total: number;
  advance_received: number;
  balance_due: number;
  status: DocumentStatus;
  signature_url: string | null;
  drive_file_id: string | null;
  created_at: string;
  updated_at: string;
  replaced_by: string | null;
}

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company & Record<string, unknown>;
        Insert: (Omit<Company, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        }) &
          Record<string, unknown>;
        Update: Partial<Company> & Record<string, unknown>;
        Relationships: [];
      };
      profiles: {
        Row: Profile & Record<string, unknown>;
        Insert: (Omit<Profile, "created_at"> & {
          created_at?: string;
        }) &
          Record<string, unknown>;
        Update: Partial<Profile> & Record<string, unknown>;
        Relationships: [];
      };
      documents: {
        Row: Document & Record<string, unknown>;
        Insert: (Omit<
          Document,
          "id" | "created_at" | "updated_at" | "replaced_by"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          replaced_by?: string | null;
        }) &
          Record<string, unknown>;
        Update: Partial<Document> & Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
