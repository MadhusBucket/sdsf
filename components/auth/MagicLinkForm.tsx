"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { assertEmailAllowlisted } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/lib/utils/ensureProfile";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MagicLinkForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      const message = "Please enter a valid email address.";
      setErrorMessage(message);
      window.alert(message);
      return;
    }

    setIsLoading(true);

    try {
      const gate = await assertEmailAllowlisted(normalizedEmail);
      if (!gate.ok) {
        setErrorMessage("Access denied. This email is not authorized.");
        return;
      }

      const supabase = createClient();

      if (usePassword && password.trim()) {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password.trim(),
        });

        if (error) {
          throw error;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error: profileError } = await ensureProfile(
            supabase,
            user.id,
            user.email ?? null
          );
          if (profileError) {
            console.error("ensureProfile after password login:", profileError);
          }
        }

        router.replace("/dashboard");
        router.refresh();
        return;
      }

      if (usePassword && !password.trim()) {
        const message = "Enter your password or turn off password login.";
        setErrorMessage(message);
        window.alert(message);
        return;
      }

      const callbackUrl = `${window.location.origin}/api/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });

      if (error) {
        throw error;
      }

      setSuccessMessage("Check your email for the magic link");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to send magic link. Please try again.";
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <label htmlFor="email" className="text-sm font-medium text-foreground">
        Email address
      </label>
      <Input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="text-base"
        required
        disabled={isLoading}
      />

      <div className="flex items-center gap-2">
        <input
          id="use-password"
          type="checkbox"
          checked={usePassword}
          onChange={(event) => {
            setUsePassword(event.target.checked);
            if (!event.target.checked) {
              setPassword("");
            }
          }}
          className="size-4 rounded border-input accent-primary"
          disabled={isLoading}
        />
        <label htmlFor="use-password" className="text-sm text-foreground">
          Use Password
        </label>
      </div>

      {usePassword ? (
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="text-base"
            disabled={isLoading}
          />
        </div>
      ) : null}

      <motion.div whileTap={{ scale: 0.95 }} transition={{ duration: 0.08 }}>
        <Button
          type="submit"
          className="h-12 w-full text-base"
          disabled={isLoading}
        >
          {isLoading
            ? usePassword
              ? "Signing in..."
              : "Sending..."
            : usePassword
              ? "Sign in"
              : "Send Magic Link"}
        </Button>
      </motion.div>

      {successMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
