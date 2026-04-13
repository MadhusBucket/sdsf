"use server";

import {
  isEmailAllowlisted,
  parseAllowedEmails,
} from "@/lib/utils/allowedEmails";

export async function assertEmailAllowlisted(email: string | null | undefined) {
  const allowed = parseAllowedEmails();
  if (!isEmailAllowlisted(email, allowed)) {
    return { ok: false as const };
  }
  return { ok: true as const };
}
