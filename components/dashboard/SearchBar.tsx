"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Document } from "@/lib/types/database";

export interface DashboardDocument extends Document {
  companies?: {
    name: string;
    branch?: string | null;
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
        placeholder="Search company, number or item (e.g. steel sheet)"
        className="h-11 rounded-xl border-gray-300 bg-white pl-9 text-base"
        inputMode="search"
      />
    </div>
  );
}

export function searchWords(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function itemLines(doc: DashboardDocument) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  return items.map((i) => [i.description, i.subtext].filter(Boolean).join(" — "));
}

/**
 * When the search matched an item (not the number, company or subject),
 * returns that item's text so the card can show why it matched.
 */
export function matchedItemLine(doc: DashboardDocument, query: string): string | null {
  const words = searchWords(query);
  if (!words.length) return null;
  const top = `${doc.doc_number} ${doc.companies?.name ?? ""} ${doc.subject ?? ""} ${doc.po_number ?? ""}`.toLowerCase();
  if (words.every((w) => top.includes(w))) return null;
  const phrase = words.join(" ");
  const score = (line: string) => {
    const l = line.toLowerCase();
    return (l.includes(phrase) ? 100 : 0) + words.filter((w) => l.includes(w)).length;
  };
  const best = itemLines(doc).sort((a, b) => score(b) - score(a))[0];
  return best && score(best) > 0 ? best : null;
}

export function fuzzyMatchesDocument(doc: DashboardDocument, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  // Every word found anywhere: number, company, subject, PO or any item line.
  const everything = [
    doc.doc_number,
    doc.companies?.name ?? "",
    doc.companies?.branch ?? "",
    doc.subject ?? "",
    doc.po_number ?? "",
    ...itemLines(doc),
  ]
    .join(" ")
    .toLowerCase();
  if (searchWords(normalizedQuery).every((w) => everything.includes(w))) return true;

  // Loose match on number and company only (typing "inv14" still finds INV/2627/014).
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
