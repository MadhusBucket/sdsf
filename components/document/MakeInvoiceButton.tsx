"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

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
import { createClient } from "@/lib/supabase/client";

interface Props {
  quotationId: string;
  docNumber: string;
  companyId: string;
  grandTotal: number;
  /** Invoices made from this quotation earlier and then cancelled. */
  cancelledInvoices: string[];
}

/** On a quotation: start a new invoice filled with this quotation's details. The quotation is not changed. */
export function MakeInvoiceButton({ quotationId, docNumber, companyId, grandTotal, cancelledInvoices }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lookalikes, setLookalikes] = useState<string[] | null>(null);

  // Invoices made by hand before this button existed are not linked. If one has the same
  // company and the same amount, it is probably this quotation already made into an invoice.
  const openDialog = () => {
    setLookalikes(null);
    setOpen(true);
    void createClient()
      .from("documents")
      .select("doc_number, status, grand_total")
      .eq("type", "invoice")
      .eq("company_id", companyId)
      .then(({ data }) => {
        const same = (data ?? []).filter(
          (d) =>
            d.status !== "void" &&
            d.status !== "replaced" &&
            Math.round(Number(d.grand_total) * 100) === Math.round(grandTotal * 100)
        );
        setLookalikes(same.map((d) => d.doc_number as string));
      });
  };

  return (
    <>
      <Button type="button" className="h-11 rounded-xl px-4" onClick={openDialog}>
        <FileText className="size-5" />
        Make invoice
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make an invoice from {docNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              A new invoice opens with the same company and items, and the next invoice number. You can change the
              items, rates or quantities before saving. This quotation stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelledInvoices.length > 0 && (
            <p className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-muted dark:text-zinc-300">
              An invoice made from this before ({cancelledInvoices.join(", ")}) was cancelled, so a new one can be made.
            </p>
          )}
          {lookalikes && lookalikes.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
              Careful: invoice {lookalikes.join(", ")} already exists for this company with the same amount. If that is
              this work, do not make another one.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={lookalikes === null}
              onClick={() => router.push(`/create?type=invoice&from=${quotationId}`)}
            >
              {lookalikes === null ? "Checking…" : lookalikes.length > 0 ? "Make another invoice" : "Yes, make invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
