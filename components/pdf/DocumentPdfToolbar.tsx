"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ChevronDown,
  Download,
  Edit,
  FileText,
  RefreshCw,
  Send,
  Share2,
  X,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSubmitLock } from "@/lib/hooks/useSubmitLock";
import { createClient } from "@/lib/supabase/client";
import type { Document } from "@/lib/types/database";

interface DocumentPdfToolbarProps {
  document: Document;
}

const STATUS_LABELS: Record<Document["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Cancelled",
  replaced: "Replaced",
};

export function DocumentPdfToolbar({ document }: DocumentPdfToolbarProps) {
  const router = useRouter();
  const { busy, run: runBusy } = useSubmitLock();
  const [pendingStatus, setPendingStatus] = useState<Document["status"] | null>(null);

  const docWord = document.type === "invoice" ? "invoice" : "quotation";

  const STATUS_CONFIRMATIONS: Record<Document["status"], { title: string; description: string }> = {
    draft: {
      title: "Move back to Draft?",
      description: `This document will be marked as a draft. This means it's not sent yet and you can still make changes to it.`,
    },
    sent: {
      title: "Mark as Sent?",
      description: `This document will be marked as sent. Use this when you've given the ${docWord} to your customer.`,
    },
    paid: {
      title: "Mark as Paid?",
      description: `This ${docWord} will be marked as paid. Use this when your customer has paid you the full amount.`,
    },
    void: {
      title: "Cancel this document?",
      description: `This document will be marked as cancelled. Use this when you're not going to use this ${docWord} anymore (for example, if the customer changed their mind or you made a mistake).`,
    },
    replaced: {
      title: "Mark as Replaced?",
      description: `This document will be marked as replaced. Use this when you've created a newer, updated version of this ${docWord}.`,
    },
  };

  const handlePrintPreview = () => {
    const iframe = globalThis.document.querySelector(
      'iframe[src*="/invoice/"]'
    ) as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/invoice/${encodeURIComponent(document.id)}`;
    const title = `${document.type === "invoice" ? "Invoice" : "Quotation"} ${document.doc_number}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text: `View ${title}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.info("Link copied to clipboard");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.error(e);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.info("Link copied to clipboard");
    }
  };

  const handleStatusChange = (status: Document["status"]) => {
    setPendingStatus(status);
  };

  const confirmStatusChange = () => {
    if (!pendingStatus) return;
    const nextStatus = pendingStatus;

    void runBusy(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("documents")
          .update({ status: nextStatus })
          .eq("id", document.id);

        if (error) throw error;

        toast.success(
          `Document marked as ${STATUS_LABELS[nextStatus].toLowerCase()}`
        );
        router.refresh();
      } catch {
        toast.error("Failed to update status");
      } finally {
        setPendingStatus(null);
      }
    });
  };

  const hasStatusActions =
    document.status === "draft" ||
    document.status === "sent" ||
    (document.status !== "void" && document.status !== "replaced");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {hasStatusActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-11">
                <FileText className="mr-2 h-4 w-4" />
                Status: {STATUS_LABELS[document.status]}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {document.status === "draft" && (
                <DropdownMenuItem onClick={() => handleStatusChange("sent")}>
                  <Send className="mr-2 h-4 w-4" />
                  Mark as Sent
                </DropdownMenuItem>
              )}
              {document.status === "sent" && (
                <DropdownMenuItem onClick={() => handleStatusChange("paid")}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Paid
                </DropdownMenuItem>
              )}
              {(document.status === "sent" || document.status === "paid") && (
                <DropdownMenuItem onClick={() => handleStatusChange("replaced")}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Mark as Replaced
                </DropdownMenuItem>
              )}
              {document.status !== "void" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleStatusChange("void")}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Mark as Cancelled
                  </DropdownMenuItem>
                </>
              )}

            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          type="button"
          variant="default"
          className="h-11"
          onClick={handlePrintPreview}
        >
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => void handleShare()}
        >
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>

        {document.status === "draft" && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => router.push(`/create?id=${document.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => { if (!open) setPendingStatus(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus ? STATUS_CONFIRMATIONS[pendingStatus].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus ? STATUS_CONFIRMATIONS[pendingStatus].description : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep current status</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={
                pendingStatus === "void"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                confirmStatusChange();
              }}
            >
              {busy ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
