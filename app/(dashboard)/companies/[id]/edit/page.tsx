"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import { useSubmitLock } from "@/lib/hooks/useSubmitLock";
import type { Company } from "@/lib/types/database";

export default function EditCompanyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const { busy: isSaving, run: runSave } = useSubmitLock();

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const effectiveUserId = await getEffectiveUserId(supabase, user.id, user.email!);

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Company not found.");
        router.replace("/companies");
        return;
      }

      const co = data as Company;
      setCompany(co);
      setName(co.name);
      setBranch(co.branch ?? "");
      setAddress(co.address ?? "");
      setGstin(co.gstin ?? "");
      setIsLoading(false);
    })();
  }, [companyId, router]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error("Company name is required."); return; }

    void runSave(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .update({
          name: trimmedName,
          branch: branch.trim() || null,
          address: address.trim(),
          gstin: gstin.trim() || null,
        })
        .eq("id", companyId);

      if (error) { toast.error(error.message); return; }
      toast.success("Company updated");
      router.push("/companies");
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!company) return null;

  return (
    <main className="mx-auto max-w-lg space-y-5 p-4 pb-10 sm:p-6">
      <Link
        href="/companies"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-black/10 bg-white pr-4 pl-2 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
      >
        <ChevronLeft className="size-5" />
        Back
      </Link>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Edit company</h1>

      <div className="space-y-4 rounded-[24px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)] sm:p-6 dark:border-white/10 dark:bg-card">
        <div className="space-y-1">
          <Label htmlFor="edit-name">Company name</Label>
          <Input
            id="edit-name"
            className="text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            autoComplete="organization"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-branch">Branch (optional)</Label>
          <Input
            id="edit-branch"
            className="text-base"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="e.g., Banjara Hills, Jubilee Hills"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-addr">Address</Label>
          <Textarea
            id="edit-addr"
            rows={4}
            className="min-h-[6rem] resize-y text-base"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, state, pin code"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-gstin">GSTIN (optional)</Label>
          <Input
            id="edit-gstin"
            className="text-base"
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
            placeholder="GSTIN"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button asChild variant="outline" className="h-12 flex-1 bg-white" disabled={isSaving}>
          <Link href="/companies">Cancel</Link>
        </Button>
        <Button
          type="button"
          className="h-12 flex-1"
          disabled={isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </main>
  );
}
