import { createClient } from "@/lib/supabase/client";
import type { DocumentType } from "@/lib/types/database";

import { parseDocNumberParts } from "@/lib/utils/formatting";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export async function fetchMaxDocumentSerial(
  supabase: SupabaseBrowserClient,
  userId: string,
  type: DocumentType,
  financialYear: string
): Promise<number> {
  const { data, error } = await supabase
    .from("documents")
    .select("doc_number")
    .eq("user_id", userId)
    .eq("type", type);

  if (error || !data?.length) return 0;

  let max = 0;
  for (const row of data) {
    const full = String((row as { doc_number: string }).doc_number);
    const parts = parseDocNumberParts(full);
    if (!parts || parts.financialYear !== financialYear) continue;
    if (parts.serial > max) max = parts.serial;
  }
  return max;
}
