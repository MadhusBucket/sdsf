import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";
import type { Document, DocumentType, LineItem, Unit } from "@/lib/types/database";
import {
  calculateGST,
  calculateGrandTotal,
  calculateLineTotal,
  calculateSubtotal,
} from "@/lib/utils/calculations";
import {
  formatDocNumber,
  generateDocNumber,
  getCurrentFY,
  parseDocNumberParts,
} from "@/lib/utils/formatting";

const roundTo2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export interface DocumentDraft {
  id: string | null;
  type: DocumentType;
  number: string;
  financial_year: string;
  issue_date: string;
  po_number: string | null;
  title: string | null;
  company_id: string | null;
  line_items: LineItem[];
  subtotal: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  grand_total: number;
  gstEnabled: boolean;
}

const DEFAULT_UNIT: Unit = "NOS";

export const buildEmptyLineItem = (slNo: number): LineItem => ({
  sl_no: slNo,
  description: "",
  subtext: null,
  qty: 0,
  unit: DEFAULT_UNIT,
  rate: 0,
  amount: 0,
  is_lumpsum: false,
});

function lineAmount(item: LineItem): number {
  if (item.is_lumpsum) return roundTo2(item.amount);
  return calculateLineTotal(item.qty, item.rate);
}

function applyLineAmounts(items: LineItem[]): LineItem[] {
  return items.map((item) => ({
    ...item,
    amount: lineAmount(item),
  }));
}

function renumberItems(items: LineItem[]): LineItem[] {
  return items.map((item, index) => ({ ...item, sl_no: index + 1 }));
}

export function computeTotals(draft: DocumentDraft): DocumentDraft {
  const line_items = applyLineAmounts(draft.line_items);
  const subtotal = calculateSubtotal(line_items);
  const gstEnabled = draft.gstEnabled;
  const cgst_rate = gstEnabled ? 9 : 0;
  const sgst_rate = gstEnabled ? 9 : 0;
  const cgst_amount = gstEnabled ? calculateGST(subtotal, 9) : 0;
  const sgst_amount = gstEnabled ? calculateGST(subtotal, 9) : 0;
  const grand_total = calculateGrandTotal(subtotal, cgst_amount, sgst_amount);

  return {
    ...draft,
    line_items,
    subtotal,
    cgst_rate,
    cgst_amount,
    sgst_rate,
    sgst_amount,
    igst_rate: 0,
    igst_amount: 0,
    grand_total,
  };
}

function documentRowToDraft(doc: Document): DocumentDraft {
  const gstEnabled = doc.cgst_amount > 0 || doc.sgst_amount > 0;
  const line_items =
    doc.items.length > 0
      ? renumberItems(
          doc.items.map((item) => ({
            ...item,
            amount: lineAmount(item),
          }))
        )
      : [buildEmptyLineItem(1)];

  const issueDate =
    doc.date.length >= 10 ? doc.date.slice(0, 10) : doc.date;

  const parsed = parseDocNumberParts(doc.doc_number);
  const financial_year = parsed?.financialYear ?? getCurrentFY();

  return computeTotals({
    id: doc.id,
    type: doc.type,
    number: doc.doc_number,
    financial_year,
    issue_date: issueDate,
    po_number: doc.po_number,
    title: doc.subject,
    company_id: doc.company_id,
    line_items,
    subtotal: 0,
    cgst_rate: 0,
    cgst_amount: 0,
    sgst_rate: 0,
    sgst_amount: 0,
    igst_rate: 0,
    igst_amount: 0,
    grand_total: 0,
    gstEnabled,
  });
}

function createFreshDraft(type: DocumentType = "quotation"): DocumentDraft {
  const today = new Date().toISOString().slice(0, 10);
  return computeTotals({
    id: null,
    type,
    number: generateDocNumber(type, 0),
    financial_year: getCurrentFY(),
    issue_date: today,
    po_number: null,
    title: null,
    company_id: null,
    line_items: [buildEmptyLineItem(1)],
    subtotal: 0,
    cgst_rate: 0,
    cgst_amount: 0,
    sgst_rate: 0,
    sgst_amount: 0,
    igst_rate: 0,
    igst_amount: 0,
    grand_total: 0,
    gstEnabled: false,
  });
}

export type CommitDocNumberResult =
  | { ok: true }
  | { ok: false; lastFull: string; nextFull: string };

