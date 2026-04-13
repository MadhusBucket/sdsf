import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

function readDefaultBizName() {
  return (
    process.env.DEFAULT_PROFILE_BIZ_NAME ??
    process.env.NEXT_PUBLIC_DEFAULT_PROFILE_BIZ_NAME ??
    "My business"
  );
}

function readDefaultAddress() {
  return (
    process.env.DEFAULT_PROFILE_ADDRESS ??
    process.env.NEXT_PUBLIC_DEFAULT_PROFILE_ADDRESS ??
    ""
  );
}

function readDefaultBankJson(): Record<string, unknown> {
  const raw =
    process.env.DEFAULT_PROFILE_BANK_JSON ??
    process.env.NEXT_PUBLIC_DEFAULT_PROFILE_BANK_JSON ??
    "{}";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Ensures a `profiles` row exists for the user.
 * If a row already exists, returns without changing it (preserves last_inv_num / last_qt_num).
 * Otherwise inserts defaults from env (server: DEFAULT_*; client: NEXT_PUBLIC_DEFAULT_*).
 */
export async function ensureProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null
) {
  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    return { error: selectError };
  }

  if (data) {
    return { error: null };
  }

  const { error } = await supabase.from("profiles").insert({
    id: userId,
    email,
    biz_name: readDefaultBizName(),
    address: readDefaultAddress(),
    bank_json: readDefaultBankJson(),
    last_inv_num: 0,
    last_qt_num: 0,
  });

  return { error };
}
