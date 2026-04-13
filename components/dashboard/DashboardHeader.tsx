"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type FontSize = "normal" | "large" | "xlarge";

const FONT_SIZE_CYCLE: FontSize[] = ["normal", "large", "xlarge"];
const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  normal: "",
  large: "font-size-large",
  xlarge: "font-size-xlarge",
};
const FONT_SIZE_LABELS: Record<FontSize, string> = {
  normal: "A",
  large: "A+",
  xlarge: "A++",
};
const STORAGE_KEY = "font-size-preference";

function applyFontSize(size: FontSize) {
  const html = document.documentElement;
  html.classList.remove("font-size-large", "font-size-xlarge");
  if (FONT_SIZE_CLASSES[size]) html.classList.add(FONT_SIZE_CLASSES[size]);
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
};

export function DashboardHeader() {
  const router = useRouter();
  const [fontSize, setFontSize] = useState<FontSize>("normal");

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) ?? "normal") as FontSize;
    const valid = FONT_SIZE_CYCLE.includes(saved) ? saved : "normal";
    setFontSize(valid);
    applyFontSize(valid);
  }, []);

  const handleFontSizeCycle = () => {
    const currentIndex = FONT_SIZE_CYCLE.indexOf(fontSize);
    const next = FONT_SIZE_CYCLE[(currentIndex + 1) % FONT_SIZE_CYCLE.length];
    setFontSize(next);
    applyFontSize(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-base font-semibold hover:opacity-80">
          {getGreeting()},{" "}
          <span className="text-primary">Pradeep</span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={`Font size: ${fontSize}. Click to change.`}
            title={`Font size: ${FONT_SIZE_LABELS[fontSize]} — click to cycle`}
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={handleFontSizeCycle}
          >
            <span className="select-none font-semibold leading-none tracking-tight"
              style={{ fontSize: fontSize === "normal" ? "0.9rem" : fontSize === "large" ? "1rem" : "1.1rem" }}
            >
              {FONT_SIZE_LABELS[fontSize]}
            </span>
          </button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/companies">Manage Companies</Link>
          </Button>
          <button
            type="button"
            aria-label="Logout"
            className="flex items-center rounded-md p-1.5 hover:opacity-70"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
}