interface DocumentStore {
  draft: DocumentDraft;
  /** Last 3-digit suffix (may be unpadded while typing). */
  editableDocNumber: string;
  /** Max serial suffix in Supabase for current user, type, and FY. */
  lastSerialInDb: number;
  /** When resuming a saved draft, fixed serial from `draft.number`. */
  savedDraftSerial: number | null;
  initializeDraft: (type?: DocumentType) => void;
  setDraft: (draft: Document) => void;
  setDraftType: (type: DocumentType) => void;
  applyDocumentSequence: (maxSerial: number) => void;
  setEditableDocNumber: (value: string) => void;
  commitEditableDocNumber: () => CommitDocNumberResult;
  setIssueDate: (issue_date: string) => void;
  setPoNumber: (po_number: string | null) => void;
  setTitle: (title: string | null) => void;
  setCompanyId: (company_id: string | null) => void;
  setGstEnabled: (gstEnabled: boolean) => void;
  setLineItems: (items: LineItem[]) => void;
  addLineItem: (item?: Partial<LineItem>) => void;
  updateLineItem: (slNo: number, updates: Partial<LineItem>) => void;
  removeLineItem: (slNo: number) => void;
  duplicateLineItem: (slNo: number) => void;
  calculateTotals: () => void;
  saveToSupabase: () => Promise<void>;
  reset: () => void;
}

