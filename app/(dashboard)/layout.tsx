import type { ReactNode } from "react";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { BottomNav } from "@/components/nav/BottomNav";
import { PageWidth } from "@/components/nav/PageWidth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f5f5] pb-[calc(4rem+env(safe-area-inset-bottom))] dark:bg-background">
      <DashboardHeader />
      <PageWidth>{children}</PageWidth>
      <BottomNav />
    </div>
  );
}
