"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { branchLabel, companyKey, groupCompanies } from "@/lib/companies/grouping";
import { computeLedger, type LedgerInvoice } from "@/lib/ledger/compute";
import { fetchPayments } from "@/lib/ledger/data";
import { allLinks } from "@/lib/convert/links";
import type { Payment } from "@/lib/ledger/types";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { DocumentType } from "@/lib/types/database";
import { rememberListTab } from "@/components/nav/lastListTab";

import { DocumentList, type PaymentSummary } from "./DocumentList";
import { DateFilter } from "./DateFilter";
import { KPICards, type DashPeriod } from "./KPICards";
import { fuzzyMatchesDocument, SearchBar, type DashboardDocument } from "./SearchBar";
import { StatusFilter, type StatusFilterValue } from "./StatusFilter";

const ALL_COMPANIES = "all";

interface SavedView {
  query: string;
  status: StatusFilterValue;
  company: string;
  scroll: number;
}

/** Filter value: "all", "g:<company>" for every branch, or "c:<branch id>" for one branch. */
function resolveCompanyFilter(
  value: string,
  groups: { key: string; name: string; branches: { id: string; branch: string | null; address: string | null; name: string }[] }[]
): { ids: Set<string>; label: string } | null {
  if (value.startsWith("g:")) {
    const g = groups.find((x) => x.key === value.slice(2));
    return g ? { ids: new Set(g.branches.map((b) => b.id)), label: `${g.name} · all branches` } : null;
  }
  if (value.startsWith("c:")) {
    const id = value.slice(2);
    const g = groups.find((x) => x.branches.some((b) => b.id === id));
    const b = g?.branches.find((x) => x.id === id);
    if (g && b) return { ids: new Set([id]), label: g.branches.length > 1 ? `${g.name} · ${branchLabel(b)}` : g.name };
  }
  return null;
}

