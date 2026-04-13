"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDocumentStore } from "@/lib/stores/documentStore";
import { formatIndianCurrency } from "@/lib/utils/formatting";

export function StickyFooter() {
  const router = useRouter();
  const draft = useDocumentStore((s) => s.draft);
  const setGstEnabled = useDocumentStore((s) => s.setGstEnabled);
  const calculateTotals = useDocumentStore((s) => s.calculateTotals);

  useEffect(() => {
    calculateTotals();
  }, [calculateTotals]);

  const handlePreview = () => {
    if (!draft.id) {
      window.alert("Save a draft first (select a company and wait a few seconds).");
      return;
    }
    router.push(`/document/${draft.id}`);
  };

  return (
    <>
      {/* Totals — scrolls with the page */}
      <div className="mx-auto max-w-3xl space-y-3 border-t px-4 pt-4 mt-4 pb-28">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-base font-medium tabular-nums">
            {formatIndianCurrency(draft.subtotal)}
          </span>
        </div>

        <div className="flex min-h-12 items-center justify-between gap-3">
          <Label
            htmlFor="gst-toggle"
            className="text-base font-medium leading-none"
          >
            Add 18% GST
          </Label>
          <Switch
            id="gst-toggle"
            checked={draft.gstEnabled}
            onCheckedChange={(v) => setGstEnabled(v)}
            className="scale-125"
          />
        </div>

        {draft.gstEnabled ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST (9%)</span>
              <span className="tabular-nums">
                {formatIndianCurrency(draft.cgst_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST (9%)</span>
              <span className="tabular-nums">
                {formatIndianCurrency(draft.sgst_amount)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Grand Total</span>
            <span className="text-xl font-bold tabular-nums text-emerald-600">
              {formatIndianCurrency(draft.grand_total)}
            </span>
          </div>
        </div>
      </div>

      {/* Button only — fixed to bottom */}
      <footer className="fixed right-0 bottom-0 left-0 z-40 border-t bg-background shadow-lg">
        <div className="mx-auto max-w-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={handlePreview}
          >
            Preview & Generate PDF
          </Button>
        </div>
      </footer>
    </>
  );
}
