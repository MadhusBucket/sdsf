"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Edit, MapPin, Plus, Search, Trash2, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
import { useSubmitLock } from "@/lib/hooks/useSubmitLock";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { Company } from "@/lib/types/database";
import { ensureProfile } from "@/lib/utils/ensureProfile";
import { branchLabel, companyKey, groupCompanies } from "@/lib/companies/grouping";
import { cn } from "@/lib/utils";

interface DeleteTarget {
  company: Company;
  docCount: number;
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  // Add dialog: a brand-new company, or a new branch of one we already have.
  const [addMode, setAddMode] = useState<"new" | "branch">("new");
  const [addGroupKey, setAddGroupKey] = useState("");

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addBranch, setAddBranch] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addGstin, setAddGstin] = useState("");
  const { busy: addBusy, run: runAdd } = useSubmitLock();

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const { busy: deleteBusy, run: runDelete } = useSubmitLock();
  const { busy: deleteCheckBusy, run: runDeleteCheck } = useSubmitLock();

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
    setAddMode("new");
    setAddGroupKey("");
    setAddName("");
    setAddBranch("");
    setAddAddress("");
    setAddGstin("");
  };

  const groups = groupCompanies(companies);
  const addGroup = groups.find((g) => g.key === addGroupKey);
  const sameNameGroup = addMode === "new" && addName.trim() ? groups.find((g) => g.key === companyKey(addName)) : undefined;

  const openAdd = (groupKey?: string) => {
    resetAddForm();
    if (groupKey) { setAddMode("branch"); setAddGroupKey(groupKey); }
    setAddOpen(true);
  };

  const handleAddSave = () => {
    const name = addMode === "branch" ? addGroup?.name ?? "" : addName.trim();
    if (addMode === "branch" && !addGroup) { toast.error("Choose the company first."); return; }
    if (!name) { toast.error("Company name is required."); return; }
    if (addMode === "branch" && !addBranch.trim()) { toast.error("Enter the branch or landmark name."); return; }

    void runAdd(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { toast.error("You must be signed in."); return; }

      const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

      const { error: profileError } = await ensureProfile(supabase, effectiveUserId, user.email ?? null);
      if (profileError) { toast.error(profileError.message); return; }

      const { data, error } = await supabase
        .from("companies")
        .insert({
          user_id: effectiveUserId,
          name,
          branch: addBranch.trim() || null,
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
      toast.success(addMode === "branch" ? "Branch added" : "Company added");
    });
  };

  const handleDeleteClick = (company: Company) => {
    void runDeleteCheck(async () => {
      const supabase = createClient();
      const { count, error } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company.id);
      // If we can't be sure it has no documents, don't offer to delete.
      if (error || count === null) {
        toast.error("Could not check this company's invoices. Try again.");
        return;
      }
      setDeleteTarget({ company, docCount: count });
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget || deleteTarget.docCount !== 0) return;
    void runDelete(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", deleteTarget.company.id);
      if (error) { toast.error(error.message); return; }
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.company.id));
      setDeleteTarget(null);
      toast.success("Company deleted");
    });
  };

  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = groups.filter((g) =>
    searchTerms.every((t) =>
      g.branches.some((c) =>
        `${c.name} ${c.branch ?? ""} ${c.address ?? ""} ${c.gstin ?? ""}`.toLowerCase().includes(t)
      )
    )
  );
  const firstLetter = (name: string) => {
    const ch = name.trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
  };
  const letters = [...new Set(matching.map((g) => firstLetter(g.name)))];
  const activeLetter = letter && letters.includes(letter) ? letter : null;
  const visibleGroups = activeLetter ? matching.filter((g) => firstLetter(g.name) === activeLetter) : matching;
  const sections = letters
    .filter((l) => !activeLetter || l === activeLetter)
    .map((l) => ({ letter: l, groups: visibleGroups.filter((g) => firstLetter(g.name) === l) }));
  const branchCount = companies.length;

  return (
    <>
      <div className="space-y-4 p-4 pb-8 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Companies</h1>
            {!isLoading && companies.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {groups.length} {groups.length === 1 ? "company" : "companies"} · {branchCount}{" "}
                {branchCount === 1 ? "address" : "addresses"}
              </p>
            )}
          </div>
          <Button type="button" className="h-11" onClick={() => openAdd()}>
            <Plus className="h-5 w-5" />
            Add
          </Button>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, branch, address or GST"
            className="h-11 pr-10 pl-9 text-base"
            inputMode="search"
            aria-label="Search companies"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </label>

        {letters.length > 1 && (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by first letter">
            <div className="flex w-max gap-1.5">
              <button
                type="button"
                onClick={() => setLetter(null)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-medium",
                  !activeLetter ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
                )}
              >
                All
              </button>
              {letters.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLetter(activeLetter === l ? null : l)}
                  className={cn(
                    "size-9 rounded-full border text-sm font-semibold",
                    activeLetter === l ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading companies…
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            No companies yet. Add your first client!
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            No company matches “{search.trim()}”.
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <section key={section.letter} className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">{section.letter}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {section.groups.map((group) => (
                    <Card key={group.key} className="border">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                              <Building2 className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="font-heading text-base font-semibold leading-snug">{group.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {group.branches.length === 1
                                  ? "1 address"
                                  : `${group.branches.length} branches`}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 shrink-0"
                            onClick={() => openAdd(group.key)}
                          >
                            <Plus className="size-4" />
                            Branch
                          </Button>
                        </div>

                        <ul className="divide-y rounded-lg border">
                          {group.branches.map((company) => {
                            const addrLines = company.address
                              ?.split("\n")
                              .map((l) => l.trim())
                              .filter(Boolean) ?? [];
                            return (
                              <li key={company.id} className="space-y-2 p-3">
                                <div className="flex items-start gap-2">
                                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0 space-y-0.5">
                                    {company.branch && (
                                      <Badge variant="secondary" className="w-fit text-xs">
                                        {company.branch}
                                      </Badge>
                                    )}
                                    {addrLines.map((line, i) => (
                                      <p key={i} className="text-sm text-muted-foreground">
                                        {line}
                                      </p>
                                    ))}
                                    {!company.branch && addrLines.length === 0 && (
                                      <p className="text-sm text-muted-foreground">No address added</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      {company.gstin ? `GSTIN: ${company.gstin}` : "No GST number"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2 pl-6">
                                  <Button asChild variant="outline" className="h-9">
                                    <Link href={`/companies/${company.id}/edit`}>
                                      <Edit className="size-4" />
                                      Edit
                                    </Link>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={deleteCheckBusy}
                                    onClick={() => handleDeleteClick(company)}
                                  >
                                    <Trash2 className="size-4" />
                                    Delete
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Add Company / Branch Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !addBusy) { setAddOpen(false); resetAddForm(); }
        }}
      >
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{addMode === "branch" ? "Add a branch" : "Add company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {groups.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Is this company already in your list?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={addBusy}
                    onClick={() => setAddMode("new")}
                    className={cn(
                      "min-h-12 rounded-lg border px-3 text-sm font-medium",
                      addMode === "new" ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
                    )}
                  >
                    No, new company
                  </button>
                  <button
                    type="button"
                    disabled={addBusy}
                    onClick={() => setAddMode("branch")}
                    className={cn(
                      "min-h-12 rounded-lg border px-3 text-sm font-medium",
                      addMode === "branch" ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
                    )}
                  >
                    Yes, new branch
                  </button>
                </div>
              </div>
            )}

            {addMode === "branch" ? (
              <div className="space-y-1">
                <Label htmlFor="add-group">Which company?</Label>
                <select
                  id="add-group"
                  value={addGroupKey}
                  onChange={(e) => setAddGroupKey(e.target.value)}
                  disabled={addBusy}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                >
                  <option value="">Choose company…</option>
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.name} ({g.branches.length})
                    </option>
                  ))}
                </select>
                {addGroup && (
                  <p className="text-xs text-muted-foreground">
                    Already has: {addGroup.branches.map((b) => branchLabel(b)).join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="add-name">Company name</Label>
                <Input
                  id="add-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Company name"
                  autoComplete="organization"
                  disabled={addBusy}
                />
                {sameNameGroup && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <b>{sameNameGroup.name}</b> is already in your list.{" "}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() => { setAddMode("branch"); setAddGroupKey(sameNameGroup.key); }}
                    >
                      Add this as a new branch instead
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="add-branch">
                Branch / landmark {addMode === "branch" ? "" : "(optional)"}
              </Label>
              <Input
                id="add-branch"
                value={addBranch}
                onChange={(e) => setAddBranch(e.target.value)}
                placeholder="e.g., Banjara Hills, Jubilee Hills"
                disabled={addBusy}
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
                disabled={addBusy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-gstin">GSTIN (optional)</Label>
              <Input
                id="add-gstin"
                value={addGstin}
                onChange={(e) => setAddGstin(e.target.value)}
                placeholder="GSTIN"
                disabled={addBusy}
              />
              {addMode === "branch" && addGroup && !addGstin && addGroup.branches.some((b) => b.gstin) && (
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                  onClick={() => setAddGstin(addGroup.branches.find((b) => b.gstin)?.gstin ?? "")}
                >
                  Same GST as other branch ({addGroup.branches.find((b) => b.gstin)?.gstin})
                </button>
              )}
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
              onClick={handleAddSave}
            >
              {addBusy ? "Saving…" : addMode === "branch" ? "Save branch" : "Save company"}
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
              {deleteTarget && deleteTarget.docCount > 0
                ? `${deleteTarget.company.name} can't be deleted`
                : `Delete ${deleteTarget?.company.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.docCount > 0
                ? `It has ${deleteTarget.docCount} ${
                    deleteTarget.docCount === 1 ? "invoice or quotation" : "invoices and quotations"
                  }. To keep those safe, a company with documents is never deleted.`
                : "This company has no invoices or quotations. It will be permanently deleted. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {deleteTarget && deleteTarget.docCount > 0 ? "OK" : "Cancel"}
            </AlertDialogCancel>
            {deleteTarget && deleteTarget.docCount === 0 && (
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
