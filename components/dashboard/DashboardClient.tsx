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
import { branchLabel, groupCompanies } from "@/lib/companies/grouping";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUserId } from "@/lib/auth/sharedAccess";
import type { DocumentType } from "@/lib/types/database";
import { rememberListTab } from "@/components/nav/lastListTab";

import { DocumentList } from "./DocumentList";
import { DateFilter } from "./DateFilter";
import { KPICards } from "./KPICards";
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

      if (!active) return;
      setDocuments((data as DashboardDocument[] | null) ?? []);
      setIsLoading(false);

      // First load: bring back the search, filters and scroll from last time.
      if (!restoredRef.current) {
        restoredRef.current = true;
        let saved: Partial<SavedView> | null = null;
        try {
          saved = JSON.parse(sessionStorage.getItem(viewKey) ?? "null");
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{plural}</h1>
          <Button asChild variant="outline" className="h-10">
            <Link href="/export">
              <Download className="size-4" />
              Download all
            </Link>
          </Button>
        </div>

        <KPICards documents={documents} type={type} />

        <SearchBar query={query} onChange={setQuery} />


        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground">
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
          <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="h-11 min-w-0 flex-1 border-gray-300 bg-white sm:w-48 sm:flex-none" aria-label="Filter by company">
                <SelectValue placeholder="All companies">
                  <span className="truncate">{companyFilter ? companyFilter.label : "All companies"}</span>
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
            <StatusFilter value={status} onChange={setStatus} />
            <DateFilter selectedDate={dateFilter} onDateChange={setDateFilter} />
          </div>
        </div>

        {isLoading && documents.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading documents...
          </div>
        ) : (
          <DocumentList documents={filteredDocuments} documentType={type} query={query} />
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