const initialSequence = () => ({
  editableDocNumber: "001",
  lastSerialInDb: 0,
  savedDraftSerial: null as number | null,
});

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  draft: createFreshDraft(),
  ...initialSequence(),

  initializeDraft: (type) =>
    set({
      draft: createFreshDraft(type),
      ...initialSequence(),
    }),

  setDraft: (doc) => {
    const parsed = parseDocNumberParts(doc.doc_number);
    const digits = parsed
      ? String(parsed.serial).padStart(3, "0")
      : "001";
    set({
      draft: documentRowToDraft(doc),
      editableDocNumber: digits,
      savedDraftSerial: doc.id ? (parsed?.serial ?? null) : null,
      lastSerialInDb: 0,
    });
  },

  setDraftType: (type) =>
    set((state) => ({
      draft: computeTotals({
        ...state.draft,
        type,
        financial_year: getCurrentFY(),
        // Quotations do not carry a PO; invoices keep whatever was set (or null).
        po_number: type === "quotation" ? null : state.draft.po_number,
      }),
    })),

  applyDocumentSequence: (maxSerial) =>
    set((state) => {
      if (state.draft.id) {
        return { lastSerialInDb: maxSerial };
      }
      const next = maxSerial + 1;
      const digits = String(next).padStart(3, "0");
      return {
        lastSerialInDb: maxSerial,
        editableDocNumber: digits,
        draft: computeTotals({
          ...state.draft,
          number: formatDocNumber(
            state.draft.type,
            state.draft.financial_year,
            next
          ),
        }),
      };
    }),

  setEditableDocNumber: (value) =>
    set((state) => {
      const digits = value.replace(/\D/g, "").slice(0, 3);
      if (
        !state.draft.id &&
        digits.length === 3 &&
        Number.parseInt(digits, 10) === state.lastSerialInDb + 1
      ) {
        const n = Number.parseInt(digits, 10);
        return {
          editableDocNumber: digits,
          draft: computeTotals({
            ...state.draft,
            number: formatDocNumber(
              state.draft.type,
              state.draft.financial_year,
              n
            ),
          }),
        };
      }
      return { editableDocNumber: digits };
    }),

  commitEditableDocNumber: () => {
    const state = get();
    const type = state.draft.type;
    const fy = state.draft.financial_year;
    const expected = state.lastSerialInDb + 1;
    const lastFull = formatDocNumber(type, fy, state.lastSerialInDb);
    const nextFull = formatDocNumber(type, fy, expected);

    if (state.draft.id && state.savedDraftSerial != null) {
      const raw = state.editableDocNumber.replace(/\D/g, "").slice(0, 3);
      const n = raw.length === 3 ? Number.parseInt(raw, 10) : NaN;
      const expectedPad = String(state.savedDraftSerial).padStart(3, "0");
      if (raw.length !== 3 || n !== state.savedDraftSerial) {
        set({ editableDocNumber: expectedPad });
        return {
          ok: false,
          lastFull: formatDocNumber(type, fy, state.lastSerialInDb),
          nextFull: formatDocNumber(type, fy, state.savedDraftSerial),
        };
      }
      set({
        draft: computeTotals({
          ...state.draft,
          number: formatDocNumber(type, fy, state.savedDraftSerial),
        }),
      });
      return { ok: true };
    }

    const raw = state.editableDocNumber.replace(/\D/g, "");
    if (raw.length !== 3) {
      const padExpected = String(expected).padStart(3, "0");
      set({ editableDocNumber: padExpected });
      return { ok: false, lastFull, nextFull };
    }

    const n = Number.parseInt(raw, 10);
    if (n !== expected) {
      set({ editableDocNumber: String(expected).padStart(3, "0") });
      return { ok: false, lastFull, nextFull };
    }

    set({
      editableDocNumber: String(n).padStart(3, "0"),
      draft: computeTotals({
        ...state.draft,
        number: formatDocNumber(type, fy, n),
      }),
    });
    return { ok: true };
  },

  setIssueDate: (issue_date) =>
    set((state) => ({ draft: { ...state.draft, issue_date } })),

  setPoNumber: (po_number) =>
    set((state) => ({
      draft: { ...state.draft, po_number: po_number || null },
    })),

  setTitle: (title) =>
    set((state) => ({ draft: { ...state.draft, title } })),

  setCompanyId: (company_id) =>
    set((state) => ({ draft: { ...state.draft, company_id } })),

  setGstEnabled: (gstEnabled) =>
    set((state) => ({
      draft: computeTotals({ ...state.draft, gstEnabled }),
    })),

  setLineItems: (items) =>
    set((state) => ({
      draft: computeTotals({
        ...state.draft,
        line_items: renumberItems(items),
      }),
    })),

  addLineItem: (item) =>
    set((state) => {
      const nextSlNo = state.draft.line_items.length + 1;
      const newItem = { ...buildEmptyLineItem(nextSlNo), ...item } as LineItem;
      return {
        draft: computeTotals({
          ...state.draft,
          line_items: renumberItems([...state.draft.line_items, newItem]),
        }),
      };
    }),

  updateLineItem: (slNo, updates) =>
    set((state) => {
      const line_items = state.draft.line_items.map((item) => {
        if (item.sl_no !== slNo) return item;
        const merged = { ...item, ...updates } as LineItem;
        const amount = merged.is_lumpsum
          ? roundTo2(merged.amount)
          : calculateLineTotal(merged.qty, merged.rate);
        return { ...merged, amount };
      });
      return { draft: computeTotals({ ...state.draft, line_items }) };
    }),

  removeLineItem: (slNo) =>
    set((state) => {
      const filtered = state.draft.line_items.filter((item) => item.sl_no !== slNo);
      const fallback = filtered.length > 0 ? filtered : [buildEmptyLineItem(1)];
      return {
        draft: computeTotals({
          ...state.draft,
          line_items: renumberItems(fallback),
        }),
      };
    }),

  duplicateLineItem: (slNo) =>
    set((state) => {
      const items = [...state.draft.line_items];
      const idx = items.findIndex((i) => i.sl_no === slNo);
      if (idx === -1) return { draft: state.draft };
      const copy: LineItem = {
        ...items[idx],
        sl_no: items.length + 1,
      };
      items.splice(idx + 1, 0, copy);
      return {
        draft: computeTotals({
          ...state.draft,
          line_items: renumberItems(items),
        }),
      };
    }),

  calculateTotals: () =>
    set((state) => ({ draft: computeTotals(state.draft) })),

  saveToSupabase: async () => {
    const { draft } = get();
    if (!draft.company_id) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const advance_received = 0;
    const balance_due = roundTo2(draft.grand_total - advance_received);
    const basePayload = {
      user_id: user.id,
      type: draft.type,
      doc_number: draft.number,
      date: draft.issue_date,
      po_number: draft.po_number,
      subject: draft.title,
      company_id: draft.company_id,
      items: draft.line_items,
      subtotal: draft.subtotal,
      cgst_amount: draft.cgst_amount,
      sgst_amount: draft.sgst_amount,
      round_off: 0,
      grand_total: draft.grand_total,
      advance_received,
      balance_due,
      status: "draft" as const,
      signature_url: null as string | null,
      drive_file_id: null as string | null,
    };

    try {
      if (draft.id) {
        const updatePayload = { id: draft.id, ...basePayload };
        const { error } = await supabase
          .from("documents")
          .update(updatePayload)
          .eq("id", draft.id);
        if (error) console.error("saveToSupabase update:", error.message);
      } else {
        const { data, error } = await supabase
          .from("documents")
          .insert(basePayload)
          .select("id")
          .single();
        if (error) {
          console.error("saveToSupabase insert:", error.message);
          return;
        }
        if (data?.id) {
          set((s) => ({ draft: { ...s.draft, id: data.id } }));
        }
      }
    } catch (e) {
      console.error("saveToSupabase", e);
    }
  },

  reset: () =>
    set({
      draft: createFreshDraft(),
      ...initialSequence(),
    }),
}));

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
useDocumentStore.subscribe((state, prev) => {
  if (prev === undefined) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    void state.saveToSupabase();
    autoSaveTimer = null;
  }, 3000);
});
