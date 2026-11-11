import type { ReactNode } from "react";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { BottomNav } from "@/components/nav/BottomNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <DashboardHeader />
      <div className="mx-auto w-full max-w-5xl">{children}</div>
      <BottomNav />
    </div>
  );
}
