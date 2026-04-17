"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { DocumentType } from "@/lib/types/database";

import { DocumentList } from "./DocumentList";
import { DocumentToggle } from "./DocumentToggle";
import { DateFilter } from "./DateFilter";
import { KPICards } from "./KPICards";
import { fuzzyMatchesDocument, SearchBar, type DashboardDocument } from "./SearchBar";
import { StatusFilter, type StatusFilterValue } from "./StatusFilter";

export function DashboardClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DocumentType>("quotation");
  const [status, setStatus] = useState<StatusFilterValue>("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const fetchDocuments = async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        setDocuments([]);
        setIsLoading(false);
        return;
      }

      const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

      const { data } = await supabase
        .from("documents")
        .select("*, companies(name, branch, address)")
        .eq("user_id", effectiveUserId)
        .order("created_at", { ascending: false });

      if (active) {
        setDocuments((data as DashboardDocument[] | null) ?? []);
        setIsLoading(false);
      }
    };

    fetchDocuments();

    const channel = supabase
      .channel("documents-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => {
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((doc) => doc.type === type)
      .filter((doc) => (status === "all" ? true : doc.status === status))
      .filter((doc) => {
        if (!dateFilter) return true;
        const docDate = new Date(doc.created_at);
        return (
          docDate.getFullYear() === dateFilter.getFullYear() &&
          docDate.getMonth() === dateFilter.getMonth() &&
          docDate.getDate() === dateFilter.getDate()
        );
      })
      .filter((doc) => fuzzyMatchesDocument(doc, query));
  }, [documents, query, status, type, dateFilter]);

  const handlePickType = (pickedType: DocumentType) => {
    setTypePickerOpen(false);
    router.push(`/create?type=${pickedType}`);
  };

  return (
    <>
      <div className="space-y-4 p-4 pb-28 sm:p-6">
        <KPICards documents={documents} />
        <DocumentToggle value={type} onChange={setType} />
        <SearchBar query={query} onChange={setQuery} />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {type === "quotation" ? "Quotations" : "Invoices"}{" "}
            <span className="font-medium text-foreground">{filteredDocuments.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <StatusFilter value={status} onChange={setStatus} />
            <DateFilter selectedDate={dateFilter} onDateChange={setDateFilter} />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading documents...
          </div>
        ) : (
          <DocumentList documents={filteredDocuments} documentType={type} />
        )}
      </div>

      <motion.div
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.08 }}
        className="fixed right-8 bottom-8 z-50 flex flex-col items-center gap-1"
      >
        <Button
          type="button"
          className="size-14 rounded-full shadow-lg"
          aria-label="Create new work"
          onClick={() => setTypePickerOpen(true)}
        >
          <Plus className="size-6" />
        </Button>
        <span className="hidden text-xs font-medium text-foreground sm:block">
          New Work
        </span>
      </motion.div>

        <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What would you like to create?</DialogTitle>
            <DialogDescription>Choose the document type to get started.</DialogDescription>
          </DialogHeader>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => handlePickType("quotation")}
            >
              Create Quotation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => handlePickType("invoice")}
            >
              Create Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
