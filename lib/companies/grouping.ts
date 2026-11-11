/**
 * "One company, many addresses": companies with the same name are treated as
 * branches of one company. Nothing is stored for this; it is worked out from
 * the name, so existing company rows are never changed.
 */

export interface BranchLike {
  id: string;
  name: string;
  branch?: string | null;
  address?: string | null;
  gstin?: string | null;
}

export interface CompanyGroup<T extends BranchLike> {
  key: string;
  name: string;
  branches: T[];
}

/** Same company even if written slightly differently ("Pvt Ltd" vs "Private Limited", "&" vs "and"). */
export function companyKey(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bprivate\b/g, "pvt")
    .replace(/\blimited\b/g, "ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Short label for one branch: landmark first, else the first line of the address. */
export function branchLabel(b: BranchLike) {
  const branch = b.branch?.trim();
  if (branch) return branch;
  const firstLine = (b.address ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  return firstLine || "Main address";
}

export function groupCompanies<T extends BranchLike>(companies: T[]): CompanyGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const c of companies) {
    const key = companyKey(c.name);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, branches]) => {
      // Show the spelling used most often.
      const counts = new Map<string, number>();
      for (const b of branches) counts.set(b.name.trim(), (counts.get(b.name.trim()) ?? 0) + 1);
      const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return {
        key,
        name,
        branches: [...branches].sort((a, b) => branchLabel(a).localeCompare(branchLabel(b))),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}
