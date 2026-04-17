"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronsUpDown, Plus, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandList } from "@/components/ui/command";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { Company } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { ensureProfile } from "@/lib/utils/ensureProfile";

interface CompanySelectorProps {
  value: string | null;
  onChange: (companyId: string | null) => void;
}

export function CompanySelector({ value, onChange }: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newGstin, setNewGstin] = useState("");

  const loadCompanies = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);
    setLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("name");
    setCompanies((data as Company[] | null) ?? []);
    setLoading(false);
  }, []);

  // Load companies on mount so a pre-selected value (e.g. when editing an
  // existing document) can resolve its display name immediately.
  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const selected = companies.find((c) => c.id === value);

  const companyLabel = (c: Company) =>
    c.branch ? `${c.branch} – ${c.name}` : c.name;

  const q = searchQuery.trim();
  const qLower = q.toLowerCase();
  const filteredCompanies =
    q.length === 0
      ? companies
      : companies.filter(
          (c) =>
            c.name.toLowerCase().includes(qLower) ||
            (c.branch?.toLowerCase().includes(qLower) ?? false)
        );

  const showCreateFromSearch = q.length > 0 && filteredCompanies.length === 0;

  useEffect(() => {
    if (adding && open) {
      const t = window.setTimeout(() => {
        document.getElementById("co-name")?.focus();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [adding, open]);

  const resetAddForm = () => {
    setAdding(false);
    setNewName("");
    setNewBranch("");
    setNewAddress("");
    setNewGstin("");
  };

  const handleCancelAdd = () => {
    resetAddForm();
  };

  const openAddForm = (prefillName: string) => {
    setAdding(true);
    setNewName(prefillName);
    setNewBranch("");
    setNewAddress("");
    setNewGstin("");
    setSearchQuery("");
  };

  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Company name is required.");
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be signed in to add a company.");
      return;
    }

    const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

    setLoading(true);
    const { error: profileError } = await ensureProfile(
      supabase,
      effectiveUserId,
      user.email ?? null
    );
    if (profileError) {
      setLoading(false);
      toast.error(profileError.message);
      return;
    }

    const { data, error } = await supabase
      .from("companies")
      .insert({
        user_id: effectiveUserId,
        name,
        branch: newBranch.trim() || null,
        address: newAddress.trim() || "",
        gstin: newGstin.trim() || null,
      })
      .select()
      .single();
    setLoading(false);
    if (error) {
      const fk =
        error.code === "23503" ||
        /foreign key|violates foreign key/i.test(error.message);
      if (fk) {
        toast.error(
          "Session expired. Please log out and log back in."
        );
      } else {
        toast.error(error.message);
      }
      return;
    }
    const company = data as Company;
    setCompanies((prev) =>
      [...prev, company].sort((a, b) => a.name.localeCompare(b.name))
    );
    onChange(company.id);
    resetAddForm();
    setSearchQuery("");
    setOpen(false);
    toast.success("Company saved");
  };

  return (
    <div className="space-y-2">
      <Label>Company</Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setSearchQuery("");
            void loadCompanies();
          } else {
            resetAddForm();
            setSearchQuery("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-12 w-full justify-between text-base font-normal"
          >
            {selected ? companyLabel(selected) : "Select company..."}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
          {adding ? (
            <div className="max-h-[min(70vh,24rem)] space-y-3 overflow-y-auto p-3">
              <p className="font-medium">New company</p>
              <div className="space-y-1">
                <Label htmlFor="co-name">Company name</Label>
                <Input
                  id="co-name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Company name"
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-branch">Branch (optional)</Label>
                <Input
                  id="co-branch"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="e.g., Banjara Hills, Jubilee Hills"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-addr">Address</Label>
                <Textarea
                  id="co-addr"
                  rows={2}
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street, city, state"
                  className="min-h-[4.5rem] resize-y text-base"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-gstin">GSTIN (optional)</Label>
                <Input
                  id="co-gstin"
                  value={newGstin}
                  onChange={(e) => setNewGstin(e.target.value)}
                  placeholder="GSTIN"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={handleCancelAdd}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="h-12 flex-1"
                  disabled={loading}
                  onClick={() => void handleSaveNew()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <Command shouldFilter={false} loop>
              <CommandInput
                placeholder="Search company..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {loading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Loading companies…
                  </div>
                ) : (
                  <>
                    {/* Native buttons: cmdk CommandItem can stay mounted but non-interactive when
                        filter scores / internal state treat rows as disabled; actions bypass cmdk. */}
                    <div
                      role="none"
                      className="space-y-0.5 border-b border-border p-1"
                    >
                      <button
                        type="button"
                        disabled={false}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center rounded-md px-2 py-2.5 text-left text-sm text-foreground outline-none",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus-visible:bg-accent focus-visible:text-accent-foreground",
                          "active:bg-accent/90"
                        )}
                        onClick={() => openAddForm("")}
                      >
                        <Plus className="mr-2 size-4 shrink-0" />
                        Add New Company
                      </button>
                      {showCreateFromSearch ? (
                        <button
                          type="button"
                          disabled={false}
                          className={cn(
                            "flex min-h-11 w-full cursor-pointer items-center rounded-md px-2 py-2.5 text-left text-sm text-foreground outline-none",
                            "hover:bg-accent hover:text-accent-foreground",
                            "focus-visible:bg-accent focus-visible:text-accent-foreground",
                            "active:bg-accent/90"
                          )}
                          onClick={() => openAddForm(q)}
                        >
                          <Plus className="mr-2 size-4 shrink-0" />
                          <span className="truncate">{`Create '${q}'`}</span>
                        </button>
                      ) : null}
                    </div>
                    {/* Native buttons: cmdk CommandItem stays greyed/disabled in this Popover+filter setup */}
                    <div
                      role="listbox"
                      aria-label="Companies"
                      className="max-h-60 space-y-0.5 overflow-y-auto p-1"
                    >
                      {filteredCompanies.map((c) => {
                        const addressLine1 = c.address?.split("\n")[0]?.trim() ?? "";
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={cn(
                              "w-full rounded-sm px-3 py-2 text-left transition-colors hover:bg-accent",
                              value === c.id && "bg-accent"
                            )}
                            onClick={() => {
                              onChange(c.id);
                              setSearchQuery("");
                              setOpen(false);
                            }}
                          >
                            <div className="flex flex-col gap-1">
                              {c.branch && (
                                <Badge variant="secondary" className="w-fit text-xs">
                                  {c.branch}
                                </Badge>
                              )}
                              <div className="text-sm font-medium">{c.name}</div>
                              {addressLine1 && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {addressLine1}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {!loading &&
                      companies.length === 0 &&
                      q.length === 0 ? (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No companies yet. Add one above.
                        </div>
                      ) : null}
                    </div>
                    <div className="border-t p-1">
                      <Link
                        href="/companies"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Settings className="size-4 shrink-0" />
                        Manage All Companies
                      </Link>
                    </div>
                  </>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
