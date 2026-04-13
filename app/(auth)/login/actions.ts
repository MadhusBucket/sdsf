"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { assertEmailAllowlisted } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/utils/ensureProfile";

export async function signInWithEmail(formData: FormData) {
  const email = (formData.get("email") as string).trim().toLowerCase();

  const gate = await assertEmailAllowlisted(email);
  if (!gate.ok) {
    redirect("/login?error=unauthorized");
  }

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const callbackUrl = `${protocol}://${host}/api/auth/callback`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl },
  });

  if (error) {
    redirect("/login?error=magic_link_failed");
  }

  redirect("/login?sent=1");
}

export async function signInWithPassword(formData: FormData) {
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;

  const gate = await assertEmailAllowlisted(email);
  if (!gate.ok) {
    redirect("/login?error=unauthorized");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=invalid");
  }

  const user = data.user;
  if (user) {
    const { error: profileError } = await ensureProfile(
      supabase,
      user.id,
      user.email ?? null
    );
    if (profileError) {
      console.error("ensureProfile after password login:", profileError.message);
    }
  }

  redirect("/dashboard");
}
