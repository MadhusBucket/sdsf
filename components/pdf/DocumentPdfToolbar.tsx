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
  superseded: "Superseded",
  replaced: "Replaced",
};

export function DocumentPdfToolbar({ document }: DocumentPdfToolbarProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);

  const filename = `${document.doc_number.replace(/\//g, "-")}.pdf`;
  const pdfUrl = `/api/generate-pdf?id=${encodeURIComponent(document.id)}`;

  const fetchPdfBlob = async (): Promise<Blob> => {
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.error === "string" ? err.error : res.statusText);
    }
    return res.blob();
  };

  const triggerDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      triggerDownload(await fetchPdfBlob());
    } catch (e) {
      console.error(e);
      toast.error("Failed to download PDF");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/api/generate-pdf?id=${encodeURIComponent(document.id)}`;
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
      toast.error("Share failed. Downloading instead…");
      void handleDownload();
    }
  };

  const handleMarkAsSent = async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("id", document.id);
    if (error) { toast.error("Failed to update status"); return; }
    toast.success("Document marked as sent");
    router.refresh();
  };

  const handleMarkAsPaid = async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("documents")
      .update({ status: "paid" })
      .eq("id", document.id);
    if (error) { toast.error("Failed to update status"); return; }
    toast.success("Document marked as paid");
    router.refresh();
  };

  const handleVoidConfirmed = async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("documents")
      .update({ status: "void" })
      .eq("id", document.id);
    if (error) { toast.error("Failed to cancel document"); return; }
    toast.success("Document cancelled");
    router.refresh();
  };

  async function handleMarkAsReplaced() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("documents")
        .update({ status: "replaced" })
        .eq("id", document.id);
      if (error) throw error;
      toast.success("Document marked as replaced");
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error("Failed to mark as replaced");
    } finally {
      setBusy(false);
    }
  }

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
                <DropdownMenuItem onClick={() => void handleMarkAsSent()}>
                  <Send className="mr-2 h-4 w-4" />
                  Mark as Sent
                </DropdownMenuItem>
              )}
              {document.status === "sent" && (
                <DropdownMenuItem onClick={() => void handleMarkAsPaid()}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Paid
                </DropdownMenuItem>
              )}
              {(document.status === "sent" || document.status === "paid") && (
                <DropdownMenuItem onClick={() => void handleMarkAsReplaced()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Mark as Replaced
                </DropdownMenuItem>
              )}
              {document.status !== "void" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setVoidDialogOpen(true)}
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
          variant="outline"
          className="h-11"
          onClick={() => void handleShare()}
        >
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>

        <Button
          type="button"
          variant="default"
          className="h-11"
          disabled={busy}
          onClick={() => void handleDownload()}
        >
          <Download className="mr-2 h-4 w-4" />
          {busy ? "Preparing…" : "Download"}
        </Button>

        {document.status === "draft" && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => router.push(`/create?type=${document.type}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {document.doc_number} as cancelled. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleVoidConfirmed()}
            >
              Cancel Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
