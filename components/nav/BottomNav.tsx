"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/quotations", label: "Quotations", icon: ScrollText },
  { href: "/companies", label: "Companies", icon: Building2 },
] as const;

/** Screens that have their own bottom bar (forms) do not show the main navigation. */
export function showsBottomNav(pathname: string) {
  return !pathname.startsWith("/create") && !/^\/companies\/[^/]+\/edit/.test(pathname);
}

export function BottomNav() {
  const pathname = usePathname();
  if (!showsBottomNav(pathname)) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                  active && "bg-primary/10"
                )}
              >
                <Icon className="size-6" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
