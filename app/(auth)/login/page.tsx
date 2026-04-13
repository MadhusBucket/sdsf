"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithEmail, signInWithPassword } from "./actions";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const sent = searchParams.get("sent");

  const [mode, setMode] = useState<"magic" | "password">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const errorMessage =
    error === "unauthorized"
      ? "Access denied. This email is not authorized."
      : error === "invalid"
        ? "Incorrect email or password. Please try again."
        : error === "magic_link_failed"
          ? "Could not send magic link. Please try again."
          : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, Pradeep
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your email to continue to SDS Flow.
          </p>
        </div>

        {errorMessage ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="size-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {sent ? (
          <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertDescription>
              Magic link sent — check your inbox.
            </AlertDescription>
          </Alert>
        ) : null}

        <form
          action={mode === "magic" ? signInWithEmail : signInWithPassword}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-base"
              required
            />
          </div>

          {mode === "password" ? (
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-base"
                required
              />
            </div>
          ) : null}

          <motion.div whileTap={{ scale: 0.95 }} transition={{ duration: 0.08 }}>
            <SubmitButton mode={mode} />
          </motion.div>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "magic" ? "password" : "magic");
              setPassword("");
            }}
            className="w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {mode === "magic"
              ? "Use password instead"
              : "Use magic link instead"}
          </button>
        </form>
      </section>
    </main>
  );
}

function SubmitButton({ mode }: { mode: "magic" | "password" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="h-12 w-full text-base"
      disabled={pending}
    >
      {pending
        ? mode === "magic"
          ? "Sending…"
          : "Signing in…"
        : mode === "magic"
          ? "Send Magic Link"
          : "Sign in"}
    </Button>
  );
}
