"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Edit, Plus, Trash2 } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { Company } from "@/lib/types/database";
import { ensureProfile } from "@/lib/utils/ensureProfile";

interface DeleteTarget {
  company: Company;
  docCount: number;
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addGstin, setAddGstin] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteCheckBusy, setDeleteCheckBusy] = useState(false);

  const loadCompanies = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

    setIsLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("name");
    setCompanies((data as Company[] | null) ?? []);
    setIsLoading(false);
  }, [router]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);

  const resetAddForm = () => {
    setAddName("");
    setAddAddress("");
    setAddGstin("");
  };

  const handleAddSave = async () => {
    const name = addName.trim();
    if (!name) { toast.error("Company name is required."); return; }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { toast.error("You must be signed in."); return; }

    const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

    setAddBusy(true);
    try {
      const { error: profileError } = await ensureProfile(supabase, effectiveUserId, user.email ?? null);
      if (profileError) { toast.error(profileError.message); return; }

      const { data, error } = await supabase
        .from("companies")
        .insert({
          user_id: effectiveUserId,
          name,
          address: addAddress.trim() || "",
          gstin: addGstin.trim() || null,
        })
        .select()
        .single();

      if (error) { toast.error(error.message); return; }

      setCompanies((prev) =>
        [...prev, data as Company].sort((a, b) => a.name.localeCompare(b.name))
      );
      setAddOpen(false);
      resetAddForm();
      toast.success("Company added");
    } finally {
      setAddBusy(false);
    }
  };

  const handleDeleteClick = async (company: Company) => {
    setDeleteCheckBusy(true);
    const supabase = createClient();
    const { count } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id);
    setDeleteCheckBusy(false);
    setDeleteTarget({ company, docCount: count ?? 0 });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", deleteTarget.company.id);
      if (error) { toast.error(error.message); return; }
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.company.id));
      setDeleteTarget(null);
      toast.success("Company deleted");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4 p-4 pb-32 sm:p-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" className="h-11">
            <Link href="/dashboard">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Manage Companies</h1>
        </div>

        {isLoading ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading companies…
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            No companies yet. Add your first client!
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => {
              const addrLines = company.address
                ?.split("\n")
                .map((l) => l.trim())
                .filter(Boolean) ?? [];
              return (
                <Card key={company.id} className="border">
                  <CardContent className="p-4">
                    <div className="space-y-0.5">
                      <p className="truncate font-semibold leading-snug">{company.name}</p>
                      {addrLines.slice(0, 2).map((line, i) => (
                        <p key={i} className="truncate text-sm text-muted-foreground">
                          {line}
                        </p>
                      ))}
                      {company.gstin && (
                        <p className="text-xs text-muted-foreground">
                          GSTIN: {company.gstin}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <Button asChild variant="outline" className="h-11 w-full">
                        <Link href={`/companies/${company.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 w-full"
                        disabled={deleteCheckBusy}
                        onClick={() => void handleDeleteClick(company)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background p-4">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={() => { resetAddForm(); setAddOpen(true); }}
        >
          <Plus className="mr-2 h-5 w-5" />
          Add New Company
        </Button>
      </div>

      {/* Add Company Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !addBusy) { setAddOpen(false); resetAddForm(); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="add-name">Company name</Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Company name"
                autoComplete="organization"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-addr">Address</Label>
              <Textarea
                id="add-addr"
                rows={3}
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                placeholder="Street, city, state"
                className="resize-y text-base"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-gstin">GSTIN (optional)</Label>
              <Input
                id="add-gstin"
                value={addGstin}
                onChange={(e) => setAddGstin(e.target.value)}
                placeholder="GSTIN"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={addBusy}
              onClick={() => { setAddOpen(false); resetAddForm(); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addBusy}
              onClick={() => void handleAddSave()}
            >
              {addBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleteBusy) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.company.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.docCount > 0
                ? `This company has ${deleteTarget.docCount} ${
                    deleteTarget.docCount === 1 ? "document" : "documents"
                  }. Deleting it may affect those records. This cannot be undone.`
                : "This will permanently delete the company. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={() => void handleDeleteConfirm()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
