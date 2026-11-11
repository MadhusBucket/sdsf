"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanySelector } from "@/components/creation/CompanySelector";
import { ItemCard } from "@/components/creation/ItemCard";
import { StickyFooter } from "@/components/creation/StickyFooter";
import { createClient } from "@/lib/supabase/client";
import { invoicesFromQuotation, saveLink } from "@/lib/convert/links";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import { useDocumentStore } from "@/lib/stores/documentStore";
import type { Document, DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { fetchMaxDocumentSerial } from "@/lib/utils/documentNumbers";
import { docPrefixForType, getCurrentFY } from "@/lib/utils/formatting";

function captureWorkspaceSignature(): string {
  const { draft: d, editableDocNumber: ed } = useDocumentStore.getState();
  return JSON.stringify({
    id: d.id,
    type: d.type,
    number: d.number,
    financial_year: d.financial_year,
    issue_date: d.issue_date,
    po_number: d.po_number,
    title: d.title,
    company_id: d.company_id,
    line_items: d.line_items,
    gstEnabled: d.gstEnabled,
    gstType: d.gstType,
    editableDocNumber: ed,
  });
}

/**
 * After an invoice made from a quotation is saved for the first time (it gets an id),
 * note which quotation it came from. Only adds a row to quotation_invoices.
 * Kept outside the page so it still happens if the page is left right after.
 */
function rememberWhenSaved(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  quotationId: string,
  invoiceNumber: string
) {
  const stop = useDocumentStore.subscribe((state) => {
    const d = state.draft;
    if (!d.id || d.type !== "invoice" || d.number !== invoiceNumber) return;
    stop();
    void (async () => {
      const { error } = await saveLink(supabase, { userId, quotationId, invoiceId: d.id! });
      if (error) {
        console.error("quotation link", error.message);
        return;
      }
      // Two devices converting at the same moment: say so, so one can be cancelled.
      const after = await invoicesFromQuotation(supabase, quotationId);
      if (after && after.active.length > 1) {
        toast.warning(
          `This quotation now has ${after.active.length} invoices: ${after.active.map((i) => i.doc_number).join(", ")}. Cancel the extra one.`
        );
      }
    })();
  });
  // Give up after 10 minutes if it was never saved (no company chosen, page closed).
  setTimeout(stop, 10 * 60 * 1000);
}

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  // "Make invoice" on a quotation: start a NEW invoice filled from that quotation.
  const fromId = editId ? null : searchParams.get("from");
  const typeParam = (searchParams.get("type") ?? "quotation") as DocumentType;

  const loadIdRef = useRef(0);
  const pristineRef = useRef<string | null>(null);
  const initializeDraft = useDocumentStore((s) => s.initializeDraft);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const applyDocumentSequence = useDocumentStore((s) => s.applyDocumentSequence);
  const draft = useDocumentStore((s) => s.draft);
  const editableDocNumber = useDocumentStore((s) => s.editableDocNumber);
  const setEditableDocNumber = useDocumentStore((s) => s.setEditableDocNumber);
  const commitEditableDocNumber = useDocumentStore((s) => s.commitEditableDocNumber);
  const setIssueDate = useDocumentStore((s) => s.setIssueDate);
  const setPoNumber = useDocumentStore((s) => s.setPoNumber);
  const setTitle = useDocumentStore((s) => s.setTitle);
  const setCompanyId = useDocumentStore((s) => s.setCompanyId);
  const addLineItem = useDocumentStore((s) => s.addLineItem);
  const lineItems = useDocumentStore((s) => s.draft.line_items);
  const [docNumberError, setDocNumberError] = useState<string | null>(null);
  const [backDialogOpen, setBackDialogOpen] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftDocument, setDraftDocument] = useState<Document | null>(null);
  const pendingRef = useRef<{
    supabase: ReturnType<typeof createClient>;
    effectiveUserId: string;
    loadId: number;
  } | null>(null);

  const hasWorkspaceChanges = () =>
    pristineRef.current !== null &&
    captureWorkspaceSignature() !== pristineRef.current;

  useEffect(() => {
    const loadId = ++loadIdRef.current;

    const snapshotPristine = () => {
      if (loadId !== loadIdRef.current) return;
      pristineRef.current = captureWorkspaceSignature();
    };

    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (loadId !== loadIdRef.current) return;

      if (!user) {
        initializeDraft(typeParam);
        toast.message(`Started new ${typeParam}`);
        snapshotPristine();
        return;
      }

      const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

      // Editing a specific document — load it directly, skip draft search.
      if (editId) {
        const { data, error } = await supabase
          .from("documents")
          .select("*")
          .eq("id", editId)
          .eq("user_id", effectiveUserId)
          .single();

        if (loadId !== loadIdRef.current) return;

        if (data && !error) {
          setDraft(data as Document);
          toast.message("Editing document");
          snapshotPristine();
        } else {
          initializeDraft(typeParam);
          toast.error("Document not found");
          snapshotPristine();
        }
        return;
      }

      if (fromId) {
        // The quotation is only read here; it is never saved over. The new invoice has no id,
        // so saving always creates a new row.
        const { data: q, error: qError } = await supabase
          .from("documents")
          .select("*")
          .eq("id", fromId)
          .eq("user_id", effectiveUserId)
          .eq("type", "quotation")
          .single();

        if (loadId !== loadIdRef.current) return;

        const usable = q && !qError && q.status !== "void" && q.status !== "replaced";
        // Already made into an invoice (that is not cancelled)? Do not make a second one.
        const existing = usable ? await invoicesFromQuotation(supabase, fromId) : null;
        if (loadId !== loadIdRef.current) return;
        if (usable && existing === null) {
          // Cannot check for an earlier invoice (setup not done), so do not risk a duplicate.
          toast.error("Make invoice is not switched on yet, so no invoice was made.");
          router.replace(`/document/${fromId}`);
          return;
        }
        if (existing && existing.active.length > 0) {
          const inv = existing.active[0];
          toast.error(`${(q as Document).doc_number} is already made into invoice ${inv.doc_number}.`);
          router.replace(`/document/${inv.id}`);
          return;
        }

        if (usable) {
          const quotation = q as Document;
          // Company is set only after the invoice number is ready: the draft auto-saves once a
          // company is chosen, and it must never save with a placeholder number.
          setDraft({
            ...quotation,
            id: null as unknown as string,
            type: "invoice",
            doc_number: `${docPrefixForType("invoice")}/${getCurrentFY()}/000`,
            date: new Date().toISOString().slice(0, 10),
            po_number: null,
            company_id: null as unknown as string,
            status: "draft",
            replaced_by: null,
          });
          const { draft: d } = useDocumentStore.getState();
          const max = await fetchMaxDocumentSerial(supabase, effectiveUserId, d.type, d.financial_year);
          if (loadId !== loadIdRef.current) return;
          applyDocumentSequence(max);
          rememberWhenSaved(supabase, effectiveUserId, quotation.id, useDocumentStore.getState().draft.number);
          setCompanyId(quotation.company_id);
          toast.message(`New invoice from ${quotation.doc_number}. Check it, change anything you need, then save.`);
          snapshotPristine();
          return;
        }
        // Cancelled, replaced or not a quotation: do not open a blank invoice by surprise.
        if (q && !qError) {
          toast.error("This quotation is cancelled or replaced, so no invoice was made.");
          router.replace(`/document/${fromId}`);
        } else {
          toast.error("Quotation not found, so no invoice was made.");
          router.replace("/quotations");
        }
        return;
      }

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", effectiveUserId)
        .eq("status", "draft")
        .eq("type", typeParam)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loadId !== loadIdRef.current) return;

      if (data && !error) {
        pendingRef.current = { supabase, effectiveUserId, loadId };
        setDraftDocument(data as Document);
        setShowDraftDialog(true);
        return;
      }

      initializeDraft(typeParam);
      toast.message(`Started new ${typeParam}`);

      const { draft: d } = useDocumentStore.getState();
      const max = await fetchMaxDocumentSerial(
        supabase,
        effectiveUserId,
        d.type,
        d.financial_year
      );

      if (loadId !== loadIdRef.current) return;
      applyDocumentSequence(max);
      snapshotPristine();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResumeDraft = () => {
    if (!pendingRef.current || !draftDocument) return;
    const { supabase, effectiveUserId, loadId } = pendingRef.current;
    setDraft(draftDocument);
    toast.message("Resumed your draft");
    setShowDraftDialog(false);
    void (async () => {
      const { draft: d } = useDocumentStore.getState();
      const max = await fetchMaxDocumentSerial(supabase, effectiveUserId, d.type, d.financial_year);
      if (loadId !== loadIdRef.current) return;
      applyDocumentSequence(max);
      pristineRef.current = captureWorkspaceSignature();
    })();
  };

  const handleStartFresh = () => {
    if (!pendingRef.current) return;
    const { supabase, effectiveUserId, loadId } = pendingRef.current;
    initializeDraft(typeParam);
    toast.message(`Started new ${typeParam}`);
    setShowDraftDialog(false);
    void (async () => {
      const { draft: d } = useDocumentStore.getState();
      const max = await fetchMaxDocumentSerial(supabase, effectiveUserId, d.type, d.financial_year);
      if (loadId !== loadIdRef.current) return;
      applyDocumentSequence(max);
      pristineRef.current = captureWorkspaceSignature();
    })();
  };

  const handleDocSuffixBlur = useCallback(() => {
    const res = commitEditableDocNumber();
    if (res.ok) {
      setDocNumberError(null);
      return;
    }
    if (draft.id) {
      setDocNumberError(
        "Document number cannot be changed for a saved draft."
      );
      return;
    }
    const kindLabel = draft.type === "invoice" ? "invoice" : "quotation";
    setDocNumberError(
      `Last ${kindLabel} was #${res.lastFull}. Next must be #${res.nextFull}`
    );
  }, [commitEditableDocNumber, draft.id, draft.type]);

  const handleBackClick = () => {
    if (hasWorkspaceChanges()) setBackDialogOpen(true);
    else router.push("/dashboard");
  };

  const docPrefix = `${docPrefixForType(draft.type)}/${draft.financial_year}/`;
  const typeLabel = draft.type === "invoice" ? "Invoice" : "Quotation";

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Back to dashboard"
            onClick={handleBackClick}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            Creating: {typeLabel}
          </span>
        </div>

        <div className="space-y-1">
          <Label htmlFor="doc-suffix">Document number</Label>
          <div
            className={cn(
              "flex h-10 min-h-10 w-full items-stretch overflow-hidden rounded-lg border bg-background shadow-xs",
              docNumberError ? "border-destructive" : "border-input"
            )}
          >
            <span
              className="flex shrink-0 items-center border-r border-input bg-muted/50 px-3 text-sm tabular-nums text-muted-foreground select-none"
              aria-hidden
            >
              {docPrefix}
            </span>
            <Input
              id="doc-suffix"
              readOnly={Boolean(draft.id)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              placeholder="000"
              className="h-10 min-h-0 rounded-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 md:text-sm"
              value={editableDocNumber}
              onChange={(e) => {
                setDocNumberError(null);
                setEditableDocNumber(e.target.value);
              }}
              onBlur={handleDocSuffixBlur}
              aria-label="Document serial number (3 digits)"
              aria-invalid={Boolean(docNumberError)}
              aria-describedby={docNumberError ? "doc-suffix-error" : undefined}
            />
          </div>
          {docNumberError ? (
            <p
              id="doc-suffix-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {docNumberError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="issue-date">Date</Label>
          <Input
            id="issue-date"
            type="date"
            className="text-base"
            value={draft.issue_date}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </div>

        {draft.type === "invoice" && (
          <div className="space-y-1">
            <Label htmlFor="po">PO number (optional)</Label>
            <Input
              id="po"
              className="text-base"
              placeholder="Purchase order"
              value={draft.po_number ?? ""}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setPoNumber(v || null);
              }}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="subject">Subject (optional)</Label>
          <Textarea
            id="subject"
            rows={3}
            className="min-h-[5rem] text-base"
            placeholder="Subject or reference"
            value={draft.title ?? ""}
            onChange={(e) => setTitle(e.target.value || null)}
          />
        </div>

        <CompanySelector value={draft.company_id} onChange={setCompanyId} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Line items</h2>
          {lineItems.map((item) => (
            <ItemCard key={item.sl_no} slNo={item.sl_no} />
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base bg-white"
            onClick={() => addLineItem()}
          >
            Add Item
          </Button>
        </section>
      </main>

      <StickyFooter />

      <AlertDialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unfinished {typeParam} draft. Do you want to continue
              working on it or start a new one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleStartFresh}>
              Start Fresh
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleResumeDraft}>
              Resume Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={backDialogOpen}
        onOpenChange={(open) => {
          if (!open) setBackDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave this page anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay Here</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setBackDialogOpen(false);
                router.push("/dashboard");
              }}
            >
              Discard & Go Back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreatePageInner />
    </Suspense>
  );
}