/** List of invoices or quotations. Search, filters and scroll are remembered so Back returns to the same place. */
export function DashboardClient({ type }: { type: DocumentType }) {
  const viewKey = `list-view-${type}`;
  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  // Payments from the ledger (read only). null = not available, cards fall back to the invoice status.
  const [payments, setPayments] = useState<Payment[] | null>(null);
  // Quotation → invoice links (read only), for the "Invoice made" tag on quotations.
  const [links, setLinks] = useState<Map<string, string[]>>(new Map());
  // Period for the dashboard numbers, remembered for this browser tab.
  const periodKey = `dash-period-${type}`;
  const [period, setPeriodState] = useState<DashPeriod>("month");
  const setPeriod = (p: DashPeriod) => {
    setPeriodState(p);
    try {
      sessionStorage.setItem(periodKey, p);
    } catch {}
  };
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilterValue>("all");
  const [company, setCompany] = useState<string>(ALL_COMPANIES);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    rememberListTab(type === "invoice" ? "/invoices" : "/quotations");
  }, [type]);

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

      const pays = type === "invoice" ? await fetchPayments(supabase, effectiveUserId) : null;
      const linkMap = type === "quotation" ? await allLinks(supabase, effectiveUserId) : new Map<string, string[]>();

      if (!active) return;
      setDocuments((data as DashboardDocument[] | null) ?? []);
      setPayments(pays);
      setLinks(linkMap);
      setIsLoading(false);

      // First load: bring back the search, filters and scroll from last time.
      if (!restoredRef.current) {
        restoredRef.current = true;
        let saved: Partial<SavedView> | null = null;
        try {
          saved = JSON.parse(sessionStorage.getItem(viewKey) ?? "null");
        } catch {}
        try {
          const v = sessionStorage.getItem(`dash-period-${type}`);
          if (v === "today" || v === "week" || v === "month" || v === "year") setPeriodState(v);
        } catch {}
        if (saved) {
          setQuery(saved.query ?? "");
          setStatus(saved.status ?? "all");
          setCompany(saved.company ?? ALL_COMPANIES);
          const y = saved.scroll ?? 0;
          if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
        }
        setRestored(true);
      }
    };

    fetchDocuments();

    const channel = supabase
      .channel(`documents-realtime-${type}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => {
        fetchDocuments();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [type, viewKey]);

  // Keep the current view saved for this browser tab.
  useEffect(() => {
    if (!restored) return;
    const write = () => {
      try {
        const view: SavedView = { query, status, company, scroll: window.scrollY };
        sessionStorage.setItem(viewKey, JSON.stringify(view));
      } catch {}
    };
    write();
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(write, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, [restored, query, status, company, viewKey]);

  const ofType = useMemo(() => documents.filter((doc) => doc.type === type), [documents, type]);

  // What is received and pending on each invoice, worked out on screen from the payments.
  const ledger = useMemo(() => {
    if (type !== "invoice" || !payments) return null;
    const keys = new Map(ofType.map((d) => [d.company_id, companyKey(d.companies?.name ?? d.company_id)]));
    return computeLedger(ofType as LedgerInvoice[], payments, (id) => keys.get(id) ?? id);
  }, [type, payments, ofType]);

  const paymentSummaries = useMemo(() => {
    if (!ledger) return undefined;
    const out: Record<string, PaymentSummary> = {};
    for (const [id, bal] of ledger.invoices) out[id] = { received: Math.max(0, bal.total - bal.pending) };
    return out;
  }, [ledger]);

  const madeInto = useMemo(() => {
    if (type !== "quotation" || links.size === 0) return undefined;
    const byId = new Map(documents.map((d) => [d.id, d]));
    const out: Record<string, string[]> = {};
    for (const [quotationId, invoiceIds] of links) {
      const numbers = invoiceIds
        .map((id) => byId.get(id))
        .filter((d) => d && d.status !== "void" && d.status !== "replaced")
        .map((d) => d!.doc_number);
      if (numbers.length) out[quotationId] = numbers;
    }
    return out;
  }, [type, links, documents]);

  const pendingById = useMemo(() => {
    if (!ledger) return undefined;
    const out: Record<string, number> = {};
    for (const [id, bal] of ledger.invoices) out[id] = bal.pending;
    return out;
  }, [ledger]);

  // Companies (grouped with their branches) that have documents of this type, with how many.
  const companyGroups = useMemo(() => {
    const branches = new Map<string, { id: string; name: string; branch: string | null; address: string | null; count: number }>();
    for (const doc of ofType) {
      const entry = branches.get(doc.company_id) ?? {
        id: doc.company_id,
        name: doc.companies?.name ?? "Unknown company",
        branch: doc.companies?.branch ?? null,
        address: doc.companies?.address ?? null,
        count: 0,
      };
      entry.count += 1;
      branches.set(doc.company_id, entry);
    }
    return groupCompanies([...branches.values()]).map((g) => ({
      ...g,
      count: g.branches.reduce((n, b) => n + b.count, 0),
    }));
  }, [ofType]);

  const companyFilter = useMemo(() => resolveCompanyFilter(company, companyGroups), [company, companyGroups]);

  const filteredDocuments = useMemo(() => {
    return ofType
      .filter((doc) => (companyFilter ? companyFilter.ids.has(doc.company_id) : true))
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
  }, [ofType, query, status, companyFilter, dateFilter]);

  const plural = type === "invoice" ? "Invoices" : "Quotations";
  const singular = type === "invoice" ? "invoice" : "quotation";

  return (
    <>
      <div className="space-y-4 p-4 pb-28 sm:p-6">
        {/* Dashboard */}
        <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
        <KPICards
          documents={documents}
          type={type}
          pendingById={pendingById}
          payments={payments}
          madeInto={madeInto}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* Divider between the dashboard and the list */}
        <div className="pt-4">
          <div className="border-t border-black/10 dark:border-white/10" />
        </div>

        {/* Invoices / Quotations */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <h2 className="font-heading text-2xl font-bold tracking-tight">{plural}</h2>
          <Button asChild variant="outline" className="h-10 bg-white">
            <Link href="/export">
              <Download className="size-4" />
              Download all
            </Link>
          </Button>
        </div>

        {/* One row: search (half) | company | status | date */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:w-1/2">
            <SearchBar query={query} onChange={setQuery} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="h-11 min-w-0 flex-1 gap-2 rounded-xl border-gray-300 bg-white [&>svg]:shrink-0 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:flex-1 [&>[data-slot=select-value]]:overflow-hidden" aria-label="Filter by company">
                <SelectValue placeholder="All companies">
                  <span className="block truncate text-left">{companyFilter ? companyFilter.label : "All companies"}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
                {companyGroups.map((g) =>
                  g.branches.length === 1 ? (
                    <SelectItem key={g.key} value={`c:${g.branches[0].id}`}>
                      {g.name} ({g.count})
                    </SelectItem>
                  ) : (
                    <SelectGroup key={g.key}>
                      <SelectLabel className="pt-3 font-semibold text-foreground">{g.name}</SelectLabel>
                      <SelectItem value={`g:${g.key}`} className="pl-6">
                        All branches ({g.count})
                      </SelectItem>
                      {g.branches.map((b) => (
                        <SelectItem key={b.id} value={`c:${b.id}`} className="pl-6">
                          {branchLabel(b)} ({b.count})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                )}
              </SelectContent>
            </Select>
            <div className="min-w-0 flex-1">
              <StatusFilter value={status} onChange={setStatus} />
            </div>
            <DateFilter selectedDate={dateFilter} onDateChange={setDateFilter} />
          </div>
        </div>

        <p className="-mt-1 text-sm text-muted-foreground">
          {plural}{" "}
          <span className="font-medium text-foreground">{filteredDocuments.length}</span>
          {companyFilter && (
            <>
              {" "}for <span className="font-medium text-foreground">{companyFilter.label}</span>{" "}
              <button
                type="button"
                onClick={() => setCompany(ALL_COMPANIES)}
                className="ml-1 text-primary underline underline-offset-4"
              >
                Show all
              </button>
            </>
          )}
        </p>

        {isLoading && documents.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading documents...
          </div>
        ) : (
          <DocumentList documents={filteredDocuments} documentType={type} query={query} payments={paymentSummaries} madeInto={madeInto} />
        )}
      </div>

      <motion.div
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.08 }}
        className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-1 sm:right-8"
      >
        <Button asChild className="h-14 rounded-full px-5 text-base shadow-lg">
          <Link href={`/create?type=${type}`} aria-label={`Create new ${singular}`}>
            <Plus className="size-6" />
            New {singular}
          </Link>
        </Button>
      </motion.div>
    </>
  );
}
