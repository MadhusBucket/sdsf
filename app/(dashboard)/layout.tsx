import type { ReactNode } from "react";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <DashboardHeader />
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </div>
  );
}
