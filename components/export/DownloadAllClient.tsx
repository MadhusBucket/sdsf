"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, FileStack, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import { createClient } from "@/lib/supabase/client";
import type { DocumentStatus, DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type Kind = "both" | DocumentType;
type Period = "fy" | "last" | "all" | "custom";

interface Row {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  date: string;
  company_id: string;
}

function fyRange(offset: number) {
  const now = new Date();
  const start = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `Apr ${start} – Mar ${start + 1}` };
}

const LARGE = 150;

/** Read-only screen: pick what to include, then download everything as one PDF. */
export function DownloadAllClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);

  const [kind, setKind] = useState<Kind>("both");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const userId = await getEffectiveUserId(supabase, user.id, user.email!);
      const [docs, cos] = await Promise.all([
        supabase.from("documents").select("id, type, status, date, company_id").eq("user_id", userId),
        supabase.from("companies").select("id, name").eq("user_id", userId).order("name"),
      ]);
      if (docs.error) throw docs.error;
      if (cos.error) throw cos.error;
      setRows((docs.data ?? []) as Row[]);
      setCompanies((cos.data ?? []) as { id: string; name: string }[]);
    })().catch((e) => {
      console.error(e);
      setFailed(true);
    });
  }, []);

  const range = useMemo(() => {
    if (period === "fy") return fyRange(0);
    if (period === "last") return fyRange(-1);
    if (period === "custom") return { from: customFrom, to: customTo, label: "" };
    return { from: "", to: "", label: "" };
  }, [period, customFrom, customTo]);

  const counts = useMemo(() => {
    const picked = (rows ?? []).filter(
      (r) =>
        (kind === "both" || r.type === kind) &&
        (!range.from || r.date >= range.from) &&
        (!range.to || r.date <= range.to) &&
        (!companyId || r.company_id === companyId) &&
        (includeCancelled || (r.status !== "void" && r.status !== "replaced"))
    );
    const invoices = picked.filter((r) => r.type === "invoice").length;
    return { invoices, quotations: picked.length - invoices, total: picked.length };
  }, [rows, kind, range, companyId, includeCancelled]);

  // Any change to the choices means the prepared file is out of date.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSrc(null);
    setReady(false);
  };

  const prepare = () => {
    const params = new URLSearchParams();
    if (kind !== "both") params.set("type", kind);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (companyId) params.set("company", companyId);
    if (includeCancelled) params.set("cancelled", "1");
    params.set("t", String(Date.now()));
    setReady(false);
    setSrc(`/export/print?${params.toString()}`);
  };

  const download = () => frameRef.current?.contentWindow?.print();

  if (failed) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Could not load your documents. Check your internet and refresh the page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-black/10 bg-white pr-4 pl-2 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-card"
      >
        <ChevronLeft className="size-5" />
        Back
      </Link>

      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Download all</h1>
        <p className="text-muted-foreground">
          Get many invoices and quotations as one PDF file. Nothing is changed.
        </p>
      </div>

      <div className="space-y-6 rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card p-5 sm:p-6">
      <Group title="What to include">
        <Chip on={kind === "both"} onClick={() => change(setKind)("both")}>Invoices and quotations</Chip>
        <Chip on={kind === "invoice"} onClick={() => change(setKind)("invoice")}>Invoices only</Chip>
        <Chip on={kind === "quotation"} onClick={() => change(setKind)("quotation")}>Quotations only</Chip>
      </Group>

      <Group title="Which dates">
        <Chip on={period === "all"} onClick={() => change(setPeriod)("all")}>All time</Chip>
        <Chip on={period === "fy"} onClick={() => change(setPeriod)("fy")}>This year ({fyRange(0).label})</Chip>
        <Chip on={period === "last"} onClick={() => change(setPeriod)("last")}>Last year ({fyRange(-1).label})</Chip>
        <Chip on={period === "custom"} onClick={() => change(setPeriod)("custom")}>Choose dates</Chip>
      </Group>
      {period === "custom" && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="grid gap-1.5 font-medium">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => change(setCustomFrom)(e.target.value)}
              className="h-12 rounded-xl border border-input bg-white px-3 text-base dark:bg-background"
            />
          </label>
          <label className="grid gap-1.5 font-medium">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => change(setCustomTo)(e.target.value)}
              className="h-12 rounded-xl border border-input bg-white px-3 text-base dark:bg-background"
            />
          </label>
        </div>
      )}

      <div className="grid max-w-md gap-1.5">
        <label htmlFor="export-company" className="font-semibold">
          Which company
        </label>
        <select
          id="export-company"
          value={companyId}
          onChange={(e) => change(setCompanyId)(e.target.value)}
          className="h-12 rounded-xl border border-input bg-white px-3 text-base dark:bg-background"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex max-w-md cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 dark:bg-background">
        <input
          type="checkbox"
          className="mt-1 size-5"
          checked={includeCancelled}
          onChange={(e) => change(setIncludeCancelled)(e.target.checked)}
        />
        <span>
          <span className="font-medium">Also include cancelled and replaced ones</span>
          <span className="block text-sm text-muted-foreground">Leave this off for a normal download.</span>
        </span>
      </label>
      </div>

      <section className="space-y-4 rounded-[24px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <FileStack className="mt-0.5 size-6 shrink-0 text-primary" />
          {rows === null ? (
            <p className="text-muted-foreground">Counting your documents…</p>
          ) : (
            <div>
              <p className="text-lg font-semibold">
                {counts.total === 0
                  ? "Nothing matches these choices."
                  : `${counts.total} ${counts.total === 1 ? "document" : "documents"} will be in the file`}
              </p>
              {counts.total > 0 && (
                <p className="text-muted-foreground">
                  {counts.invoices} {counts.invoices === 1 ? "invoice" : "invoices"} first, then {counts.quotations}{" "}
                  {counts.quotations === 1 ? "quotation" : "quotations"}. Each starts on a new page, oldest first.
                </p>
              )}
              {counts.total > LARGE && (
                <p className="mt-1 text-amber-700">
                  That is a lot. It can take a minute to get ready. If it is slow, pick one year at a time.
                </p>
              )}
            </div>
          )}
        </div>

        {!src ? (
          <Button type="button" className="h-12 w-full text-base sm:w-auto sm:px-6" disabled={!rows || counts.total === 0} onClick={prepare}>
            Get the file ready
          </Button>
        ) : !ready ? (
          <Button type="button" className="h-12 w-full text-base sm:w-auto sm:px-6" disabled>
            <Loader2 className="size-5 animate-spin" />
            Getting ready…
          </Button>
        ) : (
          <div className="space-y-2">
            <Button type="button" className="h-12 w-full text-base sm:w-auto sm:px-6" onClick={download}>
              <Download className="size-5" />
              Download PDF
            </Button>
            <p className="text-sm text-muted-foreground">
              In the window that opens, choose <b>Save as PDF</b>, then Save.
            </p>
          </div>
        )}
      </section>

      {src && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Preview</p>
          <iframe
            ref={frameRef}
            key={src}
            src={src}
            title="Preview of all documents"
            onLoad={() => setReady(true)}
            className={cn("h-[70vh] w-full rounded-[24px] border border-black/[0.06] bg-white", !ready && "opacity-50")}
          />
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium",
        on ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
