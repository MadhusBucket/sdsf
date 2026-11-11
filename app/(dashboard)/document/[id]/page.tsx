import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { DocumentPdfToolbar } from "@/components/pdf/DocumentPdfToolbar";
import { PDFPreview } from "@/components/pdf/PDFPreview";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getEffectiveUser } from "@/lib/supabase/server";
import type { Company, Document } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
import { companyColor, companyInitials } from "@/lib/companies/colors";

const STATUS_STYLES: Record<Document["status"], string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  void: "bg-red-100 text-red-700 border-red-200",
  replaced: "bg-purple-100 text-purple-700 border-purple-200",
};

const STATUS_LABELS: Record<Document["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Cancelled",
  replaced: "Replaced",
};

function statusLabel(status: Document["status"]) {
  return STATUS_LABELS[status] ?? status;
}

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const [supabase, user] = await Promise.all([createClient(), getEffectiveUser()]);
  if (!user) notFound();

  const { data, error } = await supabase
    .from("documents")
    .select("*, companies(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();

  const row = data as Document & { companies: Company | null };
  const company = row.companies;
  if (!company) notFound();

  const { companies: _companies, ...document } = row;
  const docPayload = document as Document;

  return (
    <div className="space-y-5 p-4 pb-10 sm:p-6">
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-black/10 bg-white pr-4 pl-2 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
      >
        <ChevronLeft className="size-5" />
        Back
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full text-base font-bold"
            style={{ backgroundColor: companyColor(company.name).soft, color: companyColor(company.name).text }}
            aria-hidden
          >
            {companyInitials(company.name)}
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold tracking-tight tabular-nums">{docPayload.doc_number}</h1>
            <p className="text-sm text-zinc-500">
              {company.name}
              {company.branch ? ` · ${company.branch}` : ""}
            </p>
          </div>
        </div>
        <DocumentPdfToolbar document={docPayload} />
      </div>

      <Card size="sm">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Document details</CardTitle>
              <CardDescription>Read-only summary</CardDescription>
            </div>
            <Badge
              className={cn(STATUS_STYLES[docPayload.status], "font-medium")}
              variant="outline"
            >
              {statusLabel(docPayload.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Company</p>
            <p className="text-sm font-medium">{company.name}</p>
            {company.address && (
              <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{company.address}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Type</p>
            <p className="text-sm">{docPayload.type === "invoice" ? "Invoice" : "Quotation"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Issue date</p>
            <p className="text-sm">
              {new Date(docPayload.date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          {docPayload.type === "invoice" ? (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">PO number</p>
              <p className="text-sm">{docPayload.po_number ?? "—"}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Grand total</p>
            <p className="text-sm font-semibold">{formatIndianCurrency(docPayload.grand_total)}</p>
          </div>
          {docPayload.subject ? (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Subject</p>
              <p className="text-sm">{docPayload.subject}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10">
        <PDFPreview documentId={docPayload.id} />
      </div>
    </div>
  );
}
