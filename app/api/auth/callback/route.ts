import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  isEmailAllowlisted,
  parseAllowedEmails,
} from "@/lib/utils/allowedEmails";
import { ensureProfile } from "@/lib/utils/ensureProfile";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const user = data.session.user;
  const allowedEmails = parseAllowedEmails();
  if (!isEmailAllowlisted(user.email, allowedEmails)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=unauthorized", requestUrl.origin)
    );
  }

  const { error: profileError } = await ensureProfile(
    supabase,
    user.id,
    user.email ?? null
  );

  if (profileError) {
    console.error("ensureProfile after magic link:", profileError.message);
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
