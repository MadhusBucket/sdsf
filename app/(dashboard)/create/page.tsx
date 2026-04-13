"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
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
    editableDocNumber: ed,
  });
}

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "draft")
        .eq("type", typeParam)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loadId !== loadIdRef.current) return;

      if (data && !error) {
        setDraft(data as Document);
        toast.message("Resumed your draft");
      } else {
        initializeDraft(typeParam);
        toast.message(`Started new ${typeParam}`);
      }

      const { draft: d } = useDocumentStore.getState();
      const max = await fetchMaxDocumentSerial(
        supabase,
        user.id,
        d.type,
        d.financial_year
      );

      if (loadId !== loadIdRef.current) return;
      applyDocumentSequence(max);
      snapshotPristine();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-3 pb-56">
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
            className="h-12 w-full text-base"
            onClick={() => addLineItem()}
          >
            Add Item
          </Button>
        </section>
      </main>

      <StickyFooter />

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
