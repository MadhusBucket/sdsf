"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Most pages keep a comfortable reading width; the company ledger table gets more room. */
export function PageWidth({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = /^\/ledger\/[^/]+/.test(pathname);
  return <div className={cn("mx-auto w-full", wide ? "max-w-7xl" : "max-w-5xl")}>{children}</div>;
}
