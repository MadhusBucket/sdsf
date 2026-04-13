/**
 * Parses `ALLOWED_EMAILS` (comma-separated, case-insensitive).
 * Empty list means no restriction (allow all).
 */
export function parseAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowlisted(
  email: string | null | undefined,
  allowedEmails: string[]
): boolean {
  if (allowedEmails.length === 0) return true;
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized !== "" && allowedEmails.includes(normalized);
}
