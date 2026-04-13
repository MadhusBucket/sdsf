import { AlertCircle } from "lucide-react";

import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const unauthorized = params.error === "unauthorized";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your email to continue to SDS Flow.
          </p>
        </div>

        {unauthorized ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="size-4" />
            <AlertDescription>
              Access denied. This email is not authorized.
            </AlertDescription>
          </Alert>
        ) : null}

        <MagicLinkForm />
      </section>
    </main>
  );
}
