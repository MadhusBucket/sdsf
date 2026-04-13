"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Document } from "@/lib/types/database";

export interface DashboardDocument extends Document {
  companies?: {
    name: string;
    address?: string | null;
  } | null;
}

interface SearchBarProps {
  query: string;
  onChange: (value: string) => void;
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by company or doc number..."
        className="pl-9 text-base"
        inputMode="search"
      />
    </div>
  );
}

export function fuzzyMatchesDocument(doc: DashboardDocument, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = `${doc.doc_number} ${doc.companies?.name ?? ""}`.toLowerCase();
  if (haystack.includes(normalizedQuery)) return true;

  let index = 0;
  for (const char of normalizedQuery) {
    index = haystack.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}
