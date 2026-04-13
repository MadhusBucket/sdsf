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
import type { Company } from "@/lib/types/database";

export default function EditCompanyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        toast.error("Company not found.");
        router.replace("/companies");
        return;
      }

      const co = data as Company;
      setCompany(co);
      setName(co.name);
      setAddress(co.address ?? "");
      setGstin(co.gstin ?? "");
      setIsLoading(false);
    })();
  }, [companyId, router]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error("Company name is required."); return; }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .update({
          name: trimmedName,
          address: address.trim(),
          gstin: gstin.trim() || null,
        })
        .eq("id", companyId);

      if (error) { toast.error(error.message); return; }
      toast.success("Company updated");
      router.push("/companies");
    } finally {
      setIsSaving(false);
    }
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
    <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" className="h-11">
          <Link href="/companies">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Edit Company</h1>
      </div>

      <div className="space-y-4">
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
        <Button asChild variant="outline" className="h-11 flex-1" disabled={isSaving}>
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
